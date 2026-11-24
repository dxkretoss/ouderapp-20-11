/**
 * Alleen voor tests: twee gekoppelde ouders (A en B) met één kind, plus een vreemde ouder C, tegen de
 * nagebootste manage-expenses / manage-still-needed (src/lib/mock/costs.js, zelfde contract als de edge functions).
 */
import { maak } from "./mock/costs.js";
class Fout extends Error {
    constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
let teller = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++teller).padStart(12, "0")}`;
const nu = () => new Date(Date.now() + teller).toISOString();
const ok = (p = {}) => ({ status: 200, data: { success: true, ...p } });
function gebruikerVoor(db, token) {
    const s = db.sessions.find((x) => x.token === token);
    const p = s && db.profiles.find((x) => x.id === s.user_id);
    if (!p)
        throw new Fout(401, "UNAUTHORIZED", "no session");
    return p;
}
function toegang(db, uid, kid) {
    const c = db.children.find((x) => x.id === kid);
    if (!c || (c.created_by !== uid && !db.child_parents.some((cp) => cp.child_id === kid && cp.parent_id === uid)))
        throw new Fout(404, "NOT_FOUND", "child");
    return c;
}
export function kostenGezin() {
    const h = maak({ Fout, ok, uuid, nu, gebruikerVoor, toegang });
    const [A, B, C, KIND, KIND_C] = [uuid(), uuid(), uuid(), uuid(), uuid()];
    const db = {
        profiles: [{ id: A, name: "A" }, { id: B, name: "B" }, { id: C, name: "C" }],
        sessions: [{ token: "tA", user_id: A }, { token: "tB", user_id: B }, { token: "tC", user_id: C }],
        children: [{ id: KIND, created_by: A }, { id: KIND_C, created_by: C }],
        child_parents: [{ child_id: KIND, parent_id: B, can_edit: true }],
        connections: [{ parent_1_id: A, parent_2_id: B, status: "active" }],
    };
    /** Roept een actie aan als ouder "A" | "B" | "C"; geeft de payload of { fout: code }. */
    const roep = (wie, functie, actie, body = {}) => {
        try {
            const r = h[functie][actie](db, { action: actie, ...body }, `t${wie}`);
            return JSON.parse(JSON.stringify(r.data));
        }
        catch (e) {
            if (e instanceof Fout)
                return { fout: e.code };
            throw e;
        }
    };
    const kosten = (wie, actie, body) => roep(wie, "manage-expenses", actie, body);
    return { db, A, B, C, KIND, KIND_C, kosten, nogNodig: (wie, actie, body) => roep(wie, "manage-still-needed", actie, body) };
}
