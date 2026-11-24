import { useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { api, foutTekst } from "@/lib/api";
import { start } from "@/lib/start-store";
/**
 * Het volledige kindprofiel ("Alles over …") van de server: manage-children `get` (bestaande kolommen +
 * profielsecties) en de eigen privénotitie (`get-private-note`, alleen voor de ingelogde ouder).
 * Eén bron: start-store houdt de korte vorm voor lijsten; na wijzigingen aan naam/datum/kleur/foto wordt
 * die opnieuw opgehaald. Beide gekoppelde ouders lezen dezelfde gegevens; bewerken alleen met can_edit.
 */
let state = { kinderen: {}, notities: {}, laden: {} };
const listeners = new Set();
const zet = (p) => { state = { ...state, ...p }; listeners.forEach((l) => l()); };
function meldFout(e) {
    if (e?.code === "UNAUTHORIZED")
        return;
    toast.error(foutTekst(e), { id: "kindprofiel-fout" });
}
/** Het API-kind zonder bsn (dat veld toont dit scherm niet en bewaren we niet in het geheugen). */
const zonderBsn = ({ bsn: _bsn, ...c }) => c;
export async function laadKind(id) {
    zet({ laden: { ...state.laden, [id]: true } });
    try {
        const [k, n] = await Promise.all([api("manage-children", "get", { child_id: id }), api("manage-children", "get-private-note", { child_id: id })]);
        zet({ kinderen: { ...state.kinderen, [id]: zonderBsn(k.child) }, notities: { ...state.notities, [id]: n.note ?? "" } });
    }
    catch (e) {
        if (e?.code !== "NOT_FOUND")
            meldFout(e);
        zet({ kinderen: { ...state.kinderen, [id]: e?.code === "NOT_FOUND" ? null : state.kinderen[id] } });
    }
    finally {
        zet({ laden: { ...state.laden, [id]: false } });
    }
}
const LIJSTVELDEN = ["name", "date_of_birth", "color_code"];
/**
 * Wijzigingen bewaren (optimistisch). `updates` = kolommen en/of `profile: { sectie: volledigeSectie }`;
 * een sectie wordt in zijn geheel vervangen, dus geef altijd de hele sectie mee (met behouden velden).
 */
export async function bewaarKind(id, updates) {
    const vorig = state.kinderen[id];
    if (!vorig)
        return false;
    const lokaal = { ...vorig, ...updates, profile: { ...(vorig.profile ?? {}), ...(updates.profile ?? {}) } };
    if (!updates.profile)
        lokaal.profile = vorig.profile;
    zet({ kinderen: { ...state.kinderen, [id]: lokaal } });
    try {
        const r = await api("manage-children", "update", { child_id: id, updates });
        zet({ kinderen: { ...state.kinderen, [id]: zonderBsn(r.child) } });
        if (Object.keys(updates).some((k) => LIJSTVELDEN.includes(k)))
            start.hydrateer();
        return true;
    }
    catch (e) {
        zet({ kinderen: { ...state.kinderen, [id]: vorig } });
        meldFout(e);
        return false;
    }
}
export async function bewaarNotitie(id, note) {
    const vorig = state.notities[id] ?? "";
    zet({ notities: { ...state.notities, [id]: note } });
    try {
        await api("manage-children", "save-private-note", { child_id: id, note });
        return true;
    }
    catch (e) {
        zet({ notities: { ...state.notities, [id]: vorig } });
        meldFout(e);
        return false;
    }
}
/** Profielfoto/avatar via start-store (zelfde pad als overal), daarna het profiel verversen. */
export async function zetKindBeeld(id, beeld) {
    await start.zetKindBeeld(id, beeld);
    laadKind(id);
}
export function useKindProfiel(id) {
    const s = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state, () => state);
    useEffect(() => {
        if (!id)
            return;
        laadKind(id);
        const terug = () => laadKind(id);
        window.addEventListener("focus", terug);
        return () => window.removeEventListener("focus", terug);
    }, [id]);
    return { kind: s.kinderen[id], notitie: s.notities[id] ?? "", laden: !!s.laden[id] };
}
