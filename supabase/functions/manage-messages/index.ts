// manage-messages — conversations (one per topic) and messages between the two connected parents.
// Rules: session required; the user comes ONLY from the session; a conversation is visible only to its
// creator and its other parent; sending needs an ACTIVE connection between the two; messages are
// append-only (no edit/delete); pin / mute / read state is per user (conversation_reads).
// A parent without a connected co-parent can prepare topics (other_parent_id NULL, visible only to them);
// as soon as exactly one co-parent is connected, `list` attaches those topics to that co-parent.
// Per user and private: the unsent draft per conversation (conversation_reads.draft, save-draft).
// "Akkoord geven" on a question of the other parent: `agree` records it (message_agreements, one per
// message), posts a short confirmation message and links the appointment the client created; both
// parents see the agreement in `messages`.
import { childIdsFor, coParentIdsFor, pairOf } from "../_shared/access.ts";
import { db } from "../_shared/db.ts";
import {
  CONVERSATION_COLS,
  ConversationRow,
  isConnected,
  loadConversationFor,
  MESSAGE_COLS,
  otherOf,
} from "../_shared/messages-access.ts";
import { Body, check, err, ok, serveActions } from "../_shared/respond.ts";
import { requireUser, SessionUser } from "../_shared/session.ts";
import { resolveAvatars } from "../_shared/storage.ts";
import { optText, requireUuid } from "../_shared/util.ts";

const MAX_PINS = 3;
const MAX_MESSAGE = 4000;
const MAX_TITLE = 120;
const MAX_DRAFT = 4000;
const MAX_LABEL = 200;
const TONE_LEVELS = ["geen", "licht", "escalerend", "dreigend"];

interface ReadRow {
  conversation_id: string;
  user_id: string;
  last_read_at: string | null;
  pinned: boolean;
  muted_until: string | null;
  archived: boolean;
  draft?: string | null;
  draft_updated_at?: string | null;
}

interface CoParent {
  id: string;
  name: string;
  avatar: string | null;
}

async function coParentsOf(userId: string): Promise<CoParent[]> {
  const ids = await coParentIdsFor(userId);
  if (!ids.length) return [];
  const rows = (check(
    await db().from("profiles").select("id, name, avatar_url").in("id", ids),
    "load co-parents",
  ) ?? []) as Array<{ id: string; name: string; avatar_url: string | null }>;
  const avatars = await resolveAvatars(rows.map((r) => r.avatar_url));
  return rows.map((r, i) => ({ id: r.id, name: r.name || "", avatar: avatars[i] }));
}

async function readsFor(userId: string, conversationIds: string[]): Promise<Map<string, ReadRow>> {
  const map = new Map<string, ReadRow>();
  if (!conversationIds.length) return map;
  const rows = (check(
    await db().from("conversation_reads").select("*").eq("user_id", userId).in("conversation_id", conversationIds),
    "load reads",
  ) ?? []) as ReadRow[];
  for (const r of rows) map.set(r.conversation_id, r);
  return map;
}

async function upsertRead(userId: string, conversationId: string, patch: Partial<ReadRow>): Promise<void> {
  check(
    await db()
      .from("conversation_reads")
      .upsert({ conversation_id: conversationId, user_id: userId, ...patch }, { onConflict: "conversation_id,user_id" }),
    "save read state",
  );
}

/** Messages from the other parent after my read marker. */
async function unreadCount(userId: string, c: ConversationRow, read: ReadRow | undefined): Promise<number> {
  if (!c.other_parent_id || !c.last_message_at) return 0;
  if (!c.last_message_sender_id || c.last_message_sender_id === userId) {
    // the latest message is mine: everything before it counts as seen when I replied after it
    if (read?.last_read_at && read.last_read_at >= c.last_message_at) return 0;
  }
  let q = db()
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", c.id)
    .neq("sender_id", userId);
  if (read?.last_read_at) q = q.gt("created_at", read.last_read_at);
  const res = await q;
  if (res.error) {
    console.error("[manage-messages] unread count:", res.error);
    return 0;
  }
  return res.count ?? 0;
}

