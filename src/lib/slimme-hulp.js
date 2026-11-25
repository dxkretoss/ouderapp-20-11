import i18n, { taalLocale, tLijst } from "@/i18n";
import { useSyncExternalStore } from "react";
import { categorieMeta } from "@/lib/demo-data";
import { kringState } from "@/lib/kring-store";
import { takenState } from "@/lib/taken-store";
import { itemsVoor } from "@/lib/overdracht-store";
/** De gedeelde paklijst van een wissel (server: manage-handover), dezelfde als op Overdracht. */
const lijstVan = (m) => itemsVoor(overdrachtState(), m.id);
const meeNamen = (m) => lijstVan(m).map((i) => i.naam);
const nogInpakken = (m) => lijstVan(m).filter((i) => !i.ingepakt).map((i) => i.naam);
import { alleRegels } from "@/lib/audit-store";
import { gezinState, isIk } from "@/lib/gezin";
import { nuLijst } from "@/lib/nu-afstemmen-store";
import { authState, opAuth } from "@/lib/auth-store";
import { zetVoorkeur } from "@/lib/voorkeuren-store";
import { overdrachtState, useOverdracht } from "@/lib/overdracht-store";
import { aanwezigVoor, startAfstemming, useAanwezigheid } from "@/lib/aanwezigheid-store";
import { agendaState } from "@/lib/agenda-store";
/**
 * Slimme laag ("Even vooruitkijken", Deze week, Morgen, Wat moet mee?, conflictcontrole, Sinds je laatste bezoek).
 * Leest en combineert bestaande stores — één bron per gegeven, nooit kopieën. Signalen zijn losse regels;
 * Home toont er hooguit 3. Niets wijzigt zichzelf: elke actie opent de bestaande flow of vraagt bevestiging.
 * Persoonlijke hulp: een suggestie aan de ene ouder wordt niet met de andere ouder gedeeld.
 * Het voorbeeldgezin bestaat niet meer: er zijn geen vaste voorbeeldafspraken of een voorbeeld-zorgweek;
 * agenda-afspraken komen als `extra` mee vanuit de agenda (agenda-store).
 * Bronnen: vaste spullen (routines) uit manage-handover (overdracht-store), wie er gaat uit de afstemming per
 * afspraak (aanwezigheid-store). Persoonlijke keuzes (weggedrukt, later herinneren, niet meer tonen, laatste
 * bezoek, gekoppelde afstemvraag) zijn voorkeuren van je account (profiles.preferences.app), niet van dit apparaat.
 */
