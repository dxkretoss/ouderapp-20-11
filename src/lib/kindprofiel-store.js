import { useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { api, foutTekst } from "@/lib/api";
import { start } from "@/lib/start-store";
/**
 * Het volledige kindprofiel ("Alles over …") van de server: manage-children `get` (bestaande kolommen +
 * profielsecties) en de eigen privénotitie (`get-private-note`, alleen voor de ingelogde ouder).
 * Eén bron: start-store houdt de korte vorm voor lijsten; na wijzigingen aan naam/datum/kleur/foto wordt
 * die opnieuw opgehaald. Beide gekoppelde ouders lezen dezelfde gegevens; bewerken alleen met can_edit.
 * Per kind en per onderdeel kan de toegang van een ouder beperkt zijn ("Gezag en toegang", manage-children
 * `access`): onderdelen die je niet mag zien komen niet van de server (`hidden_sections`), `my_access`
 * zegt per onderdeel of je mag bewerken.
 */
let state = { kinderen: {}, notities: {}, laden: {}, toegang: {}, toegangLaden: {}, toegangFout: {} };
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
    zet({ laden: { ...state.laden, [id]: true }, fouten: { ...(state.fouten ?? {}), [id]: false } });
    // De privénotitie apart: als alleen die mislukt, blijft het profiel gewoon zichtbaar.
    const notitie = api("manage-children", "get-private-note", { child_id: id }).then((n) => n.note ?? "", () => undefined);
    try {
        const k = await api("manage-children", "get", { child_id: id });
        const n = await notitie;
        zet({ kinderen: { ...state.kinderen, [id]: zonderBsn(k.child) }, notities: n === undefined ? state.notities : { ...state.notities, [id]: n } });
    }
    catch (e) {
        if (e?.code !== "NOT_FOUND")
            meldFout(e);
        zet({
            kinderen: { ...state.kinderen, [id]: e?.code === "NOT_FOUND" ? null : state.kinderen[id] },
            // Nog niets geladen en geen "niet gevonden": het scherm toont een fout met opnieuw proberen.
            fouten: { ...(state.fouten ?? {}), [id]: e?.code !== "NOT_FOUND" && state.kinderen[id] === undefined },
        });
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
    return { kind: s.kinderen[id], notitie: s.notities[id] ?? "", laden: !!s.laden[id], fout: !!s.fouten?.[id] };
}

/* ---------- Gezag en toegang (per kind) ---------- */
export async function laadToegang(id) {
    zet({ toegangLaden: { ...state.toegangLaden, [id]: true }, toegangFout: { ...state.toegangFout, [id]: false } });
    try {
        const r = await api("manage-children", "access", { child_id: id });
        zet({ toegang: { ...state.toegang, [id]: r } });
    }
    catch (e) {
        if (e?.code !== "NOT_FOUND")
            meldFout(e);
        zet({ toegangFout: { ...state.toegangFout, [id]: true } });
    }
    finally {
        zet({ toegangLaden: { ...state.toegangLaden, [id]: false } });
    }
}
/** Na een wijziging in toegang: overzicht, profiel en de lijst opnieuw (wat je mag zien kan veranderd zijn). */
function naToegang(id, r) {
    zet({ toegang: { ...state.toegang, [id]: r } });
    laadKind(id);
    start.hydrateer();
}
/**
 * Toegang van een ouder (jij of de andere ouder) voor één onderdeel wijzigen. Jouw eigen toegang beperken
 * gaat meteen; al het andere wordt een verzoek dat de andere ouder moet beantwoorden. Geeft het nieuwe
 * overzicht terug (null bij een fout).
 */
export async function vraagToegang(id, ouderId, sectie, rechten) {
    try {
        const r = await api("manage-children", "request-access", { child_id: id, parent_id: ouderId, section: sectie, view: !!rechten.view, propose: !!rechten.propose, edit: !!rechten.edit });
        naToegang(id, r);
        return r;
    }
    catch (e) {
        meldFout(e);
        return null;
    }
}
export async function beantwoordToegang(id, verzoekId, akkoord) {
    try {
        const r = await api("manage-children", "respond-access", { request_id: verzoekId, accept: akkoord });
        naToegang(id, r);
        return true;
    }
    catch (e) {
        meldFout(e);
        laadToegang(id);
        return false;
    }
}
export async function trekToegangIn(id, verzoekId) {
    try {
        const r = await api("manage-children", "withdraw-access", { request_id: verzoekId });
        naToegang(id, r);
        return true;
    }
    catch (e) {
        meldFout(e);
        return false;
    }
}
export function useToegang(id) {
    const s = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state, () => state);
    useEffect(() => { if (id)
        laadToegang(id); }, [id]);
    return { toegang: s.toegang[id], laden: !!s.toegangLaden[id], fout: !!s.toegangFout[id] };
}
