import i18n, { taalLocale } from "@/i18n";
import { uur } from "./tijd-tekst";
import { isOpen } from "./openstaande-voorstellen";
const NS = "lib.activiteiten";
export const categorieTitel = {
    get regelen() { return i18n.t(`${NS}.categorie.regelen`); },
    get gewijzigd() { return i18n.t(`${NS}.categorie.gewijzigd`); },
    get info() { return i18n.t(`${NS}.categorie.info`); },
};
const tijdTekst = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : uur(d.toLocaleString(taalLocale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(" om", ","));
};
/** Eenvoudige taal: "Afspraak in de agenda" vs. "Afspraak tussen jullie". */
const bronTerm = (bron) => i18n.t(`${NS}.bron.${bron}`);
function uitVoorstel(v, i) {
    const basis = { naar: v.naar, volgorde: v.verzonden ? Date.parse(v.verzonden) || 1e12 - i : 1e12 - i, tijd: v.verzonden && !Number.isNaN(Date.parse(v.verzonden)) ? tijdTekst(v.verzonden) : "" };
    if (v.aanJou && isOpen(v)) {
        return { ...basis, id: `act-${v.sleutel}`, categorie: "regelen", icoon: "samen", verzoek: true,
            titel: v.kortTitel ?? v.titel, uitleg: `${bronTerm(v.bron)} · ${v.omschrijving}` };
    }
    if (v.status === "akkoord" || v.status === "afgerond") {
        return { ...basis, id: `act-${v.sleutel}-klaar`, categorie: "info", icoon: "akkoord", verzoek: false,
            titel: i18n.t(`${NS}.geregeld`, { term: bronTerm(v.bron) }), uitleg: v.titel };
    }
    return null;
}
const termAudit = (soort) => i18n.t(`${NS}.audit.${soort}`);
const NAAR = { afspraak: "/agenda", schema: "/zorgregeling", besluit: "/beslissingen", kosten: "/kosten", taak: "/taken", spul: "/spullen", spullen: "/spullen", overdracht: "/overdracht", document: "/documenten", vakantie: "/agenda" };
function uitAudit(e) {
    if (e.soort === "dossier" || e.actie === "EXPORTED" || !i18n.exists(`${NS}.audit.${e.soort}`))
        return null;
    const term = termAudit(e.soort);
    const naar = NAAR[e.soort] ?? "/";
    const details = [
        { label: i18n.t(`${NS}.detail.wat`), waarde: e.itemNaam },
        ...(e.meta["datum"] ? [{ label: i18n.t(`${NS}.detail.datum`), waarde: e.meta["datum"] }] : []),
        ...(e.meta["tijd"] ? [{ label: i18n.t(`${NS}.detail.tijd`), waarde: e.meta["tijd"] }] : []),
        ...(e.kinderen.length ? [{ label: i18n.t(`${NS}.detail.kinderen`), waarde: e.kinderen.join(", ") }] : []),
        { label: i18n.t(`${NS}.detail.door`), waarde: e.actorNaam },
        { label: i18n.t(`${NS}.detail.wanneer`), waarde: tijdTekst(e.moment) },
        ...(e.meta["reden"] ? [{ label: i18n.t(`${NS}.detail.reden`), waarde: e.meta["reden"] }] : []),
    ];
    const basis = { id: `act-${e.eventId}`, volgorde: Date.parse(e.moment), tijd: tijdTekst(e.moment), naar, verzoek: false, details, wijzigingen: e.wijzigingen, door: e.actorNaam };
    if (e.actie === "DELETED")
        return { ...basis, categorie: "gewijzigd", icoon: "afwijzen", titel: i18n.t(`${NS}.titel.verwijderd`, { term }), uitleg: i18n.t(`${NS}.uitleg.verwijderd`, { actor: e.actorNaam, item: e.itemNaam }) };
    if (e.actie === "UPDATED") {
        const w = e.wijzigingen[0];
        return { ...basis, categorie: "gewijzigd", icoon: "wissel", titel: i18n.t(`${NS}.titel.gewijzigd`, { term }),
            uitleg: w ? i18n.t(`${NS}.uitleg.veranderd`, { actor: e.actorNaam, veld: w.veld, item: e.itemNaam, oud: w.oud, nieuw: w.nieuw }) : i18n.t(`${NS}.uitleg.gewijzigd`, { actor: e.actorNaam, item: e.itemNaam }) };
    }
    if (e.actie === "CREATED")
        return { ...basis, categorie: "info", icoon: "agenda", titel: i18n.t(`${NS}.titel.nieuw`, { term: `${term.charAt(0).toLowerCase()}${term.slice(1)}` }), uitleg: `${e.actorNaam}: ${e.itemNaam}` };
    if (e.actie === "ACCEPTED")
        return { ...basis, categorie: "info", icoon: "akkoord", titel: i18n.t(`${NS}.titel.goedgekeurd`, { term }), uitleg: i18n.t(`${NS}.uitleg.akkoord`, { actor: e.actorNaam, item: e.itemNaam }) };
    if (e.actie === "DECLINED" || e.actie === "CANCELLED")
        return { ...basis, categorie: "gewijzigd", icoon: "info", titel: i18n.t(e.actie === "DECLINED" ? `${NS}.titel.nietAkkoord` : `${NS}.titel.ingetrokken`, { term }), uitleg: `${e.actorNaam} · ${e.itemNaam}` };
    return null;
}
function uitMomentje(m, i, ik, anderNaam) {
    if (m.prive || m.van === ik)
        return null;
    const moment = m.aangemaakt ? Date.parse(m.aangemaakt) : NaN;
    return { id: `act-moment-${m.id}`, categorie: "info", icoon: "momentjes", verzoek: false, volgorde: Number.isNaN(moment) ? 1e9 - i : moment, tijd: Number.isNaN(moment) ? m.wanneer.split(" · ")[0] ?? "" : tijdTekst(m.aangemaakt),
        titel: i18n.t(`${NS}.momentGedeeld`), uitleg: m.tekst.replace(/\p{Extended_Pictographic}/gu, "").trim(), naar: "/momentjes", ...(anderNaam ? { door: anderNaam } : {}) };
}
const ICOON_MELDING = { task: "taken", agreement: "afspraak", decision: "beslissing", moment: "momentjes", document: "documenten", belonging: "doos", cost: "kosten", budget: "kosten", care: "zorgregeling", vacation: "agenda", attendance: "agenda", proposal: "samen", invitation: "link" };
/** Servermelding (de andere ouder deed iets) → activiteit. Tekst uit lib.meldingen.<key>; parameters zijn korte, niet-gevoelige waarden. */
function uitMelding(n) {
    const params = { ...(n.params ?? {}), naam: n.actor_name || i18n.t("common.deAndereOuder") };
    if (!i18n.exists(`lib.meldingen.${n.key}.titel`))
        return null;
    return { id: `act-notif-${n.id}`, categorie: n.category === "wijziging" ? "gewijzigd" : "info", icoon: ICOON_MELDING[n.type] ?? "melding", verzoek: false,
        volgorde: Date.parse(n.created_at), tijd: tijdTekst(n.created_at), naar: n.link || "/activiteiten", door: params.naam,
        titel: i18n.t(`lib.meldingen.${n.key}.titel`, params), uitleg: i18n.t(`lib.meldingen.${n.key}.uitleg`, params) };
}
/** Bundel informatieve gebeurtenissen van hetzelfde type (nooit verzoeken of wijzigingen). */
export function bundel(lijst) {
    const uit = [];
    const groepen = new Map();
    for (const a of lijst) {
        if (a.categorie !== "info") {
            uit.push(a);
            continue;
        }
        const k = a.titel;
        groepen.set(k, [...(groepen.get(k) ?? []), a]);
    }
    for (const [titel, g] of groepen) {
        if (g.length === 1) {
            uit.push(g[0]);
            continue;
        }
        const s = [...g].sort((a, b) => b.volgorde - a.volgorde);
        const kop = s[0];
        const meervoud = kop.icoon === "momentjes" ? i18n.t(`${NS}.momentenGedeeld`, { count: g.length }) : `${titel} (${g.length})`;
        uit.push({ ...kop, id: `bundel-${s.map((x) => x.id).join("+")}`, titel: meervoud, uitleg: kop.uitleg, onderdelen: s });
    }
    return uit;
}
/**
 * Meerdere meldingen met dezelfde sleutel over hetzelfde ding (bijv. twee keer "Klopt de vaste verdeling?" voor
 * hetzelfde kind, omdat de regeling opnieuw is opgeslagen): alleen de nieuwste telt, de oudere zijn achterhaald.
 * Meldingen zonder entity_id blijven allemaal staan.
 */
