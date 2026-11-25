import { useSyncExternalStore } from "react";
import i18n, { taalLocale } from "@/i18n";
import { api } from "@/lib/api";
import { authState } from "@/lib/auth-store";
import { startState } from "@/lib/start-store";
import { meldFout, serverBron } from "@/lib/praktisch-sync";
import { verversAudit } from "@/lib/audit-store";
const t = (k, o) => i18n.t(`lib.afsprakenStore.${k}`, o);
/* ---------- model: één afspraak = één bronobject met versies en gebeurtenissen ---------- */
// Bron: edge function manage-agreements (tabel parent_agreements). Elke afspraak heeft versies, één open voorstel,
// akkoord per ouder en een geschiedenis die alleen groeit. Alleen de ANDERE ouder antwoordt; de indiener mag intrekken.
// `groep` is de opgeslagen (Nederlandse) waarde van `onderwerp`; labels worden bij het tonen vertaald.
const onderwerpSleutel = { "Halen & brengen": "halenBrengen", "Planning & wijzigingen": "planning", Contact: "contact", Kinderen: "kinderen", "School & opvang": "school", Gezondheid: "gezondheid", Kosten: "kosten", Vakanties: "vakanties", Overig: "overig" };
export const ONDERWERPEN = [
    ["halenBrengen", "Halen & brengen"], ["planning", "Planning & wijzigingen"], ["contact", "Contact"],
    ["kinderen", "Kinderen"], ["school", "School & opvang"], ["gezondheid", "Gezondheid"], ["kosten", "Kosten"],
    ["vakanties", "Vakanties"], ["overig", "Overig"],
].map(([id, groep]) => ({ id, groep, get label() { return t(`onderwerpKeuze.${id}`); } }));
/** Weergavenaam van een opgeslagen onderwerp. */
export const onderwerpLabel = (g) => (onderwerpSleutel[g] ? t(`onderwerp.${onderwerpSleutel[g]}`) : g);
/** Rollen in een voorstel, relatief aan wie kijkt: IK = de ingelogde ouder, ANDER = de gekoppelde andere ouder. */
export const IK = "ik";
export const ANDER = "ander";
// Opslagwaarde blijft Nederlands ("5 oktober 2026"): geschiedenisDatum leest dit terug. Tonen gaat via toonDatum.
const nlDatum = (d) => d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
export const vandaag = () => nlDatum(new Date());
const nlUit = (iso) => (iso ? nlDatum(new Date(iso)) : undefined);
/** Wie moet nog instemmen? Een professional telt nooit als akkoord van ouders. */
// Oudere (test)bronnen gebruiken nog de namen "Sanne"/"Joris" voor kijker/ander.
const ALIAS = { [IK]: "Sanne", [ANDER]: "Joris" };
const isRol = (wie, r) => wie === r || wie === ALIAS[r];
export const nodig = (v) => (v.partijen ?? [IK, ANDER]).filter((o) => !v.akkoord[o] && !v.akkoord[ALIAS[o]]);
export const wachtOpMij = (a) => !!a.voorstel && !isRol(a.voorstel.door, IK) && nodig(a.voorstel).includes(IK);
/** Naam voor een rol: jij / de naam van de andere ouder (of "de andere ouder"). */
export const naam = (wie) => (wie === IK ? t("jij") : wie === ANDER ? anderNaam() : wie);
function anderNaam() {
    // Met meerdere andere ouders (per kind een andere) is "de andere ouder" de enige juiste naam.
    const co = startState().coOuders ?? [];
    return (co.length === 1 && co[0]?.name) || i18n.t("common.deAndereOuder");
}
const eigenNaam = () => authState().gebruiker?.name || t("jij");
const zinSoort = (v) => (v.soort === "nieuw" ? "nieuw" : v.soort === "stoppen" ? "stoppen" : "wijziging");
export const zin = (v) => t(`zin.${zinSoort(v)}`);
/** Volledige zin "<wie> stelt … voor"; `jij` kiest de vervoeging voor de gebruiker zelf. */
export const voorstelZin = (v, wieNaam, jij = false) => t(`${jij ? "regelJij" : "regel"}.${zinSoort(v)}`, { naam: wieNaam });
/* ---------- server → weergavemodel ---------- */
const STATUS = { active: "Actief", pending: "Voorstel", stopped: "Gestopt", withdrawn: "Ingetrokken", rejected: "Niet doorgegaan" };
const rol = (id) => (id && id === authState().gebruiker?.id ? IK : ANDER);
const persoonNaam = (id) => (rol(id) === IK ? eigenNaam() : anderNaam());
const kindTekst = (ids) => {
    const kids = startState().kinderen;
    const namen = (ids?.length ? ids.map((id) => kids.find((k) => k.id === id)?.naam).filter(Boolean) : kids.map((k) => k.naam));
    return namen.join(" & ");
};
/** Eén geschiedenisregel (server: { at, by, type, ... }) → { datum, tekst } in de taal van de app. */
function regel(h) {
    const wie = persoonNaam(h.by);
    const R = (k, o) => i18n.t(`routes.afspraken.geschiedenis.${k}`, o);
    const teksten = {
        "voorgesteld-nieuw": () => R("stelDezeVoor", { wie }),
        "voorgesteld-wijziging": () => R("stelVoorWijziging", { wie }),
        "voorgesteld-stoppen": () => R("stelVoorStoppen", { wie }),
        akkoord: () => R("akkoord", { wie }),
        "akkoord-wijziging": () => R("akkoordWijziging", { wie }),
        "niet-akkoord-nieuw": () => R("nietAkkoordNieuw", { wie }),
        "niet-akkoord-wijziging": () => R("nietAkkoordWijziging", { wie }),
        "ander-voorstel": () => R("anderVoorstel", { wie, alt: h.alt ?? "", origineel: h.origineel ?? "" }),
        "meer-tijd": () => t("geschiedenis.meerTijd", { wie }),
        ingetrokken: () => t("geschiedenis.ingetrokken", { door: wie, tekst: h.tekst ?? "" }),
        "gaat-in": () => t("geschiedenis.gaatIn"),
        gestopt: () => t("geschiedenis.gestopt"),
        "nieuwe-versie": () => t("geschiedenis.nieuweVersie", { oud: h.oud ?? "", nieuw: h.nieuw ?? "" }),
        vastgelegd: () => t("geschiedenis.vastgelegd", { wie }),
        geimporteerd: () => i18n.t("lib.importStore.overgenomenUit", { document: h.document ?? "" }),
    };
    return { datum: nlUit(h.at), moment: h.at, get tekst() { return (teksten[h.type] ?? (() => h.type))(); } };
}
export function afspraakVanServer(r) {
    const p = r.proposal;
    const parties = p?.parties ?? [];
    const voorstel = p ? {
        soort: p.kind, door: rol(p.by), tekst: p.text ?? undefined, datum: nlUit(p.at),
        akkoord: Object.fromEntries(Object.entries(p.approvals ?? {}).filter(([, v]) => v).map(([id]) => [rol(id), true])),
        partijen: parties.length >= 2 ? [IK, ANDER] : [IK],
        ...(p.more_time ? { meerTijd: { door: rol(p.more_time.by), datum: nlUit(p.more_time.at) } } : {}),
    } : undefined;
    const door = r.agreed_by ?? [];
    return {
        id: r.id, titel: r.title, tekst: r.text, onderwerp: r.topic || "Overig", anderId: r.other_parent_id ?? null, kindIds: r.child_ids ?? [], get kind() { return kindTekst(r.child_ids); },
        status: STATUS[r.status] ?? "Actief", afgesprokenOp: nlUit(r.agreed_at), geldtVanaf: nlUit(r.valid_from), gestoptOp: nlUit(r.stopped_at),
        get afgesprokenDoor() { return door.length >= 2 ? `${eigenNaam()} & ${anderNaam()}` : door.length === 1 ? persoonNaam(door[0]) : undefined; },
        ...(r.source?.kind === "document" ? { bron: { soort: "document", label: r.source.label ?? "", document: true } } : {}),
        ...(r.evaluation_date ? { evaluatie: nlUit(r.evaluation_date) } : {}), ...(r.link_note ? { koppeling: r.link_note } : {}),
        veiligheid: !!r.is_safety, formeel: !!r.is_formal,
        versies: (r.versions ?? []).map((v) => ({ tekst: v.text, tot: nlUit(v.until) })),
        geschiedenis: [...(r.history ?? [])].reverse().map(regel),
        voorstel, versie: r.revision ?? 1, door: r.created_by,
    };
}
/* ---------- store ---------- */
let lijst = [];
let besluiten = [];
const ls = new Set();
const meld = () => ls.forEach((l) => l());
const sync = serverBron({
    laad: async () => {
        const r = await api("manage-agreements", "list");
        lijst = (r.agreements ?? []).map(afspraakVanServer);
        besluiten = r.decisions ?? [];
        meld();
    },
    wis: () => { lijst = []; besluiten = []; meld(); },
});
/** Laadstatus voor de schermen (useStatus / ververs). */
export const afsprakenBron = sync;
export const afsprakenState = () => { sync.zorg(); return lijst; };
export function useAfspraken() {
    sync.zorg();
    return useSyncExternalStore((l) => { ls.add(l); return () => ls.delete(l); }, () => lijst, () => lijst);
}
const vervang = (r) => {
    const a = afspraakVanServer(r);
    lijst = lijst.some((x) => x.id === a.id) ? lijst.map((x) => (x.id === a.id ? a : x)) : [...lijst, a];
    meld();
    return a;
};
async function roep(actie, body) {
    try {
        const r = await api("manage-agreements", actie, body);
        return r;
    }
    catch (e) {
        meldFout(e, "afspraken-fout");
        // Bij "STALE" of een andere fout: haal de nieuwste versie op, zodat het scherm klopt.
        sync.ververs();
        return null;
    }
}
/** Nieuwe afspraak voorstellen (zonder gekoppelde andere ouder: direct vastgelegd). */
export async function stelNieuweAfspraakVoor({ onderwerp, titel, tekst, kindIds = [], anderId }) {
    // anderId: alleen zonder kinderen en met meerdere andere ouders (voor wie het voorstel is).
    const r = await roep("propose-new", { topic: onderwerp, title: titel, text: tekst, child_ids: kindIds, ...(anderId ? { other_parent_id: anderId } : {}) });
    return r ? vervang(r.agreement) : null;
}
/** Wijziging of stoppen voorstellen; de huidige afspraak blijft gelden tot beide ouders akkoord zijn. */
export async function stelWijzigingVoor(id, v) {
    const a = lijst.find((x) => x.id === id);
    const r = await roep("propose-change", { agreement_id: id, kind: v.soort === "stoppen" ? "stoppen" : "wijziging", text: v.tekst ?? null, revision: a?.versie });
    return r ? vervang(r.agreement) : null;
}
/** Antwoord van de andere ouder: "akkoord" | "ander" (met tekst) | "niet" | "meer-tijd". */
export async function reageerOpVoorstel(id, keuze, tekst) {
    const a = lijst.find((x) => x.id === id);
    if (!a || !wachtOpMij(a))
        return null;

    const r = await roep("respond", { agreement_id: id, response: keuze, text: tekst ?? null, revision: a.versie });
    return r ? vervang(r.agreement) : null;
}
/** Only the author can withdraw a pending proposal; the existing agreement is retained. */
export function trekAfspraakIn(id, door = IK) {
    const a = lijst.find((x) => x.id === id);
    const v = a?.voorstel;
    const wie = door === "Sanne" ? IK : door === "Joris" ? ANDER : door;
    if (!a || !v || !isRol(v.door, wie) || wie !== IK || !nodig(v).length)
        return false;
    if (!authState().gebruiker) {
        // Zonder sessie (alleen tests/oude bronnen): lokaal, met dezelfde regels.
        zetAfspraken((l) => l.map((x) => x.id === id ? { ...x, voorstel: undefined, status: v.soort === "nieuw" ? "Ingetrokken" : x.status,
            geschiedenis: [{ datum: vandaag(), get tekst() { return t("geschiedenis.ingetrokken", { door: naam(IK), tekst: v.tekst ?? x.tekst }); } }, ...x.geschiedenis] } : x));
        return true;
    }
    roep("withdraw", { agreement_id: id }).then((r) => { if (r)
        vervang(r.agreement); });
    return true;
}
/** Bevestigde onderdelen uit de ouderschapsplan-import: komen als voorstel in deze ene bron (solo: direct). */
export async function importeerAfspraken(items, document, { kindIds = [], anderId } = {}) {
    const r = await roep("import", { items: items.map((x) => ({ title: x.titel, text: x.tekst, topic: x.onderwerp, source_label: x.bron })), document, child_ids: kindIds, ...(anderId ? { other_parent_id: anderId } : {}) });
    (r?.agreements ?? []).forEach(vervang);
    return !!r;
}
/** Alleen voor tests (zonder sessie): lokale wijziging, niets naar de server. */
export function zetAfspraken(f) {
    const oud = new Map(lijst.map((a) => [a.id, a]));
    lijst = f(lijst).map((a) => { const o = oud.get(a.id); return o === a ? o : { ...a, versie: (o?.versie ?? 0) + 1 }; });
    meld();
}
/** Eigen voorstellen die nog op de ander wachten (Home: "Afstemming loopt"). */
export const eigenOpenVoorstellen = (l) => l.filter((a) => a.voorstel && a.voorstel.door === IK && nodig(a.voorstel).length > 0);
/* ---------- beslissingen (zelfde bron, type "decision") ---------- */
export function useBesluiten() {
    sync.zorg();
    return useSyncExternalStore((l) => { ls.add(l); return () => ls.delete(l); }, () => besluiten, () => besluiten);
}
export const besluitenState = () => { sync.zorg(); return besluiten; };
export async function neemBesluitVoor({ titel, soort, kindId, modus }) {
    // Een beslissing hoort bij één kind; de server richt hem aan de andere ouder van dat kind.
    const r = await roep("decision-create", { title: titel, kind: soort, child_id: kindId, mode: modus });
    if (r) {
        besluiten = [...besluiten, r.decision];
        meld();
        verversAudit();
    }
    return r?.decision ?? null;
}
/** Eigen open beslissing intrekken (zolang de andere ouder nog niet antwoordde). Geeft de beslissing of null. */
export async function trekBesluitIn(id) {
    const r = await roep("decision-withdraw", { decision_id: id });
    if (r) {
        besluiten = besluiten.map((b) => (b.id === id ? r.decision : b));
        meld();
        verversAudit();
    }
    return r?.decision ?? null;
}
export async function reageerOpBesluit(id, reactie) {
    const r = await roep("decision-respond", { decision_id: id, response: reactie });
    if (r) {
        besluiten = besluiten.map((b) => (b.id === id ? r.decision : b));
        meld();
        verversAudit();
    }
    return r?.decision ?? null;
}
// Alleen voor het teruglezen van opgeslagen Nederlandse datums (geen weergave).
const maandNamen = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
/** "5 oktober 2026" → Date; zonder jaartal of onbekend → null (lezers verzinnen dan geen datum). */
export function geschiedenisDatum(tekst) {
    const m = /^(\d{1,2}) ([a-z]+) (\d{4})$/.exec((tekst ?? "").trim());
    const i = m ? maandNamen.indexOf(m[2]) : -1;
    return m && i >= 0 ? new Date(Number(m[3]), i, Number(m[1]), 12) : null;
}
/** Opgeslagen Nederlandse datum ("5 oktober 2026" of "2 maart") tonen in de taal van de app. Onbekend → ongewijzigd. */
export function toonDatum(tekst, zonderJaar = false) {
    if (!tekst)
        return tekst;
    const d = geschiedenisDatum(tekst);
    if (d)
        return d.toLocaleDateString(taalLocale(), zonderJaar ? { day: "numeric", month: "long" } : { day: "numeric", month: "long", year: "numeric" });
    const m = /^(\d{1,2}) ([a-z]+)$/.exec(tekst.trim());
    const i = m ? maandNamen.indexOf(m[2]) : -1;
    return m && i >= 0 ? new Date(2026, i, Number(m[1]), 12).toLocaleDateString(taalLocale(), { day: "numeric", month: "long" }) : tekst;
}
/** Alles in deze bron is door het gezin zelf ingevoerd (geen voorbeeldafspraken meer). */
export function isIngevuldeAfspraak() {
    return true;
}
/** Voert een volledig goedgekeurd voorstel uit (alleen nog voor lokale tests zonder sessie). */
export function voerUit(a) {
    const v = a.voorstel;
    if (!v || nodig(v).length)
        return a;
    const d = vandaag();
    if (v.soort === "nieuw")
        return { ...a, tekst: v.tekst ?? a.tekst, status: "Actief", voorstel: undefined, afgesprokenOp: d, geldtVanaf: d, geschiedenis: [{ datum: d, tekst: t("geschiedenis.gaatIn") }, ...a.geschiedenis] };
    if (v.soort === "stoppen")
        return { ...a, status: "Gestopt", gestoptOp: d, voorstel: undefined, geschiedenis: [{ datum: d, tekst: t("geschiedenis.gestopt") }, ...a.geschiedenis] };
    if (!v.tekst)
        return a;
    return { ...a, tekst: v.tekst, voorstel: undefined, geldtVanaf: d, versies: [{ tekst: a.tekst, tot: d }, ...a.versies], geschiedenis: [{ datum: d, tekst: t("geschiedenis.nieuweVersie", { oud: a.tekst, nieuw: v.tekst }) }, ...a.geschiedenis] };
}
