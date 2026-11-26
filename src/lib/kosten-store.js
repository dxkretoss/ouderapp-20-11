import { useSyncExternalStore } from "react";
import i18n, { taalLocale } from "@/i18n";
import { api, foutTekst } from "@/lib/api";
import { authState, opAuth } from "@/lib/auth-store";
import { startState, useStart } from "@/lib/start-store";
import { meldFout } from "@/lib/feedback";
import { berekenSaldo, veiligeBetaallink } from "@/lib/verrekening";
import { bijTerugkeer } from "@/lib/terugkeer";
/**
 * Kosten van het eigen gezin — één bron voor uitgaven, budgetten, afrekeningen, vaste lasten en de
 * kostenafspraak, gevuld door `manage-expenses` (actie `overview`). Alleen in het geheugen; opnieuw
 * geladen na inloggen, bij terugkeer naar het venster en na elke wijziging die meer raakt dan één record.
 * Records bewaren profiel-id's; voor de schermen worden ze vertaald naar "ik"/"ander" (de kijker).
 * budget-store en vaste-lasten-store zijn dunne lagen op deze bron (geen tweede lijst).
 */
const LEEG = Object.freeze({ me: null, partner_id: null, partner_ids: [], pairs: [], expenses: [], budgets: [], settlements: [], recurring: [], pots: [], agreement: { current: null, pending: null } });
let ruw = LEEG;
let status = "leeg"; // leeg | laden | klaar | fout
let geladenVoor = null;
let bezigMet = null;
let laatsteLaad = 0;
const luisteraars = new Set();
const meld = () => luisteraars.forEach((l) => l());
const r2 = (n) => Math.round(n * 100) / 100;
function fout(e) {
    if (e?.code === "UNAUTHORIZED")
        return;
    meldFout(foutTekst(e));
}
/* ---------- laden ---------- */
let gekoppeld = false;
function koppel() {
    if (gekoppeld || typeof window === "undefined")
        return;
    gekoppeld = true;
    opAuth(() => {
        const g = authState().gebruiker;
        if (!g || authState().status !== "aan") {
            if (geladenVoor) {
                ruw = LEEG;
                status = "leeg";
                geladenVoor = null;
                meld();
            }
            return;
        }
        if (geladenVoor && geladenVoor !== g.id) {
            ruw = LEEG;
            status = "leeg";
            geladenVoor = null;
            meld();
        }
        queueMicrotask(zorgVoorLaden);
    });
    // Geen realtime: bij terugkeer naar de app opnieuw ophalen (hoogstens eens per 10 s).
    bijTerugkeer("kosten", () => { if ((geladenVoor || status === "fout") && Date.now() - laatsteLaad > 10000)
        return laadKosten(); });
}
function zorgVoorLaden() {
    koppel();
    const a = authState();
    if (a.status !== "aan" || !a.gebruiker)
        return;
    // Na een mislukte eerste lading niet automatisch blijven proberen: de pagina toont "Opnieuw proberen".
    if (geladenVoor !== a.gebruiker.id && !bezigMet && status !== "fout")
        laadKosten();
}
/** Alles opnieuw van de server halen. */
/**
 * Teller van eigen wijzigingen (toevoegen, reageren, verwijderen …). Een verversing die liep terwijl er
 * iets gewijzigd werd, heeft oude gegevens: die gooien we weg en we laden direct opnieuw — anders zou een
 * net toegevoegde uitgave verdwijnen tot de pagina herladen wordt.
 */
