// admin-api — the ONLY backend of the super admin panel (separate project ouderapp_admin_react).
// Public function (deploy with --no-verify-jwt); every action except `login` requires an ADMIN session
// in the x-admin-token header. Admin sessions live in admin_sessions and are separate from the app's
// user_sessions: an app token never works here and an admin token never works in the app.
//
// Security:
// - Only profiles with role 'superadmin', verified and not disabled can sign in; any other account gets the
//   same INVALID_CREDENTIALS as a wrong password (no account enumeration).
// - Login rate limits per e-mail (5 / 15 min) and per IP (10 / 15 min), on top of bcrypt.
// - Sessions: 8 h absolute, 30 min idle, only the sha256 of the token is stored. Every request re-checks the
//   admin's role, verification and disabled state, so demoting/disabling an admin ends its sessions at once.
// - Optional hardening via secrets: ADMIN_IP_ALLOWLIST (comma-separated IPs) and ADMIN_ORIGINS (allowed
//   browser origins of the admin panel).
// - Data minimisation: no message contents, documents, BSN, medical notes, bank accounts or passwords ever leave
//   this function; private ("only for me") appointments are listed without their title.
// - Every action is written to admin_audit_log.
import { db } from "../_shared/db.ts";
import { check, err, HttpError, ok, serveActions } from "../_shared/respond.ts";
import { hashPassword, verifyPassword } from "../_shared/password.ts";
import { clientIp, countRateEvents, recordRateEvent } from "../_shared/codes.ts";
import { revokeAllSessions } from "../_shared/session.ts";
import { normalizeEmail, optText, randomHex, requireUuid, sha256Hex } from "../_shared/util.ts";

const SESSION_HOURS = 8;
const IDLE_MINUTES = 30;
const EMAIL_FAILS_PER_15_MIN = 5;
const IP_FAILS_PER_15_MIN = 10;
const MAX_PAGE_SIZE = 100;
const ADMIN_ROLE = "superadmin";