async function myConversations(userId: string): Promise<ConversationRow[]> {
  return (check(
    await db()
      .from("conversations")
      .select(CONVERSATION_COLS)
      .or(`created_by.eq.${userId},other_parent_id.eq.${userId}`)
      .order("last_message_at", { ascending: false, nullsFirst: false }),
    "list conversations",
  ) ?? []) as ConversationRow[];
}

async function toApi(
  me: SessionUser,
  c: ConversationRow,
  ctx: { read?: ReadRow; coParents: CoParent[]; myChildren: Set<string>; connected: Set<string>; profiles: Map<string, CoParent> },
) {
  const other = otherOf(c, me.id);
  const read = ctx.read;
  const mutedUntil = read?.muted_until && new Date(read.muted_until).getTime() > Date.now() ? read.muted_until : null;
  return {
    id: c.id,
    title: c.title || "",
    related_child_id: c.related_child_id && ctx.myChildren.has(c.related_child_id) ? c.related_child_id : null,
    created_by: c.created_by,
    other_parent_id: c.other_parent_id,
    other_parent: other ? ctx.profiles.get(other) ?? { id: other, name: "", avatar: null } : null,
    draft: !c.other_parent_id,
    can_send: !!other && ctx.connected.has(other),
    last_message_text: c.last_message_text,
    last_message_at: c.last_message_at,
    last_message_sender_id: c.last_message_sender_id,
    created_at: c.created_at,
    updated_at: c.updated_at,
    unread: await unreadCount(me.id, c, read),
    pinned: !!read?.pinned,
    muted_until: mutedUntil,
    archived: !!read?.archived,
    // Only ever the session user's own read row: the other parent's draft never leaves the server.
    my_draft: read?.draft ?? null,
  };
}

async function buildContext(me: SessionUser, rows: ConversationRow[], coParents?: CoParent[]) {
  const cps = coParents ?? (await coParentsOf(me.id));
  const profiles = new Map(cps.map((p) => [p.id, p]));
  // former co-parents (disconnected) still show their name on old conversations
  const missing = [...new Set(rows.map((c) => otherOf(c, me.id)).filter((id): id is string => !!id && !profiles.has(id)))];
  if (missing.length) {
    const extra = (check(
      await db().from("profiles").select("id, name").in("id", missing),
      "load former co-parents",
    ) ?? []) as Array<{ id: string; name: string }>;
    for (const p of extra) profiles.set(p.id, { id: p.id, name: p.name || "", avatar: null });
  }
  return {
    coParents: cps,
    profiles,
    connected: new Set(cps.map((p) => p.id)),
    myChildren: new Set(await childIdsFor(me.id)),
    reads: await readsFor(me.id, rows.map((c) => c.id)),
  };
}

async function conversationOut(me: SessionUser, c: ConversationRow) {
  const ctx = await buildContext(me, [c]);
  return toApi(me, c, { ...ctx, read: ctx.reads.get(c.id) });
}

function messageOut(m: Record<string, any>) {
  return {
    id: m.id,
    conversation_id: m.conversation_id,
    sender_id: m.sender_id,
    content: m.content,
    tone_level: m.tone_level || "geen",
    is_system: !!m.is_system,
    created_at: m.created_at,
    client_id: m.client_id ?? null,
  };
}

function clientId(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || !/^[A-Za-z0-9_-]{6,64}$/.test(v)) throw err.validation("client_id is invalid");
  return v;
}

function toneLevel(v: unknown): string {
  return typeof v === "string" && TONE_LEVELS.includes(v) ? v : "geen";
}

function content(v: unknown): string {
  if (typeof v !== "string") throw err.validation("content is required");
  const t = v.trim();
  if (!t) throw err.validation("content is required");
  if (t.length > MAX_MESSAGE) throw err.validation(`content is too long (max ${MAX_MESSAGE})`);
  return t;
}