let wijzigingen = 0;
export async function laadKosten() {
    const a = authState();
    if (a.status !== "aan" || !a.gebruiker)
        return;
    const voor = a.gebruiker.id;
    if (bezigMet)
        return bezigMet;
    if (status !== "klaar") {
        status = "laden";
        meld();
    }
    laatsteLaad = Date.now();
    const wijzigingenBijStart = wijzigingen;
    let opnieuw = false;
    bezigMet = (async () => {
        try {
            const r = await api("manage-expenses", "overview");
            if (authState().gebruiker?.id !== voor)
                return;
            if (wijzigingen !== wijzigingenBijStart) {
                opnieuw = true; // verouderd antwoord: niet over de nieuwe stand heen schrijven
                return;
            }
            ruw = { me: r.me, partner_id: r.partner_id ?? null, partner_ids: r.partner_ids ?? (r.partner_id ? [r.partner_id] : []), pairs: r.pairs ?? [], expenses: r.expenses ?? [], budgets: r.budgets ?? [], settlements: r.settlements ?? [], recurring: r.recurring ?? [], pots: r.pots ?? [], agreement: r.agreement ?? { current: null, pending: null } };
            status = "klaar";
            geladenVoor = voor;
        }
        catch (e) {
            if (authState().gebruiker?.id !== voor)
                return;
            // Gegevens van deze gebruiker blijven staan bij een mislukte verversing; zonder gegevens: foutweergave
            // met "Opnieuw proberen" (geladenVoor blijft leeg, zodat een volgende poging echt opnieuw laadt).
            if (geladenVoor === voor)
                status = "klaar";
            else {
                status = "fout";
                if (e?.code === "UNAUTHORIZED")
                    return;
            }
        }
        finally {
            bezigMet = null;
            if (authState().gebruiker?.id !== voor) {
                status = "leeg";
                queueMicrotask(zorgVoorLaden);
            }
            meld();
            if (opnieuw)
                queueMicrotask(() => { void laadKosten(); });
        }
    })();
    return bezigMet;
}
/** Intern voor budget-store / vaste-lasten-store: ruwe bron lezen en één record vervangen. */
export const kostenBron = {
    ruw: () => ruw,
    zet(p) { wijzigingen++; ruw = { ...ruw, ...p }; meld(); },
    vervang(lijst, item) {
        wijzigingen++;
        const oud = ruw[lijst];
        ruw = { ...ruw, [lijst]: oud.some((x) => x.id === item.id) ? oud.map((x) => (x.id === item.id ? item : x)) : [item, ...oud] };
        meld();
    },
    fout,
};
/* ---------- vertalen naar de vorm van de schermen ---------- */
const wieVan = (id, ik) => (!id ? null : id === ik ? "ik" : "ander");
/** Weergavetekst bij kind-id's; groepswaarden blijven bronwaarden (vertaald via kindLabel). */
export function kindTekst(ids, kinderen = startState().kinderen) {
    const namen = (ids ?? []).map((id) => kinderen.find((k) => k.id === id)?.naam).filter(Boolean);
    if (!namen.length)
        return "Gezin/algemeen";
    if (namen.length > 1 && namen.length === kinderen.length)
        return "Alle kinderen";
    return namen.join(" & ");
}
const ICOON = { School: "school", Sport: "sport", Kleding: "kleding", Zorg: "medisch", Medisch: "medisch", Opvang: "opvang", Activiteiten: "activiteit", Bon: "bon" };
/** De andere partij van een record vanuit de kijker; null bij een privé-record ("Alleen jij"). */
const andereVan = (maker, ander, ik) => (!ander ? null : maker === ik ? ander : maker);
const REACTIES = ["akkoord", "ander_voorstel", "niet_akkoord"];
function kostVan(e, ik, kinderen) {
    const ikBetaal = e.payer_id === ik;
    const pctIk = ikBetaal ? e.payer_pct : r2(100 - e.payer_pct);
    const stappen = e.steps ?? [];
    const laatste = [...stappen].reverse().find((s) => s.type !== "opmerking" && s.type !== "herinnering");
    const maker = e.created_by ?? e.payer_id;
    return {
        doorIk: maker === ik,
        partnerId: andereVan(maker, e.other_parent_id, ik),
        /** De andere ouder heeft al gereageerd (akkoord, ander voorstel of niet akkoord). */
        beantwoord: stappen.some((s) => REACTIES.includes(s.type) && s.actor_id && s.actor_id !== maker),
        herinneringen: stappen.filter((s) => s.type === "herinnering").map((s) => s.created_at),
        aangemaakt: e.created_at,
        categorieGekozen: e.category && e.category !== "Overig" ? e.category : null,
        id: e.id,
        omschrijving: e.description,
        bedrag: e.amount,
        datum: e.date,
        categorie: e.category,
        icoon: ICOON[e.category] ?? "bon",
        kindIds: e.child_ids ?? [],
        kind: kindTekst(e.child_ids, kinderen),
        betaaldDoor: ikBetaal ? "ik" : "ander",
        betaaldDoorId: e.payer_id,
        pctIk,
        aandeelIk: r2((e.amount * pctIk) / 100),
        verdeling: `${pctIk} / ${r2(100 - pctIk)}`,
        bron: e.paid_from === "kindrekening" ? "kindrekening" : "eigen",
        status: e.status,
        // Alleen na een "Ander voorstel" ligt de beurt expliciet vast; anders reageert wie niet betaalde.
        ...(e.counter_pending && e.turn_to_respond ? { aanZet: wieVan(e.turn_to_respond, ik) } : {}),
        meerTijd: e.status === "wacht" && laatste?.type === "meer_tijd" ? { tot: laatste.review_at, door: wieVan(laatste.actor_id, ik) } : null,
        budgetId: e.budget_id ?? undefined,
        settlementId: e.settlement_id ?? null,
        gedeeld: !!e.other_parent_id,
        stappen: stappen.map((s) => ({ ...s, wie: wieVan(s.actor_id, ik) })),
        bijlagen: (e.attachments ?? []).map((b) => ({ id: b.id, naam: b.name, soort: b.kind, url: b.url, moment: b.created_at })),
        opmerkingen: stappen.filter((s) => s.note).map((s) => ({ id: s.id, tekst: s.note, soort: s.type, door: wieVan(s.actor_id, ik), moment: s.created_at })),
    };
}
const STAP = { voorstel: "Voorstel", akkoord: "Akkoord", niet_akkoord: "Niet akkoord", ander_voorstel: "Ander voorstel", wijzigingsvoorstel: "Wijzigingsvoorstel", ingetrokken: "Ingetrokken", meer_tijd: "Meer tijd gevraagd", herinnering: "Herinnering verstuurd", werkelijke_uitgave: "Werkelijke uitgave" };
/** Budget in de bestaande vorm (wat, kind, max, pctIk, status, aanZet, stappen …); percentages vanuit de kijker. */
export function budgetVan(b, ik, kinderen = startState().kinderen) {
    const ikMaakte = b.created_by === ik;
    const naarIk = (p) => (p === null || p === undefined ? undefined : ikMaakte ? p : r2(100 - p));
    return {
        id: b.id,
        partnerId: andereVan(b.created_by, b.other_parent_id, ik),
        wat: b.title,
        kindIds: b.child_ids ?? [],
        kind: kindTekst(b.child_ids, kinderen),
        max: b.amount,
        pctIk: naarIk(b.creator_pct),
        door: ikMaakte ? "ik" : "ander",
        doorId: b.created_by,
        status: b.status,
        aanZet: wieVan(b.turn_to_respond, ik),
        ...(b.note ? { toelichting: b.note } : {}),
        ...(b.response_date ? { reactieDatum: b.response_date } : {}),
        ...(b.category ? { categorie: b.category } : {}),
        periode: b.period ?? "eenmalig",
        ...(b.valid_from ? { geldigVan: b.valid_from } : {}),
        ...(b.valid_to ? { geldigTot: b.valid_to } : {}),
        ...(b.terms ? { voorwaarden: b.terms } : {}),
        ...(b.expense_id ? { kostId: b.expense_id } : {}),
        stappen: (b.steps ?? []).map((s) => ({ wie: wieVan(s.actor_id, ik), wieId: s.actor_id, wat: STAP[s.type] ?? s.type, ...(s.amount !== null && s.amount !== undefined ? { bedrag: s.amount } : {}), ...(s.creator_pct !== null && s.creator_pct !== undefined ? { pctIk: naarIk(s.creator_pct) } : {}), ...(s.review_at ? { terugkijkMoment: s.review_at } : {}), moment: s.created_at })),
    };
}
const maandTekst = (p, moment) => {
    const d = /^\d{4}-\d{2}$/.test(p ?? "") ? new Date(`${p}-15T12:00:00`) : new Date(moment);
    return Number.isNaN(d.getTime()) ? String(p ?? "") : d.toLocaleDateString(taalLocale(), { month: "long", year: "numeric" });
};
function verrekeningVan(s, ik) {
    return {
        id: s.id,
        partnerId: s.payer_id === ik ? s.receiver_id : s.payer_id,
        gemaakt: s.created_at,
        afgerondOp: s.finished_at ?? s.confirmed_at ?? null,
        get maand() { return maandTekst(s.period, s.created_at); },
        bedrag: s.amount,
        van: wieVan(s.payer_id, ik),
        aan: wieVan(s.receiver_id, ik),
        vanId: s.payer_id,
        aanId: s.receiver_id,
        get datum() { return new Date(s.created_at).toLocaleDateString(taalLocale()); },
        get wijze() { return s.description || i18n.t("lib.kostenStore.handmatigeAfrekening"); },
        omschrijving: s.description ?? "",
        status: s.status,
        kostIds: s.expense_ids ?? [],
        ...(s.payment_link ? { betaalverzoek: s.payment_link } : {}),
        iban: s.bank_iban ?? "",
        rekeninghouder: s.bank_account_name ?? "",
        kenmerk: s.reference_code ?? "",
        gebeurtenissen: (s.steps ?? []).map((g) => ({ status: g.status, door: wieVan(g.actor_id, ik), moment: g.created_at })),
    };
}
export const STANDAARD_AFSPRAAK = Object.freeze({ wijze: "alleen", pctIk: 50, moment: "maand", grens: null });
function afspraakVan(a, ik) {
    if (!a)
        return null;
    return { id: a.id, wijze: a.split_mode, pctIk: a.proposed_by === ik ? a.proposer_pct : r2(100 - a.proposer_pct), moment: a.settle_moment, grens: a.approval_threshold, status: a.status, doorIk: a.proposed_by === ik, metAnder: !!a.partner_id, beslistOp: a.decided_at, gemaakt: a.created_at };
}
let cache = null;
let cacheSleutel = [];
/* ---------- gekozen andere ouder (alleen UI-keuze; pas zichtbaar bij twee of meer co-ouders) ---------- */
let gekozenPartner = null;
/** Kies de andere ouder waarvoor Kosten saldo, afspraken, afrekeningen en openstaande punten toont. */
export function kiesKostenPartner(id) {
    if (gekozenPartner === id)
        return;
    gekozenPartner = id;
    cache = null;
    meld();
}
const perMaandVan = (l) => (l.interval === "yearly" ? r2(l.amount / 12) : l.interval === "quarterly" ? r2(l.amount / 3) : l.interval === "weekly" ? r2((l.amount * 52) / 12) : l.amount);
function lastVan(l, ik, kinderen) {
    return { id: l.id, wat: l.title, bedrag: l.amount, interval: l.interval ?? "monthly", kindIds: l.child_ids ?? [], kind: kindTekst(l.child_ids, kinderen), perMaand: perMaandVan(l), pctIk: l.created_by === ik ? l.creator_pct : r2(100 - l.creator_pct), doorIk: l.created_by === ik, gedeeld: !!l.other_parent_id, partnerId: andereVan(l.created_by, l.other_parent_id, ik), categorie: l.category ?? null };
}
function potVan(p, ik, kinderen) {
    return { id: p.id, wat: p.title, doel: p.target_amount ?? 0, gespaard: p.saved ?? 0, kindIds: p.child_ids ?? [], kind: kindTekst(p.child_ids, kinderen), doorIk: p.created_by === ik, gedeeld: !!p.other_parent_id, partnerId: andereVan(p.created_by, p.other_parent_id, ik), notitie: p.note ?? "", stortingen: (p.deposits ?? []).map((d) => ({ id: d.id, bedrag: d.amount, datum: d.date, notitie: d.note ?? "", door: wieVan(d.created_by, ik) ?? "ander" })) };
}
/** Afspraak (bevestigd + open voorstel) met één andere ouder; zonder andere ouder de eigen (Solo) afspraak. */
function afspraakVoor(partnerId, ik) {
    const bron = (partnerId && ruw.pairs.find((p) => p.partner_id === partnerId)?.agreement) || ruw.agreement || { current: null, pending: null };
    const huidig = afspraakVan(bron.current, ik);
    const open = afspraakVan(bron.pending, ik);
    // De afspraak die nu geldt: de bevestigde; zolang er nog geen is het openstaande voorstel (voorlopig).
    const geldt = huidig ?? open ?? STANDAARD_AFSPRAAK;
    return { huidig, open, geldt, bevestigd: !!huidig && (!partnerId || huidig.metAnder) };
}
function instellingenVan(afspraak, historie) {
    const geldt = afspraak.geldt;
    const sleutel = geldt.wijze === "alleen" || geldt.wijze === "per-uitgave" ? 50 : geldt.wijze === "50" ? 50 : geldt.pctIk;
    // Vorm van de oude verrekeninstellingen: één sleutel (de afspraak), afrekenmoment en ontvangerbevestiging (altijd aan).
    return { sleutels: { Algemeen: { ik: sleutel, ander: r2(100 - sleutel) } }, modus: geldt.moment === "direct" ? "direct" : geldt.moment === "zelf" ? "zelf" : "maandelijks", ontvangerBevestigt: true, historie };
}
function afgeleid() {
    const kinderen = startState().kinderen;
    if (cache && cacheSleutel[0] === ruw && cacheSleutel[1] === kinderen && cacheSleutel[2] === status)
        return cache;
    const ik = ruw.me;
    const partnerIds = ruw.partner_ids ?? [];
    const meerdere = partnerIds.length > 1;
    if (!partnerIds.includes(gekozenPartner))
        gekozenPartner = partnerIds[0] ?? null;
    // Eén co-ouder (of geen): precies zoals altijd. Twee of meer: per andere ouder (privé-items van jezelf blijven zichtbaar).
    const partnerId = meerdere ? gekozenPartner : ruw.partner_id;
    const kosten = ruw.expenses.map((e) => kostVan(e, ik, kinderen));
    const budgetten = ruw.budgets.map((b) => budgetVan(b, ik, kinderen));
    const historie = ruw.settlements.map((s) => verrekeningVan(s, ik));
    const lasten = ruw.recurring.map((l) => lastVan(l, ik, kinderen));
    const potjes = (ruw.pots ?? []).map((p) => potVan(p, ik, kinderen));
    const afspraak = afspraakVoor(partnerId, ik);
    const instellingen = instellingenVan(afspraak, historie);
    const vanPaar = (x) => !meerdere || !x.partnerId || x.partnerId === partnerId;
    const paarHistorie = meerdere ? historie.filter((v) => v.partnerId === partnerId) : historie;
    cache = {
        status,
        ikId: ik,
        partnerId,
        partnerIds,
        meerdere,
        kosten,
        budgetten,
        lasten,
        potjes,
        afspraak,
        instellingen,
        /** Zelfde vorm, maar alleen het gekozen ouderpaar (plus je eigen privé-items). Bij één co-ouder gelijk aan het geheel. */
        paar: meerdere ? {
            status, ikId: ik, partnerId, partnerIds, meerdere,
            kosten: kosten.filter(vanPaar),
            budgetten: budgetten.filter(vanPaar),
            lasten: lasten.filter(vanPaar),
            potjes: potjes.filter(vanPaar),
            afspraak,
            instellingen: instellingenVan(afspraak, paarHistorie),
        } : null,
        /** Per andere ouder: afspraak en kinderen (voor de keuze bovenaan Kosten). */
        paren: (ruw.pairs ?? []).map((p) => ({ partnerId: p.partner_id, kindIds: p.child_ids ?? [], afspraak: afspraakVoor(p.partner_id, ik) })),
    };
    if (!cache.paar)
        cache.paar = cache;
    cacheSleutel = [ruw, kinderen, status];
    return cache;
}
const abonneer = (l) => { luisteraars.add(l); zorgVoorLaden(); return () => luisteraars.delete(l); };
function useDeel(kies) {
    useStart(); // kindnamen volgen start-store
    return useSyncExternalStore(abonneer, () => kies(afgeleid()), () => kies(afgeleid()));
}
export const kostenSnapshot = () => afgeleid();
export const useKosten = () => useDeel((a) => a.kosten);
export const useKostenBron = () => useDeel((a) => a);
/** Kosten van het gekozen ouderpaar (Kosten-pagina, afrekenen, budgetten). Bij één co-ouder = useKostenBron. */
export const useKostenPaar = () => useDeel((a) => a.paar);
export const useVerrekenInstellingen = () => useDeel((a) => a.paar.instellingen);
export const useKostenAfspraak = () => useDeel((a) => a.paar.afspraak);
/** Zelfde teken als voorheen (Home leest dit): positief = jij betaalt de andere ouder, negatief = de andere ouder betaalt jou. */
export function nogTeVerrekenen(lijst) {
    return -berekenSaldo(lijst).netto;
}
export function useKostExtra(kostId) {
    const k = useKosten().find((x) => x.id === kostId);
    return { bijlagen: k?.bijlagen ?? [], opmerkingen: k?.opmerkingen ?? [] };
}
export const heeftBijlagen = (kostId) => (afgeleid().kosten.find((k) => k.id === kostId)?.bijlagen.length ?? 0) > 0;
/* ---------- acties: uitgaven ---------- */
const vervangKost = (e) => kostenBron.vervang("expenses", e);
/**
 * Nieuwe uitgave. Invoer in app-termen: { omschrijving, bedrag, datum (JJJJ-MM-DD), kindIds, categorie?,
 * bron ("eigen"|"kindrekening"), verdeling ("standaard"|"50"|"anders"|"volledig"), pctIk, budgetId?,
 * gedeeld (true = met de andere ouder van deze kinderen; standaard false = "Alleen jij"), anderId?,
 * opmerking?, bon? (data-URL), bonNaam?, bijlage?, bijlageNaam? }. Geeft de opgeslagen uitgave (app-vorm) of null.
 */
