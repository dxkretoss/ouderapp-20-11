// manage-moments — "Momentjes" (photo/text moments) and milestones per child, with one reaction per
// other parent. Session required. Private moments ("Alleen voor mij") are only ever returned to their
// author. Photos live in the PRIVATE bucket "moments" and are served as 1 h signed URLs.
import { db } from "../_shared/db.ts";
import { check, err, ok, serveActions } from "../_shared/respond.ts";
import { requireUser } from "../_shared/session.ts";
import { optDate, optText, requireUuid } from "../_shared/util.ts";
import { resolveAvatars, uploadImage } from "../_shared/storage.ts";
import { addressFor, CaregiverAccess, caregiverAccess, caregiverProfilesFor, canSee, Family, familyFor, familyMembers } from "../_shared/practical-scope.ts";
import { notify } from "../_shared/practical-audit.ts";

const VISIBILITY = ["private", "parents", "circle"];
const PHASES = ["geen", "vooraf", "tijdens", "na"];
const MILESTONES = ["Eerste stapjes", "Eerste woordje", "Eerste schooldag", "Eerste tand", "Zwemdiploma", "Verjaardag", "Sportprestatie", "Rapport", "Iets bijzonders"];
const REACTIONS = ["leuk", "lief", "trots", "watGoed", "tekst", "duim"];
const COLS = "id, user_id, child_id, title, description, photo_url, is_milestone, is_private, visibility, circle_ids, phase, milestone, entry_kind, happened_on, other_parent_id, created_at, deleted_at";

type Row = Record<string, any>;

/** Parent rule, plus: circle members' moments for my children, and (as a caregiver) moments shared with my circle record. */
function mayRead(f: Family, cg: CaregiverAccess, circleAuthors: Set<string>, r: Row): boolean {
  if (r.deleted_at) return false;
  const isPrivate = r.visibility === "private" || r.is_private;
  if (r.user_id === f.userId) return true;
  if (r.child_id && f.childIds.includes(r.child_id) && (canSee(f, r.user_id, [r.child_id], isPrivate, r.other_parent_id ?? null) || (!isPrivate && circleAuthors.has(r.user_id)))) return true;
  return r.visibility === "circle" && !!r.child_id && cg.view("momentjes").includes(r.child_id) && (r.circle_ids ?? []).some((id: string) => cg.caregiverIds.includes(id));
}

const visible = (f: Family, r: Row) => !r.deleted_at && canSee(f, r.user_id, r.child_id ? [r.child_id] : [], r.visibility === "private" || r.is_private, r.other_parent_id ?? null);

async function out(rows: Row[], f: Family) {
  const ids = rows.map((r) => r.id);
  const reactions = ids.length
    ? ((check(await db().from("moment_reactions").select("moment_id, user_id, reaction, reaction_text, created_at").in("moment_id", ids), "reactions") ?? []) as Row[])
    : [];
  const urls = await resolveAvatars(rows.map((r) => r.photo_url));
  return rows.map((r, i) => ({
    id: r.id,
    child_id: r.child_id,
    author_id: r.user_id,
    text: r.description ?? r.title,
    photo_url: urls[i],
    visibility: r.visibility === "private" || r.is_private ? "private" : r.visibility,
    other_parent_id: r.other_parent_id ?? null,
    circle_ids: r.circle_ids ?? [],
    phase: r.phase || "geen",
    milestone: r.milestone ?? null,
    kind: r.entry_kind || "moment",
    happened_on: r.happened_on ?? String(r.created_at).slice(0, 10),
    created_at: r.created_at,
    // Only reactions of parents in this family (never other people's data).
    reactions: reactions
      .filter((x) => x.moment_id === r.id && familyMembers(f).includes(x.user_id))
      .map((x) => ({ user_id: x.user_id, reaction: x.reaction, text: x.reaction_text ?? null, created_at: x.created_at })),
  }));
}

async function loadMoment(f: Family, id: unknown): Promise<Row> {
  const mid = requireUuid(id, "moment_id");
  const row = check(await db().from("shared_moments").select(COLS).eq("id", mid).maybeSingle(), "load moment") as Row | null;
  if (!row || !visible(f, row)) throw err.notFound("Moment not found");
  return row;
}

