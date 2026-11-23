import { corsHeaders, handleOptions } from "./cors.ts";

export type ErrorCode =
  | "VALIDATION"
  | "WEAK_PASSWORD"
  | "EMAIL_TAKEN"
  | "INVALID_CREDENTIALS"
  | "NOT_VERIFIED"
  | "CODE_INVALID"
  | "CODE_EXPIRED"
  | "TOO_MANY_ATTEMPTS"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVITE_EXPIRED"
  | "INVITE_USED"
  | "INVITE_CANCELLED"
  | "INVITE_DECLINED"
  | "INVITE_OWN"
  | "INVITE_EMAIL_MISMATCH"
  | "CHILD_LIMIT"
  | "RATE_LIMITED"
  | "GONE"
  | "SERVER";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

/** HTTP 200 { success: true, ...payload } */
export function ok(payload: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ success: true, ...payload }), { status: 200, headers: jsonHeaders });
}

/** HTTP 4xx/5xx { success: false, code, message } */
export function fail(status: number, code: ErrorCode, message: string): Response {
  return new Response(JSON.stringify({ success: false, code, message }), { status, headers: jsonHeaders });
}

/** Throw this anywhere inside a handler to answer with a coded error. */
export class HttpError extends Error {
  status: number;
  code: ErrorCode;
  constructor(status: number, code: ErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const err = {
  validation: (m = "Invalid request") => new HttpError(400, "VALIDATION", m),
  unauthorized: (m = "No valid session") => new HttpError(401, "UNAUTHORIZED", m),
  forbidden: (m = "Not allowed") => new HttpError(403, "FORBIDDEN", m),
  notFound: (m = "Not found") => new HttpError(404, "NOT_FOUND", m),
  server: (m = "Internal error") => new HttpError(500, "SERVER", m),
};

/** Throws a SERVER error (logged) when a Supabase call returned an error. */
export function check<T>(res: { data: T; error: unknown }, context: string): T {
  if (res.error) {
    console.error(`[db] ${context}:`, res.error);
    throw err.server(`Database error (${context})`);
  }
  return res.data;
}

export type Body = Record<string, any>;

async function readBody(req: Request): Promise<Body> {
  if (req.method !== "POST") throw new HttpError(405, "VALIDATION", "Use POST");
  const text = await req.text();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    return parsed as Body;
  } catch {
    throw err.validation("Body must be a JSON object");
  }
}

export type Handler = (req: Request, body: Body, ctx: { action: string; isEn: boolean }) => Promise<Response>;

/**
 * Wraps a function: OPTIONS, JSON body parsing, action dispatch and error mapping.
 * `defaultAction` is used when the body carries no action.
 */
export function serveActions(
  name: string,
  handlers: Record<string, Handler>,
  defaultAction?: string,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const pre = handleOptions(req);
    if (pre) return pre;
    try {
      const body = await readBody(req);
      const action = typeof body.action === "string" && body.action ? body.action : defaultAction || "";
      const handler = Object.prototype.hasOwnProperty.call(handlers, action) ? handlers[action] : undefined;
      if (!handler) return fail(400, "VALIDATION", `Unknown action "${action}"`);
      const isEn = String(body.lang ?? "").toLowerCase().startsWith("en");
      return await handler(req, body, { action, isEn });
    } catch (e) {
      if (e instanceof HttpError) return fail(e.status, e.code, e.message);
      console.error(`[${name}] unhandled error:`, e);
      return fail(500, "SERVER", "Internal error");
    }
  };
}

/** 410 stub for retired functions. */
export function goneHandler(name: string): (req: Request) => Response {
  return (req: Request) => {
    const pre = handleOptions(req);
    if (pre) return pre;
    return fail(410, "GONE", `The function "${name}" has been retired. Please update the app.`);
  };
}