export async function voegUitgaveToe(x) {
    const ik = ruw.me ?? authState().gebruiker?.id;
    const gedeeld = !!x.gedeeld || !!x.budgetId;
    const ander = gedeeld ? x.anderId ?? ruw.partner_id ?? null : null;
    const tijdelijk = {
        id: `tmp-${Date.now()}`, description: x.omschrijving, amount: x.bedrag, date: x.datum, category: x.categorie ?? "Overig", child_ids: x.kindIds ?? [],
        paid_from: x.bron ?? "eigen", split: x.verdeling, payer_id: ik, payer_pct: x.verdeling === "volledig" ? 100 : x.verdeling === "50" ? 50 : x.pctIk ?? 50,
        created_by: ik, other_parent_id: ander, status: !ander || x.bron === "kindrekening" || x.verdeling === "volledig" ? "opgeslagen" : "wacht",
        turn_to_respond: null, counter_pending: false, budget_id: x.budgetId ?? null, steps: [], attachments: [], created_at: new Date().toISOString(),
    };
    kostenBron.zet({ expenses: [tijdelijk, ...ruw.expenses] });
    try {
        const r = await api("manage-expenses", "create-expense", {
            expense: { description: x.omschrijving, amount: x.bedrag, date: x.datum, child_ids: x.kindIds ?? [], category: x.categorie ?? undefined, paid_from: x.bron ?? "eigen", split: x.verdeling, payer_pct: x.pctIk, budget_id: x.budgetId ?? null, comment: x.opmerking || undefined, shared: gedeeld, ...(gedeeld && x.anderId ? { other_parent_id: x.anderId } : {}) },
            ...(x.bon ? { receipt: x.bon, receipt_name: x.bonNaam } : {}),
            ...(x.bijlage ? { attachment: x.bijlage, attachment_name: x.bijlageNaam } : {}),
        });
        kostenBron.zet({ expenses: ruw.expenses.map((e) => (e.id === tijdelijk.id ? r.expense : e)) });
        // Een gekoppeld budget is op de server bijgewerkt (uitgegeven): bron verversen.
        if (x.budgetId)
            laadKosten();
        return kostVan(r.expense, ruw.me, startState().kinderen);
    }
    catch (e) {
        kostenBron.zet({ expenses: ruw.expenses.filter((k) => k.id !== tijdelijk.id) });
        fout(e);
        return null;
    }
}
/** Eén uitgave via de server bijwerken; bij een fout de oude versie terugzetten en melden. */
async function stuurKost(actie, id, velden = {}, optimistisch = null) {
    const oud = ruw.expenses.find((e) => e.id === id);
    if (!oud)
        return null;
    if (optimistisch)
        vervangKost({ ...oud, ...optimistisch });
    try {
        const r = await api("manage-expenses", actie, { expense_id: id, ...velden });
        vervangKost(r.expense);
        return kostVan(r.expense, ruw.me, startState().kinderen);
    }
    catch (e) {
        vervangKost(oud);
        fout(e);
        return null;
    }
}
/**
 * Eigen uitgave wijzigen (privé altijd tot afgerekend; gedeeld zolang de andere ouder nog niet reageerde).
 * Velden in app-termen: { omschrijving?, bedrag?, datum?, categorie? (null = geen), kindIds?, bron?, verdeling?, pctIk? }.
 */