const afspraken = [];
const lokaalIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Vandaag (lokale datum). De oude naam blijft voor bestaande aanroepers; het is geen demodag meer. */
const vandaagIso = () => lokaalIso(new Date());
// Dagnamen zijn interne id's (routines, vergelijkingen); voor weergave gaat alles via dagTekst().
const dagNamen = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const NS = "lib.slimmeHulp";
/** Weergavenaam van een dag-id ("maandag", "vandaag") in de huidige taal, kleine letters. */
const dagTekst = (id) => id === "vandaag" ? i18n.t(`${NS}.vandaag`) : (tLijst("common.dagen")[(dagNamen.indexOf(id) + 6) % 7] ?? id);
const hoofdletter = (s) => s.replace(/^./, (c) => c.toUpperCase());
const isoVanDag = (dag) => `2025-03-${String(dag).padStart(2, "0")}`;
const weekdag = (iso) => dagNamen[new Date(`${iso}T00:00`).getDay()];
/** Dag-id van een agenda-afspraak, taalonafhankelijk afgeleid van de numerieke dag (gelijk aan de dag in de agenda). */
const dagVan = (a) => { const iso = isoVanDag(a.dag); return iso === vandaagIso() ? "vandaag" : weekdag(iso); };
const minuten = (t) => { const m = /^(\d{1,2}):(\d{2})/.exec(t); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const kindPast = (a, b) => {
    if (!a.trim() || !b.trim())
        return false;
    if ([a, b].some((x) => /^(allebei|alle kinderen|de kinderen|both|all children|the children)$/i.test(x.trim())))
        return true;
    const namen = (x) => x.toLowerCase().split(/\s*(?:&|,|\ben\b|\band\b)\s*/).map((n) => n.trim()).filter(Boolean);
    return namen(a).some((n) => namen(b).includes(n));
};
/* ---------- persoonlijke keuzes: voorkeuren van het account ---------- */
// Klein houden: alle voorkeuren samen mogen hooguit 16 KB zijn (manage-profile).
const MAX_LIJST = 20;
const leegKeuzes = () => ({ later: {}, nietMeer: [], routineNietNodig: [], afstem: {}, laatsteBezoek: null });
let keuzes = leegKeuzes();
let keuzesVoor = undefined;
const listeners = new Set();
const meld = () => { versie++; listeners.forEach((l) => l()); };
let versie = 0;
/** Neemt de keuzes over uit het profiel (bij inloggen of een ander account); eigen wijzigingen houden we zelf bij. */
function volgAccount() {
    const g = authState().gebruiker;
    const id = g?.id ?? null;
    if (id === keuzesVoor)
        return;
    keuzesVoor = id;
    const app = g?.preferences?.app ?? {};
    const later = app.slimLater && typeof app.slimLater === "object" && !Array.isArray(app.slimLater)
        ? Object.fromEntries(Object.entries(app.slimLater).filter(([, tijd]) => typeof tijd === "number" && Number.isFinite(tijd) && tijd > Date.now()))
        : {};
    keuzes = {
        later,
        nietMeer: Array.isArray(app.slimNietMeer) ? app.slimNietMeer.filter((x) => typeof x === "string") : [],
        routineNietNodig: Array.isArray(app.slimRoutineNietNodig) ? app.slimRoutineNietNodig.filter((x) => typeof x === "string") : [],
        afstem: app.slimAfstem && typeof app.slimAfstem === "object" && !Array.isArray(app.slimAfstem) ? app.slimAfstem : {},
        laatsteBezoek: typeof app.laatsteBezoek === "string" ? app.laatsteBezoek : null,
    };
    if (id)
        zetOudeKeuzesOver();
    meld();
}
/** Oude, alleen-lokale keuzes (vóór de serveropslag): één keer overnemen en van dit apparaat wissen. */
function zetOudeKeuzesOver() {
    try {
        const v = JSON.parse(localStorage.getItem("onzeapp-slimme-hulp") ?? "null");
        const bezoek = localStorage.getItem("onzeapp-laatste-bezoek");
        if (v && typeof v === "object") {
            if (Array.isArray(v.nietMeer) && !keuzes.nietMeer.length)
                bewaar({ nietMeer: v.nietMeer.filter((x) => typeof x === "string") });
            if (Array.isArray(v.routineNietNodig) && !keuzes.routineNietNodig.length)
                bewaar({ routineNietNodig: v.routineNietNodig.filter((x) => typeof x === "string") });
        }
        if (bezoek && !keuzes.laatsteBezoek)
            bewaar({ laatsteBezoek: bezoek });
        localStorage.removeItem("onzeapp-slimme-hulp");
        localStorage.removeItem("onzeapp-laatste-bezoek");
    }
    catch { /* geen opslag */ }
}
let gekoppeld = false;
function laad() {
    if (gekoppeld || typeof window === "undefined")
        return;
    gekoppeld = true;
    opAuth(volgAccount);
    volgAccount();
}
const VOORKEUR = { later: "slimLater", nietMeer: "slimNietMeer", routineNietNodig: "slimRoutineNietNodig", afstem: "slimAfstem", laatsteBezoek: "laatsteBezoek" };
/** Wijzigt keuzes lokaal en schrijft ze naar de accountvoorkeuren (voorkeuren-store bundelt en bewaart). */
function bewaar(p) {
    keuzes = { ...keuzes, ...p };
    for (const [k, v] of Object.entries(p))
        if (VOORKEUR[k])
            zetVoorkeur(VOORKEUR[k], v);
    meld();
}
/** Routines (vaste spullen per kind en dag) komen uit manage-handover; hier alleen gelezen. */
const routines = () => overdrachtState().routines ?? [];
/** Gaat de ingelogde ouder (volgens de afstemming bij die afspraak) zelf? */
const ikGaZelf = (afspraakId) => { const a = afspraakId ? aanwezigVoor(afspraakId) : null; return !!a && a.wieGaat === "sanne" && a.fase !== "open"; };
let snapshot = null;
let snapshotVersie = -1;
let snapshotRoutines = null;
/** Vorm zoals de schermen al kenden: { routines, later, nietMeer, routineNietNodig, afstem }. */
function huidig() {
    const r = routines();
    if (!snapshot || snapshotVersie !== versie || snapshotRoutines !== r) {
        snapshot = { ...keuzes, routines: r };
        snapshotVersie = versie;
        snapshotRoutines = r;
    }
    return snapshot;
}
export function useSlimmeHulp() {
    // Meeluisteren met de bronnen, zodat schermen bijwerken als routines of afstemmingen veranderen.
    useOverdracht();
    useAanwezigheid();
    return useSyncExternalStore((l) => { laad(); listeners.add(l); return () => listeners.delete(l); }, () => { laad(); return huidig(); }, () => huidig());
}
/** Patroonvoorstel bewust afgewezen: wordt onthouden, zodat de app het niet opnieuw vraagt. */
export const routineNietNodig = (sleutel) => { laad(); bewaar({ routineNietNodig: [...new Set([...keuzes.routineNietNodig, String(sleutel)])].slice(-MAX_LIJST) }); };
export const laterHerinneren = (id, tot) => {
    laad();
    if (!Number.isFinite(tot) || tot <= Date.now())
        return;
    // Verlopen herinneringen opruimen, zodat de voorkeur klein blijft.
    const nog = Object.entries(keuzes.later).filter(([, t]) => t > Date.now()).slice(-(MAX_LIJST - 1));
    bewaar({ later: { ...Object.fromEntries(nog), [id]: tot } });
};
export const nietMeerTonen = (t) => { laad(); bewaar({ nietMeer: [...new Set([...keuzes.nietMeer, String(t)])].slice(-MAX_LIJST) }); };
export const zetWeerAan = () => { laad(); bewaar({ nietMeer: [], later: {}, routineNietNodig: [] }); };
/**
 * "Ik ga": bij een gedeelde afspraak wordt dat een afstemvoorstel aan de andere ouder (manage-agenda,
 * aanwezigheid). Een privé-afspraak hoeft niet afgestemd te worden: dan gebeurt er niets.
 */
export function ikGa(afspraakId, _titel) {
    const a = agendaState().events.find((x) => x.id === afspraakId);
    if (!a || a.gedeeld === false || !/^[0-9a-f-]{36}$/i.test(String(afspraakId)))
        return;
    startAfstemming(afspraakId, "een", "sanne", { wieGaat: "sanne" });
}
/** Plek van een spul: profiel-id van jou of de andere ouder, anders vrije tekst. */
const plekNaam = (p) => (isIk(p) || p === "sanne" ? i18n.t(`${NS}.plek.sanne`) : p && (p === gezinState().ander?.id || p === "joris") ? i18n.t(`${NS}.plek.joris`) : p && !/^[0-9a-f-]{36}$/i.test(p) ? p : i18n.t(`${NS}.plek.anders`));
/** Wie heeft het kind die dag: geen voorbeeld-zorgweek meer (de echte verdeling staat in agenda-zorg). */
const verblijfOp = () => undefined;
const regelOverdracht = () => {
    const w = kringState().momenten.find((m) => m.soort === "wissel");
    if (!w)
        return [];
    const open = nogInpakken(w);
    const extra = mogelijkMee(w).length;
    if (!open.length && !extra)
        return [];
    return [{
            id: `transfer-${w.id}`, type: "upcoming_transfer", prioriteit: 1,
            titel: i18n.t(`${NS}.overdracht.titel`, { dag: w.dag.toLowerCase() }),
            tekst: `${i18n.t(`${NS}.overdracht.volgende`, { dag: w.dag, tijd: w.tijd })}${open.length ? i18n.t(`${NS}.overdracht.open`, { count: open.length }) : i18n.t(`${NS}.overdracht.lijstKlaar`)}${extra ? i18n.t(`${NS}.overdracht.extra`, { count: extra }) : "."}`,
            waarom: i18n.t(extra ? `${NS}.overdracht.waaromExtra` : `${NS}.overdracht.waarom`),
            acties: [{ label: i18n.t(`${NS}.watMoetMee`), to: "/overdracht" }],
        }];
};
const regelSpullen = ({ vandaag }) => {
    const uit = [];
    for (const s of takenState().spullen.filter((x) => x.type === "vast" && x.plek)) {
        // Zoek een komende sportactiviteit van hetzelfde kind binnen 3 dagen
        const a = afspraken.find((x) => x.categorie === "sport" && x.kind.toLowerCase() === s.kind && isoVanDag(x.dag) >= vandaag && x.dag - Number(vandaag.slice(8)) <= 3);
        if (!a)
            continue;
        const bij = verblijfOp(isoVanDag(a.dag));
        if (!bij || bij === s.plek)
            continue;
        uit.push({
            id: `mismatch-${s.id}-${a.id}`, type: "item_location_mismatch", prioriteit: 1,
            titel: i18n.t(`${NS}.spullen.titel`, { dag: dagTekst(dagVan(a)) }),
            tekst: i18n.t(`${NS}.spullen.tekst`, { dagHoofd: hoofdletter(dagTekst(dagVan(a))), kind: a.kind, activiteit: a.titel.toLowerCase(), spul: s.naam.toLowerCase(), plek: plekNaam(s.plek) }),
            waarom: i18n.t(`${NS}.spullen.waarom`, { titel: a.titel, dag: dagTekst(dagVan(a)), spul: s.naam.toLowerCase(), plek: plekNaam(s.plek) }),
            acties: [{ label: i18n.t(`${NS}.spullen.bekijk`), to: "/spullen" }],
        });
    }
    return uit;
};
const regelWieGaat = ({ vandaag }) => afspraken
    .filter((a) => (a.categorie === "medisch" || a.categorie === "school") && isoVanDag(a.dag) > vandaag && a.dag - Number(vandaag.slice(8)) <= 7 && !aanwezigVoor(a.id))
    .slice(0, 1)
    .map((a) => ({
    id: `wie-${a.id}`, type: "unassigned_task", prioriteit: 2,
    titel: i18n.t(`${NS}.wieGaat.titel`),
    tekst: i18n.t(`${NS}.wieGaat.tekst`, { titel: a.titel, dag: dagTekst(dagVan(a)), tijd: a.tijd }),
    waarom: i18n.t(`${NS}.wieGaat.waarom`, { titel: a.titel }),
    acties: [{ label: i18n.t(`${NS}.wieGaat.ikGa`), doe: () => ikGa(a.id, a.titel) }, { label: i18n.t(`${NS}.wieGaat.samen`), to: "/samen-regelen" }],
}));
const regelDeadline = ({ vandaag }) => takenState().taken
    .filter((t) => !t.klaar && t.deadline && t.deadline >= vandaag && (new Date(t.deadline).getTime() - new Date(vandaag).getTime()) / 864e5 <= 7)
    .slice(0, 1)
    .map((t) => ({
    id: `deadline-${t.id}`, type: "upcoming_deadline", prioriteit: 1,
    titel: i18n.t(`${NS}.deadline.titel`), tekst: i18n.t(`${NS}.deadline.tekst`, { tekst: t.tekst, datum: new Date(t.deadline).toLocaleDateString(taalLocale(), { day: "numeric", month: "long" }) }),
    waarom: i18n.t(`${NS}.deadline.waarom`), acties: [{ label: i18n.t(`${NS}.deadline.bekijk`), to: "/taken" }],
}));
// Home 9.0: de overdracht staat alleen in de kaart Vandaag (binnen 24 uur) — niet nog eens als tip.
void regelOverdracht;
const regels = [regelSpullen, regelDeadline, regelWieGaat];
/** Hooguit 3, gesorteerd op prioriteit; weggedrukte en uitgezette soorten komen niet terug. Geen zichtbare score. */
export function suggesties(vandaag = vandaagIso()) {
    laad();
    return regels.flatMap((r) => r({ vandaag }))
        .filter((s) => (keuzes.later[s.id] ?? 0) <= Date.now() && !keuzes.nietMeer.includes(s.type))
        .sort((a, b) => a.prioriteit - b.prioriteit)
        .slice(0, 3);
}
/* ---------- Wat moet mee? (alleen uit routines en bevestigde activiteiten — nooit verzonnen) ---------- */
export function mogelijkMee(m) {
    const al = meeNamen(m);
    const k = kringState();
    const volgende = k.momenten.filter((x) => x.id !== m.id && x.datum > m.datum && x.kindIds.some((id) => m.kindIds.includes(id)));
    const totWissel = volgende.find((x) => x.soort === "wissel")?.datum ?? "9999";
    const uitActiviteit = volgende.filter((x) => x.soort === "afspraak" && x.datum < totWissel).flatMap((x) => x.mee.map((item) => ({ item, reden: `${x.titel} ${x.dag.toLowerCase()} ${x.tijd}` })));
    const dagen = new Set();
    const lok = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    for (let d = new Date(`${m.datum}T00:00`); lok(d) <= (totWissel === "9999" ? m.datum : totWissel); d.setDate(d.getDate() + 1))
        dagen.add(dagNamen[d.getDay()]);
    const uitRoutine = routines().filter((r) => m.kindIds.includes(r.kind) && (r.dag === "elke" || dagen.has(r.dag))).map((r) => ({ item: r.item, reden: r.reden }));
    const gezien = new Set(al.map((x) => x.toLowerCase()));
    return [...uitActiviteit, ...uitRoutine].filter((x) => { const k2 = x.item.toLowerCase(); if (gezien.has(k2))
        return false; gezien.add(k2); return true; });
}
export function weekOverzicht(vandaag = vandaagIso()) {
    laad();
    const start = new Date(`${vandaag}T00:00`);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const wissel = kringState().momenten.find((m) => m.soort === "wissel");
    const meeOpen = wissel ? nogInpakken(wissel).length : 0;
    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const dagNaam = dagNamen[d.getDay()];
        const weekDagen = (a) => a.dag >= start.getDate() && a.dag <= start.getDate() + 6;
        const regels = afspraken.filter((a) => weekDagen(a) && (dagVan(a) === "vandaag" ? "donderdag" : dagVan(a)) === dagNaam).map((a) => ({
            tijd: a.tijd, tekst: a.categorie === "wissel" ? i18n.t(`${NS}.week.wisselmoment`) : `${a.titel} · ${a.kind}`,
            sub: a.categorie === "wissel" && meeOpen ? i18n.t(`${NS}.week.meeOpen`, { count: meeOpen }) : categorieMeta[a.categorie].label,
            naar: a.categorie === "wissel" ? "/overdracht" : "/agenda",
            dag: a.categorie === "wissel" ? undefined : iso,
        }));
        regels.sort((x, y) => (x.tijd ?? "").localeCompare(y.tijd ?? ""));
        for (const r of routines().filter((x) => x.dag === dagNaam))
            regels.push({ tekst: r.reden, sub: i18n.t(`${NS}.week.itemMee`, { item: r.item }), naar: "/overdracht" });
        return { iso, label: hoofdletter(dagTekst(dagNaam)), regels };
    });
}
export const morgenOverzicht = (vandaag = vandaagIso()) => {
    const d = new Date(`${vandaag}T00:00`);
    d.setDate(d.getDate() + 1);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return weekOverzicht(vandaag).find((x) => x.iso === iso) ?? { iso, label: dagTekst(dagNamen[d.getDay()]), regels: [] };
};
export const nogTeRegelenDezeWeek = () => regels.flatMap((r) => r({ vandaag: vandaagIso() })).filter((s) => s.prioriteit <= 2).length;
export function overlappendeAfspraken(p, bestaand, ignore) {
    const start = minuten(p.tijd), eind = minuten(p.eindtijd ?? "");
    if (start === null)
        return [];
    return bestaand.filter((a) => {
        if ((ignore && a.id === ignore) || a.datum !== p.datum || !kindPast(a.kind, p.kind))
            return false;
        const s = minuten(a.tijd), e = minuten(a.eindtijd ?? "");
        if (s === null)
            return false;
        // With no known duration, compare the actual point in time; never invent a one-hour appointment.
        if (eind === null && e === null)
            return start === s;
        if (eind === null)
            return e !== null && start >= s && start < e;
        if (e === null)
            return s >= start && s < eind;
        return start < e && s < eind;
    });
}
export function controleerAfspraak(p, extra = [], ignore, metDemo = true) {
    const uit = [];
    const start = minuten(p.tijd);
    if (start !== null) {
        const bestaand = [...(metDemo ? afspraken.filter((a) => a.categorie !== "vakantie").map((a) => ({ id: a.id, titel: a.titel, datum: isoVanDag(a.dag), tijd: a.tijd, kind: a.kind })) : []), ...extra];
        for (const botst of overlappendeAfspraken(p, bestaand, ignore))
            uit.push({ soort: "overlap", tekst: i18n.t(`${NS}.controle.overlap`, { titel: botst.titel, tijd: botst.tijd }), afspraakId: botst.id });
        // Alleen melden als het wisselmoment werkelijk in de buurt ligt; niet elk verband is een melding.
        const wissel = metDemo ? kringState().momenten.find((m) => m.soort === "wissel" && m.datum === p.datum && m.kindIds.some((k) => kindPast(k, p.kind))) : undefined;
        const wisselTijd = wissel ? minuten(wissel.tijd) : null;
        if (wissel && wisselTijd !== null && Math.abs(wisselTijd - start) <= 60)
            uit.push({ soort: "wissel", tekst: i18n.t(`${NS}.controle.wissel`, { kind: p.kind, wisselTijd: wissel.tijd, titel: p.titel.toLowerCase(), tijd: p.tijd }) });
    }
    // Een vaststaand feit (bijv. schoolactiviteit) plant de ouder niet zelf: geen afstemvraag over de verblijfdag.
    const bij = !metDemo || p.categorie === "school" ? undefined : verblijfOp(p.datum);
    if (bij && bij !== "sanne") {
        uit.push({ soort: "verblijf", tekst: /allebei|both|&/i.test(p.kind) ? i18n.t(`${NS}.controle.verblijfKinderen`) : i18n.t(`${NS}.controle.verblijfKind`, { kind: p.kind }) });
    }
    return uit;
}
export function controleerPrive(p, extra = []) {
    const start = minuten(p.tijd);
    if (start === null)
        return [];
    const eind = minuten(p.eindtijd ?? "") ?? start + 60;
    const binnen = (t) => { const m = minuten(t); return m !== null && m >= start - 15 && m <= eind; };
    const uit = [];
    const wissel = kringState().momenten.find((m) => m.soort === "wissel" && (m.datum === p.datum || weekdag(m.datum) === weekdag(p.datum)) && binnen(m.tijd));
    if (wissel)
        uit.push({ kind: i18n.t(`${NS}.prive.deKinderen`), titel: i18n.t(`${NS}.prive.hetWisselmoment`), tekst: i18n.t(`${NS}.prive.wisselTekst`, { tijd: wissel.tijd }), bericht: i18n.t(`${NS}.prive.wisselBericht`, { tijd: wissel.tijd }) });
    const bijMij = verblijfOp(p.datum) === "sanne";
    const kindAfspraken = [...afspraken.filter((a) => a.categorie !== "vakantie").map((a) => ({ id: a.id, titel: a.titel, datum: isoVanDag(a.dag), tijd: a.tijd, kind: a.kind })), ...extra];
    for (const a of kindAfspraken) {
        if (a.datum !== p.datum || !binnen(a.tijd))
            continue;
        const ingepland = ikGaZelf(a.id);
        if (!ingepland && !bijMij)
            continue; // kind bij de ander en geen taak: geen melding
        const t = a.titel.split(" · ")[0].toLowerCase();
        uit.push({ kind: a.kind, titel: t, tekst: i18n.t(`${NS}.prive.brengTekst`, { kind: a.kind, titel: t, tijd: a.tijd }), bericht: i18n.t(`${NS}.prive.brengBericht`, { kind: a.kind, titel: t }) });
    }
    return uit;
}
/** Eén afspraak, één verzoek: het verzoek wordt gekoppeld, niet erbij gezet. */
export const koppelAfstem = (afspraakId, verzoekId) => {
    laad();
    if (!afspraakId || !verzoekId)
        return;
    // Alleen echte ids bewaren (een tijdelijke afspraak- of verzoek-id bestaat na verversen niet meer).
    const echt = (x) => /^[0-9a-f-]{36}$/i.test(String(x));
    const nog = Object.entries(keuzes.afstem).filter(([a, v]) => a !== afspraakId && echt(a) && echt(v)).slice(-(MAX_LIJST - 1));
    const nieuw = Object.fromEntries(nog);
    if (echt(afspraakId) && echt(verzoekId))
        nieuw[afspraakId] = verzoekId;
    else
        tijdelijkAfstem.set(afspraakId, verzoekId);
    bewaar({ afstem: nieuw });
};
/** Koppelingen met een tijdelijke id (alleen tot de server de echte id geeft). */
const tijdelijkAfstem = new Map();
/** "Afgestemd ✓" alleen als de andere ouder positief antwoordde; geen reactie = geen akkoord. */
export function afstemStatus(afspraakId) {
    laad();
    const id = keuzes.afstem[afspraakId] ?? tijdelijkAfstem.get(afspraakId);
    if (!id)
        return "geen";
    const n = nuLijst().find((x) => x.id === id);
    if (!n)
        return "open";
    if (n.status !== "opgelost")
        return "open";
    return /(is goed|akkoord|^ja|haal op|pak op|that's fine|that time works|fine|agreed|^yes|i'll pick|pick (him|her|them|\w+) up)/i.test(n.antwoord ?? "") ? "akkoord" : "geen";
}
/* ---------- Sinds je laatste bezoek: gebundeld, alleen praktisch relevante wijzigingen ---------- */
export function sindsLaatsteBezoek() {
    if (typeof window === "undefined")
        return null;
    laad();
    if (!keuzesVoor)
        return null;
    const vorige = keuzes.laatsteBezoek;
    // Hooguit elke 10 minuten opslaan (voorkeur van het account), anders bij elk bezoek aan Home een aanroep.
    if (!vorige || Date.now() - new Date(vorige).getTime() > 10 * 60_000)
        bewaar({ laatsteBezoek: new Date().toISOString() });
    if (!vorige)
        return null;
    // Alleen als je de app een tijdje (≥ 1 uur) niet hebt geopend
    if (Date.now() - new Date(vorige).getTime() < 36e5)
        return null;
    // Audit-events dragen het profiel-id van de actor (server); eigen handelingen tellen niet.
    const nieuw = alleRegels().filter((e) => e.moment > vorige && e.actie !== "EXPORTED" && e.actorId !== "sanne" && !isIk(e.actorId));
    if (!nieuw.length)
        return null;
    const routes = { afspraak: "/agenda", kosten: "/kosten", schema: "/zorgregeling", besluit: "/beslissingen", dossier: "/exporteren", taak: "/taken", spul: "/spullen" };
    const recent = [...nieuw].reverse().filter((e, i, l) => l.findIndex((x) => x.soort === e.soort && x.itemId === e.itemId) === i);
    return { sinds: vorige, regels: recent.slice(0, 3).map((e) => ({ id: e.eventId, tekst: `${e.itemNaam} · ${i18n.t(`${NS}.bezoek.${e.actie === "ACCEPTED" ? "akkoord" : e.actie === "CREATED" ? "toegevoegd" : e.actie === "DELETED" ? "verwijderd" : "bijgewerkt"}`)}`, to: routes[e.soort], hash: `item-${e.itemId}` })) };
}