/** Inserts one message (idempotent per client_id) and moves the conversation's "last message". */
async function insertMessage(
  me: SessionUser,
  c: ConversationRow,
  text: string,
  tone: string,
  cid: string | null,
  opts: { system?: boolean; clearDraft?: boolean } = {},
) {
  if (cid) {
    const existing = check(
      await db()
        .from("messages")
        .select(MESSAGE_COLS)
        .eq("conversation_id", c.id)
        .eq("sender_id", me.id)
        .eq("client_id", cid)
        .maybeSingle(),
      "find retried message",
    ) as Record<string, any> | null;
    if (existing) return existing;
  }
  const msg = check(
    await db()
      .from("messages")
      .insert({ conversation_id: c.id, sender_id: me.id, content: text, tone_level: tone, is_system: !!opts.system, client_id: cid })
      .select(MESSAGE_COLS)
      .single(),
    "insert message",
  ) as Record<string, any>;
  check(
    await db()
      .from("conversations")
      .update({ last_message_text: text.slice(0, 500), last_message_at: msg.created_at, last_message_sender_id: me.id })
      .eq("id", c.id),
    "update conversation",
  );
  await upsertRead(me.id, c.id, {
    last_read_at: msg.created_at,
    ...(opts.clearDraft ? { draft: null, draft_updated_at: new Date().toISOString() } : {}),
  });
  c.last_message_text = text.slice(0, 500);
  c.last_message_at = msg.created_at;
  c.last_message_sender_id = me.id;
  return msg;
}

async function assertCanSend(me: SessionUser, c: ConversationRow): Promise<void> {
  const other = otherOf(c, me.id);
  if (!other) throw err.forbidden("Connect the other parent before sending");
  if (!(await isConnected(me.id, other))) throw err.forbidden("You are no longer connected with this parent");
}

async function unreadTotal(me: SessionUser): Promise<number> {
  const rows = (await myConversations(me.id)).filter((c) => c.other_parent_id);
  const reads = await readsFor(me.id, rows.map((c) => c.id));
  const counts = await Promise.all(rows.map((c) => unreadCount(me.id, c, reads.get(c.id))));
  return counts.reduce((s, n) => s + n, 0);
}

interface AgreementRow {
  message_id: string;
  conversation_id: string;
  agreed_by: string | null;
  label: string;
  event_id: string | null;
  confirmation_message_id: string | null;
  created_at: string;
}
const AGREEMENT_COLS = "message_id, conversation_id, agreed_by, label, event_id, confirmation_message_id, created_at";

function agreementOut(me: SessionUser, a: AgreementRow) {
  return {
    message_id: a.message_id,
    agreed_by: a.agreed_by,
    mine: a.agreed_by === me.id,
    label: a.label,
    in_agenda: !!a.event_id,
    // The appointment id only for the parent who created it; the other parent finds it in the shared agenda.
    event_id: a.agreed_by === me.id ? a.event_id : null,
    created_at: a.created_at,
  };
}

async function agreementsOf(me: SessionUser, conversationId: string) {
  const rows = (check(
    await db().from("message_agreements").select(AGREEMENT_COLS).eq("conversation_id", conversationId).limit(500),
    "load agreements",
  ) ?? []) as AgreementRow[];
  return rows.map((a) => agreementOut(me, a));
}

/** Draft text: '' / null clears it. Never trimmed away completely (keeps line breaks the user typed). */
function draftText(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") throw err.validation("draft must be a string");
  if (v.length > MAX_DRAFT) throw err.validation(`draft is too long (max ${MAX_DRAFT})`);
  return v.trim() ? v : null;
}

