// handover-reminders — SCHEDULED function (not called by users). Run every 15 minutes.
// Protected by the header `x-cron-secret`, which must equal the env var HANDOVER_CRON_SECRET.
//
// Per handover (derived on the server from the fixed schedule, _shared/handover-schedule.ts), grouped per
// date + handing-over parent + receiving parent:
//   list_ready     from 48 h before the handover: the fixed items are put on the list and the handing-over
//                  parent gets "De lijst voor {dag} staat klaar."
//   evening        the evening before (from HANDOVER_EVENING_TIME, default 19:00, Europe/Amsterdam) until the
//                  handover: the handing-over parent gets "Morgen wissel. Klopt de lijst?" with the packed count.
//   received_check from 1 h after the handover time (for 23 h): the receiving parent gets "Is alles meegekomen?"
//                  (only when the list has items that were not confirmed yet).
// Only parents of the children concerned are notified; never during a parent's quiet hours (Rustmodus):
// the notification is then retried on a later run while its window is open.
// Idempotent: every notification is first written to handover_notification_log (unique per kind, handover,
// children and recipient); only a newly inserted row is sent. Safe to run as often as wanted.
// Also cleans up: expired checklist items, old drafts and old log rows.
import { db } from "../_shared/db.ts";
import { check } from "../_shared/respond.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { safeEqual } from "../_shared/util.ts";
import { type ChildSchedule, handoversOn, loadSchedules, localInstant, localParts, OUT, plusDays } from "../_shared/handover-schedule.ts";

type Row = Record<string, any>;
const H = 3600_000;
const WEEKDAY_NL = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const WEEKDAY_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const RETENTION_DAYS = 31;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

/** Is `time` ("HH:MM") inside [from, to) (the window may wrap midnight)? */
function inWindow(time: string, from: unknown, to: unknown): boolean {
  if (typeof from !== "string" || typeof to !== "string" || !/^\d{2}:\d{2}$/.test(from) || !/^\d{2}:\d{2}$/.test(to)) return false;
  return from <= to ? time >= from && time < to : time >= from || time < to;
}

/** Quiet hours from the app preferences (profiles.preferences.app): rustmodus / nachtrust. */
function quiet(prefs: Row | null | undefined, time: string): boolean {
  const app = prefs?.app && typeof prefs.app === "object" ? prefs.app : {};
  return (app.rustmodus === true && inWindow(time, app.rustVan ?? "21:00", app.rustTot ?? "07:00"))
    || (app.nachtrustAan === true && inWindow(time, app.nachtrustVan ?? "21:00", app.nachtrustTot ?? "08:00"));
}

/** Children that have a fixed schedule (paged). */
async function scheduledChildIds(): Promise<string[]> {
  const ids: string[] = [];
  for (let from = 0; ; from += 1000) {
    const rows = (check(
      await db().from("children").select("id").not("care_schedule", "is", null).order("id").range(from, from + 999),
      "scheduled children",
    ) ?? []) as Row[];
    ids.push(...rows.map((r) => r.id));
    if (rows.length < 1000) break;
  }
  return ids;
}

/** System notification (no actor), same shape as practical-audit's notify; the client renders lib.meldingen.<key>. */
async function send(to: string, key: string, params: Record<string, string | number>, moment: string, kids: string[]): Promise<boolean> {
  const res = await db().from("notifications").insert({
    user_id: to, actor_id: null, type: "handover", category: "actie", title: key, message: "",
    link: `/overdracht?moment=${moment}`, entity_type: "handover", entity_id: moment, child_ids: kids,
    metadata: { params, audit_id: null },
  });
  if (res.error) console.error("[handover-reminders] notify failed:", res.error);
  return !res.error;
}

/** A claimed notification that could not be sent is released, so a later run retries it. */
async function unclaim(kind: string, moment: string, childKey: string, recipient: string): Promise<void> {
  const res = await db().from("handover_notification_log").delete()
    .eq("kind", kind).eq("moment_id", moment).eq("child_key", childKey).eq("recipient_id", recipient);
  if (res.error) console.error("[handover-reminders] could not release claim:", kind, moment, childKey, recipient, res.error);
}

