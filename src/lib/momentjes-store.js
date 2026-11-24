import { useSyncExternalStore } from "react";
import i18n, { taalLocale } from "@/i18n";
import { api } from "@/lib/api";
import { authState } from "@/lib/auth-store";
import { meldFout, serverBron } from "@/lib/praktisch-sync";
const t = (sleutel, o) => i18n.t(sleutel, o);
/** Vaste mijlpaalwaarden (worden zo bewaard); weergave via mijlpaalLabel. */
export const mijlpalen = [
    "Eerste stapjes", "Eerste woordje", "Eerste schooldag", "Eerste tand", "Zwemdiploma",
    "Verjaardag", "Sportprestatie", "Rapport", "Iets bijzonders",
];
const MIJLPAAL_SLEUTEL = { "Eerste stapjes": "eersteStapjes", "Eerste woordje": "eersteWoordje", "Eerste schooldag": "eersteSchooldag", "Eerste tand": "eersteTand", Zwemdiploma: "zwemdiploma", Verjaardag: "verjaardag", Sportprestatie: "sportprestatie", Rapport: "rapport", "Iets bijzonders": "ietsBijzonders" };
export const mijlpaalLabel = (m) => (MIJLPAAL_SLEUTEL[m] ? t(`lib.momentjesStore.mijlpaal.${MIJLPAAL_SLEUTEL[m]}`) : m);
/** Snelle reacties: bewaard als vaste id; icoon en tekst worden bij de weergave gekozen (zie Momentjes.jsx). */
export const reacties = [
    { id: "leuk", get l() { return t("lib.momentjesStore.reactie.leuk"); } }, { id: "lief", get l() { return t("lib.momentjesStore.reactie.lief"); } }, { id: "trots", get l() { return t("lib.momentjesStore.reactie.trots"); } }, { id: "watGoed", get l() { return t("lib.momentjesStore.reactie.watGoed"); } },
];
export const momentLabel = {
    get vooraf() { return t("lib.momentjesStore.moment.vooraf"); }, get tijdens() { return t("lib.momentjesStore.moment.tijdens"); }, get na() { return t("lib.momentjesStore.moment.na"); }, geen: "",
};
/**
 * Momentjes en mijlpalen van het eigen gezin — bron: edge function manage-moments (shared_moments + moment_reactions,
 * foto's in de privé-bucket "moments" via tijdelijke links). Model per moment (ongewijzigd voor de schermen):
 * { id, kindId, van (profiel-id van de maker), tekst, foto, wanneer, datum, moment, mijlpaal, prive, kringIds,
 *   reactie, reactieTekst, reactieVan }. "Alleen voor mij" (prive) komt nooit bij de andere ouder.
 * De voorkeuren "herinnering" en "professionals" zijn instellingen op dit apparaat.
 */
const leeg = () => ({ lijst: [], mijlpalen: [], geladen: false });
let state = { herinnering: true, professionals: false, ...leeg() };
const listeners = new Set();
function zet(p) {
    state = { ...state, ...p };
    listeners.forEach((l) => l());
}
const wanneerTekst = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()))
        return "";
    const vandaag = new Date().toISOString().slice(0, 10) === iso.slice(0, 10);
    const tijd = d.toLocaleTimeString(taalLocale(), { hour: "2-digit", minute: "2-digit" });
    return vandaag ? t("components.Momentjes.deel.wanneerVandaag", { tijd }) : t("routes.momentjes.eigen.wanneer", { datum: d.toLocaleDateString(taalLocale(), { weekday: "short", day: "numeric", month: "long" }), tijd });
};
export function momentVanServer(m) {
    const ik = authState().gebruiker?.id;
    // Eén reactie per andere ouder; de kaart toont de reactie van de ander op mijn moment, of mijn reactie op het hunne.
    const r = (m.reactions ?? []).find((x) => x.user_id !== m.author_id);
    return {
        id: m.id, kindId: m.child_id, van: m.author_id, auteurId: m.author_id, tekst: m.text ?? "", foto: m.photo_url ?? undefined,
        get wanneer() { return wanneerTekst(m.created_at); }, datum: m.happened_on, aangemaakt: m.created_at,
        moment: m.phase || "geen", mijlpaal: m.milestone ?? undefined, prive: m.visibility === "private", kringIds: m.circle_ids ?? [],
        ...(r ? { reactie: r.reaction, reactieTekst: r.text ?? "", reactieVan: r.user_id } : {}),
        vanMij: !!ik && m.author_id === ik,
    };
}
const mijlpaalVanServer = (m) => ({ id: m.id, kind: m.child_id, jaar: Number(String(m.happened_on ?? m.created_at).slice(0, 4)), tekst: m.text ?? "", van: m.author_id });
function verdeel(lijst) {
    return {
        lijst: lijst.filter((m) => m.kind !== "mijlpaal").map(momentVanServer),
        mijlpalen: lijst.filter((m) => m.kind === "mijlpaal").map(mijlpaalVanServer),
    };
}
let ruw = [];
const sync = serverBron({
    laad: async () => {
        const r = await api("manage-moments", "list");
        ruw = r.moments ?? [];
        zet({ ...verdeel(ruw), geladen: true });
    },
    wis: () => { ruw = []; zet(leeg()); },
});
const vervang = (m) => { ruw = [m, ...ruw.filter((x) => x.id !== m.id)]; zet(verdeel(ruw)); };
/**
 * Nieuw moment. Velden zoals DeelMomentje ze maakt: { kindId, tekst, foto (data-URL, al verkleind), moment, mijlpaal, prive, kringIds }.
 * Geeft een promise; bij een fout volgt een rustige melding.
 */
export async function voegMomentjeToe(m) {
    try {
        const r = await api("manage-moments", "create", {
            child_id: m.kindId, text: m.tekst || null, photo_base64: m.foto?.startsWith("data:") ? m.foto : undefined, phase: m.moment || "geen",
            milestone: m.mijlpaal ?? null, visibility: m.prive ? "private" : m.kringIds?.length ? "circle" : "parents", circle_ids: m.kringIds ?? [],
        });
        vervang(r.moment);
        return true;
    }
    catch (e) {
        meldFout(e, "momentjes-fout");
        return false;
    }
}
/** Reageren op het moment van de ander (één reactie per ouder). Optimistisch. */
export async function reageer(id, p) {
    const vorig = state.lijst;
    zet({ lijst: state.lijst.map((m) => (m.id === id ? { ...m, reactie: p.reactie, reactieTekst: p.reactieTekst, reactieVan: authState().gebruiker?.id } : m)) });
    try {
        const r = await api("manage-moments", "react", { moment_id: id, reaction: p.reactie, text: p.reactie === "tekst" || p.reactie === "duim" ? (p.reactieTekst || null) : null });
        vervang(r.moment);
    }
    catch (e) {
        zet({ lijst: vorig });
        meldFout(e, "momentjes-fout");
    }
}
/** Mijlpaal (korte regel op het kindprofiel): { kind, tekst }. */
export async function voegMijlpaalToe(m) {
    try {
        const r = await api("manage-moments", "create", { child_id: m.kind, kind: "mijlpaal", text: m.tekst, visibility: "parents" });
        vervang(r.moment);
    }
    catch (e) {
        meldFout(e, "momentjes-fout");
    }
}
export const setHerinnering = (v) => zet({ herinnering: v });
export const setProfessionals = (v) => zet({ professionals: v });
export const momentjesState = () => { sync.zorg(); return state; };
export function useMomentjes() {
    sync.zorg();
    return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state, () => state);
}