const handlers = {
  /**
   * All conversations of the user + co-parents + total unread. Prepared topics (made while Solo) stay
   * private until the creator shares them explicitly (update with share: true).
   */
  async list(req: Request) {
    const me = await requireUser(req);
    const coParents = await coParentsOf(me.id);
    const rows = await myConversations(me.id);
    const ctx = await buildContext(me, rows, coParents);
    const conversations = await Promise.all(rows.map((c) => toApi(me, c, { ...ctx, read: ctx.reads.get(c.id) })));
    return ok({
      conversations,
      co_parents: coParents,
      unread_total: conversations.reduce((s, c) => s + (c.archived ? 0 : c.unread), 0),
    });
  },

  /** Lightweight count for the bottom-nav badge. */
  async unread(req: Request) {
    const me = await requireUser(req);
    return ok({ unread_total: await unreadTotal(me) });
  },

  /** New topic. Without a connected co-parent it is a prepared topic (visible only to the creator). */
  async create(req: Request, body: Body) {
    const me = await requireUser(req);
    const title = optText(body.title, "title", MAX_TITLE);
    if (!title) throw err.validation("title is required");
    let childId: string | null = null;
    if (body.child_id !== undefined && body.child_id !== null && body.child_id !== "") {
      childId = requireUuid(body.child_id, "child_id");
      if (!(await childIdsFor(me.id)).includes(childId)) throw err.notFound("Child not found");
    }
    if (body.other_parent_id !== undefined && body.other_parent_id !== null) requireUuid(body.other_parent_id, "other_parent_id");
    // The other parent of this child (per child a different co-parent is possible); without a child the
    // chosen or only co-parent. None (Solo child) = a prepared topic, private until shared.
    const other = await pairOf(me.id, childId ? [childId] : [], body.other_parent_id ?? undefined);
    const initial = body.initial_message === undefined || body.initial_message === null || body.initial_message === ""
      ? null
      : content(body.initial_message);
    if (initial && !other) throw err.forbidden("Connect the other parent before sending");
    const now = new Date().toISOString();
    const c = check(
      await db()
        .from("conversations")
        .insert({
          title,
          type: "topic",
          created_by: me.id,
          other_parent_id: other,
          related_child_id: childId,
          is_pinned: false,
          is_archived: false,
          last_message_text: null,
          last_message_at: now,
        })
        .select(CONVERSATION_COLS)
        .single(),
      "create conversation",
    ) as ConversationRow;
    await upsertRead(me.id, c.id, { last_read_at: now });
    let message: ReturnType<typeof messageOut> | null = null;
    if (initial) message = messageOut(await insertMessage(me, c, initial, toneLevel(body.tone_level), clientId(body.client_id)));
    return ok({ conversation: await conversationOut(me, c), message });
  },

  /**
   * Messages of one conversation, oldest first. `since` (ISO) returns only newer ones (polling).
   * Marks the conversation as read unless `mark_read: false`.
   */
  async messages(req: Request, body: Body) {
    const me = await requireUser(req);
    const c = await loadConversationFor(me.id, requireUuid(body.conversation_id, "conversation_id"));
    let since: string | null = null;
    if (body.since !== undefined && body.since !== null && body.since !== "") {
      if (typeof body.since !== "string" || Number.isNaN(Date.parse(body.since))) throw err.validation("since is invalid");
      since = new Date(body.since).toISOString();
    }
    let q = db().from("messages").select(MESSAGE_COLS).eq("conversation_id", c.id);
    if (since) q = q.gt("created_at", since);
    // newest 500, returned oldest first
    const rows = ((check(await q.order("created_at", { ascending: false }).limit(500), "load messages") ?? []) as Record<string, any>[])
      .reverse();
    if (body.mark_read !== false && c.other_parent_id) {
      const last = rows.length ? rows[rows.length - 1].created_at : null;
      const stamp = last && last > new Date().toISOString() ? last : new Date().toISOString();
      await upsertRead(me.id, c.id, { last_read_at: stamp });
    }
    return ok({ conversation: await conversationOut(me, c), messages: rows.map(messageOut), agreements: await agreementsOf(me, c.id) });
  },

  /** Send a message. Needs an attached other parent with an ACTIVE connection. */
  async send(req: Request, body: Body) {
    const me = await requireUser(req);
    const c = await loadConversationFor(me.id, requireUuid(body.conversation_id, "conversation_id"));
    const text = content(body.content);
    await assertCanSend(me, c);
    const msg = await insertMessage(me, c, text, toneLevel(body.tone_level), clientId(body.client_id), { clearDraft: true });
    return ok({ message: messageOut(msg), conversation: await conversationOut(me, c) });
  },

  /** Mark as read up to now. */
  async "mark-read"(req: Request, body: Body) {
    const me = await requireUser(req);
    const c = await loadConversationFor(me.id, requireUuid(body.conversation_id, "conversation_id"));
    await upsertRead(me.id, c.id, { last_read_at: new Date().toISOString() });
    return ok({ conversation: await conversationOut(me, c) });
  },

  /**
   * Per-user preferences: `pinned` (max 3), `muted_until` (ISO or null), `archived`;
   * `title` only by the creator.
   */
  async update(req: Request, body: Body) {
    const me = await requireUser(req);
    const c = await loadConversationFor(me.id, requireUuid(body.conversation_id, "conversation_id"));
    const patch: Partial<ReadRow> = {};
    if (body.pinned !== undefined) {
      if (typeof body.pinned !== "boolean") throw err.validation("pinned must be a boolean");
      if (body.pinned) {
        const pins = (check(
          await db().from("conversation_reads").select("conversation_id").eq("user_id", me.id).eq("pinned", true),
          "count pins",
        ) ?? []) as Array<{ conversation_id: string }>;
        if (pins.filter((p) => p.conversation_id !== c.id).length >= MAX_PINS) throw err.validation("PIN_LIMIT");
      }
      patch.pinned = body.pinned;
    }
    if (body.muted_until !== undefined) {
      if (body.muted_until === null || body.muted_until === "") patch.muted_until = null;
      else if (typeof body.muted_until === "string" && !Number.isNaN(Date.parse(body.muted_until))) {
        patch.muted_until = new Date(body.muted_until).toISOString();
      } else throw err.validation("muted_until is invalid");
    }
    if (body.archived !== undefined) {
      if (typeof body.archived !== "boolean") throw err.validation("archived must be a boolean");
      patch.archived = body.archived;
    }
    if (body.title !== undefined) {
      if (c.created_by !== me.id) throw err.forbidden("Only the creator can rename a topic");
      const title = optText(body.title, "title", MAX_TITLE);
      if (!title) throw err.validation("title is required");
      check(await db().from("conversations").update({ title }).eq("id", c.id), "rename conversation");
      c.title = title;
    }
    // Share a prepared topic with the other parent (of its child). Only the creator, only once.
    if (body.share === true) {
      if (c.created_by !== me.id) throw err.notFound();
      if (!c.other_parent_id) {
        const other = await pairOf(me.id, c.related_child_id ? [c.related_child_id] : [], body.other_parent_id ?? undefined);
        if (!other) throw err.forbidden("Connect the other parent before sharing");
        check(await db().from("conversations").update({ other_parent_id: other }).eq("id", c.id).is("other_parent_id", null), "share conversation");
        c.other_parent_id = other;
      }
    }
    if (Object.keys(patch).length) await upsertRead(me.id, c.id, patch);
    return ok({ conversation: await conversationOut(me, c) });
  },

  /** The user's own unsent text for this conversation (private; also for prepared topics). */
  async "save-draft"(req: Request, body: Body) {
    const me = await requireUser(req);
    const c = await loadConversationFor(me.id, requireUuid(body.conversation_id, "conversation_id"));
    const draft = draftText(body.draft);
    await upsertRead(me.id, c.id, { draft, draft_updated_at: new Date().toISOString() });
    return ok({ conversation_id: c.id, draft });
  },

  async "clear-draft"(req: Request, body: Body) {
    const me = await requireUser(req);
    const c = await loadConversationFor(me.id, requireUuid(body.conversation_id, "conversation_id"));
    await upsertRead(me.id, c.id, { draft: null, draft_updated_at: new Date().toISOString() });
    return ok({ conversation_id: c.id, draft: null });
  },

  /**
   * Agree to a question the OTHER parent asked in this conversation. Records the agreement once per message,
   * posts a confirmation message (and the optional note) so the other parent sees it, and links the appointment
   * the client created in the shared agenda (event_id, must be the caller's own appointment). Repeating the call
   * returns the existing agreement (and only fills in a missing event_id).
   */
  async agree(req: Request, body: Body, ctx: { isEn: boolean }) {
    const me = await requireUser(req);
    const c = await loadConversationFor(me.id, requireUuid(body.conversation_id, "conversation_id"));
    const messageId = requireUuid(body.message_id, "message_id");
    const label = optText(body.label, "label", MAX_LABEL);
    if (!label) throw err.validation("label is required");
    const note = body.note === undefined || body.note === null || body.note === "" ? null : content(body.note);
    const noteClientId = note ? clientId(body.client_id) : null;
    let eventId: string | null = null;
    if (body.event_id !== undefined && body.event_id !== null && body.event_id !== "") {
      eventId = requireUuid(body.event_id, "event_id");
      const ev = check(
        await db().from("calendar_events").select("id, created_by").eq("id", eventId).maybeSingle(),
        "load event",
      ) as { id: string; created_by: string } | null;
      if (!ev || ev.created_by !== me.id) throw err.notFound("Appointment not found");
    }
    const msg = check(
      await db().from("messages").select("id, sender_id, is_system").eq("id", messageId).eq("conversation_id", c.id).maybeSingle(),
      "load message",
    ) as { id: string; sender_id: string; is_system: boolean } | null;
    if (!msg) throw err.notFound("Message not found");
    if (msg.sender_id === me.id || msg.is_system) throw err.validation("Only a question of the other parent can be agreed to");
    await assertCanSend(me, c);

    const existing = check(
      await db().from("message_agreements").select(AGREEMENT_COLS).eq("message_id", msg.id).maybeSingle(),
      "load agreement",
    ) as AgreementRow | null;
    if (existing) {
      if (!existing.event_id && eventId && existing.agreed_by === me.id) {
        check(await db().from("message_agreements").update({ event_id: eventId }).eq("message_id", msg.id), "link event");
        existing.event_id = eventId;
      }
      return ok({ agreement: agreementOut(me, existing), messages: [], conversation: await conversationOut(me, c), already: true });
    }

    // Claim the agreement FIRST (message_id is the primary key): a parallel agree loses here and gets the
    // existing one back, so the confirmation message is posted exactly once.
    const ins = await db()
      .from("message_agreements")
      .insert({ message_id: msg.id, conversation_id: c.id, agreed_by: me.id, label, event_id: eventId, confirmation_message_id: null })
      .select(AGREEMENT_COLS)
      .single();
    if (ins.error) {
      const first = check(
        await db().from("message_agreements").select(AGREEMENT_COLS).eq("message_id", msg.id).maybeSingle(),
        "load agreement",
      ) as AgreementRow | null;
      if (!first) check(ins as any, "insert agreement");
      return ok({ agreement: agreementOut(me, first as AgreementRow), messages: [], conversation: await conversationOut(me, c), already: true });
    }
    let confirmation: Awaited<ReturnType<typeof insertMessage>>;
    try {
      confirmation = await insertMessage(me, c, `${ctx.isEn ? "Agreed" : "Akkoord"}: ${label}`, "geen", null, { system: true });
    } catch (e) {
      // no confirmation message → no agreement (the user can try again)
      await db().from("message_agreements").delete().eq("message_id", msg.id).is("confirmation_message_id", null);
      throw e;
    }
    const linked = check(
      await db().from("message_agreements").update({ confirmation_message_id: confirmation.id }).eq("message_id", msg.id).select(AGREEMENT_COLS).maybeSingle(),
      "link confirmation",
    ) as AgreementRow | null;
    const out = [messageOut(confirmation)];
    if (note) out.push(messageOut(await insertMessage(me, c, note, "geen", noteClientId, { clearDraft: false })));
    return ok({ agreement: agreementOut(me, (linked ?? ins.data) as AgreementRow), messages: out, conversation: await conversationOut(me, c) });
  },

  /** Only a prepared topic without messages can be removed (by its creator); sent messages are history. */
  async delete(req: Request, body: Body) {
    const me = await requireUser(req);
    const c = await loadConversationFor(me.id, requireUuid(body.conversation_id, "conversation_id"));
    if (c.created_by !== me.id) throw err.forbidden("Only the creator can remove a topic");
    const res = await db().from("messages").select("id", { count: "exact", head: true }).eq("conversation_id", c.id);
    if (res.error) check(res as any, "count messages");
    if ((res.count ?? 0) > 0) throw err.forbidden("A conversation with messages cannot be removed");
    check(await db().from("conversations").delete().eq("id", c.id), "delete conversation");
    return ok({});
  },
};


Deno.serve(serveActions("manage-messages", handlers));