/** Claim, send, and release the claim when sending failed. */
async function deliver(kind: string, moment: string, childKey: string, to: string, key: string, params: () => Promise<Record<string, string | number>>, kids: string[]): Promise<boolean> {
  if (!(await claim(kind, moment, childKey, to))) return false;
  let ok = false;
  try {
    ok = await send(to, key, await params(), moment, kids);
  } catch (e) {
    console.error("[handover-reminders] send failed:", e);
  }
  if (ok) return true;
  await unclaim(kind, moment, childKey, to);
  return false;
}

/** Records the notification; true when it was not sent before (then the caller sends it). */
async function claim(kind: string, moment: string, childKey: string, recipient: string): Promise<boolean> {
  const res = await db().from("handover_notification_log").insert({ kind, moment_id: moment, child_key: childKey, recipient_id: recipient });
  if (!res.error) return true;
  if ((res.error as { code?: string }).code === "23505") return false;
  console.error("[handover-reminders] log failed:", res.error);
  return false; // never risk a duplicate
}

/** Fixed items ("Vaste spullen") of these children for the days until the next handover, added once. */
async function fillFixedItems(moment: string, nextDate: string | null, kids: string[], owner: string): Promise<void> {
  const routines = (check(await db().from("fixed_routines").select("id, child_id, day_of_week, item_name").in("child_id", kids), "routines") ?? []) as Row[];
  if (!routines.length) return;
  const days = new Set<string>();
  const end = nextDate ?? plusDays(moment, 7);
  for (let d = moment, i = 0; i < 14 && d < end; d = plusDays(d, 1), i++) days.add(WEEKDAY_NL[weekday(d)]);
  if (!days.size) days.add(WEEKDAY_NL[weekday(moment)]);
  const wanted = routines.filter((r) => !r.day_of_week || r.day_of_week === "elke" || !WEEKDAY_NL.includes(String(r.day_of_week).toLowerCase()) || days.has(String(r.day_of_week).toLowerCase()));
  if (!wanted.length) return;
  const existing = (check(
    await db().from("handover_checklist_items").select("source_ref").eq("moment_id", moment).eq("source", "vast").in("source_ref", wanted.map((r) => r.id)),
    "existing fixed",
  ) ?? []) as Row[];
  const have = new Set(existing.map((r) => r.source_ref));
  const expiry = new Date(`${moment}T12:00:00Z`);
  expiry.setUTCDate(expiry.getUTCDate() + RETENTION_DAYS);
  for (const r of wanted.filter((x) => !have.has(x.id))) {
    const ins = await db().from("handover_checklist_items").insert({
      user_id: owner, child_id: r.child_id, child_ids: [r.child_id], moment_id: moment, item_name: r.item_name,
      source: "vast", source_ref: r.id, deleted_at: expiry.toISOString(),
    });
    if (ins.error && (ins.error as { code?: string }).code !== "23505") console.error("[handover-reminders] fixed item:", ins.error);
  }
}

async function listCounts(moment: string, kids: string[]): Promise<{ total: number; packed: number; unconfirmed: number }> {
  const now = new Date().toISOString();
  const rows = (check(
    await db().from("handover_checklist_items").select("is_packed, received, removed").eq("moment_id", moment).eq("removed", false)
      .overlaps("child_ids", kids).or(`deleted_at.is.null,deleted_at.gt.${now}`),
    "list counts",
  ) ?? []) as Row[];
  return { total: rows.length, packed: rows.filter((r) => r.is_packed).length, unconfirmed: rows.filter((r) => r.received === null || r.received === undefined).length };
}