interface Admin {
  id: string;
  email: string;
  name: string;
  session_id: string;
  ip: string | null;
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

function listEnv(name: string): string[] {
  return (Deno.env.get(name) || "").split(",").map((s) => s.trim()).filter(Boolean);
}

/** Optional IP allow-list and origin check; both apply to every action, including login. */
function assertNetwork(req: Request): void {
  const ips = listEnv("ADMIN_IP_ALLOWLIST");
  if (ips.length) {
    const ip = clientIp(req);
    if (!ip || !ips.includes(ip)) throw err.forbidden("Not allowed from this network");
  }
  const origins = listEnv("ADMIN_ORIGINS");
  if (origins.length) {
    const origin = req.headers.get("origin") || "";
    if (!origins.includes(origin)) throw err.forbidden("Not allowed from this origin");
  }
}

function readAdminToken(req: Request): string | null {
  const raw = (req.headers.get("x-admin-token") || "").trim();
  return /^[0-9a-f]{64}$/i.test(raw) ? raw.toLowerCase() : null;
}

async function audit(adminId: string | null, action: string, targetId: string | null, meta: Record<string, unknown>, ip: string | null) {
  const { error } = await db().from("admin_audit_log").insert({ admin_id: adminId, action, target_id: targetId, meta, ip });
  if (error) console.error("[admin-api] audit failed:", error);
}

/** Valid admin session → the admin; otherwise 401. Also enforces idle timeout and re-checks the role. */
async function requireAdmin(req: Request): Promise<Admin> {
  assertNetwork(req);
  const token = readAdminToken(req);
  if (!token) throw err.unauthorized();
  const hash = await sha256Hex(token);
  const s = check(
    await db().from("admin_sessions").select("id, admin_id, expires_at, revoked_at, last_seen_at").eq("token_hash", hash).maybeSingle(),
    "load admin session",
  ) as { id: string; admin_id: string; expires_at: string; revoked_at: string | null; last_seen_at: string } | null;
  const now = Date.now();
  if (!s || s.revoked_at || new Date(s.expires_at).getTime() <= now) throw err.unauthorized();
  if (now - new Date(s.last_seen_at).getTime() > IDLE_MINUTES * 60_000) {
    await db().from("admin_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", s.id);
    throw err.unauthorized("Session expired");
  }
  const p = check(
    await db().from("profiles").select("id, email, name, role, is_verified, disabled_at").eq("id", s.admin_id).maybeSingle(),
    "load admin profile",
  ) as { id: string; email: string; name: string; role: string; is_verified: boolean; disabled_at: string | null } | null;
  if (!p || p.role !== ADMIN_ROLE || !p.is_verified || p.disabled_at) {
    await db().from("admin_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", s.id);
    throw err.unauthorized();
  }
  const { error } = await db().from("admin_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", s.id);
  if (error) console.warn("[admin-api] touch failed:", error);
  return { id: p.id, email: p.email, name: p.name, session_id: s.id, ip: clientIp(req) };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Exact row count (head request, no rows transferred). */
async function count(table: string, apply: (q: any) => any = (q) => q): Promise<number> {
  const res = await apply(db().from(table).select("*", { count: "exact", head: true }));
  if (res.error) {
    console.error(`[admin-api] count ${table}:`, res.error);
    throw err.server(`Database error (count ${table})`);
  }
  return res.count ?? 0;
}

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

/** Search text for a PostgREST or-filter: strip characters that have meaning in the filter syntax. */
function cleanSearch(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.replace(/[%_,()*\\:"']/g, " ").trim().slice(0, 100);
}

function intIn(v: unknown, min: number, max: number, dflt: number): number {
  const n = Number(v);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : dflt;
}

const LIST_LIMIT = 50;

/**
 * Weekly schedule of a child (children.care_schedule, JSON text) seen from `userId`.
 * The stored days are "ik"/"ander" from the point of view of whoever saved it (ikId); flipped for the other parent.
 */
function scheduleFor(raw: unknown, userId: string): Record<string, unknown> | null {
  let cs: any = raw;
  if (typeof raw === "string") {
    try { cs = JSON.parse(raw); } catch { return null; }
  }
  if (!cs || typeof cs !== "object") return null;
  if (cs.later) return { later: true };
  const days = Array.isArray(cs.dagen) ? cs.dagen.slice(0, 14) : [];
  const own = !cs.ikId || cs.ikId === userId;
  return {
    later: false,
    pattern: typeof cs.patroon === "string" ? cs.patroon : null,
    days: days.map((d: unknown) => ((d === "ik") === own ? "user" : "other")),
    handover_time: typeof cs.wisseltijd === "string" ? cs.wisseltijd : null,
    place: typeof cs.plek === "string" ? cs.plek.slice(0, 80) : null,
    set_by_user: own,
    saved_at: typeof cs.opgeslagen === "string" ? cs.opgeslagen : null,
    confirmation: cs.bevestiging?.status ?? null,
  };
}

const PROFILE_LIST_COLS = "id, email, name, role, usage_mode, is_verified, onboarding_completed, created_at, last_login_at, disabled_at";

/** Admin password policy: stronger than the app's. */
function assertAdminPassword(v: unknown): string {
  if (typeof v !== "string" || v.length < 12 || v.length > 200 || !/[A-Z]/.test(v) || !/[a-z]/.test(v) || !/[0-9]/.test(v) || !/[^A-Za-z0-9]/.test(v)) {
    throw new HttpError(400, "WEAK_PASSWORD", "Use at least 12 characters with upper case, lower case, a digit and a special character");
  }
  return v;
}

/** The target must be an existing, non-admin account (admins are managed in the database, not here). */
async function loadTarget(id: string): Promise<Record<string, any>> {
  const p = check(
    await db().from("profiles").select(`${PROFILE_LIST_COLS}, disabled_reason`).eq("id", id).maybeSingle(),
    "load user",
  ) as Record<string, any> | null;
  if (!p || p.role === ADMIN_ROLE) throw err.notFound("User not found");
  return p;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

Deno.serve(serveActions("admin-api", {
  async login(req, body) {
    assertNetwork(req);
    const ip = clientIp(req);
    let email: string;
    try {
      email = normalizeEmail(body.email);
    } catch {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid e-mail or password");
    }
    if ((await countRateEvents(email, "admin_login_fail", 15)) >= EMAIL_FAILS_PER_15_MIN ||
      (ip && (await countRateEvents(`ip:${ip}`, "ip_admin_login_fail", 15)) >= IP_FAILS_PER_15_MIN)) {
      throw new HttpError(429, "RATE_LIMITED", "Too many failed attempts, try again later");
    }
    const rows = check(
      await db().from("profiles").select("id, email, name, role, password, is_verified, disabled_at").eq("email", email).limit(1),
      "find admin",
    ) as Array<Record<string, any>> | null;
    const p = rows?.[0];
    const eligible = !!p && p.role === ADMIN_ROLE && p.is_verified && !p.disabled_at;
    // Always run bcrypt (verifyPassword uses a dummy hash when there is none) so timing does not reveal accounts.
    const valid = await verifyPassword(body.password, eligible ? p!.password : null);
    if (!eligible || !valid) {
      await recordRateEvent(email, "admin_login_fail");
      if (ip) await recordRateEvent(`ip:${ip}`, "ip_admin_login_fail");
      await audit(null, "login_failed", null, { email }, ip);
      throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid e-mail or password");
    }
    const token = randomHex(32);
    check(
      await db().from("admin_sessions").insert({
        admin_id: p!.id,
        token_hash: await sha256Hex(token),
        expires_at: new Date(Date.now() + SESSION_HOURS * 3_600_000).toISOString(),
        ip,
        user_agent: (req.headers.get("user-agent") || "").slice(0, 300) || null,
      }),
      "create admin session",
    );
    await audit(p!.id, "login", null, {}, ip);
    return ok({
      token,
      expires_in: SESSION_HOURS * 3600,
      idle_timeout: IDLE_MINUTES * 60,
      admin: { id: p!.id, email: p!.email, name: p!.name },
    });
  },

  async me(req) {
    const a = await requireAdmin(req);
    return ok({ admin: { id: a.id, email: a.email, name: a.name }, idle_timeout: IDLE_MINUTES * 60 });
  },

  async logout(req) {
    const a = await requireAdmin(req);
    await db().from("admin_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", a.session_id);
    await audit(a.id, "logout", null, {}, a.ip);
    return ok({});
  },

  async "change-password"(req, body) {
    const a = await requireAdmin(req);
    const next = assertAdminPassword(body.new_password);
    const row = check(await db().from("profiles").select("password").eq("id", a.id).single(), "load admin password") as { password: string | null };
    if (!(await verifyPassword(body.current_password, row.password))) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Current password is incorrect");
    }
    check(await db().from("profiles").update({ password: await hashPassword(next) }).eq("id", a.id), "update admin password");
    // End every other admin session of this admin.
    await db().from("admin_sessions").update({ revoked_at: new Date().toISOString() }).eq("admin_id", a.id).neq("id", a.session_id).is("revoked_at", null);
    await audit(a.id, "password_changed", a.id, {}, a.ip);
    return ok({});
  },

  async dashboard(req) {
    await requireAdmin(req);
    const users = (q: any) => q.neq("role", ADMIN_ROLE);
    const [
      total, verified, disabled, new7, new30, active7, active30,
      together, solo, caregiver, children, connections, pendingInvites, liveSessions,
    ] = await Promise.all([
      count("profiles", users),
      count("profiles", (q) => users(q).eq("is_verified", true)),
      count("profiles", (q) => users(q).not("disabled_at", "is", null)),
      count("profiles", (q) => users(q).gte("created_at", daysAgo(7))),
      count("profiles", (q) => users(q).gte("created_at", daysAgo(30))),
      count("profiles", (q) => users(q).gte("last_login_at", daysAgo(7))),
      count("profiles", (q) => users(q).gte("last_login_at", daysAgo(30))),
      count("profiles", (q) => users(q).eq("usage_mode", "together")),
      count("profiles", (q) => users(q).eq("usage_mode", "solo")),
      count("profiles", (q) => users(q).eq("usage_mode", "caregiver")),
      count("children"),
      count("parent_connections", (q) => q.in("status", ["connected", "active"])),
      count("invitations", (q) => q.in("status", ["pending", "sent", "viewed"]).gt("expires_at", new Date().toISOString())),
      count("user_sessions", (q) => q.is("revoked_at", null).gt("expires_at", new Date().toISOString()).gte("last_seen_at", daysAgo(1))),
    ]);
    // Sign-ups per day for the last 30 days (only the timestamp column is transferred).
    const recent = check(
      await db().from("profiles").select("created_at").neq("role", ADMIN_ROLE).gte("created_at", daysAgo(30)).limit(10_000),
      "signups per day",
    ) as Array<{ created_at: string }> | null;
    const perDay: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) perDay[daysAgo(i).slice(0, 10)] = 0;
    for (const r of recent ?? []) {
      const d = r.created_at.slice(0, 10);
      if (d in perDay) perDay[d]++;
    }
    const latest = check(
      await db().from("profiles").select(PROFILE_LIST_COLS).neq("role", ADMIN_ROLE).order("created_at", { ascending: false }).limit(6),
      "latest users",
    );
    return ok({
      users: { total, verified, unverified: total - verified, disabled, new7, new30, active7, active30 },
      usage: { together, solo, caregiver },
      children,
      connections,
      pending_invitations: pendingInvites,
      sessions_24h: liveSessions,
      signups_per_day: Object.entries(perDay).map(([date, n]) => ({ date, count: n })),
      latest_users: latest ?? [],
    });
  },

  async "list-users"(req, body) {
    await requireAdmin(req);
    const page = intIn(body.page, 1, 10_000, 1);
    const size = intIn(body.page_size, 5, MAX_PAGE_SIZE, 20);
    const search = cleanSearch(body.search);
    let q = db().from("profiles").select(PROFILE_LIST_COLS, { count: "exact" }).neq("role", ADMIN_ROLE);
    if (search) q = q.or(`name.ilike.*${search}*,email.ilike.*${search}*`);
    switch (body.status) {
      case "verified": q = q.eq("is_verified", true).is("disabled_at", null); break;
      case "unverified": q = q.eq("is_verified", false); break;
      case "disabled": q = q.not("disabled_at", "is", null); break;
      case "active7": q = q.gte("last_login_at", daysAgo(7)); break;
      case "inactive30": q = q.or(`last_login_at.is.null,last_login_at.lt.${daysAgo(30)}`); break;
    }
    if (["together", "solo", "caregiver"].includes(body.usage)) q = q.eq("usage_mode", body.usage);
    const sorts: Record<string, [string, boolean]> = {
      newest: ["created_at", false], oldest: ["created_at", true], last_login: ["last_login_at", false], name: ["name", true], email: ["email", true],
    };
    const [col, asc] = sorts[body.sort] ?? sorts.newest;
    q = q.order(col, { ascending: asc, nullsFirst: false }).order("id", { ascending: true }).range((page - 1) * size, page * size - 1);
    const res = await q;
    if (res.error) {
      console.error("[admin-api] list users:", res.error);
      throw err.server("Database error (list users)");
    }
    const rows = (res.data ?? []) as Array<Record<string, any>>;
    const ids = rows.map((r) => r.id);
    // Per-page aggregates (three small queries for at most MAX_PAGE_SIZE users).
    const kids = new Map<string, number>(), links = new Map<string, number>(), sessions = new Map<string, number>();
    if (ids.length) {
      const [cp, pc, us] = await Promise.all([
        db().from("child_parents").select("parent_id").in("parent_id", ids),
        db().from("parent_connections").select("parent_1_id, parent_2_id").in("status", ["connected", "active"]).or(`parent_1_id.in.(${ids.join(",")}),parent_2_id.in.(${ids.join(",")})`),
        db().from("user_sessions").select("user_id").in("user_id", ids).is("revoked_at", null).gt("expires_at", new Date().toISOString()),
      ]);
      for (const r of (check(cp, "count children") ?? []) as Array<{ parent_id: string }>) kids.set(r.parent_id, (kids.get(r.parent_id) ?? 0) + 1);
      for (const r of (check(pc, "count connections") ?? []) as Array<{ parent_1_id: string; parent_2_id: string }>) {
        for (const id of [r.parent_1_id, r.parent_2_id]) if (ids.includes(id)) links.set(id, (links.get(id) ?? 0) + 1);
      }
      for (const r of (check(us, "count sessions") ?? []) as Array<{ user_id: string }>) sessions.set(r.user_id, (sessions.get(r.user_id) ?? 0) + 1);
    }
    return ok({
      users: rows.map((r) => ({ ...r, children: kids.get(r.id) ?? 0, co_parents: links.get(r.id) ?? 0, active_sessions: sessions.get(r.id) ?? 0 })),
      total: res.count ?? 0,
      page,
      page_size: size,
    });
  },

  async "get-user"(req, body) {
    const a = await requireAdmin(req);
    const id = requireUuid(body.id, "id");
    const user = await loadTarget(id);
    const now = new Date().toISOString();
    const [cpRes, pcRes, invRes, sesRes, auditCount, lastAudit, evRes, taskRes, expRes, setRes] = await Promise.all([
      db().from("child_parents").select("role, created_at, children(id, name, date_of_birth, created_at, care_schedule)").eq("parent_id", id),
      db().from("parent_connections").select("id, parent_1_id, parent_2_id, status, created_at").or(`parent_1_id.eq.${id},parent_2_id.eq.${id}`),
      db().from("invitations").select("id, to_email, status, created_at, expires_at, accepted_at").eq("from_parent_id", id).order("created_at", { ascending: false }).limit(20),
      db().from("user_sessions").select("id, created_at, last_seen_at, expires_at, revoked_at, user_agent").eq("user_id", id).order("last_seen_at", { ascending: false }).limit(10),
      count("audit_events", (q) => q.eq("actor_id", id)),
      db().from("audit_events").select("created_at").eq("actor_id", id).order("created_at", { ascending: false }).limit(1),
      // Created by this user. Private appointments ("only for me") keep their title private.
      db().from("calendar_events").select("id, title, category, category_key, start_date, start_time, end_date, is_all_day, is_shared, status, child_ids, created_at")
        .eq("created_by", id).is("deleted_at", null).order("start_date", { ascending: false }).limit(LIST_LIMIT),
      db().from("tasks").select("id, title, deadline, is_completed, completed_at, recurrence, user_id, assignee_id, child_ids, created_at")
        .or(`user_id.eq.${id},assignee_id.eq.${id}`).is("deleted_at", null).order("created_at", { ascending: false }).limit(LIST_LIMIT),
      db().from("expenses").select("id, description, amount, category, date, payer_id, created_by, approval_status, status, settled, child_ids, created_at")
        .or(`payer_id.eq.${id},created_by.eq.${id}`).order("date", { ascending: false }).limit(LIST_LIMIT),
      // Never the bank account (bank_iban / bank_account_name).
      db().from("settlements").select("id, amount, status, period, payer_id, receiver_id, created_at, paid_at, finished_at")
        .or(`payer_id.eq.${id},receiver_id.eq.${id}`).order("created_at", { ascending: false }).limit(LIST_LIMIT),
    ]);
    // Children: first name and age only (never BSN, medical notes, allergies, school…).
    const children = ((check(cpRes, "user children") ?? []) as Array<Record<string, any>>)
      .filter((r) => r.children)
      .map((r) => ({ id: r.children.id, name: r.children.name, birth_year: r.children.date_of_birth ? Number(String(r.children.date_of_birth).slice(0, 4)) : null, role: r.role, linked_at: r.created_at, schedule: scheduleFor(r.children.care_schedule, id) }));
    const nameOfChild = new Map(children.map((c) => [c.id, c.name]));
    const childNames = (ids: unknown) => (Array.isArray(ids) ? ids : []).map((cid) => nameOfChild.get(String(cid))).filter(Boolean);
    // Other parents of these children.
    const childIds = children.map((c) => c.id);
    const otherParents = new Map<string, string[]>();
    if (childIds.length) {
      const others = check(await db().from("child_parents").select("child_id, parent_id").in("child_id", childIds).neq("parent_id", id), "other parents") as Array<{ child_id: string; parent_id: string }> | null;
      for (const o of others ?? []) otherParents.set(o.child_id, [...(otherParents.get(o.child_id) ?? []), o.parent_id]);
    }
    const conns = (check(pcRes, "user connections") ?? []) as Array<Record<string, any>>;
    const events = (check(evRes, "user events") ?? []) as Array<Record<string, any>>;
    const tasks = (check(taskRes, "user tasks") ?? []) as Array<Record<string, any>>;
    const expenses = (check(expRes, "user expenses") ?? []) as Array<Record<string, any>>;
    const settlements = (check(setRes, "user settlements") ?? []) as Array<Record<string, any>>;
    const peerIds = [...new Set([
      ...conns.map((c) => (c.parent_1_id === id ? c.parent_2_id : c.parent_1_id)),
      ...[...otherParents.values()].flat(),
      ...tasks.flatMap((t) => [t.user_id, t.assignee_id]),
      ...expenses.flatMap((e) => [e.payer_id, e.created_by]),
      ...settlements.flatMap((x) => [x.payer_id, x.receiver_id]),
    ].filter((p) => p && p !== id))];
    const peers = new Map<string, { name: string; email: string }>();
    if (peerIds.length) {
      const ps = check(await db().from("profiles").select("id, name, email").in("id", peerIds), "peer names") as Array<{ id: string; name: string; email: string }> | null;
      for (const p of ps ?? []) peers.set(p.id, { name: p.name, email: p.email });
    }
    const sessions = ((check(sesRes, "user sessions") ?? []) as Array<Record<string, any>>).map((s) => ({
      ...s,
      active: !s.revoked_at && s.expires_at > now,
    }));
    await audit(a.id, "view_user", id, {}, a.ip);
    return ok({
      user,
      children: children.map((c) => ({ ...c, other_parents: (otherParents.get(c.id) ?? []).map((pid) => ({ id: pid, ...(peers.get(pid) ?? { name: "", email: "" }) })) })),
      connections: conns.map((c) => {
        const pid = c.parent_1_id === id ? c.parent_2_id : c.parent_1_id;
        return { id: c.id, status: c.status, created_at: c.created_at, parent: { id: pid, ...(peers.get(pid) ?? { name: "", email: "" }) } };
      }),
      invitations: check(invRes, "user invitations") ?? [],
      sessions,
      appointments: events.map((e) => (e.is_shared === false
        ? { id: e.id, title: null, private: true, start_date: e.start_date, end_date: e.end_date, start_time: null, is_all_day: e.is_all_day, status: e.status, child_names: childNames(e.child_ids), created_at: e.created_at }
        : { id: e.id, title: e.title, private: false, category: e.category_key || e.category, start_date: e.start_date, end_date: e.end_date, start_time: e.start_time, is_all_day: e.is_all_day, status: e.status, child_names: childNames(e.child_ids), created_at: e.created_at })),
      tasks: tasks.map((t) => ({
        id: t.id, title: t.title, deadline: t.deadline, is_completed: t.is_completed, completed_at: t.completed_at, recurrence: t.recurrence,
        created_by_user: t.user_id === id, assignee: t.assignee_id ? (t.assignee_id === id ? "self" : peers.get(t.assignee_id)?.name || "Other person") : null,
        child_names: childNames(t.child_ids), created_at: t.created_at,
      })),
      expenses: expenses.map((e) => ({
        id: e.id, description: e.description, amount: Number(e.amount), category: e.category, date: e.date, approval_status: e.approval_status, status: e.status, settled: e.settled,
        paid_by_user: e.payer_id === id, payer: e.payer_id === id ? "self" : peers.get(e.payer_id)?.name || "Other parent", child_names: childNames(e.child_ids), created_at: e.created_at,
      })),
      settlements: settlements.map((x) => ({
        id: x.id, amount: Number(x.amount), status: x.status, period: x.period, direction: x.payer_id === id ? "pays" : "receives",
        other: peers.get(x.payer_id === id ? x.receiver_id : x.payer_id)?.name || "Other parent", created_at: x.created_at, paid_at: x.paid_at, finished_at: x.finished_at,
      })),
      totals: {
        appointments: events.length, tasks: tasks.length, open_tasks: tasks.filter((t) => !t.is_completed).length,
        expenses: expenses.length, expenses_amount: Math.round(expenses.filter((e) => e.payer_id === id).reduce((s2, e) => s2 + Number(e.amount || 0), 0) * 100) / 100,
        settlements: settlements.length,
      },
      activity: { events: auditCount, last_event_at: ((check(lastAudit, "last event") ?? []) as Array<{ created_at: string }>)[0]?.created_at ?? null },
    });
  },

  async "disable-user"(req, body) {
    const a = await requireAdmin(req);
    const id = requireUuid(body.id, "id");
    await loadTarget(id);
    const reason = optText(body.reason, "reason", 500) ?? null;
    check(await db().from("profiles").update({ disabled_at: new Date().toISOString(), disabled_reason: reason }).eq("id", id), "disable user");
    await revokeAllSessions(id);
    await audit(a.id, "disable_user", id, { reason }, a.ip);
    return ok({ user: await loadTarget(id) });
  },

  async "enable-user"(req, body) {
    const a = await requireAdmin(req);
    const id = requireUuid(body.id, "id");
    await loadTarget(id);
    check(await db().from("profiles").update({ disabled_at: null, disabled_reason: null }).eq("id", id), "enable user");
    await audit(a.id, "enable_user", id, {}, a.ip);
    return ok({ user: await loadTarget(id) });
  },

}));