export function alleenNieuwste(meldingen) {
    const gezien = new Set();
    return [...meldingen]
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
        .filter((n) => {
        if (!n.entity_id)
            return true;
        const k = `${n.key}|${n.entity_type ?? ""}|${n.entity_id}`;
        if (gezien.has(k))
            return false;
        gezien.add(k);
        return true;
    });
}
/**
 * Bronnen: { ik (profiel-id), voorstellen, audit, momentjes, meldingen?, anderNaam? }. Een servermelding die bij een
 * auditevent hoort (audit_id) vervangt dat event, zodat dezelfde handeling niet twee keer verschijnt.
 */
export function verzamelActiviteiten(b) {
    const meldingen = alleenNieuwste(b.meldingen ?? []);
    const metMelding = new Set(meldingen.map((n) => n.audit_id).filter(Boolean));
    // Ook zonder audit_id: een melding over hetzelfde item, van dezelfde persoon, binnen 5 minuten = dezelfde handeling.
    const zelfdeHandeling = (e) => !!e.itemId && meldingen.some((n) => n.entity_id === e.itemId && (!n.actor_id || n.actor_id === e.actorId) && Math.abs(Date.parse(n.created_at) - Date.parse(e.moment)) < 5 * 60_000);
    const ruw = [
        ...b.voorstellen.map(uitVoorstel),
        ...b.audit.filter((e) => e.actorId !== b.ik && !metMelding.has(e.eventId) && !zelfdeHandeling(e)).map(uitAudit),
        ...b.momentjes.map((m, i) => uitMomentje(m, i, b.ik, b.anderNaam)),
        ...meldingen.map(uitMelding),
    ].filter((x) => x !== null);
    const uniek = [...new Map(ruw.map((a) => [a.id, a])).values()];
    return bundel(uniek);
}
const VOLGORDE = ["regelen", "gewijzigd", "info"];
/** Groepeer per categorie in vaste volgorde, nieuwste bovenaan; lege categorieën vallen weg. */
export function perCategorie(l) {
    return VOLGORDE.map((c) => ({ categorie: c, items: l.filter((a) => a.categorie === c).sort((a, b) => b.volgorde - a.volgorde) }))
        .filter((g) => g.items.length > 0);
}
const alleIds = (a) => a.onderdelen ? a.onderdelen.map((o) => o.id) : [a.id];
export const isGelezen = (a, gelezen) => alleIds(a).every((id) => gelezen.includes(id));
/** Nieuw = ongelezen, plus openstaande verzoeken (die blijven tot ze in de bron zijn afgehandeld). */
export const nieuw = (l, gelezen) => l.filter((a) => a.verzoek || !isGelezen(a, gelezen));
/** Bolletje op het belletje: alleen bij iets ongelezens. */
export const heeftNieuws = (l, gelezen) => l.some((a) => !isGelezen(a, gelezen));
export const markeerIds = alleIds;