async function run() {
  const now = new Date();
  const local = localParts(now);
  const eveningFrom = /^\d{2}:\d{2}$/.test(Deno.env.get("HANDOVER_EVENING_TIME") ?? "") ? Deno.env.get("HANDOVER_EVENING_TIME")! : "19:00";
  const stats = { children: 0, handovers: 0, sent: 0, skippedQuiet: 0 };

  const ids = await scheduledChildIds();
  stats.children = ids.length;
  const prefsCache = new Map<string, Row | null>();
  const prefs = async (id: string) => {
    if (!prefsCache.has(id)) {
      const p = check(await db().from("profiles").select("preferences").eq("id", id).maybeSingle(), "prefs") as Row | null;
      prefsCache.set(id, (p?.preferences as Row) ?? null);
    }
    return prefsCache.get(id);
  };

  for (let i = 0; i < ids.length; i += 200) {
    const schedules = await loadSchedules(ids.slice(i, i + 200));
    const all = [...schedules.values()];
    // yesterday (received check) up to the day after tomorrow (48 h before)
    for (const date of [plusDays(local.date, -1), local.date, plusDays(local.date, 1), plusDays(local.date, 2)]) {
      const hs = handoversOn(all, date);
      // group per handing-over + receiving parent: one list per handover moment (moment id = date)
      const groups = new Map<string, { from: string; to: string; kids: string[]; time: string }>();
      for (const h of hs) {
        const k = `${h.from}|${h.to}`;
        const g = groups.get(k) ?? { from: h.from, to: h.to, kids: [], time: h.time };
        g.kids.push(h.childId);
        if (h.time && (!g.time || h.time < g.time)) g.time = h.time;
        groups.set(k, g);
      }
      for (const g of groups.values()) {
        stats.handovers++;
        const kids = [...new Set(g.kids)].sort();
        const childKey = kids.join(",");
        const at = localInstant(date, g.time || "12:00").getTime();
        const ms = now.getTime();
        const dag = WEEKDAY_NL[weekday(date)], day = WEEKDAY_EN[weekday(date)];
        // Only a parent linked (role 'parent', active connection, see loadSchedules) to EVERY child of the
        // group is ever notified or gets items on their list.
        const parentOfAll = (p: string) => kids.every((k) => schedules.get(k)?.parents.includes(p) ?? false);
        const packer = g.from !== OUT && parentOfAll(g.from) ? g.from : null;
        const receiver = g.to !== OUT && parentOfAll(g.to) ? g.to : null;

        // 1. list ready (48 h before, until the handover)
        if (packer && ms >= at - 48 * H && ms < at) {
          if (quiet(await prefs(packer), local.time)) stats.skippedQuiet++;
          else {
            const next = nextHandoverDate(all.filter((c) => kids.includes(c.id)), date);
            await fillFixedItems(date, next, kids, packer);
            if (await deliver("list_ready", date, childKey, packer, "overdrachtLijstKlaar", async () => ({ dag, day, totaal: (await listCounts(date, kids)).total }), kids)) stats.sent++;
          }
        }
        // 2. evening before
        if (packer && local.date === plusDays(date, -1) && local.time >= eveningFrom && ms < at) {
          if (quiet(await prefs(packer), local.time)) stats.skippedQuiet++;
          else if (await deliver("evening", date, childKey, packer, "overdrachtMorgen", async () => {
            const c = await listCounts(date, kids);
            return { ingepakt: c.packed, totaal: c.total };
          }, kids)) stats.sent++;
        }
        // 3. "Is alles meegekomen?" one hour after, for the receiving parent
        if (receiver && ms >= at + H && ms < at + 24 * H) {
          const c = await listCounts(date, kids);
          if (c.total && c.unconfirmed) {
            if (quiet(await prefs(receiver), local.time)) stats.skippedQuiet++;
            else if (await deliver("received_check", date, childKey, receiver, "overdrachtAllesMeegekomen", async () => ({ totaal: c.total }), kids)) stats.sent++;
          }
        }
      }
    }
  }

  // housekeeping (best-effort)
  const cut = new Date(now.getTime() - 60 * 24 * H).toISOString();
  await db().from("handover_checklist_items").delete().lt("deleted_at", now.toISOString());
  await db().from("handover_note_drafts").delete().lt("updated_at", cut);
  await db().from("handover_notification_log").delete().lt("sent_at", cut);
  return stats;
}

/** First date after `date` (max 14 days) on which one of these children changes parent. */
function nextHandoverDate(children: ChildSchedule[], date: string): string | null {
  for (let i = 1; i <= 14; i++) {
    const d = plusDays(date, i);
    if (handoversOn(children, d).length) return d;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const secret = Deno.env.get("HANDOVER_CRON_SECRET") ?? "";
  const given = req.headers.get("x-cron-secret") ?? "";
  if (!secret || secret.length < 16 || !safeEqual(given, secret)) return json(401, { success: false, code: "UNAUTHORIZED", message: "Not allowed" });
  try {
    return json(200, { success: true, ...(await run()) });
  } catch (e) {
    console.error("[handover-reminders] failed:", e);
    return json(500, { success: false, code: "SERVER", message: "Internal error" });
  }
});
