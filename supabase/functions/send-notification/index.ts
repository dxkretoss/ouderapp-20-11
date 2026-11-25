// send-notification — the signed-in parent's in-app notifications + Activities read-marks.
// Session required. Notifications are CREATED server-side by other functions (notify() in
// _shared/practical-audit.ts) when the other parent acts; the browser can only read them and mark
// them read. Push delivery (APNs/FCM via device_tokens) is not part of Milestone 2.
import { db } from "../_shared/db.ts";
import { check, err, ok, serveActions } from "../_shared/respond.ts";
import { requireUser } from "../_shared/session.ts";
import { caregiverProfilesFor, familyFor, familyMembers, namesFor } from "../_shared/practical-scope.ts";
import { caregiverGrantsFor } from "../_shared/family-caregivers.ts";
import { linkedParents } from "../_shared/parent-permissions.ts";

const COLS = "id, user_id, actor_id, type, category, title, link, is_read, read_at, metadata, entity_type, entity_id, child_ids, created_at";
const MAX_IDS = 500;

type Row = Record<string, any>;

function readIds(v: unknown): string[] {
  if (!Array.isArray(v)) throw err.validation("item_ids must be an array");
  const ids = [...new Set(v.filter((x) => typeof x === "string" && x.length > 0 && x.length <= 300))] as string[];
  if (ids.length > MAX_IDS) throw err.validation(`At most ${MAX_IDS} ids`);
  return ids;
}

const NOTIF_PREFIX = "act-notif-";

async function markRead(userId: string, ids: string[]) {
  if (!ids.length) return;
  const at = new Date().toISOString();
  check(
    await db().from("activity_reads").upsert(ids.map((item_id) => ({ user_id: userId, item_id, read_at: at })), { onConflict: "user_id,item_id", ignoreDuplicates: true }),
    "mark read",
  );
  const notifIds = ids.filter((x) => x.startsWith(NOTIF_PREFIX)).map((x) => x.slice(NOTIF_PREFIX.length)).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  if (notifIds.length) {
    check(await db().from("notifications").update({ is_read: true, read_at: at }).eq("user_id", userId).in("id", notifIds).eq("is_read", false), "mark notifications");
  }
}

Deno.serve(serveActions("send-notification", {
  async list(req) {
    const me = await requireUser(req);
    const f = await familyFor(me.id);
    const [n, r] = await Promise.all([
      db().from("notifications").select(COLS).eq("user_id", me.id).order("created_at", { ascending: false }).limit(200),
      db().from("activity_reads").select("item_id").eq("user_id", me.id).order("read_at", { ascending: false }).limit(2000),
    ]);
    // Parents and the live circle members (caregivers with an account) of my children.
    const members = [...familyMembers(f), ...(await caregiverProfilesFor(f.childIds))];
    // Access changes apply at once: hide notifications from people / about children no longer shared.
    const all = (check(n, "list notifications") ?? []) as Row[];
    const asParent = (x: Row) =>
      (!x.actor_id || members.includes(x.actor_id)) &&
      // every child must still be shared with that parent (per child a different co-parent is possible)
      (x.child_ids ?? []).every((id: string) => f.childIds.includes(id) && (!x.actor_id || x.actor_id === me.id || !f.coParents.includes(x.actor_id) || (f.shared[x.actor_id] ?? []).includes(id)));
    // Caregiver accounts (circle members): a notification about children this account currently has live
    // grants for (EVERY child), from a parent of those children (or the system), e.g. pick-ups and help requests.
    const grants = await caregiverGrantsFor(me.id);
    const cgKids = new Set(grants.map((g) => g.child_id));
    const cgCandidates = all.filter((x) => !asParent(x) && (x.child_ids ?? []).length > 0 && (x.child_ids as string[]).every((id) => cgKids.has(id)));
    const parentsOf = cgCandidates.length ? (await linkedParents(cgCandidates.flatMap((x) => x.child_ids as string[]))).parents : new Map<string, Set<string>>();
    const asCaregiver = (x: Row) => cgCandidates.includes(x) &&
      (!x.actor_id || (x.child_ids as string[]).every((id) => parentsOf.get(id)?.has(x.actor_id) ?? false));
    const rows = all.filter((x) => asParent(x) || asCaregiver(x));
    const names = await namesFor(rows.map((x) => x.actor_id));
    return ok({
      notifications: rows.map((x) => ({
        id: x.id,
        actor_id: x.actor_id ?? null,
        actor_name: names[x.actor_id] ?? "",
        type: x.type,
        category: x.category || "info",
        key: x.title,
        params: x.metadata?.params ?? {},
        audit_id: x.metadata?.audit_id ?? null,
        link: x.link ?? null,
        entity_type: x.entity_type ?? null,
        entity_id: x.entity_id ?? null,
        child_ids: x.child_ids ?? [],
        is_read: !!x.is_read,
        created_at: x.created_at,
      })),
      read_ids: ((check(r, "list reads") ?? []) as Row[]).map((x) => x.item_id),
    });
  },

  /** Marks Activities items read (ids as shown in the feed; "act-notif-<id>" also marks the notification). */
  async "mark-read"(req, body) {
    const me = await requireUser(req);
    await markRead(me.id, readIds(body.item_ids));
    return ok({});
  },
}));
