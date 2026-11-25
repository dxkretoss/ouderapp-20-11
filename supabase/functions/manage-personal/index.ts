// manage-personal — the parent's own, private data (table personal_entries). Owner-only: every query filters
// on the SESSION user; ids from the body only select among the user's own rows. Nothing here is ever shared
// with, notified to, or visible for the other parent, a caregiver or a professional.
// Kinds:
//   houvast_zin     { tekst }                         Mijn houvast: own sentences (max 50)
//   houvast_moment  { moment }                        Mijn houvast: saved "lastige momenten" tips (max 100, unique)
//   wissel_log      { datum, gevoel, hielp[] }        "Hoe ging de wissel": rolling log (newest 200 kept)
//   solo_note       { tekst }                         Solo logbook (max 500)
//   safety_report   { notitie, context? }             "Onveilig voelen" report, server timestamp (max 500, not editable)
//   co_chat         { berichten: [{ rol, tekst }] }   saved conversation with Co (one per user)
// Actions: list, add, update, delete, put (singleton kinds), clear (one kind).
import { db } from "../_shared/db.ts";
import { Body, check, err, ok, serveActions } from "../_shared/respond.ts";
import { requireUser } from "../_shared/session.ts";
import { isPlainObject, requireUuid } from "../_shared/util.ts";

type Data = Record<string, unknown>;

interface KindRule {
  max: number;
  /** Over the maximum: drop the oldest instead of refusing (rolling log). */
  rolling?: boolean;
  /** Exactly one row per user; written with `put`. */
  singleton?: boolean;
  /** Can be changed after creation. */
  editable?: boolean;
  /** Can be removed one by one. */
  deletable?: boolean;
  clean: (v: unknown) => Data;
}

const GEVOEL = ["Rustig", "Ging wel", "Lastig", "Heftig"];
const HIELP = ["Mijn zin", "Ademen", "Kort afscheid", "Knuffel mee", "Niets"];
const ROLLEN = ["ouder", "ai"];

function text(v: unknown, field: string, max: number, required = true): string {
  if (v === undefined || v === null) {
    if (required) throw err.validation(`${field} is required`);
    return "";
  }
  if (typeof v !== "string") throw err.validation(`${field} must be a string`);
  const t = v.trim();
  if (required && !t) throw err.validation(`${field} is required`);
  if (t.length > max) throw err.validation(`${field} is too long (max ${max})`);
  return t;
}

function obj(v: unknown): Data {
  if (!isPlainObject(v)) throw err.validation("data must be an object");
  return v as Data;
}

function isoDate(v: unknown, field: string): string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw err.validation(`${field} must be YYYY-MM-DD`);
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw err.validation(`${field} is not a valid date`);
  return v;
}

const KINDS: Record<string, KindRule> = {
  houvast_zin: {
    max: 50,
    editable: true,
    deletable: true,
    clean: (v) => ({ tekst: text(obj(v).tekst, "tekst", 500) }),
  },
  houvast_moment: {
    max: 100,
    deletable: true,
    clean: (v) => {
      const m = obj(v).moment;
      if (typeof m !== "number" || !Number.isInteger(m) || m < 1 || m > 1000) throw err.validation("moment is invalid");
      return { moment: m };
    },
  },
  wissel_log: {
    max: 200,
    rolling: true,
    deletable: true,
    clean: (v) => {
      const d = obj(v);
      const gevoel = typeof d.gevoel === "string" && GEVOEL.includes(d.gevoel) ? d.gevoel : null;
      if (!gevoel) throw err.validation("gevoel is invalid");
      const hielp = Array.isArray(d.hielp) ? [...new Set(d.hielp.filter((h): h is string => typeof h === "string" && HIELP.includes(h)))] : [];
      return { datum: isoDate(d.datum, "datum"), gevoel, hielp };
    },
  },
  solo_note: {
    max: 500,
    editable: true,
    deletable: true,
    clean: (v) => ({ tekst: text(obj(v).tekst, "tekst", 4000) }),
  },
  safety_report: {
    max: 500,
    deletable: true,
    clean: (v) => {
      const d = obj(v);
      return { notitie: text(d.notitie, "notitie", 4000, false), context: text(d.context, "context", 300, false) };
    },
  },
  co_chat: {
    max: 1,
    singleton: true,
    deletable: true,
    clean: (v) => {
      const lijst = obj(v).berichten;
      if (!Array.isArray(lijst)) throw err.validation("berichten must be a list");
      if (lijst.length > 30) throw err.validation("berichten has too many items (max 30)");
      return {
        berichten: lijst.map((b, i) => {
          const x = obj(b);
          if (typeof x.rol !== "string" || !ROLLEN.includes(x.rol)) throw err.validation(`berichten[${i}].rol is invalid`);
          return { rol: x.rol, tekst: text(x.tekst, `berichten[${i}].tekst`, 3000) };
        }),
      };
    },
  },
};

const COLS = "id, kind, data, created_at, updated_at";

interface Row {
  id: string;
  kind: string;
  data: Data;
  created_at: string;
  updated_at: string;
}

function kindOf(v: unknown): string {
  if (typeof v !== "string" || !Object.prototype.hasOwnProperty.call(KINDS, v)) throw err.validation("kind is invalid");
  return v;
}

const out = (r: Row) => ({ id: r.id, kind: r.kind, data: r.data ?? {}, created_at: r.created_at, updated_at: r.updated_at });

