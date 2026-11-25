import { useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import { authState } from "@/lib/auth-store";
import { optimistisch, serverBron } from "@/lib/praktisch-sync";
/**
 * Persoonlijke, privé gegevens van de ingelogde ouder (edge function manage-personal, tabel personal_entries).
 * Alleen voor jou: nooit gedeeld met of zichtbaar voor de andere ouder, de kring of een professional.
 * Soorten: houvast_zin { tekst }, houvast_moment { moment }, wissel_log { datum, gevoel, hielp[] },
 * solo_note { tekst }, safety_report { notitie, context }, co_chat { berichten[] } (één per ouder).
 * Elk item: { id, soort, data, aangemaakt, bijgewerkt }. Optimistisch bijwerken; bij een fout terugzetten + melding.
 */
const leeg = () => ({ items: [], geladen: false });
let state = leeg();
const luisteraars = new Set();
const zet = (p) => { state = { ...state, ...p }; luisteraars.forEach((l) => l()); };
const vanServer = (e) => ({ id: e.id, soort: e.kind, data: e.data ?? {}, aangemaakt: e.created_at, bijgewerkt: e.updated_at });
const sync = serverBron({
    laad: async () => {
        const r = await api("manage-personal", "list", {}, { stil: state.geladen });
        zet({ items: (r.entries ?? []).map(vanServer), geladen: true });
    },
    wis: () => zet(leeg()),
});
/** Laadstatus voor de schermen (useStatus / ververs). */
export const persoonlijkBron = sync;
const ingelogd = () => !!authState().gebruiker;
const tijdelijkId = () => `tmp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const vervang = (id, e) => zet({ items: state.items.map((x) => (x.id === id ? vanServer(e) : x)) });
/** Alle items van één soort (oudste eerst). */
export const vanSoort = (s, soort) => s.items.filter((x) => x.soort === soort);
export function usePersoonlijk() {
    sync.zorg();
    return useSyncExternalStore((l) => { luisteraars.add(l); return () => luisteraars.delete(l); }, () => state, () => state);
}
export const persoonlijkState = () => { sync.zorg(); return state; };
/** Nieuw item; geeft het (echte) item terug of null bij een fout. */
export async function voegPersoonlijkToe(soort, data, foutId = "persoonlijk-fout") {
    if (!ingelogd())
        return null;
    const id = tijdelijkId();
    const r = await optimistisch(() => {
        zet({ items: [...state.items, { id, soort, data, aangemaakt: new Date().toISOString(), bijgewerkt: new Date().toISOString() }] });
        return () => zet({ items: state.items.filter((x) => x.id !== id) });
    }, () => api("manage-personal", "add", { kind: soort, data }), foutId);
    if (!r?.entry)
        return null;
    // Bestond al (bijv. hetzelfde moment twee keer bewaard): het tijdelijke item vervalt.
    if (state.items.some((x) => x.id === r.entry.id))
        zet({ items: state.items.filter((x) => x.id !== id) });
    else
        vervang(id, r.entry);
    // Rollende log: de server bewaart de nieuwste 200; daarna opnieuw laden houdt de lijst gelijk.
    if (soort === "wissel_log" && vanSoort(state, soort).length > 200)
        void sync.ververs();
    return vanServer(r.entry);
}
export async function wijzigPersoonlijk(id, data) {
    const vorig = state.items.find((x) => x.id === id);
    if (!vorig || String(id).startsWith("tmp-"))
        return false;
    const r = await optimistisch(() => {
        zet({ items: state.items.map((x) => (x.id === id ? { ...x, data } : x)) });
        return () => zet({ items: state.items.map((x) => (x.id === id ? vorig : x)) });
    }, () => api("manage-personal", "update", { id, data }));
    if (!r?.entry)
        return false;
    vervang(id, r.entry);
    return true;
}
export async function verwijderPersoonlijk(id) {
    const vorig = state.items.find((x) => x.id === id);
    if (!vorig)
        return false;
    if (String(id).startsWith("tmp-")) {
        zet({ items: state.items.filter((x) => x.id !== id) });
        return true;
    }
    const r = await optimistisch(() => {
        const plek = state.items.indexOf(vorig);
        zet({ items: state.items.filter((x) => x.id !== id) });
        return () => { const lijst = [...state.items]; lijst.splice(Math.min(plek, lijst.length), 0, vorig); zet({ items: lijst }); };
    }, () => api("manage-personal", "delete", { id }));
    return !!r;
}
/** Het ene item van een soort met één exemplaar (co_chat) opslaan of vervangen. */
export async function zetEnkelPersoonlijk(soort, data) {
    if (!ingelogd())
        return false;
    const vorig = vanSoort(state, soort)[0] ?? null;
    const id = vorig?.id ?? tijdelijkId();
    const r = await optimistisch(() => {
        const nieuw = { id, soort, data, aangemaakt: vorig?.aangemaakt ?? new Date().toISOString(), bijgewerkt: new Date().toISOString() };
        zet({ items: vorig ? state.items.map((x) => (x.id === id ? nieuw : x)) : [...state.items, nieuw] });
        return () => zet({ items: vorig ? state.items.map((x) => (x.id === id ? vorig : x)) : state.items.filter((x) => x.id !== id) });
    }, () => api("manage-personal", "put", { kind: soort, data }, { stil: true }));
    if (!r?.entry)
        return false;
    vervang(id, r.entry);
    return true;
}
/** Alle items van één soort verwijderen (bijv. het bewaarde gesprek met Co). */
export async function wisPersoonlijk(soort) {
    const weg = vanSoort(state, soort);
    if (!weg.length)
        return true;
    const r = await optimistisch(() => {
        zet({ items: state.items.filter((x) => x.soort !== soort) });
        return () => zet({ items: [...state.items, ...weg] });
    }, () => api("manage-personal", "clear", { kind: soort }));
    return !!r;
}
