// Conversations are visible ONLY to their two parents: the creator and the other parent.
// A conversation without other_parent_id is a prepared topic of its creator (nobody else sees it).
// Used by manage-messages and ai-tools (conversation summary). Always called with the SESSION user id.
import { ACTIVE_CONNECTION } from "./access.ts";
import { db } from "./db.ts";
import { check, err } from "./respond.ts";

export const CONVERSATION_COLS =
  "id, title, type, related_child_id, created_by, other_parent_id, last_message_text, last_message_at, last_message_sender_id, created_at, updated_at";
export const MESSAGE_COLS = "id, conversation_id, sender_id, content, tone_level, is_system, created_at, client_id";

export interface ConversationRow {
  id: string;
  title: string | null;
  type: string;
  related_child_id: string | null;
  created_by: string | null;
  other_parent_id: string | null;
  last_message_text: string | null;
  last_message_at: string | null;
  last_message_sender_id: string | null;
  created_at: string;
  updated_at: string;
}

export const isParticipant = (c: ConversationRow, userId: string): boolean =>
  c.created_by === userId || c.other_parent_id === userId;

/** The other participant from the viewer's side (null for a prepared topic). */
export const otherOf = (c: ConversationRow, userId: string): string | null =>
  c.created_by === userId ? c.other_parent_id : c.created_by;

/** Loads a conversation the user takes part in; NOT_FOUND otherwise (no existence leak). */
export async function loadConversationFor(userId: string, conversationId: string): Promise<ConversationRow> {
  const row = check(
    await db().from("conversations").select(CONVERSATION_COLS).eq("id", conversationId).maybeSingle(),
    "load conversation",
  ) as ConversationRow | null;
  if (!row || !isParticipant(row, userId)) throw err.notFound("Conversation not found");
  return row;
}

/** Is there an ACTIVE (undirected) parent_connections row between a and b? */
export async function isConnected(a: string, b: string): Promise<boolean> {
  const rows = check(
    await db()
      .from("parent_connections")
      .select("id")
      .or(`and(parent_1_id.eq.${a},parent_2_id.eq.${b}),and(parent_1_id.eq.${b},parent_2_id.eq.${a})`)
      .in("status", ACTIVE_CONNECTION)
      .limit(1),
    "connection check",
  ) as Array<{ id: string }> | null;
  return !!rows && rows.length > 0;
}