/** One of MY rows; anything else (missing or someone else's) is the same NOT_FOUND. */
async function loadOwn(userId: string, id: string): Promise<Row> {
  const row = check(
    await db().from("personal_entries").select(COLS).eq("id", id).eq("user_id", userId).maybeSingle(),
    "load personal entry",
  ) as Row | null;
  if (!row) throw err.notFound();
  return row;
}

async function count(userId: string, kind: string): Promise<number> {
  const res = await db().from("personal_entries").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("kind", kind);
  if (res.error) check(res as any, "count personal entries");
  return res.count ?? 0;
}

const handlers = {
  /** My entries, oldest first, for the requested kinds (default: all). */
  async list(req: Request, body: Body) {
    const me = await requireUser(req);
    const kinds = body.kinds === undefined || body.kinds === null
      ? Object.keys(KINDS)
      : Array.isArray(body.kinds) && body.kinds.length <= Object.keys(KINDS).length
      ? [...new Set(body.kinds.map(kindOf))]
      : (() => { throw err.validation("kinds must be a list"); })();
    if (!kinds.length) return ok({ entries: [] });
    const rows = (check(
      await db().from("personal_entries").select(COLS).eq("user_id", me.id).in("kind", kinds).order("created_at", { ascending: true }).limit(2000),
      "list personal entries",
    ) ?? []) as Row[];
    return ok({ entries: rows.map(out) });
  },

  /** New entry. houvast_moment is unique per moment (adding it again returns the existing one). */
  async add(req: Request, body: Body) {
    const me = await requireUser(req);
    const kind = kindOf(body.kind);
    const rule = KINDS[kind];
    if (rule.singleton) throw err.validation("Use put for this kind");
    const data = rule.clean(body.data);
    if (kind === "houvast_moment") {
      const same = check(
        await db().from("personal_entries").select(COLS).eq("user_id", me.id).eq("kind", kind).eq("data->>moment", String(data.moment)).limit(1),
        "find saved moment",
      ) as Row[] | null;
      if (same && same.length) return ok({ entry: out(same[0]) });
    }
    const n = await count(me.id, kind);
    if (n >= rule.max) {
      if (!rule.rolling) throw err.validation(`LIMIT: at most ${rule.max} items`);
      const oldest = (check(
        await db().from("personal_entries").select("id").eq("user_id", me.id).eq("kind", kind).order("created_at", { ascending: true }).limit(n - rule.max + 1),
        "find oldest entries",
      ) ?? []) as Array<{ id: string }>;
      if (oldest.length) check(await db().from("personal_entries").delete().eq("user_id", me.id).in("id", oldest.map((o) => o.id)), "drop oldest entries");
    }
    const row = check(
      await db().from("personal_entries").insert({ user_id: me.id, kind, data }).select(COLS).single(),
      "add personal entry",
    ) as Row;
    return ok({ entry: out(row) });
  },

  /** Change an editable entry of mine. */
  async update(req: Request, body: Body) {
    const me = await requireUser(req);
    const row = await loadOwn(me.id, requireUuid(body.id, "id"));
    const rule = KINDS[row.kind];
    if (!rule?.editable) throw err.validation("This item cannot be changed");
    const data = rule.clean(body.data);
    const saved = check(
      await db().from("personal_entries").update({ data }).eq("id", row.id).eq("user_id", me.id).select(COLS).single(),
      "update personal entry",
    ) as Row;
    return ok({ entry: out(saved) });
  },

  /** Create or replace the single entry of a singleton kind (co_chat). */
  async put(req: Request, body: Body) {
    const me = await requireUser(req);
    const kind = kindOf(body.kind);
    const rule = KINDS[kind];
    if (!rule.singleton) throw err.validation("Use add for this kind");
    const data = rule.clean(body.data);
    const existing = check(
      await db().from("personal_entries").select("id").eq("user_id", me.id).eq("kind", kind).maybeSingle(),
      "find singleton",
    ) as { id: string } | null;
    let res = existing
      ? await db().from("personal_entries").update({ data }).eq("id", existing.id).eq("user_id", me.id).select(COLS).single()
      : await db().from("personal_entries").insert({ user_id: me.id, kind, data }).select(COLS).single();
    if (!existing && res.error && (res.error as { code?: string }).code === "23505") {
      // created by a parallel save (uq_personal_entries_co_chat): replace that one instead
      res = await db().from("personal_entries").update({ data }).eq("user_id", me.id).eq("kind", kind).select(COLS).single();
    }
    return ok({ entry: out(check(res, "save singleton") as Row) });
  },

  async delete(req: Request, body: Body) {
    const me = await requireUser(req);
    const row = await loadOwn(me.id, requireUuid(body.id, "id"));
    if (!KINDS[row.kind]?.deletable) throw err.validation("This item cannot be removed");
    check(await db().from("personal_entries").delete().eq("id", row.id).eq("user_id", me.id), "delete personal entry");
    return ok({ id: row.id });
  },

  /** Remove all my entries of one kind (e.g. the saved Co conversation). */
  async clear(req: Request, body: Body) {
    const me = await requireUser(req);
    const kind = kindOf(body.kind);
    if (!KINDS[kind].deletable) throw err.validation("This item cannot be removed");
    check(await db().from("personal_entries").delete().eq("user_id", me.id).eq("kind", kind), "clear personal entries");
    return ok({ kind });
  },
};

Deno.serve(serveActions("manage-personal", handlers));