Deno.serve(serveActions("manage-moments", {
  async list(req) {
    const me = await requireUser(req);
    const f = await familyFor(me.id);
    const cg = await caregiverAccess(me.id);
    const kids = [...new Set([...f.childIds, ...cg.view("momentjes")])];
    const [own, perKind] = await Promise.all([
      db().from("shared_moments").select(COLS).in("user_id", familyMembers(f)).is("deleted_at", null).order("created_at", { ascending: false }).limit(500),
      kids.length
        ? db().from("shared_moments").select(COLS).in("child_id", kids).is("deleted_at", null).order("created_at", { ascending: false }).limit(500)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const alle = [...((check(own, "list moments") ?? []) as Row[]), ...((check(perKind, "list moments per child") ?? []) as Row[])];
    const rows = [...new Map(alle.map((r) => [r.id, r])).values()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    // Moments written by circle members (caregivers with an account) of my children are shared with the parents.
    const circleAuthors = await caregiverProfilesFor(f.childIds);
    return ok({ moments: await out(rows.filter((r) => mayRead(f, cg, circleAuthors, r)), f) });
  },

  /** kind "moment" (text and/or photo) or "mijlpaal" (a short milestone line on the child profile). */
  async create(req, body) {
    const me = await requireUser(req);
    const f = await familyFor(me.id);
    const childId = requireUuid(body.child_id, "child_id");
    // A caregiver may add a moment (shared with the parents) only with "bijdragen" for momentjes of this child.
    const asCaregiver = !f.childIds.includes(childId);
    if (asCaregiver && !(await caregiverAccess(me.id)).contribute("momentjes").includes(childId)) throw err.notFound("Child not found");
    if (asCaregiver) body.visibility = "parents";
    const kind = asCaregiver ? "moment" : body.kind ?? "moment";
    if (!["moment", "mijlpaal"].includes(kind)) throw err.validation("kind is invalid");
    const text = optText(body.text, "text", 2000) ?? null;
    if (!text && !body.photo_base64) throw err.validation("text or photo is required");
    // New moments are private ("Alleen jij") unless the author chooses to share them.
    const visibility = body.visibility ?? "private";
    if (!VISIBILITY.includes(visibility)) throw err.validation("visibility is invalid");
    const phase = body.phase ?? "geen";
    if (!PHASES.includes(phase)) throw err.validation("phase is invalid");
    const milestone = body.milestone ?? null;
    if (milestone !== null && !MILESTONES.includes(milestone)) throw err.validation("milestone is invalid");
    const circle = Array.isArray(body.circle_ids) && visibility === "circle"
      ? body.circle_ids.filter((x: unknown) => typeof x === "string" && x.length <= 80).slice(0, 30)
      : [];
    const photo = body.photo_base64 ? await uploadImage("moments", childId, body.photo_base64) : null;
    const row = check(
      await db().from("shared_moments").insert({
        user_id: me.id,
        child_id: childId,
        title: (text ?? "").slice(0, 200) || "-",
        description: text,
        photo_url: photo,
        is_milestone: kind === "mijlpaal" || !!milestone,
        is_private: visibility === "private",
        visibility,
        circle_ids: circle,
        phase,
        milestone,
        entry_kind: kind,
        happened_on: optDate(body.happened_on, "happened_on") ?? new Date().toISOString().slice(0, 10),
        // Shared with the other parent of this child; private / caregiver moments are not addressed.
        other_parent_id: asCaregiver ? null : addressFor(f, [childId], visibility === "private"),
      }).select(COLS).single(),
      "create moment",
    ) as Row;
    // Moments are not part of the change history; Activities reads shared moments directly.
    return ok({ moment: (await out([row], f))[0] });
  },

  /** One reaction per parent; never on your own moment. The author is notified. */
  async react(req, body) {
    const me = await requireUser(req);
    const f = await familyFor(me.id);
    const row = await loadMoment(f, body.moment_id);
    if (row.user_id === me.id) throw err.forbidden("You cannot react to your own moment");
    if (!REACTIONS.includes(body.reaction)) throw err.validation("reaction is invalid");
    const text = optText(body.text, "text", 80) ?? null;
    check(
      await db().from("moment_reactions").upsert(
        { moment_id: row.id, user_id: me.id, reaction: body.reaction, reaction_text: text, created_at: new Date().toISOString() },
        { onConflict: "moment_id,user_id" },
      ),
      "react",
    );
    await notify({ to: row.user_id, actorId: me.id, type: "moment", category: "info", key: "momentReactie", link: "/momentjes", entityType: "moment", entityId: row.id, childIds: row.child_id ? [row.child_id] : [] });
    return ok({ moment: (await out([row], f))[0] });
  },

  /** "Alleen jij" ↔ "Gedeeld" (or circle): only the author. Sharing addresses the other parent of the child. */
  async "set-visibility"(req, body) {
    const me = await requireUser(req);
    const f = await familyFor(me.id);
    const row = await loadMoment(f, body.moment_id);
    if (row.user_id !== me.id) throw err.notFound("Moment not found");
    const visibility = body.visibility;
    if (!VISIBILITY.includes(visibility)) throw err.validation("visibility is invalid");
    const upd = check(
      await db().from("shared_moments").update({
        visibility, is_private: visibility === "private",
        other_parent_id: row.child_id && f.childIds.includes(row.child_id) ? addressFor(f, [row.child_id], visibility === "private") : null,
      }).eq("id", row.id).select(COLS).single(),
      "set visibility",
    ) as Row;
    return ok({ moment: (await out([upd], f))[0] });
  },

  /** Soft delete by the author (history of shared items is never rewritten for others). */
  async delete(req, body) {
    const me = await requireUser(req);
    const f = await familyFor(me.id);
    const row = await loadMoment(f, body.moment_id);
    if (row.user_id !== me.id) throw err.forbidden("Only the author can remove a moment");
    check(await db().from("shared_moments").update({ deleted_at: new Date().toISOString() }).eq("id", row.id), "delete moment");
    return ok({});
  },
}));