export async function wijzigUitgave(id, x) {
    const expense = {
        ...(x.omschrijving !== undefined ? { description: x.omschrijving } : {}),
        ...(x.bedrag !== undefined ? { amount: x.bedrag } : {}),
        ...(x.datum !== undefined ? { date: x.datum } : {}),
        ...(x.categorie !== undefined ? { category: x.categorie ?? "Overig" } : {}),
        ...(x.kindIds !== undefined ? { child_ids: x.kindIds } : {}),
        ...(x.bron !== undefined ? { paid_from: x.bron } : {}),
        ...(x.verdeling !== undefined ? { split: x.verdeling, payer_pct: x.pctIk } : {}),
    };
    return stuurKost("update-expense", id, { expense }, { ...(expense.description ? { description: expense.description } : {}), ...(expense.amount ? { amount: expense.amount } : {}), ...(expense.date ? { date: expense.date } : {}) });
}
/** Eigen gedeelde uitgave intrekken (status "ingetrokken"; telt niet meer mee). */
export const trekUitgaveIn = (id) => stuurKost("withdraw-expense", id, {}, { status: "ingetrokken", turn_to_respond: null });
/** Privé-uitgave later delen met de andere ouder van deze kinderen. */
export const deelUitgave = (id, { anderId, verdeling, pctIk } = {}) => stuurKost("share-expense", id, { ...(anderId ? { other_parent_id: anderId } : {}), ...(verdeling ? { split: verdeling, payer_pct: pctIk } : {}) });
/** Vriendelijke herinnering aan de andere ouder (de server begrenst het aantal). */
export const herinnerUitgave = (id) => stuurKost("remind-expense", id);
/** Eigen uitgave verwijderen (privé, ingetrokken, of nog niet beantwoord). Optimistisch weg; bij een fout terug. */
export async function verwijderUitgave(id) {
    const item = ruw.expenses.find((e) => e.id === id);
    if (!item)
        return false;
    kostenBron.zet({ expenses: ruw.expenses.filter((e) => e.id !== id) });
    try {
        await api("manage-expenses", "delete-expense", { expense_id: id });
        if (ruw.budgets.some((b) => b.expense_id === id))
            laadKosten(); // een eenmalig budget is weer beschikbaar
        return true;
    }
    catch (e) {
        if (!ruw.expenses.some((x) => x.id === id))
            kostenBron.zet({ expenses: [item, ...ruw.expenses] });
        fout(e);
        return false;
    }
}
/** Reactie op een uitgave: "akkoord" | "ander_voorstel" | "niet_akkoord" | "meer_tijd". Alleen wie aan zet is (server controleert). */
export async function reageerOpKost(id, reactie, extra = {}) {
    const oud = ruw.expenses.find((e) => e.id === id);
    if (!oud)
        return false;
    const optimistisch = reactie === "akkoord" ? { status: "bevestigd", counter_pending: false } : reactie === "niet_akkoord" ? { status: "betwist", counter_pending: false } : reactie === "ander_voorstel" ? { counter_pending: true, turn_to_respond: oud.created_by === ruw.me ? oud.other_parent_id : oud.created_by } : {};
    vervangKost({ ...oud, ...optimistisch });
    try {
        const r = await api("manage-expenses", "respond-expense", { expense_id: id, response: reactie, ...extra });
        vervangKost(r.expense);
        return true;
    }
    catch (e) {
        vervangKost(oud);
        fout(e);
        return false;
    }
}
export async function voegOpmerkingToe(kostId, tekst) {
    try {
        const r = await api("manage-expenses", "comment-expense", { expense_id: kostId, text: tekst });
        vervangKost(r.expense);
        return true;
    }
    catch (e) {
        fout(e);
        return false;
    }
}
/** Bon of bijlage (data-URL van een foto of pdf) bij een bestaande uitgave; privé opgeslagen, getoond via tijdelijke link. */
export async function voegBijlageToe(kostId, bestand, naam, soort = "bon") {
    try {
        const r = await api("manage-expenses", "add-attachment", { expense_id: kostId, kind: soort, file: bestand, file_name: naam });
        vervangKost(r.expense);
        return true;
    }
    catch (e) {
        fout(e);
        return false;
    }
}
/* ---------- acties: afrekenen ---------- */
const vervangVerrekening = (s) => kostenBron.vervang("settlements", s);
/** Bij twee of meer co-ouders: voor welke andere ouder (anders laat de server het zelf bepalen). */
const partnerVeld = () => { const a = afgeleid(); return a.meerdere && a.partnerId ? { partner_id: a.partnerId } : {}; };
/** Start (of hergebruik) één afrekening voor de posten die nu in het saldo staan (gekozen ouderpaar). Expliciete actie; openen alleen is geen betaling. */
export async function startVerrekening() {
    const paar = afgeleid().paar;
    const huidig = berekenSaldo(paar.kosten, paar.budgetten);
    const ids = [...huidig.anderAanIk.posten, ...huidig.ikAanAnder.posten].map((p) => p.post.id);
    const bestaand = paar.instellingen.historie.find((v) => !["ontvangst-bevestigd", "afgerond"].includes(v.status) && v.kostIds.some((id) => ids.includes(id)));
    if (bestaand)
        return bestaand;
    if (Math.abs(huidig.netto) < 0.01 || !ids.length)
        return null;
    try {
        const nu = new Date();
        const r = await api("manage-expenses", "start-settlement", { expense_ids: ids, period_label: `${nu.getFullYear()}-${String(nu.getMonth() + 1).padStart(2, "0")}`, ...partnerVeld() });
        vervangVerrekening(r.settlement);
        return verrekeningVan(r.settlement, ruw.me);
    }
    catch (e) {
        fout(e);
        return null;
    }
}
/** Alleen de ontvanger: betaallink (bekende betaaldienst) en/of eigen rekeninggegevens delen. */
export async function deelBetaalverzoek(id, { link, omschrijving, iban, rekeninghouder } = {}) {
    if (link && !veiligeBetaallink(link))
        return false;
    try {
        const r = await api("manage-expenses", "share-payment-request", { settlement_id: id, payment_link: link || undefined, description: omschrijving || undefined, bank_iban: iban || undefined, bank_account_name: rekeninghouder || undefined });
        vervangVerrekening(r.settlement);
        return true;
    }
    catch (e) {
        fout(e);
        return false;
    }
}
const ACTIE = { aangegeven: "indicate-payment", ontvangen: "confirm-receipt", afronden: "finish-settlement" };
/** "aangegeven" (betaler meldt betaling, geen bewijs) · "ontvangen" (alleen ontvanger) · "afronden" (alleen ontvanger). */
export async function reageerOpVerrekening(id, actie) {
    if (!ACTIE[actie])
        return false;
    try {
        const r = await api("manage-expenses", ACTIE[actie], { settlement_id: id });
        vervangVerrekening(r.settlement);
        if (actie === "ontvangen")
            await laadKosten(); // gekoppelde uitgaven zijn nu verrekend
        return true;
    }
    catch (e) {
        fout(e);
        return false;
    }
}
/* ---------- acties: kostenafspraak ---------- */
/** Afspraak van het gekozen paar in de bron zetten (pairs + oude agreement-vorm). */
function zetAfspraak(partnerId, agreement) {
    const pairs = (ruw.pairs ?? []).map((p) => (p.partner_id === partnerId ? { ...p, agreement } : p));
    kostenBron.zet({ pairs, ...(!partnerId || (ruw.partner_ids ?? []).length <= 1 ? { agreement } : {}) });
}
/** Opslaan: zonder andere ouder geldt het meteen; met een gekoppelde ouder wordt het een voorstel dat die bevestigt. */
export async function zetKostenAfspraak(p) {
    const a = afgeleid();
    const huidig = a.paar.afspraak;
    const basis = { ...STANDAARD_AFSPRAAK, ...(huidig.open?.doorIk ? huidig.open : huidig.geldt), ...p };
    try {
        const r = await api("manage-expenses", "save-agreement", { split_mode: basis.wijze, my_pct: basis.pctIk, settle_moment: basis.moment, approval_threshold: basis.grens ?? null, ...partnerVeld() });
        zetAfspraak(a.partnerId, r.agreement);
        return true;
    }
    catch (e) {
        fout(e);
        return false;
    }
}
/** Alleen de andere ouder beantwoordt een voorstel: "akkoord" | "niet_akkoord". */
export async function reageerOpAfspraak(reactie) {
    const a = afgeleid();
    const open = a.paar.afspraak.open;
    if (!open)
        return false;
    try {
        const r = await api("manage-expenses", "respond-agreement", { agreement_id: open.id, response: reactie });
        zetAfspraak(a.partnerId, r.agreement);
        return true;
    }
    catch (e) {
        fout(e);
        return false;
    }
}
/** Voor tests en afmelden. */
export function _resetKosten(nieuw = LEEG, st = "leeg") {
    ruw = nieuw;
    status = st;
    geladenVoor = null;
    gekozenPartner = null;
    cache = null;
    meld();
}
