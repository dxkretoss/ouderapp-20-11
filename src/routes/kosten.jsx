import { Afrekenen } from "@/components/Afrekenen";
import { GeldInvoer } from "@/components/GeldInvoer";
import { bewerkGeld, leesGeld } from "@/lib/geld-invoer";
import { useTranslation } from "react-i18next";
import i18n, { taalLocale } from "@/i18n";
import { zichtbareKostenActies } from "@/lib/kosten-overzicht";
import { Assistent } from "@/components/Assistent";
import { aanZetBij, beoordeelKosten, budgetMelding, nietAkkoordKostTekst, tegenvoorstelVerstuurdTekst, toonDatumTekst, wachtOpJouwAkkoord } from "@/lib/kosten-akkoord";
import { useKeuzeTeksten } from "@/components/RustigTip";
import { VasteLasten } from "@/components/VasteLasten";
import { GeschiedenisKnop } from "@/components/Geschiedenis";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Plus, SlidersHorizontal, Camera, Clock, Paperclip, Receipt, X } from "lucide-react";
import { Chevron, MetChevron, Vinkje } from "@/components/Tekens";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useBudgettenPaar } from "@/lib/budget-store";
import { bevestig, meldFout } from "@/lib/feedback";
import { AppShell, BackButton, TerugKnop } from "@/components/AppShell";
import { AppIcon, Pictogram } from "@/components/AppIcon";
import { BonScanner } from "@/components/BonScanner";
import { uploadDocument } from "@/lib/documenten-store";
import { BudgetVoorstel } from "@/components/BudgetVoorstel";
import { Badge } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { EigenLeeg } from "@/components/EigenLeeg";
import { KindPil, KostenTabs, kindLabel } from "@/components/KostenTabs";
import { ContextToevoegen } from "@/components/ContextToevoegen";
import { HandCoins, ListPlus, PiggyBank, ReceiptText } from "lucide-react";
import { kostenWijzen, kostenMomenten, standaardPct, useStart } from "@/lib/start-store";
import { useKostenBron, useKostenPaar, useKostenAfspraak, kiesKostenPartner, reageerOpKost, reageerOpVerrekening, voegBijlageToe, voegOpmerkingToe, voegUitgaveToe, wijzigUitgave, trekUitgaveIn, verwijderUitgave, deelUitgave, herinnerUitgave, zetKostenAfspraak, reageerOpAfspraak, kindTekst, STANDAARD_AFSPRAAK, laadKosten } from "@/lib/kosten-store";
import { InhoudLaden, LaadFout } from "@/components/Laden";
import { useGezin } from "@/lib/gezin";
import { DeelKeuze, DeelLabel } from "@/components/DeelKeuze";
import { useDeelOpties } from "@/lib/kosten-delen";
import { leesBonBestand } from "@/lib/bon-bestand";
import { Zichtbaar } from "@/components/Zichtbaar";
import { afrekenWeergave, verrekeningStatus, berekenSaldo, categorieLabel, periodeGrenzen, periodeTotalen, sleutelVoor, statusLabel, } from "@/lib/verrekening";
export const Route = createFileRoute("/kosten")({
    head: () => ({
        meta: [
            { title: i18n.t("routes.kosten.meta.titel") },
            {
                name: "description",
                content: i18n.t("routes.kosten.meta.beschrijving"),
            },
            { property: "og:title", content: i18n.t("routes.kosten.meta.titel") },
            {
                property: "og:description",
                content: i18n.t("routes.kosten.meta.ogBeschrijving"),
            },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    validateSearch: z.object({ budget: z.string().optional(), uitgave: z.string().optional(), kind: z.string().optional(), benodigdheid: z.string().optional(), bronItem: z.string().optional(), bron: z.enum(["kindrekening"]).optional() }),
    component: KostenPagina,
});
const euro = (n) => n.toLocaleString(taalLocale(), { style: "currency", currency: "EUR" });
const categorieen = ["School", "Sport", "Kleding", "Zorg", "Opvang", "Activiteiten", "Medisch", "Overig"];
const vandaagIso = () => new Date().toLocaleDateString("sv-SE");
const maandVan = (k) => (k.datum ?? "").slice(0, 7);
/** Kindlabels in de kindkleur; zonder kinderen het groepslabel ("Gezin/algemeen"). */
function Kinderen({ ids, naam }) {
    const st = useStart();
    const kids = (ids ?? []).map((id) => st.kinderen.find((k) => k.id === id)).filter(Boolean);
    if (!kids.length)
        return <KindPil naam={naam}/>;
    return <>{kids.map((k) => <KindPil key={k.id} naam={k.naam} kleur={k.kleur}/>)}</>;
}
function KostenPagina() {
    const { t } = useTranslation();
    const [scherm, setScherm] = useState("overzicht");
    const [berekeningTerug, setBerekeningTerug] = useState("overzicht");
    const [periode] = useState("maand");
    const { uitgave, kind: voorKind, budget, benodigdheid, bronItem, bron: zoekBron } = Route.useSearch();
    const [nieuwOpen, setNieuwOpen] = useState(!!uitgave);
    const [vanBudget, setVanBudget] = useState(null);
    const [detailId, setDetailId] = useState(null);
    // Kosten van het gekozen ouderpaar; bij één co-ouder precies alles (zoals altijd).
    const bron = useKostenPaar();
    const geheel = useKostenBron();
    const gezin = useGezin();
    const alle = bron.kosten;
    const gekoppeld = !!bron.partnerId;
    const { sleutels, modus, historie } = bron.instellingen;
    const afspraak = bron.afspraak;
    const budgetten = bron.budgetten;
    const saldo = berekenSaldo(alle, budgetten);
    const netto = saldo.netto; // positief: de andere ouder betaalt jou
    const vandaag = vandaagIso();
    const weergave = afrekenWeergave(modus, vandaag);
    const beoordeling = beoordeelKosten(alle, budgetten, vandaag);
    const opJou = alle.filter((k) => wachtOpJouwAkkoord(k, beoordeling.get(k.id)));
    const [wijzigStart, setWijzigStart] = useState(false);
    const afspraken = budgetten.filter((v) => v.status === "akkoord" || v.status === "uitgegeven");
    const [voorstelKey, setVoorstelKey] = useState(0);
    const [toonAlle, setToonAlle] = useState(false);
    const [alleActies, setAlleActies] = useState(false);
    const [budgetDetail, setBudgetDetail] = useState(budget && budget !== "nieuw" ? budget : null);
    const [manier, setManier] = useState(undefined);
    const [betaalStart, setBetaalStart] = useState(false);
    const [bezigMet, setBezigMet] = useState(null);
    const navigeer = useNavigate();
    // Alleen ingeklapte onderdelen blijven op dit apparaat bewaard; het bedrag staat altijd in beeld.
    const [rust, setRust] = useState({ open: {} });
    useEffect(() => { setRust(leesRust()); }, []);
    const zetRust = (r) => { setRust(r); try {
        localStorage.setItem(RUST_SLEUTEL, JSON.stringify(r));
    }
    catch { /* alleen deze sessie */ } };
    const klap = (id, nu) => zetRust({ ...rust, open: { ...rust.open, [id]: !nu } });
    const dezeMaand = vandaag.slice(0, 7);
    const uitgavenDezeMaand = alle.filter((k) => maandVan(k) === dezeMaand);
    const nieuweUitgave = nieuwOpen ? <NieuweUitgave budget={vanBudget} voorinvul={uitgave} startBron={zoekBron} voorKind={voorKind} startManier={manier} onSluit={() => { setNieuwOpen(false); setVanBudget(null); setManier(undefined); }}/> : null;
    if (bron.status === "fout")
        return <AppShell><h1 className="lora text-[32px] leading-tight">{t("routes.kosten.titel")}</h1><LaadFout onOpnieuw={laadKosten}/></AppShell>;
    if (bron.status === "leeg" || bron.status === "laden")
        return <AppShell><h1 className="lora text-[32px] leading-tight">{t("routes.kosten.titel")}</h1><InhoudLaden /></AppShell>;
    if (scherm === "berekening")
        return <BerekeningScherm saldo={saldo} kosten={alle} historie={historie} budgetten={budgetten} onTerug={() => { setScherm(berekeningTerug); setBerekeningTerug("overzicht"); }}/>;
    if (scherm === "verrekenen")
        return (<Afrekenen periode={periode} startVerzoek={betaalStart} onTerug={() => { setBetaalStart(false); setScherm("overzicht"); }} onBerekening={() => { setBerekeningTerug("verrekenen"); setScherm("berekening"); }}/>);
    if (scherm === "instellingen")
        return <EigenAfspraken onTerug={() => setScherm("overzicht")}/>;
    if (scherm === "historie")
        return <HistorieScherm historie={historie} onTerug={() => setScherm("overzicht")}/>;
    if (scherm === "alle")
        return <>
      <AppShell>
        <div className="flex items-start gap-3">
          <TerugKnop onClick={() => setScherm("overzicht")}/>
          <div>
            <h1 className="lora text-[30px] leading-tight">{t("routes.kosten.alle.titel")}</h1>
            <p className="mt-1 text-sm text-ink-soft">{t("routes.kosten.alle.intro")}</p>
          </div>
        </div>
        {alle.length ? <Transacties alle={alle} historie={historie} onOpen={setDetailId}/> : <p className="mt-6 text-sm text-ink-soft">{t("routes.kosten.alle.leeg")}</p>}
      </AppShell>
      <KostDetail key={detailId ?? ""} kost={alle.find((k) => k.id === detailId) ?? null} onSluit={() => setDetailId(null)} onVerrekenen={() => { setDetailId(null); setScherm("verrekenen"); }}/>
    </>;
    // Nog niets: rustige lege weergave met één eerste stap (budget voorstellen kan pas met een gekoppelde ouder).
    if (!alle.length && !budgetten.length && !historie.length && !bron.lasten.length && !bron.potjes.length && budget !== "nieuw" && !afspraak.open && !bron.meerdere)
        return (<>
        <EigenLeeg titel={t("routes.kosten.titel")} icoon="kosten" tekst={t("routes.kosten.eigen.leegTekst")} knop={t("routes.kosten.eigen.eersteUitgave")} onKnop={() => setNieuwOpen(true)} extra={<><button onClick={() => { setManier("scan"); setNieuwOpen(true); }} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-brand/40 bg-brand-soft px-5 text-sm font-semibold text-brand"><Camera aria-hidden="true" strokeWidth={1.8} className="size-4"/>{t("routes.kosten.snel.scannen")}</button><button onClick={() => setScherm("instellingen")} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-border bg-card px-5 text-sm font-semibold text-ink"><SlidersHorizontal aria-hidden="true" strokeWidth={1.8} className="size-4 text-brand"/>{t("routes.kosten.eigen.afsprakenInstellen")}</button></>}/>
        {nieuweUitgave}
      </>);
    const acties = [
        ...opJou.map((k) => ({ id: k.id, titel: k.omschrijving, bedrag: k.bedrag, status: t("routes.kosten.status.jouwReactie"), open: () => setDetailId(k.id) })),
    ];
    // Aankopen die de andere ouder binnen een afgesproken budget deed: geen akkoord nodig, wel even laten zien (14 dagen).
    const grensRecent = new Date(Date.now() - 14 * 86400000).toISOString();
    const binnenBudget = alle.filter((k) => k.betaaldDoor !== "ik" && k.status === "wacht" && beoordeling.get(k.id)?.soort === "gedekt" && (k.aangemaakt ?? "") >= grensRecent);
    const ontvangenBudgetten = budgetten.filter((b) => b.aanZet === "ik" && (b.status === "wacht" || b.status === "tegenvoorstel"));
    const afspraakVoorJou = afspraak.open && !afspraak.open.doorIk ? afspraak.open : null;
    const wachtBevestiging = historie.some((v) => v.status === "wacht-op-ontvanger");
    const opmaak = (nieuweManier) => { setManier(nieuweManier); setNieuwOpen(true); };
    const sleutel = sleutelVoor(sleutels, "Algemeen");
    const grens = afspraak.bevestigd ? afspraak.geldt.grens : null;
    const aantalWacht = acties.length + ontvangenBudgetten.length + (afspraakVoorJou ? 1 : 0);
    const wachtOpen = rust.open["wacht"] !== false; // standaard open zolang er iets wacht
    const openPosten = [...saldo.anderAanIk.posten, ...saldo.ikAanAnder.posten].map((p) => ({ ...p, ikOntvang: p.post.betaaldDoor === "ik" })).sort((a, b) => String(b.post.datum).localeCompare(String(a.post.datum)));
    const openAfrekening = historie.some((v) => v.status !== "afgerond" && v.kostIds?.length);
    const budgetVoorstellen = () => { if (!gekoppeld) {
        navigeer({ to: "/solo" });
        return;
    } zetRust({ ...rust, open: { ...rust.open, budgetten: true } }); setVoorstelKey((k) => k + 1); };
    const betaalverzoek = () => { if (!gekoppeld) {
        navigeer({ to: "/solo" });
        return;
    } setBetaalStart(true); setScherm("verrekenen"); };
    const snelReageer = async (k, reactie, tekst) => {
        setBezigMet(k.id);
        const gelukt = await reageerOpKost(k.id, reactie);
        setBezigMet(null);
        if (gelukt)
            bevestig(tekst);
    };
    const keuzeTekst = { akkoord: t("common.akkoord"), ander: t("common.anderVoorstel"), niet: t("common.nietAkkoord") };
    // Bij twee of meer andere ouders: per ouder saldo, afspraken en openstaande punten.
    const naamVan = (id) => gezin.coOuders.find((c) => c.id === id)?.naam || t("common.deAndereOuder");
    const wachtVoor = (pid) => {
        const k = geheel.kosten.filter((x) => x.partnerId === pid);
        const b = geheel.budgetten.filter((x) => x.partnerId === pid);
        const oordeel = beoordeelKosten(k, b, vandaag);
        const paar = geheel.paren.find((p) => p.partnerId === pid);
        return k.filter((x) => wachtOpJouwAkkoord(x, oordeel.get(x.id))).length + b.filter((x) => x.aanZet === "ik" && (x.status === "wacht" || x.status === "tegenvoorstel")).length + (paar?.afspraak.open && !paar.afspraak.open.doorIk ? 1 : 0);
    };
    return (<AppShell>
      <div className="flex items-center justify-between gap-3">
        <h1 className="lora min-w-0 text-[32px] leading-tight">{t("routes.kosten.titel")}</h1>
        <div className="flex shrink-0 items-center gap-1.5">
          <Assistent pagina="Kosten"/>
          <ContextToevoegen titel={t("routes.kosten.toevoegen.titel")} acties={[
            { titel: t("routes.kosten.toevoegen.uitgave"), uitleg: t("routes.kosten.toevoegen.uitgaveUitleg"), icoon: ReceiptText, onKies: () => opmaak("hand") },
            { titel: t("routes.kosten.toevoegen.budget"), uitleg: gekoppeld ? t("routes.kosten.toevoegen.budgetUitleg") : t("routes.kosten.solo.eerstUitnodigen"), icoon: PiggyBank, onKies: budgetVoorstellen },
            ...(gekoppeld ? [{ titel: t("routes.kosten.toevoegen.betaalverzoek"), uitleg: t("routes.kosten.toevoegen.betaalverzoekUitleg"), icoon: HandCoins, onKies: betaalverzoek }] : []),
            { titel: t("routes.kosten.toevoegen.nogNodig"), uitleg: t("routes.kosten.toevoegen.nogNodigUitleg"), apart: t("routes.kosten.toevoegen.nogNietGekocht"), icoon: ListPlus, onKies: () => navigeer({ to: "/boodschappen" }) },
        ]}/>
        </div>
      </div>
      <KostenTabs actief="uitgaven"/>
      {bron.meerdere ? <div role="tablist" aria-label={t("routes.kosten.partner.label")} className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {bron.partnerIds.map((pid) => { const n = wachtVoor(pid); const aan = pid === bron.partnerId; return <button key={pid} role="tab" aria-selected={aan} onClick={() => kiesKostenPartner(pid)} className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-black ${aan ? "border-brand bg-brand-soft text-brand" : "border-border bg-white/60 text-ink-soft"}`}>
            {t("routes.kosten.partner.met", { naam: naamVan(pid) })}
            {n ? <span className="grid size-6 place-items-center rounded-full bg-[#DCE3D3] text-xs font-black text-[#3F5747]" aria-label={t("routes.kosten.partner.wacht", { aantal: n })}>{n}</span> : null}
          </button>; })}
      </div> : null}
      <Zichtbaar voor="samen" className="mt-2.5"/>

      <div className="mt-2 animate-in fade-in duration-300">
          <section aria-label={t("routes.kosten.saldo.totaalOpenstaand")} className="mt-4 rounded-[26px] border-2 border-[#A9BCA8] px-5 pb-4 pt-4" style={{ background: "linear-gradient(135deg, rgba(220,230,210,.9), rgba(233,239,227,.85))" }}>
            <p className="text-[12.5px] font-extrabold uppercase tracking-[0.1em] text-brand">{t("routes.kosten.saldo.totaalOpenstaand")}</p>
            {!gekoppeld ? (<><p className="mt-1 text-[15px] font-extrabold text-[#2F4A3A]">{t("routes.kosten.solo.saldo")}</p><Link to="/solo" className="mt-3 inline-flex h-11 items-center rounded-full border border-white/90 bg-white/80 px-4 text-[14.5px] font-black text-[#2F4A3A]">{t("routes.kosten.solo.uitnodigen")}</Link></>) : saldo.aantalPosten === 0 || Math.abs(netto) < 0.01 ? (<><p className="font-display text-[36px] font-black leading-none tabular-nums">{euro(0)}</p><p className="mt-1 text-[15px] font-extrabold text-[#2F4A3A]">{wachtBevestiging ? t("routes.kosten.saldo.wachtJoris") : t("routes.kosten.saldo.allesVerrekend")}</p></>) : (<>
                <p className="font-display text-[36px] font-black leading-none tabular-nums">{euro(Math.abs(netto))}</p>
                <p className="mt-1 text-[15px] font-extrabold text-[#2F4A3A]">{netto > 0 ? t("routes.kosten.saldo.jorisBetaaltJou") : t("routes.kosten.saldo.jijBetaaltJoris")}</p>
              </>)}
            {gekoppeld && weergave === "tussenstand" && Math.abs(netto) >= 0.01 ? <p className="mt-1 text-xs text-ink-soft">{t("routes.kosten.saldo.tussenstand")}</p> : null}
            {gekoppeld ? <div className="mt-3 flex gap-2">
              <Button disabled={!((saldo.aantalPosten > 0 && Math.abs(netto) >= 0.01) || openAfrekening)} onClick={() => setScherm("verrekenen")} className="h-11 flex-1 rounded-full text-[14.5px] font-black shadow-none">{t("routes.kosten.saldo.afrekenen")}</Button>
              <button onClick={() => setScherm("berekening")} className="h-11 flex-1 rounded-full border border-white/90 bg-white/80 text-[14.5px] font-black text-[#2F4A3A]">{t("routes.kosten.overzicht.berekening")}</button>
            </div> : null}
            {gekoppeld && openPosten.length ? <ul className="mt-3 divide-y divide-[#A9BCA8]/40 border-t border-[#A9BCA8]/50">
              {openPosten.slice(0, 4).map(({ post, aandeel, ikOntvang }) => <li key={post.id}><button type="button" onClick={() => setDetailId(post.id)} className="flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left text-sm">
                  <span className="min-w-0"><span className="block truncate font-extrabold text-[#2F4A3A]">{post.omschrijving}</span><span className="block text-xs text-[#3F5747]">{toonDatumTekst(post.datum)} · {ikOntvang ? t("routes.kosten.saldo.anderBetaaltJouDeel") : t("routes.kosten.saldo.jijBetaaltDeel")}</span></span>
                  <span className="shrink-0 font-black tabular-nums text-[#2F4A3A]">{euro(aandeel)}</span>
                </button></li>)}
            </ul> : null}
            <button type="button" onClick={() => setScherm("alle")} className="mt-2 inline-flex min-h-11 items-center text-sm font-extrabold text-brand"><MetChevron>{t("routes.kosten.alle.bekijk")}</MetChevron></button>
            <div className="mt-1 flex items-start justify-between gap-3 border-t border-[#A9BCA8]/50 pt-2.5 text-sm text-ink-soft">
              <span className="min-w-0">{gekoppeld ? <>{grens !== null && grens !== undefined ? t("routes.kosten.saldo.afspraakGrens", { jij: sleutel.ik, joris: sleutel.ander, grens: euro(grens) }) : t("routes.kosten.saldo.afspraak", { jij: sleutel.ik, joris: sleutel.ander })}{afspraak.bevestigd ? "" : ` · ${t("routes.kosten.eigen.voorlopigKort")}`}</> : t("routes.kosten.saldo.eigenAfspraken")}</span>
              <button onClick={() => setScherm("instellingen")} className="-my-2 min-h-10 shrink-0 font-extrabold text-brand">{t("common.wijzigen")}</button>
            </div>
          </section>

          <div className="mt-3 grid grid-cols-2 gap-2">
            {[
            { id: "scan", titel: t("routes.kosten.snel.scannen"), Icoon: Camera, doe: () => opmaak("scan") },
            { id: "uitgave", titel: t("routes.kosten.snel.uitgave"), Icoon: ReceiptText, doe: () => opmaak("hand") },
            { id: "budget", titel: t("routes.kosten.snel.budget"), Icoon: PiggyBank, doe: budgetVoorstellen },
            { id: "verzoek", titel: t("routes.kosten.snel.betaalverzoek"), Icoon: HandCoins, doe: betaalverzoek },
        ].map(({ id, titel, Icoon, doe }) => <button key={id} type="button" onClick={doe} className="flex min-h-[64px] items-center gap-2.5 rounded-[18px] border border-white/85 bg-white/70 px-3.5 py-2.5 text-left text-[14.5px] font-black text-[#2F4A3A]">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#E9EFE3] text-brand"><Icoon aria-hidden="true" strokeWidth={1.8} className="size-[18px]"/></span>
              <span className="min-w-0 leading-tight">{titel}</span>
            </button>)}
          </div>

          {aantalWacht || binnenBudget.length ? (<Klap id="wacht" titel={t("routes.kosten.wacht.titel")} rechts={aantalWacht ? <span className="grid size-8 place-items-center rounded-full bg-[#DCE3D3] text-sm font-black text-[#3F5747]">{aantalWacht}</span> : null} sub={[...(afspraakVoorJou ? [t("routes.kosten.wacht.afspraak")] : []), ...ontvangenBudgetten.map((b) => b.wat), ...acties.map((a) => a.titel), ...binnenBudget.map((k) => k.omschrijving)].slice(0, 3).join(", ").toLowerCase().replace(/^./, (c) => c.toUpperCase())} open={wachtOpen} wissel={() => klap("wacht", wachtOpen)}>
              <div className="space-y-2">
                {afspraakVoorJou ? <div className="flex items-center gap-3 rounded-[16px] bg-white px-3.5 py-2.5">
                  <span className="min-w-0 flex-1"><span className="block text-[15.5px] font-black">{t("routes.kosten.wacht.afspraak")}</span><span className="mt-0.5 block text-sm text-ink-soft">{t("routes.kosten.wacht.vanNaam", { naam: t("common.deAndereOuder") })}</span></span>
                  <Button onClick={() => setScherm("instellingen")} className="h-10 shrink-0 rounded-full px-4 text-sm font-black shadow-none">{t("common.bekijken")}</Button>
                </div> : null}
                {ontvangenBudgetten.length ? <div className="rounded-[16px] bg-white px-3.5 py-1">
                  <p className="pt-2 text-xs font-bold uppercase tracking-[0.1em] text-brand">{t("routes.kosten.wacht.budgetvoorstel")}</p>
                  <BudgetVoorstel zonderKop filter="actie" onUitgave={(b) => { setVanBudget(b); setNieuwOpen(true); }}/>
                </div> : null}
                {zichtbareKostenActies(acties, alleActies).map((a) => {
                const k = alle.find((x) => x.id === a.id);
                if (!k)
                    return null;
                const bezig = bezigMet === k.id;
                return <div key={a.id} className="rounded-[16px] bg-white px-3.5 py-2.5">
                  <button type="button" onClick={a.open} aria-label={t("routes.kosten.wacht.openLabel", { titel: a.titel })} className="flex w-full items-start gap-3 text-left">
                    <span className="min-w-0 flex-1"><span className="block text-[15.5px] font-black">{a.titel}</span><span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-ink-soft"><Kinderen ids={k.kindIds} naam={k.kind}/><span>{k.betaaldDoor === "ik" ? t("routes.kosten.wacht.vanJou") : t("routes.kosten.wacht.vanNaam", { naam: t("common.deAndereOuder") })} · {toonDatumTekst(k.datum)}</span></span></span>
                    <span className="shrink-0 text-right"><span className="block text-[15.5px] font-black tabular-nums">{euro(k.bedrag)}</span><span className="block text-xs text-ink-soft">{t("routes.kosten.rij.jouwDeel", { bedrag: euro(k.aandeelIk) })}</span></span>
                  </button>
                  {budgetMelding(beoordeling.get(k.id)) ? <p className="mt-1 text-xs font-semibold text-accent-warm">{budgetMelding(beoordeling.get(k.id))}</p> : null}
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Button disabled={bezig} onClick={() => snelReageer(k, "akkoord", t("routes.kosten.detail.afgesproken"))} className="min-h-11 text-xs shadow-none">{keuzeTekst.akkoord}</Button>
                    <Button disabled={bezig} variant="outline" onClick={() => { setWijzigStart(true); setDetailId(k.id); }} className="min-h-11 text-xs">{keuzeTekst.ander}</Button>
                    <Button disabled={bezig} variant="outline" onClick={() => snelReageer(k, "niet_akkoord", nietAkkoordKostTekst())} className="min-h-11 text-xs">{keuzeTekst.niet}</Button>
                    <Button disabled={bezig} variant="outline" onClick={() => snelReageer(k, "meer_tijd", t("routes.kosten.detail.meerTijdVastgelegd"))} className="min-h-11 text-xs">{t("common.meerTijdNodig")}</Button>
                  </div>
                </div>;
            })}
                {binnenBudget.map((k) => <div key={k.id} className="flex items-center gap-3 rounded-[16px] bg-white px-3.5 py-2.5">
                  <span className="min-w-0 flex-1"><span className="block text-[15.5px] font-black">{k.omschrijving}</span><span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-ink-soft"><Kinderen ids={k.kindIds} naam={k.kind}/><span>{t("routes.kosten.wacht.binnenBudget", { bedrag: euro(k.bedrag) })}</span></span></span>
                  <Button variant="outline" onClick={() => setDetailId(k.id)} className="h-10 shrink-0 rounded-full px-4 text-sm font-black">{t("common.bekijken")}</Button>
                </div>)}
              </div>
              {acties.length > 3 ? <button type="button" onClick={() => setAlleActies((v) => !v)} aria-expanded={alleActies} className="mt-3 flex min-h-11 w-full items-center justify-between rounded-full border border-white/90 bg-white/70 px-4 text-sm font-black text-[#2F4A3A]">{alleActies ? t("routes.kosten.wacht.toonMinder") : t("routes.kosten.wacht.bekijkAlle")} <Chevron richting="omlaag" open={alleActies} className="size-4 text-ink-soft"/></button> : null}
              <p className="mt-2 text-xs text-ink-soft">{t("routes.kosten.wacht.bedragenPas")}</p>
            </Klap>) : null}

          <Klap id="budgetten" titel={t("routes.kosten.budgetten.titel")} rechts={<span className="text-sm font-bold text-ink-soft">{t("routes.kosten.budgetten.afgesproken", { aantal: afspraken.length })}</span>} open={!!rust.open["budgetten"] || budget === "nieuw" || voorstelKey > 0} wissel={() => klap("budgetten", !!rust.open["budgetten"])}>
            <h3 className="text-[15px] font-black">{t("routes.kosten.budgetten.voorstellen")}</h3>
            <p className="mt-0.5 text-xs text-ink-soft">{t("routes.kosten.budgetten.nietInSaldo")}</p>
            {gekoppeld ? <BudgetVoorstel key={voorstelKey} zonderKop filter="lopend" bronItem={bronItem} voorinvul={benodigdheid} voorKind={voorKind} startOpen={budget === "nieuw" || voorstelKey > 0} onUitgave={(b) => { setVanBudget(b); setNieuwOpen(true); }}/> : null}
            {gekoppeld ? <button type="button" onClick={budgetVoorstellen} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-brand/40 bg-brand-soft px-4 text-sm font-semibold text-brand"><Plus aria-hidden="true" strokeWidth={2} className="size-4"/>{t("routes.kosten.snel.budget")}</button> : <p className="mt-2 text-sm text-ink-soft">{t("routes.kosten.solo.eerstUitnodigen")} <Link to="/solo" className="inline-flex min-h-10 items-center font-semibold text-brand">{t("routes.kosten.solo.uitnodigen")}</Link></p>}
            <h3 className="mt-4 text-[15px] font-black">{t("routes.kosten.budgetten.afgesprokenKop")}</h3>
            <BudgetVoorstel zonderKop filter="afgesproken" onUitgave={(b) => { setVanBudget(b); setNieuwOpen(true); }}/>
            {!afspraken.length ? <p className="mt-2 rounded-xl bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)] px-3 py-3 text-center text-sm text-ink-soft">{t("routes.kosten.budgetten.geenAfgesproken")}</p> : null}
            <h3 className="mt-4 text-[15px] font-black">{t("routes.kosten.budgetten.eerder")}</h3>
            <p className="mt-0.5 text-xs text-ink-soft">{t("routes.kosten.budgetten.eerderUitleg")}</p>
            <BudgetVoorstel zonderKop filter="eerder" onUitgave={(b) => { setVanBudget(b); setNieuwOpen(true); }}/>
            <button type="button" onClick={() => setScherm("instellingen")} className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-ink">{t("routes.kosten.instellingen.titel")}</button>
          </Klap>

          <Klap id="uitgaven" titel={t("routes.kosten.uitgavenMaand", { maand: toonDatumTekst(dezeMaand) })} rechts={<span className="text-sm font-bold text-ink-soft">{uitgavenDezeMaand.length}</span>} open={!!rust.open["uitgaven"]} wissel={() => klap("uitgaven", !!rust.open["uitgaven"])}>
            {uitgavenDezeMaand.length ? <div className="space-y-2.5">{uitgavenDezeMaand.map((k) => <KostRij key={k.id} k={k} onOpen={() => setDetailId(k.id)}/>)}</div> : <p className="rounded-xl bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)] px-3 py-3 text-center text-sm text-ink-soft">{t("routes.kosten.geenDezeMaand")}</p>}
            <button onClick={() => setToonAlle((o) => !o)} aria-expanded={toonAlle} className="mt-3 flex min-h-11 w-full items-center justify-between rounded-full border border-white/90 bg-white/70 px-4 text-sm font-black text-[#2F4A3A]">
              {t("routes.kosten.eerdereMaanden")} <Chevron richting="omlaag" open={toonAlle} className="size-4 text-ink-soft"/>
            </button>
            {toonAlle ? <Transacties alle={alle} historie={historie} onOpen={setDetailId}/> : null}
          </Klap>
          <VasteLasten />

          <Klap id="overzicht" titel={t("routes.kosten.overzicht.titel")} sub={t("routes.kosten.overzicht.sub")} open={!!rust.open["overzicht"]} wissel={() => klap("overzicht", !!rust.open["overzicht"])}>
            <div className="divide-y divide-[#E9E1D5]">
              {[["alle", t("routes.kosten.alle.bekijk"), t("routes.kosten.alle.uitleg")], ["berekening", t("routes.kosten.overzicht.berekening"), t("routes.kosten.overzicht.berekeningUitleg")], ["historie", t("routes.kosten.overzicht.historie"), t("routes.kosten.overzicht.historieUitleg")], ["instellingen", t("routes.kosten.overzicht.instellingen"), t("routes.kosten.overzicht.instellingenUitleg")]].map(([naar, titel, uitleg]) => (<button key={naar} onClick={() => setScherm(naar)} className="flex min-h-12 w-full items-center gap-3 py-2.5 text-left">
                  <span className="min-w-0 flex-1"><span className="block text-[15px] font-black">{titel}</span><span className="block text-xs text-ink-soft">{uitleg}</span></span>
                  <Chevron className="size-4 text-ink-soft"/>
                </button>))}
            </div>
          </Klap>

          <div className="mt-5 flex items-start gap-2.5 rounded-[22px] bg-white/45 px-4 py-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-full border border-[#C9D6C3] bg-[#E9EFE3] text-xs font-black text-[#3F5747]" aria-hidden>Co</span>
            <p className="text-[14px] leading-snug text-[#3F5747]">{t("routes.kosten.coTip")}</p>
          </div>
        </div>

      {nieuweUitgave}
      {budgetDetail ? <Sheet open onOpenChange={(o) => { if (!o)
        setBudgetDetail(null); }}><SheetContent side="bottom" className="left-1/2 max-h-[90dvh] w-full max-w-md -translate-x-1/2 overflow-y-auto rounded-t-2xl bg-background px-5 pb-8 pt-4"><SheetHeader className="pr-8 text-left"><SheetTitle>{t("routes.kosten.budgetDetails.titel")}</SheetTitle><SheetDescription>{t("routes.kosten.budgetDetails.beschrijving")}</SheetDescription></SheetHeader><div className="mt-3"><BudgetVoorstel doelId={budgetDetail} onKlaar={() => setBudgetDetail(null)} onUitgave={(b) => { setBudgetDetail(null); setVanBudget(b); setNieuwOpen(true); }}/></div></SheetContent></Sheet> : null}
      <KostDetail key={detailId ?? ""} startWijzig={wijzigStart} kost={alle.find((k) => k.id === detailId) ?? null} onSluit={() => { setDetailId(null); setWijzigStart(false); }} onVerrekenen={() => { setDetailId(null); setScherm("verrekenen"); }}/>
    </AppShell>);
}
function kostStatus(k) {
    const s = k.status;
    if (s === "betaald" || s === "verrekend")
        return { label: i18n.t("routes.kosten.status.afgerekend"), toon: "klaar", afgerekend: true };
    if (s === "openstaand" || s === "bevestigd")
        return { label: i18n.t("routes.kosten.saldo.titel"), toon: "info" };
    if (s === "wacht") {
        if (k.meerTijd)
            return { label: i18n.t("routes.kosten.status.meerTijd"), toon: "actie" };
        return { label: aanZetBij(k) === "ik" ? i18n.t("routes.kosten.status.jouwReactie") : i18n.t("routes.kosten.status.wachtOpAnder"), toon: "actie" };
    }
    return { label: statusLabel[s] ?? s, toon: "neutraal", afgerekend: s === "opgeslagen" };
}
function KostRij({ k, onOpen }) {
    const { t } = useTranslation();
    const kostenBron = useKostenPaar().kosten;
    const budgetBron = useBudgettenPaar();
    const gedekt = beoordeelKosten(kostenBron, budgetBron, vandaagIso()).get(k.id)?.soort === "gedekt";
    const st = gedekt ? { label: t("routes.kosten.status.binnenBudget"), toon: "klaar" } : kostStatus(k);
    const ikBetaalde = k.betaaldDoor === "ik";
    const deelAnder = ikBetaalde ? k.bedrag - k.aandeelIk : k.aandeelIk;
    const deelTekst = ikBetaalde ? t("routes.kosten.rij.deelNaam", { naam: t("common.deAndereOuder"), bedrag: euro(deelAnder) }) : t("routes.kosten.rij.jouwDeel", { bedrag: euro(deelAnder) });
    const vanKindrekening = k.bron === "kindrekening";
    const metBijlage = k.bijlagen.length > 0;
    return (<div id={`item-${k.id}`} role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter")
        onOpen(); }} className="zoekdoel cursor-pointer rounded-[22px] border border-white/85 bg-white/60 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex min-w-0 items-center gap-1 text-[17px] font-black"><span className="truncate">{k.omschrijving}</span>{metBijlage ? <Paperclip className="size-3.5 shrink-0 text-ink-soft" aria-label={t("routes.kosten.rij.metBijlage")}/> : null}</p>
        <p className="shrink-0 text-[17px] font-black tabular-nums">{euro(k.bedrag)}</p>
      </div>
      <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-ink-soft"><Kinderen ids={k.kindIds} naam={k.kind}/><DeelLabel gedeeld={k.gedeeld}/><span>{ikBetaalde ? t("common.jij") : t("routes.kosten.nieuw.andereOuder")}{vanKindrekening ? ` · ${t("routes.kosten.rij.kindrekening")}` : ""}{k.categorieGekozen ? ` · ${categorieLabel(k.categorieGekozen)}` : ""} · {toonDatumTekst(k.datum)}</span></p>
      <p className={`mt-1.5 text-sm font-extrabold ${st.toon === "klaar" ? "text-brand" : st.toon === "actie" ? "text-[#7A5E44]" : "text-ink-soft"}`}>{st.toon === "klaar" ? <Vinkje className="mr-1 inline size-4 align-[-3px]"/> : st.toon === "actie" ? <Clock aria-hidden="true" strokeWidth={2} className="mr-1 inline size-4 align-[-3px]"/> : null}{vanKindrekening ? (metBijlage ? t("routes.kosten.rij.vanKindrekeningBon") : t("routes.kosten.rij.vanKindrekeningGeenBon")) : <>{st.label}{st.afgerekend || !k.gedeeld ? "" : ` · ${deelTekst}`}</>}</p>
    </div>);
}
function Transacties({ alle, historie, onOpen }) {
    const { t } = useTranslation();
    const [kind, setKind] = useState("Alle");
    const [cat, setCat] = useState("Alle");
    const [status, setStatus] = useState("Alle");
    const [periode, setPeriode] = useState("Alle");
    const maanden = [...new Set(alle.map(maandVan).filter(Boolean))];
    const lijst = alle.filter((k) => (kind === "Alle" || k.kind === kind) &&
        (cat === "Alle" || k.categorie === cat) &&
        (status === "Alle" || kostStatus(k).label === status) &&
        (periode === "Alle" || maandVan(k) === periode));
    // "Alle" en de opties blijven bronwaarden voor het filter; alleen de weergave wordt vertaald.
    const Kies = ({ label, waarde, opties, onChange, toon = (o) => o }) => (<label className="flex flex-col gap-1 text-[11px] font-semibold text-ink-soft">{label}
      <select value={waarde} onChange={(e) => onChange(e.target.value)} className="min-h-10 rounded-md border border-border bg-card px-2 text-sm font-normal text-ink">
        {["Alle", ...opties].map((o) => <option key={o} value={o}>{o === "Alle" ? t("routes.kosten.filter.alle") : toon(o)}</option>)}
      </select>
    </label>);
    const naam = (id) => (id === "ik" ? t("common.jij") : t("routes.kosten.nieuw.andereOuder"));
    return (<div className="animate-in fade-in duration-300">
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Kies label={t("routes.kosten.filter.kind")} waarde={kind} opties={[...new Set(alle.map((k) => k.kind))]} onChange={setKind} toon={kindLabel}/>
        <Kies label={t("routes.kosten.filter.periode")} waarde={periode} opties={maanden} onChange={setPeriode} toon={toonDatumTekst}/>
        <Kies label={t("routes.kosten.filter.categorie")} waarde={cat} opties={[...new Set(alle.map((k) => k.categorie))]} onChange={setCat} toon={categorieLabel}/>
        <Kies label={t("routes.kosten.filter.status")} waarde={status} opties={[...new Set(alle.map((k) => kostStatus(k).label))]} onChange={setStatus}/>
      </div>
      <h2 className="mt-5 font-display text-lg font-bold">{t("routes.kosten.titel")} <span className="text-sm font-normal text-ink-soft">({lijst.length})</span></h2>
      <div className="mt-2 space-y-2">
        {lijst.length === 0 ? <p className="text-sm text-ink-soft">{t("routes.kosten.filter.geen")}</p> : lijst.map((k) => <KostRij key={k.id} k={k} onOpen={() => onOpen(k.id)}/>)}
      </div>
      {historie.length ? <>
      <h2 className="mt-6 font-display text-lg font-bold">{t("routes.kosten.afrekeningenBetalingen")}</h2>
      <div className="mt-2 divide-y divide-border border-y border-border">
        {historie.map((v) => (<div key={v.id} className="flex items-center gap-3 py-3">
            <AppIcon functie="portemonnee" maat="sm"/>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{v.maand}</p>
              <p className="text-xs text-ink-soft">{v.datum} · {naam(v.van)} → {naam(v.aan)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold tabular-nums">{euro(v.bedrag)}</p>
              <Badge toon={v.status === "afgerond" ? "klaar" : "actie"} className="mt-1">{verrekeningStatus(v.status)}</Badge>
            </div>
          </div>))}
      </div>
      </> : null}
      <p className="mt-3 text-xs text-ink-soft">{t("routes.kosten.betalenNogNiet")}</p>
    </div>);
}
// --- Berekening: exact zichtbaar hoe het saldo is opgebouwd ---
/** Totalen per periode: totaal, wat ieder voorschoot, ieders afgesproken deel, openstaand en afgerond. */
function PeriodeTotalen({ kosten, historie, budgetten }) {
    const { t } = useTranslation();
    const [periode, setPeriode] = useState("maand");
    const tot = periodeTotalen(kosten, historie, budgetten, periodeGrenzen(periode, vandaagIso()));
    const ander = t("common.deAndereOuder");
    const chip = (a) => `min-h-10 rounded-full border px-3 text-xs font-semibold ${a ? "border-brand bg-brand-soft text-brand" : "border-border text-ink-soft"}`;
    return (<section className="mt-5" aria-label={t("routes.kosten.periode.titel")}>
      <h2 className="font-display text-lg font-bold">{t("routes.kosten.periode.titel")}</h2>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={t("routes.kosten.periode.titel")}>
        {["maand", "vorigeMaand", "jaar", "alles"].map((p) => <button key={p} type="button" aria-pressed={periode === p} onClick={() => setPeriode(p)} className={chip(periode === p)}>{t(`routes.kosten.periode.${p}`)}</button>)}
      </div>
      {tot.aantal === 0 && !tot.afgerekend.aantal && !tot.afTeStemmen.aantal ? <p className="mt-3 text-sm text-ink-soft">{t("routes.kosten.periode.leeg")}</p> : <dl className="mt-3 divide-y divide-border border-y border-border text-sm">
        {[[t("routes.kosten.periode.totaal", { aantal: tot.aantal }), tot.totaal], [t("routes.kosten.periode.betaaldJij"), tot.betaaldIk], [t("routes.kosten.periode.betaaldNaam", { naam: ander }), tot.betaaldAnder], [t("routes.kosten.periode.deelJij"), tot.deelIk], [t("routes.kosten.periode.deelNaam", { naam: ander }), tot.deelAnder]].map(([label, bedrag]) => <div key={label} className="flex justify-between gap-3 py-2.5"><dt className="text-ink-soft">{label}</dt><dd className="font-semibold tabular-nums">{euro(Number(bedrag))}</dd></div>)}
        <div className="flex justify-between gap-3 py-2.5"><dt className="text-ink-soft">{t("routes.kosten.periode.openstaand")}</dt><dd className="text-right font-semibold tabular-nums">{Math.abs(tot.netto) < 0.01 ? euro(0) : `${euro(Math.abs(tot.netto))} · ${tot.netto > 0 ? t("routes.kosten.saldo.jorisBetaaltJou") : t("routes.kosten.saldo.jijBetaaltJoris")}`}</dd></div>
        <div className="flex justify-between gap-3 py-2.5"><dt className="text-ink-soft">{t("routes.kosten.periode.afgerekend", { aantal: tot.afgerekend.aantal })}</dt><dd className="font-semibold tabular-nums">{euro(tot.afgerekend.bedrag)}</dd></div>
        {tot.afTeStemmen.aantal ? <div className="flex justify-between gap-3 py-2.5"><dt className="text-ink-soft">{t("routes.kosten.periode.afTeStemmen", { aantal: tot.afTeStemmen.aantal })}</dt><dd className="font-semibold tabular-nums">{euro(tot.afTeStemmen.bedrag)}</dd></div> : null}
      </dl>}
      <p className="mt-2 text-xs text-ink-soft">{t("routes.kosten.periode.uitleg")}</p>
    </section>);
}
function BerekeningScherm({ saldo, kosten, historie, budgetten, onTerug }) {
    const { t } = useTranslation();
    const ander = t("common.deAndereOuder");
    const jou = t("routes.kosten.berekening.jou");
    const posten = [...saldo.anderAanIk.posten, ...saldo.ikAanAnder.posten].map((p) => p.post);
    const totaal = posten.reduce((n, k) => n + k.bedrag, 0);
    const jouw = posten.reduce((n, k) => n + k.aandeelIk, 0);
    return (<AppShell>
      <div className="flex items-start gap-3">
        <TerugKnop onClick={onTerug}/>
        <div>
          <h1 className="lora text-[30px] leading-tight">{t("routes.kosten.berekening.titel")}</h1>
          <p className="mt-1 text-sm text-ink-soft">{t("routes.kosten.berekening.intro")}</p>
        </div>
      </div>

      <PeriodeTotalen kosten={kosten} historie={historie} budgetten={budgetten}/>
      <h2 className="mt-6 font-display text-lg font-bold">{t("routes.kosten.berekening.nuOpen")}</h2>
      <dl className="mt-2 divide-y divide-border border-y border-border text-sm">
        {[[t("routes.kosten.berekening.totaal"), totaal], [t("routes.kosten.berekening.jouwAandeel"), jouw], [t("routes.kosten.berekening.aandeelNaam", { naam: ander }), totaal - jouw], [t("routes.kosten.berekening.voorgeschotenJou"), posten.filter((k) => k.betaaldDoor === "ik").reduce((n, k) => n + k.bedrag, 0)], [t("routes.kosten.berekening.voorgeschotenNaam", { naam: ander }), posten.filter((k) => k.betaaldDoor !== "ik").reduce((n, k) => n + k.bedrag, 0)]].map(([label, bedrag]) => <div key={label} className="flex justify-between gap-3 py-2.5"><dt className="text-ink-soft">{label}</dt><dd className="font-semibold">{euro(Number(bedrag))}</dd></div>)}
      </dl>

      <section className="mt-5">
        <h2 className="font-display text-lg font-bold">{t("routes.kosten.berekening.teBetalen", { van: ander, aan: jou })}</h2>
        <ul className="mt-2 divide-y divide-border">
          {saldo.anderAanIk.posten.map(({ post, aandeel }) => (<li key={post.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="flex min-w-0 items-center gap-2"><Pictogram waarde={post.icoon} maat="sm" vorm="kaal"/><span className="truncate">{post.omschrijving}</span></span>
              <span className="shrink-0 font-semibold">{euro(aandeel)}</span>
            </li>))}
        </ul>
        <p className="border-t border-border pt-2.5 text-right text-sm font-bold">{t("routes.kosten.berekening.totaalBedrag", { bedrag: euro(saldo.anderAanIk.totaal) })}</p>
      </section>

      <section className="mt-6">
        <h2 className="font-display text-lg font-bold">{t("routes.kosten.berekening.teBetalen", { van: jou, aan: ander })}</h2>
        <ul className="mt-2 divide-y divide-border">
          {saldo.ikAanAnder.posten.map(({ post, aandeel }) => (<li key={post.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="flex min-w-0 items-center gap-2"><Pictogram waarde={post.icoon} maat="sm" vorm="kaal"/><span className="truncate">{post.omschrijving}</span></span>
              <span className="shrink-0 font-semibold">{euro(aandeel)}</span>
            </li>))}
        </ul>
        <p className="border-t border-border pt-2.5 text-right text-sm font-bold">{t("routes.kosten.berekening.totaalBedrag", { bedrag: euro(saldo.ikAanAnder.totaal) })}</p>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-card p-5 text-center">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-brand uppercase">{t("routes.kosten.berekening.naVerrekening")}</p>
        <p className="mt-2 text-sm text-ink-soft">
          {euro(saldo.anderAanIk.totaal)} − {euro(saldo.ikAanAnder.totaal)}
        </p>
        <p className="mt-1 font-display text-2xl font-extrabold text-accent-warm">
          {saldo.netto >= 0 ? t("routes.kosten.saldo.jorisBetaaltJou") : t("routes.kosten.saldo.jijBetaaltJoris")}: {euro(Math.abs(saldo.netto))}
        </p>
      </section>
    </AppShell>);
}
// --- Historie ---
function HistorieScherm({ historie, onTerug, }) {
    const { t } = useTranslation();
    const naam = (id) => (id === "ik" ? t("common.jij") : t("routes.kosten.nieuw.andereOuder"));
    return (<AppShell>
      <div className="flex items-start gap-3">
        <TerugKnop onClick={onTerug}/>
        <div>
          <h1 className="lora text-[30px] leading-tight">{t("routes.kosten.historie.titel")}</h1>
          <p className="mt-1 text-sm text-ink-soft">{t("routes.kosten.historie.intro")}</p>
        </div>
      </div>
      {!historie.length ? <p className="mt-6 text-sm text-ink-soft">{t("routes.kosten.historie.leeg")}</p> : null}
      <ul className="mt-5 divide-y divide-border">
        {historie.map((v) => (<li key={v.id} className="py-3.5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{v.maand}</p>
              <Badge>{verrekeningStatus(v.status)}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-soft">
              {v.bedrag === 0
                ? t("routes.kosten.historie.geenBetaling")
                : `${euro(v.bedrag)} · ${naam(v.van)} → ${naam(v.aan)} · ${v.wijze}`}
            </p>
            <p className="text-[11px] text-ink-soft/80">{v.datum}</p>
            {v.status === "wacht-op-ontvanger" && v.aan === "ik" ? (<Button className="mt-2 min-h-11 shadow-none" onClick={async () => { if (await reageerOpVerrekening(v.id, "ontvangen"))
                bevestig(t("routes.kosten.historie.ontvangstBevestigd")); }}>{t("routes.kosten.historie.ikHebOntvangen", { bedrag: euro(v.bedrag) })}</Button>) : null}
            {v.status === "ontvangst-bevestigd" && v.aan === "ik" ? <Button className="mt-2" onClick={async () => { if (await reageerOpVerrekening(v.id, "afronden"))
            bevestig(t("routes.kosten.historie.afgerond")); }}>{t("routes.kosten.historie.afronden")}</Button> : null}
          </li>))}
      </ul>
    </AppShell>);
}
/** Kindkeuzes van het eigen gezin: ieder kind, "Alle kinderen" (bij meer dan één) en "Gezin/algemeen". */
function kindKeuzesVan(kinderen) {
    return [...kinderen.map((k) => ({ waarde: k.naam, ids: [k.id] })), ...(kinderen.length > 1 ? [{ waarde: "Alle kinderen", ids: kinderen.map((k) => k.id) }] : []), { waarde: "Gezin/algemeen", ids: [] }];
}
let bewaardConcept = null;
function NieuweUitgave({ budget: startBudget, voorinvul, voorKind, onSluit, startManier, startBron, }) {
    const { t } = useTranslation();
    const st = useStart();
    const bron = useKostenPaar();
    const budgetten = bron.budgetten;
    const bronKosten = bron.kosten;
    const [budget, setBudget] = useState(startBudget ?? null);
    const ikNaam = st.naam || t("common.jij");
    const anderNaam = t("routes.kosten.nieuw.andereOuder");
    const geldt = bron.afspraak.geldt ?? STANDAARD_AFSPRAAK;
    const eigenPct = standaardPct(geldt);
    const grens = bron.afspraak.bevestigd ? geldt.grens : null;
    const kindKeuzes = kindKeuzesVan(st.kinderen);
    const kindVanBudget = (b) => kindKeuzes.find((k) => k.ids.length === b.kindIds.length && k.ids.every((id) => b.kindIds.includes(id)))?.waarde ?? kindTekst(b.kindIds);
    // Uit een bericht: bedrag alleen voorstellen als er een herkenbaar €-bedrag in staat; gebruiker controleert altijd.
    const bedragUitTekst = voorinvul?.match(/€\s?(\d+(?:[.,]\d{1,2})?)/)?.[1] ?? "";
    const start = !budget && !voorinvul ? bewaardConcept : null;
    const [omschrijving, setOmschrijving] = useState(start?.omschrijving ?? budget?.wat ?? voorinvul?.replace(/€\s?\d+(?:[.,]\d{1,2})?/, "").replace(/\s+/g, " ").trim().slice(0, 60) ?? "");
    const [bedragTekst, setBedragTekst] = useState(start?.bedragTekst ?? (budget ? bewerkGeld(budget.max) : bedragUitTekst));
    const [kind, setKind] = useState(start?.kind ?? (budget ? kindVanBudget(budget) : voorKind && kindKeuzes.some((k) => k.waarde === voorKind) ? voorKind : voorKind === "Allebei" && st.kinderen.length > 1 ? "Alle kinderen" : kindKeuzes[0]?.waarde ?? "Gezin/algemeen"));
    // Categorie is vrijwillig: geen stille standaard (de server bewaart dan "Overig").
    const [categorie, setCategorie] = useState(start?.categorie ?? null);
    const [manier, setManier] = useState(startManier ?? "hand");
    const [datum, setDatum] = useState(vandaagIso());
    const [toelichting, setToelichting] = useState("");
    const [meer, setMeer] = useState(false);
    const [vraagSluiten, setVraagSluiten] = useState(false);
    const [verdeling, setVerdeling] = useState(budget ? (budget.pctIk === 50 ? "50" : "anders") : geldt.wijze === "per-uitgave" ? "50" : "standaard");
    const [pctIk, setPctIk] = useState(budget?.pctIk ?? 60);
    const [bon, setBon] = useState(null);
    // Betaald van: eigen rekening (daarna verrekenen) of de gezamenlijke kindrekening (niets te verrekenen; bon erbij).
    const [bronRek, setBronRek] = useState(startBron ?? "eigen");
    const [bijlage, setBijlage] = useState(null);
    const [extraKeuze, setExtraKeuze] = useState(null);
    const [bezig, setBezig] = useState(false);
    const navigeer = useNavigate();
    const bedrag = leesGeld(bedragTekst) ?? 0;
    const kindIds = kindKeuzes.find((k) => k.waarde === kind)?.ids ?? [];
    // "Alleen jij" is de standaard; delen is een bewuste keuze. Een uitgave bij een afgesproken budget is altijd gedeeld.
    const [gedeeldKeuze, setGedeeldKeuze] = useState(!!startBudget);
    const [scanKindIds, setScanKindIds] = useState(null);
    const delen = useDeelOpties(manier === "scan" && scanKindIds ? scanKindIds : kindIds);
    const gedeeld = !!budget || (gedeeldKeuze && delen.kan);
    const gemengd = !budget && gedeeldKeuze && delen.gemengd;
    const gekoppeld = gedeeld;
    const sleutel = { ik: eigenPct ?? 100, ander: 100 - (eigenPct ?? 100) };
    const alleenBijhouden = !gekoppeld || eigenPct === null;
    const effectiefIk = verdeling === "standaard" ? sleutel.ik : verdeling === "50" ? 50 : verdeling === "volledig" ? 100 : pctIk;
    const deelIk = Math.round(bedrag * effectiefIk) / 100;
    const deelAnder = Math.round((bedrag - deelIk) * 100) / 100;
    const ingevuld = manier === "hand" && !budget && !voorinvul && !!(omschrijving.trim() || bedragTekst.trim() || bon || bijlage);
    const probeerSluiten = () => (ingevuld ? setVraagSluiten(true) : onSluit());
    useEffect(() => {
        const esc = (e) => { if (e.key === "Escape")
            probeerSluiten(); };
        window.addEventListener("keydown", esc);
        return () => window.removeEventListener("keydown", esc);
    });
    const budgetBeoordeling = budget ? beoordeelKosten([...bronKosten, { id: "invoer", omschrijving, categorie: budget.categorie ?? categorie, kind, kindIds, datum, bedrag, status: "wacht", betaaldDoor: "ik", aandeelIk: Math.round(bedrag * budget.pctIk) / 100, budgetId: budget.id }], budgetten, datum).get("invoer") : null;
    const budgetRest = budgetBeoordeling?.soort === "boven" ? budgetBeoordeling.rest : budget?.max ?? 0;
    const overschot = budget ? Math.round((bedrag - budgetRest) * 100) / 100 : 0;
    const overschreden = budgetBeoordeling?.soort === "boven" && overschot > 0.009;
    // Grensbedrag (bevestigde afspraak): daarboven eerst een budget, en dan is een bon verplicht.
    const gedeeldeKosten = gekoppeld && !alleenBijhouden && verdeling !== "volledig";
    const eerstBudget = grens !== null && grens !== undefined && gedeeldeKosten && bedrag > grens && !budget;
    const bonVerplicht = grens !== null && grens !== undefined && gedeeldeKosten && bedrag > grens && !!budget && !bon;
    const kanOpslaan = !!omschrijving.trim() && bedrag > 0 && !!datum && !!kind && !(overschreden && !extraKeuze) && !eerstBudget && !bonVerplicht && !gemengd && !bezig;
    const opslaan = async () => {
        if (!kanOpslaan)
            return;
        setBezig(true);
        bewaardConcept = null;
        // Bij overschrijding: het afgesproken deel volgt de budgetverdeling; het extra deel apart.
        const basis = overschreden ? budgetRest : bedrag;
        const r = await voegUitgaveToe({
            omschrijving, bedrag: basis, datum, kindIds, categorie: categorie ?? undefined, bron: gekoppeld ? bronRek : "eigen",
            verdeling: budget ? "anders" : alleenBijhouden ? "volledig" : verdeling, pctIk: budget ? budget.pctIk : effectiefIk,
            gedeeld, anderId: delen.anderId ?? undefined,
            budgetId: budget?.id, opmerking: toelichting.trim() || undefined, bon: bon?.data, bonNaam: bon?.naam, bijlage: bijlage?.data, bijlageNaam: bijlage?.naam,
        });
        if (!r) {
            setBezig(false);
            return; // fout is gemeld; het formulier blijft staan om het opnieuw te proberen
        }
        if (overschreden) {
            // Het extra deel boven het budget is een aparte uitgave: pas "opgeslagen" melden als die ook gelukt is.
            const extra = await voegUitgaveToe({ omschrijving: t("routes.kosten.nieuw.extraBovenBudget", { omschrijving }), bedrag: overschot, datum, kindIds, categorie: categorie ?? undefined, bron: bronRek, verdeling: extraKeuze === "eigen" ? "volledig" : "anders", pctIk: budget.pctIk, gedeeld: true, anderId: budget.partnerId ?? delen.anderId ?? undefined });
            setBezig(false);
            if (!extra) {
                meldFout(t("routes.kosten.nieuw.extraMislukt", { bedrag: euro(overschot) }));
                onSluit();
                return;
            }
        }
        setBezig(false);
        bevestig(t(r.status === "wacht" ? "routes.kosten.melding.gedeeld" : "routes.kosten.melding.opgeslagen"), { uitleg: omschrijving });
        onSluit();
    };
    const vanScan = async (b) => {
        const metBudget = b.budgetId ? budgetten.find((x) => x.id === b.budgetId) : null;
        const verd = b.verdeling;
        if (!metBudget && gemengd) {
            meldFout(t("lib.api.fout.MIXED_CHILDREN"));
            return false;
        }
        const scanGedeeld = !!metBudget || gedeeld;
        if (grens !== null && grens !== undefined && scanGedeeld && !alleenBijhouden && verd !== "volledig" && b.bedrag > grens && !metBudget) {
            meldFout(t("routes.kosten.nieuw.eerstBudget", { grens: euro(grens) }));
            return false;
        }
        const r = await voegUitgaveToe({ omschrijving: b.omschrijving, bedrag: b.bedrag, datum: b.datum ?? vandaagIso(), kindIds: b.kindIds, bron: "eigen", verdeling: metBudget ? "anders" : alleenBijhouden || !scanGedeeld ? "volledig" : verd, pctIk: metBudget ? metBudget.pctIk : verd === "50" ? 50 : sleutel.ik, gedeeld: scanGedeeld, anderId: metBudget?.partnerId ?? delen.anderId ?? undefined, budgetId: metBudget?.id, bon: b.foto, bonNaam: t("components.BonScanner.bonNaam", { naam: b.omschrijving }) });
        if (r) {
            bevestig(t(r.status === "wacht" ? "routes.kosten.melding.gedeeld" : "routes.kosten.melding.opgeslagen"), { uitleg: b.omschrijving });
            onSluit();
        }
        return !!r;
    };
    return (<div className="app-modal-achter z-30" onClick={probeerSluiten}>
      <div role="dialog" aria-modal="true" aria-label={budget ? t("routes.kosten.nieuw.uitgaveToevoegen") : t("routes.kosten.nieuw.nieuweUitgave")} className="app-modal" onClick={(e) => e.stopPropagation()} onTouchStart={(e) => { e.currentTarget.dataset["y"] = String(e.touches[0]?.clientY ?? 0); }} onTouchEnd={(e) => { const el = e.currentTarget; const dy = (e.changedTouches[0]?.clientY ?? 0) - Number(el.dataset["y"] ?? 0); if (dy > 90 && el.scrollTop <= 0)
        probeerSluiten(); }}>
        <button type="button" onClick={probeerSluiten} aria-label={t("common.sluiten")} className="knop-kruis absolute right-2 top-2 size-11"><X className="size-5"/></button>
        <p className="pr-10 font-display text-lg font-bold">{budget ? t("routes.kosten.nieuw.uitgaveToevoegen") : t("routes.kosten.nieuw.nieuweUitgave")}</p>
        {vraagSluiten ? (<div className="mt-4 space-y-2 border-y border-border py-4">
            <p className="text-sm font-semibold">{t("routes.kosten.nieuw.concept.vraag")}</p>
            <button onClick={() => { bewaardConcept = { omschrijving, bedragTekst, kind, categorie }; bevestig(t("routes.kosten.nieuw.concept.bewaard")); onSluit(); }} className="min-h-11 w-full rounded-full bg-brand text-sm font-semibold text-primary-foreground">{t("routes.kosten.nieuw.concept.bewaren")}</button>
            <button onClick={() => { bewaardConcept = null; onSluit(); }} className="min-h-11 w-full rounded-full border border-border bg-card text-sm font-semibold text-ink-soft">{t("common.verwijderen")}</button>
            <button onClick={() => setVraagSluiten(false)} className="min-h-11 w-full text-sm font-semibold text-brand">{t("routes.kosten.nieuw.concept.verder")}</button>
          </div>) : manier === "kies" ? (<div className="mt-4 space-y-2">
            <button onClick={() => setManier("scan")} className="flex min-h-14 w-full items-center gap-3 rounded-md border border-border px-3 text-left text-sm font-semibold"><AppIcon functie="foto" maat="md"/>{t("routes.kosten.nieuw.bonScannen")}</button>
            <button onClick={() => setManier("hand")} className="flex min-h-14 w-full items-center gap-3 rounded-md border border-border px-3 text-left text-sm font-semibold"><AppIcon functie="notitie" maat="md"/>{t("routes.kosten.nieuw.handmatig")}</button>
          </div>) : manier === "scan" ? (<div className="mt-4 space-y-2">
            <p className="text-xs text-ink-soft">{t("routes.kosten.nieuw.scanUitleg")}</p>
            <DeelKeuze gedeeld={gedeeld} onChange={setGedeeldKeuze} kan={delen.kan || delen.gemengd}/>
            {gemengd ? <p role="alert" className="text-xs font-semibold text-accent-warm">{t("lib.api.fout.MIXED_CHILDREN")}</p> : null}
            <BonScanner standaardPct={alleenBijhouden ? 100 : sleutel.ik} toonVerdeling={gedeeld && !alleenBijhouden} onKindIds={setScanKindIds} onKosten={vanScan} onDocument={(d) => d.foto ? uploadDocument(d.foto, { naam: d.naam, categorie: "Bonnen", kindId: st.kinderen.find((k) => k.naam === d.kind)?.id ?? null, bron: "bon", bestandsnaam: `${d.naam}.jpg` }) : null}/>
            <button onClick={() => setManier("hand")} className="min-h-11 text-sm font-semibold text-brand">{t("routes.kosten.nieuw.lieverHandmatig")}</button>
          </div>) : <>
        {budget ? <p className="mt-1 text-xs text-ink-soft">{t("routes.kosten.nieuw.afgesprokenBudget", { bedrag: euro(budget.max), sanne: budget.pctIk, ander: 100 - budget.pctIk })}</p> : null}
        <Button variant="link" className="px-0" onClick={() => setManier("scan")}><AppIcon functie="foto" maat="sm" vorm="kaal"/>{t("routes.kosten.nieuw.bonScannen")}</Button>
        <div className="mt-4 space-y-3">
          {budget ? <DeelLabel gedeeld/> : <DeelKeuze gedeeld={gedeeld} onChange={setGedeeldKeuze} kan={delen.kan || delen.gemengd}/>}
          {gemengd ? <p role="alert" className="text-xs font-semibold text-accent-warm">{t("lib.api.fout.MIXED_CHILDREN")}</p> : null}
          <input value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} placeholder={t("routes.kosten.nieuw.omschrijvingEigen")} className="w-full rounded-md border border-border bg-card px-4 py-3 text-sm outline-none placeholder:text-ink-soft/70"/>
          <GeldInvoer value={bedragTekst} onChange={setBedragTekst} label={t("routes.kosten.nieuw.bedrag")}/>
          {delen.kan && budgetten.some((b) => b.status === "akkoord" || b.status === "uitgegeven") ? <label className="block text-xs font-semibold">{t("routes.kosten.nieuw.budgetVrijwillig")}<select aria-label={t("routes.kosten.nieuw.budgetLabel")} value={budget?.id ?? ""} onChange={(e) => { const b = budgetten.find((b) => b.id === e.target.value) ?? null; setBudget(b); if (b) {
            setKind(kindVanBudget(b));
            setCategorie(b.categorie ?? categorie);
            setVerdeling(b.pctIk === 50 ? "50" : "anders");
            setPctIk(b.pctIk);
        } }} className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"><option value="">{t("routes.kosten.nieuw.geenBudget")}</option>{budgetten.filter((b) => b.status === "akkoord" || b.status === "uitgegeven").map((b) => <option key={b.id} value={b.id}>{b.wat}</option>)}</select></label> : null}
          {budget && budgetMelding(budgetBeoordeling) ? <p className="text-xs text-accent-warm">{budgetMelding(budgetBeoordeling)}</p> : null}
          <label className="block text-xs font-semibold">{t("routes.kosten.nieuw.datum")}<input type="date" aria-label={t("routes.kosten.nieuw.datum")} value={datum} max={vandaagIso()} onChange={(e) => setDatum(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"/></label>

          <p className="text-xs font-semibold text-ink-soft">{t("routes.kosten.nieuw.voor")}</p>
          <div className="flex flex-wrap gap-2">
            {kindKeuzes.map(({ waarde: k }) => (<button key={k} onClick={() => setKind(k)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${kind === k ? "border-brand bg-brand-soft text-brand" : "border-border text-ink-soft"}`}>
                {kindLabel(k)}
              </button>))}
          </div>

          <p className="text-xs font-semibold text-ink-soft">{t("routes.kosten.nieuw.betaaldDoor")}</p>
          <p className="rounded-md border border-brand bg-brand-soft px-3 py-2 text-sm font-semibold text-brand">{ikNaam}{!gekoppeld ? <span className="block text-[11px] font-normal text-ink-soft">{delen.kan ? t("routes.kosten.nieuw.alleenJijUitleg") : t("routes.kosten.nieuw.eigenNietGekoppeld")}</span> : null}</p>

          {gekoppeld ? <>
          <p className="text-xs font-semibold text-ink-soft">{t("routes.kosten.nieuw.betaaldVan")}</p>
          <div className="flex gap-2" role="group" aria-label={t("routes.kosten.nieuw.betaaldVan")}>
            {[["eigen", t("routes.kosten.nieuw.bron.eigen"), t("routes.kosten.nieuw.bron.eigenSub")], ["kindrekening", t("routes.kosten.nieuw.bron.kind"), t("routes.kosten.nieuw.bron.kindSub")]].map(([v, l, sub]) => (<button key={v} type="button" onClick={() => setBronRek(v)} aria-pressed={bronRek === v} className={`flex-1 rounded-2xl border px-3 py-2 text-left text-sm font-black ${bronRek === v ? "border-brand bg-brand-soft text-brand" : "border-border text-ink-soft"}`}>{l}<span className="block text-[11px] font-normal">{sub}</span></button>))}
          </div>
          {bronRek === "kindrekening" ? <div className="rounded-2xl bg-[#E9EFE3] p-3"><p className="text-sm font-black text-[#2F4A3A]">{t("routes.kosten.nieuw.bonToevoegen")}</p><p className="text-xs text-[#3F5747]">{t("routes.kosten.nieuw.bonUitleg", { naam: t("common.deAndereOuder") })}</p><BonKeuze gekozen={bon?.naam} onKies={setBon}/></div> : null}
          </> : null}

          {alleenBijhouden ? <p className="text-xs text-ink-soft">{t("routes.kosten.nieuw.alleenBijhouden")}</p> : bronRek === "kindrekening" ? null : <>
          <p className="text-xs font-semibold text-ink-soft">{t("routes.kosten.nieuw.hoeVerdelen")}{bron.afspraak.bevestigd ? "" : <span className="font-normal"> · {t("routes.kosten.nieuw.voorlopig")}</span>}</p>
          <div className="space-y-2">
            {[
                    ...(geldt.wijze === "per-uitgave" ? [] : [["standaard", t("routes.kosten.nieuw.volgensAfspraak", { sanne: sleutel.ik, joris: sleutel.ander })]]),
                    ["50", "50 / 50"],
                    ...(budget || verdeling === "anders" ? [["anders", t("routes.kosten.nieuw.anderPercentage")]] : []),
                    ["volledig", t("routes.kosten.nieuw.volledig")],
                ].map(([v, label]) => (<label key={v} className="flex items-center gap-3 text-sm">
                <input type="radio" name="verdeling" checked={verdeling === v} onChange={() => setVerdeling(v)} className="size-4 accent-[var(--color-brand)]"/>
                {label}
              </label>))}
            {verdeling === "anders" ? (<div className="flex items-center gap-2 pl-7 text-sm">
                <span className="text-ink-soft">{ikNaam}</span>
                <input type="number" min={0} max={100} value={pctIk} onChange={(e) => setPctIk(Math.min(100, Math.max(0, Number(e.target.value))))} className="w-16 rounded-md border border-border bg-card px-2 py-1 text-sm"/>
                <span className="text-ink-soft">% / {anderNaam} {100 - pctIk}%</span>
              </div>) : null}
          </div>

          {bedrag > 0 ? (verdeling === "volledig"
                ? <p className="rounded-md border border-border bg-card p-3 text-sm text-ink-soft">{t("routes.kosten.nieuw.nietVerrekend")}</p>
                : <div className="rounded-md border border-border bg-card p-3 text-sm">
              <p className="flex justify-between font-semibold"><span>{t("routes.kosten.nieuw.deelAnder")}</span><b>{euro(deelAnder)}</b></p>
              <p className="mt-1 flex justify-between text-xs text-ink-soft"><span>{t("routes.kosten.nieuw.deelJij")}</span><span>{euro(deelIk)}</span></p>
            </div>) : null}
          </>}

          {eerstBudget ? (<div role="status" className="rounded-md border border-border bg-muted p-3 text-sm">
              <p className="font-semibold">{t("routes.kosten.nieuw.eerstBudget", { grens: euro(grens) })}</p>
              <Button variant="link" className="min-h-11 px-0" onClick={() => { onSluit(); navigeer({ to: "/kosten", search: { budget: "nieuw", benodigdheid: omschrijving.trim() || undefined } }); }}><MetChevron>{t("routes.kosten.nieuw.budgetDoen")}</MetChevron></Button>
            </div>) : null}
          {bonVerplicht ? <p role="status" className="text-xs font-semibold text-accent-warm">{t("routes.kosten.nieuw.bonVerplicht")}</p> : null}
          {overschreden ? (<div role="status" className="rounded-md border border-accent-warm/50 bg-muted p-3 text-sm">
              <p className="font-semibold">{t("routes.kosten.nieuw.overschreden", { bedrag: euro(overschot) })}</p>
              <p className="mt-0.5 text-xs text-ink-soft">{t("routes.kosten.nieuw.binnenAfspraak", { budget: euro(budgetRest), extra: euro(overschot) })}</p>
              <div className="mt-2 space-y-1.5">
                {[["eigen", t("routes.kosten.nieuw.extra.eigen"), t("routes.kosten.nieuw.extra.eigenSub")], ["afstemmen", t("routes.kosten.nieuw.extra.voorstellen", { naam: t("common.deAndereOuder") }), t("routes.kosten.nieuw.extra.voorstellenSub", { naam: t("common.deAndereOuder") })]].map(([v, l, sub]) => (<label key={v} className="flex items-start gap-3">
                    <input type="radio" name="extra" checked={extraKeuze === v} onChange={() => setExtraKeuze(v)} className="mt-1 size-4 accent-[var(--color-brand)]"/>
                    <span>{l}<span className="block text-[11px] text-ink-soft">{sub}</span></span>
                  </label>))}
              </div>
            </div>) : null}
          {bronRek !== "kindrekening" && <BonKeuze gekozen={bon?.naam} onKies={setBon}/>}
          {/* Meer opties: één uitklapbaar blok (categorie + bijlagen); dezelfde knop klapt het weer in. */}
          <div className="border-y border-border">
            <button type="button" onClick={() => setMeer((v) => !v)} aria-expanded={meer} aria-controls="kosten-meer-opties" className="flex min-h-14 w-full items-center gap-3 py-3 text-left">
              <SlidersHorizontal aria-hidden="true" strokeWidth={1.8} className="size-4 shrink-0 text-brand"/>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-brand">{meer ? t("routes.kosten.nieuw.minderOpties") : t("routes.kosten.nieuw.meerOpties")}</span>
                {!meer ? <span className="mt-0.5 block text-xs text-ink-soft">{categorie ? t("routes.kosten.nieuw.meerOptiesSub", { categorie: categorieLabel(categorie) }) : t("routes.kosten.nieuw.meerOptiesSubGeen")}</span> : null}
              </span>
              <Chevron richting="omlaag" open={meer} className="size-4 shrink-0 text-ink-soft transition-transform"/>
            </button>
            {meer ? (<div id="kosten-meer-opties" className="mb-3 space-y-4 rounded-md border border-border bg-card p-3">
                <div>
                  <p className="text-xs font-semibold text-ink-soft">{t("routes.kosten.filter.categorie")} <span className="font-normal">{t("routes.kosten.nieuw.optioneel")}</span></p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {categorieen.map((c) => (<button key={c} type="button" aria-pressed={categorie === c} onClick={() => setCategorie(categorie === c ? null : c)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${categorie === c ? "border-brand bg-brand-soft text-brand" : "border-border text-ink-soft"}`}>
                        {categorieLabel(c)}
                      </button>))}
                  </div>
                </div>
                <div className="border-t border-border pt-1">
                  <BestandKnop label={t("routes.kosten.bon.andereBijlage")} gekozen={bijlage?.naam} icoon={Paperclip} accept="image/*,application/pdf" onKies={setBijlage}/>
                </div>
              </div>) : null}
          </div>
        </div>
        <label className="mt-3 block text-xs font-semibold">{t("routes.kosten.nieuw.toelichting")}<textarea value={toelichting} onChange={(e) => setToelichting(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"/></label>
        <div className="voet-vast">
        <Button onClick={opslaan} disabled={!kanOpslaan} className="min-h-12 w-full rounded-full bg-brand text-sm font-semibold text-primary-foreground disabled:opacity-40">
          {t("routes.kosten.nieuw.opslaan")}
        </Button>
        </div>
        </>}
      </div>
    </div>);
}
function BonKeuze({ gekozen, onKies }) {
    const { t } = useTranslation();
    // Eén bonbijlage: "Foto maken" vraagt pas camera bij tikken (capture); zonder camera opent de gewone bestandskeuze.
    return (<div className="py-2">
      <p className="text-sm font-semibold">{t("routes.kosten.bon.bonnetje")} <span className="font-normal text-ink-soft">{t("routes.kosten.bon.optioneel")}</span>{gekozen ? <span className="ml-2 text-xs font-normal text-ink-soft">{gekozen}</span> : null}</p>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <BestandKnop label={t("routes.kosten.bon.foto")} icoon={Camera} accept="image/*" capture onKies={onKies}/>
        <BestandKnop label={t("routes.kosten.bon.bestand")} icoon={Receipt} accept="image/*,application/pdf" onKies={onKies}/>
      </div>
    </div>);
}
/** Kiest een foto of pdf en geeft { naam, data } door; te groot of een ander soort bestand geeft een rustige melding. */
function BestandKnop({ label, gekozen, icoon: Icon, accept, capture, onKies }) {
    const { t } = useTranslation();
    return (<label className="flex cursor-pointer items-center gap-2 py-2.5 text-sm font-semibold text-brand">
      <Icon className="size-4" strokeWidth={1.6}/>
      <span className="flex-1">{label}</span>
      {gekozen ? <span className="truncate text-xs font-normal text-ink-soft">{gekozen}</span> : null}
      <input type="file" accept={accept} capture={capture ? "environment" : undefined} className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f)
        return; try {
        const b = await leesBonBestand(f);
        if (b)
            onKies(b);
    }
    catch (fout) {
        meldFout(fout?.message === "TE_GROOT" ? t("routes.kosten.bon.teGroot") : t("routes.kosten.bon.soort"));
    } }}/>
    </label>);
}
function BijlageKiezers({ bon, bijlage, onBon, onBijlage }) {
    const { t } = useTranslation();
    return (<div className="divide-y divide-border border-y border-border">
      <BonKeuze gekozen={bon} onKies={onBon}/>
      <BestandKnop label={t("routes.kosten.bon.andereBijlage")} gekozen={bijlage} icoon={Paperclip} accept="image/*,application/pdf" onKies={onBijlage}/>
    </div>);
}
/** "60 / 40" of "60" → jouw percentage, of null. */
const leesVerdeling = (s) => { const m = s.trim().match(/^(\d{1,3})(?:\s*\/\s*(\d{1,3}))?$/); const n = m ? Number(m[1]) : NaN; return Number.isFinite(n) && n >= 0 && n <= 100 && (!m?.[2] || Number(m[2]) === 100 - n) ? n : null; };
/** Mag een herinnering (max. 2, 24 uur na elkaar; de server controleert hetzelfde). */
const magKostHerinnering = (k) => k.herinneringen.length < 2 && (!k.herinneringen.length || Date.now() - new Date(k.herinneringen.at(-1)).getTime() >= 24 * 3600 * 1000);
/** Eigen uitgave aanpassen: omschrijving, bedrag, datum en (vrijwillige) categorie. */
function KostBewerken({ kost, onKlaar }) {
    const { t } = useTranslation();
    const [omschrijving, setOmschrijving] = useState(kost.omschrijving);
    const [bedragTekst, setBedragTekst] = useState(bewerkGeld(kost.bedrag));
    const [datum, setDatum] = useState(kost.datum ?? vandaagIso());
    const [categorie, setCategorie] = useState(kost.categorieGekozen);
    const [bezig, setBezig] = useState(false);
    const bedrag = leesGeld(bedragTekst) ?? 0;
    const geldig = !!omschrijving.trim() && bedrag > 0 && !!datum && datum <= vandaagIso();
    return (<form className="space-y-2 py-3" onSubmit={async (e) => {
            e.preventDefault();
            if (!geldig || bezig)
                return;
            setBezig(true);
            const r = await wijzigUitgave(kost.id, { omschrijving: omschrijving.trim(), bedrag, datum, categorie });
            setBezig(false);
            if (r) {
                bevestig(t("routes.kosten.detail.gewijzigd"), { uitleg: r.status === "wacht" ? t("routes.kosten.saldo.wachtJoris") : undefined });
                onKlaar();
            }
        }}>
      {kost.gedeeld ? <p className="text-xs text-ink-soft">{t("routes.kosten.detail.wijzigenGedeeld")}</p> : null}
      <input value={omschrijving} maxLength={200} onChange={(e) => setOmschrijving(e.target.value)} aria-label={t("routes.kosten.nieuw.omschrijvingEigen")} className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"/>
      <GeldInvoer value={bedragTekst} onChange={setBedragTekst} label={t("routes.kosten.nieuw.bedrag")}/>
      <label className="block text-xs font-semibold">{t("routes.kosten.nieuw.datum")}<input type="date" value={datum} max={vandaagIso()} onChange={(e) => setDatum(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"/></label>
      <label className="block text-xs font-semibold">{t("routes.kosten.filter.categorie")}<select value={categorie ?? ""} onChange={(e) => setCategorie(e.target.value || null)} className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"><option value="">{t("routes.kosten.detail.geenCategorie")}</option>{categorieen.map((c) => <option key={c} value={c}>{categorieLabel(c)}</option>)}</select></label>
      <div className="flex gap-2">
        <Button type="submit" disabled={!geldig || bezig} className="min-h-11 flex-1 shadow-none">{t("common.opslaan")}</Button>
        <Button type="button" variant="outline" onClick={onKlaar} className="min-h-11">{t("common.annuleren")}</Button>
      </div>
    </form>);
}
function KostDetail({ kost, onSluit, onVerrekenen, startWijzig = false }) {
    const { t } = useTranslation();
    const paar = useKostenPaar();
    const bronKosten = paar.kosten;
    const bronBudgetten = paar.budgetten;
    const beoordeling = beoordeelKosten(bronKosten, bronBudgetten, vandaagIso()).get(kost?.id ?? "");
    const keuze = useKeuzeTeksten();
    const delen = useDeelOpties(kost?.kindIds ?? []);
    const [opm, setOpm] = useState("");
    const [wijzig, setWijzig] = useState(startWijzig);
    const [bewerk, setBewerk] = useState(false);
    const [vraag, setVraag] = useState(null); // "verwijderen" | "intrekken" | "delen"
    const [nieuwBedrag, setNieuwBedrag] = useState("");
    const [nieuweVerdeling, setNieuweVerdeling] = useState("");
    const [meer, setMeer] = useState(startWijzig);
    const [bezig, setBezig] = useState(false);
    if (!kost)
        return null;
    const status = kost.status;
    const gedekt = status === "wacht" && beoordeling?.soort === "gedekt";
    const label = status === "betaald" || status === "verrekend" ? t("routes.kosten.status.afgerekend") : status === "openstaand" || status === "bevestigd" || gedekt ? t("routes.kosten.detail.toegevoegd") : kostStatus(kost).label;
    const pct = kost.pctIk;
    const open = status === "openstaand" || status === "bevestigd" || gedekt;
    const ikReageer = wachtOpJouwAkkoord(kost, beoordeling);
    const laatsteVoorstel = kost.aanZet === "ik" ? [...kost.stappen].reverse().find((s) => s.type === "ander_voorstel") : null;
    const actieKnop = "flex min-h-12 w-full items-center justify-between py-3 text-left text-sm font-semibold";
    // Eigen uitgave: wat mag nog (de server controleert hetzelfde)?
    const gereserveerd = paar.instellingen.historie.some((v) => !["ontvangst-bevestigd", "afgerond"].includes(v.status) && v.kostIds?.includes(kost.id));
    const nietAfgerekend = status !== "verrekend" && status !== "betaald" && !kost.settlementId && !gereserveerd;
    const onbeantwoord = (status === "wacht" || status === "opgeslagen") && !kost.beantwoord;
    const magWijzigen = kost.doorIk && nietAfgerekend && status !== "ingetrokken" && (!kost.gedeeld || onbeantwoord);
    const magIntrekken = kost.doorIk && kost.gedeeld && nietAfgerekend && ["wacht", "bevestigd", "opgeslagen", "betwist"].includes(status);
    const magVerwijderen = kost.doorIk && nietAfgerekend && (!kost.gedeeld || status === "ingetrokken" || onbeantwoord);
    const magDelen = kost.doorIk && !kost.gedeeld && nietAfgerekend && delen.kan;
    const magHerinneren = kost.gedeeld && status === "wacht" && aanZetBij(kost) === "ander" && !gedekt && magKostHerinnering(kost);
    const doe = async (f, tekst, sluit = true) => {
        setBezig(true);
        const r = await f();
        setBezig(false);
        setVraag(null);
        if (r) {
            bevestig(tekst);
            if (sluit)
                onSluit();
        }
    };
    const reageer = async (reactie, tekst, extra) => {
        setBezig(true);
        const gelukt = await reageerOpKost(kost.id, reactie, extra);
        setBezig(false);
        if (gelukt) {
            bevestig(tekst);
            onSluit();
        }
    };
    const voorstelTekst = (s) => [s.amount ? t("routes.kosten.detail.notitieBedrag", { bedrag: euro(s.amount) }) : null, s.payer_pct !== null && s.payer_pct !== undefined ? t("routes.kosten.detail.notitieVerdeling", { verdeling: `${kost.betaaldDoor === "ik" ? s.payer_pct : 100 - s.payer_pct} / ${kost.betaaldDoor === "ik" ? 100 - s.payer_pct : s.payer_pct}` }) : null, s.note].filter(Boolean).join(" · ");
    const Bevestigen = ({ tekst, knop, onJa }) => (<div className="py-3">
      <p className="text-sm">{tekst}</p>
      <div className="mt-2 flex gap-2">
        <Button disabled={bezig} onClick={onJa} className="min-h-11 flex-1 shadow-none">{knop}</Button>
        <Button variant="outline" onClick={() => setVraag(null)} className="min-h-11">{t("common.annuleren")}</Button>
      </div>
    </div>);
    return (<Sheet open onOpenChange={(o) => { if (!o) {
        setWijzig(false);
        setOpm("");
        onSluit();
    } }}>
      <SheetContent side="bottom" className="left-1/2 max-h-[90dvh] w-full max-w-md -translate-x-1/2 overflow-y-auto rounded-t-2xl bg-background px-5 pb-[max(2.5rem,calc(env(safe-area-inset-bottom,0px)+1.5rem))] pt-4">
        <SheetHeader className="pr-8 text-left">
          <SheetTitle className="font-display text-2xl font-medium">{kost.omschrijving}</SheetTitle>
          <SheetDescription className="text-xs">{kindLabel(kost.kind)} · {toonDatumTekst(kost.datum)} · {kost.betaaldDoor === "ik" ? t("routes.kosten.detail.betaaldDoorJou") : t("routes.kosten.detail.betaaldDoorAnder")}{kost.bron === "kindrekening" ? ` · ${t("routes.kosten.rij.kindrekening")}` : ""}</SheetDescription>
        </SheetHeader>
        <div className="mt-3 flex items-baseline justify-between gap-3"><p className="font-display text-3xl">{euro(kost.bedrag)}</p><DeelLabel gedeeld={kost.gedeeld}/></div>
        <dl className="mt-4 divide-y divide-border border-y border-border text-sm">
          <div className="flex justify-between py-2.5"><dt className="text-ink-soft">{t("routes.kosten.detail.datum")}</dt><dd>{toonDatumTekst(kost.datum)}</dd></div>
          {kost.categorieGekozen ? <div className="flex justify-between py-2.5"><dt className="text-ink-soft">{t("routes.kosten.filter.categorie")}</dt><dd>{categorieLabel(kost.categorieGekozen)}</dd></div> : null}
          {kost.gedeeld && kost.bron !== "kindrekening" ? <>
          <div className="flex justify-between py-2.5"><dt className="text-ink-soft">{t("routes.kosten.detail.verdeling")}</dt><dd>{pct} / {100 - pct}</dd></div>
          <div className="flex justify-between py-2.5"><dt className="text-ink-soft">{t("routes.kosten.detail.jouwDeel")}</dt><dd className="font-semibold">{euro(kost.aandeelIk)}</dd></div>
          <div className="flex justify-between py-2.5"><dt className="text-ink-soft">{t("routes.kosten.detail.deelAnder")}</dt><dd className="font-semibold">{euro(Math.round((kost.bedrag - kost.aandeelIk) * 100) / 100)}</dd></div>
          </> : null}
          <div className="flex justify-between py-2.5"><dt className="text-ink-soft">{t("routes.kosten.filter.status")}</dt><dd>{label}</dd></div>
        </dl>

        {kost.bijlagen.length ? (<div className="mt-4"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand">{t("routes.kosten.detail.bijlagen")}</p>
            {kost.bijlagen.map((b) => <p key={b.id} className="mt-1 flex items-center gap-2 text-sm">{b.soort === "bon" ? <Receipt className="size-3.5"/> : <Paperclip className="size-3.5"/>}{b.url ? <a href={b.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline-offset-2 hover:underline">{b.naam}</a> : b.naam}<span className="text-[11px] text-ink-soft">{b.soort === "bon" ? t("lib.kostenStore.veld.bon") : t("lib.kostenStore.veld.bijlage")}</span></p>)}
          </div>) : null}

        {ikReageer ? <div className="mt-4">
          <p className="text-xs text-ink-soft">{t("routes.kosten.detail.nogGeenAkkoord")}</p>
          {laatsteVoorstel ? <p className="mt-1 text-sm"><span className="font-semibold">{t("routes.kosten.detail.voorgesteld")}</span> {voorstelTekst(laatsteVoorstel)}</p> : null}
          {kost.meerTijd?.door === "ik" ? <p className="mt-1 text-xs text-ink-soft">{t("routes.kosten.status.meerTijd")}</p> : null}
          {budgetMelding(beoordeling) ? <p className="mt-1 text-xs font-semibold text-accent-warm">{budgetMelding(beoordeling)}</p> : null}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button disabled={bezig} onClick={() => reageer("akkoord", t("routes.kosten.detail.afgesproken"))} className="min-h-11 flex-1 text-xs">{keuze.akkoord}</Button>
            <Button disabled={bezig} variant="outline" onClick={() => { setMeer(true); setWijzig(true); }} className="min-h-11 flex-1 text-xs">{keuze.ander}</Button>
            <Button disabled={bezig} variant="outline" onClick={() => reageer("niet_akkoord", nietAkkoordKostTekst())} className="min-h-11 flex-1 text-xs">{keuze.niet}</Button>
            <Button disabled={bezig} variant="outline" onClick={() => reageer("meer_tijd", t("routes.kosten.detail.meerTijdVastgelegd"))} className="min-h-11 flex-1 text-xs">{t("common.meerTijdNodig")}</Button>
          </div>
        </div> : gedekt && beoordeling?.soort === "gedekt" ? <div className="mt-3"><p className="text-xs text-ink-soft">{t("routes.kosten.detail.gedekt", { wat: beoordeling.budget.wat, sanne: beoordeling.budget.pctIk, ander: 100 - beoordeling.budget.pctIk })}</p><p className="mt-1 text-xs text-brand">{t("routes.kosten.detail.gedektToegevoegd")}</p></div> : status === "wacht" ? <p className="mt-3 text-xs text-ink-soft">{kost.meerTijd?.door === "ander" ? t("routes.kosten.detail.anderMeerTijd") : t("routes.kosten.status.wachtOpAnder")}</p> : null}

        {magWijzigen || magIntrekken || magVerwijderen || magDelen || magHerinneren ? <div className="mt-4 divide-y divide-border border-y border-border">
          {magHerinneren ? <button className={actieKnop} disabled={bezig} onClick={() => doe(() => herinnerUitgave(kost.id), t("routes.kosten.detail.herinneringVerstuurd"), false)}>{t("routes.kosten.detail.herinnering")}<Chevron className="size-4 text-ink-soft"/></button> : null}
          {magWijzigen ? (bewerk ? <KostBewerken kost={kost} onKlaar={() => setBewerk(false)}/> : <button className={actieKnop} onClick={() => setBewerk(true)}>{t("routes.kosten.detail.wijzigen")}<Chevron className="size-4 text-ink-soft"/></button>) : null}
          {magDelen ? (vraag === "delen" ? <Bevestigen tekst={t("routes.kosten.detail.delenVraag")} knop={t("routes.kosten.detail.delen")} onJa={() => doe(() => deelUitgave(kost.id, { anderId: delen.anderId ?? undefined }), t("routes.kosten.detail.gedeeldMelding"))}/> : <button className={actieKnop} onClick={() => setVraag("delen")}>{t("routes.kosten.detail.delen")}<Chevron className="size-4 text-ink-soft"/></button>) : null}
          {magIntrekken ? (vraag === "intrekken" ? <Bevestigen tekst={t("routes.kosten.detail.intrekkenVraag")} knop={t("routes.kosten.detail.intrekken")} onJa={() => doe(() => trekUitgaveIn(kost.id), t("routes.kosten.detail.ingetrokken"))}/> : <button className={actieKnop} onClick={() => setVraag("intrekken")}>{t("routes.kosten.detail.intrekken")}<Chevron className="size-4 text-ink-soft"/></button>) : null}
          {magVerwijderen ? (vraag === "verwijderen" ? <Bevestigen tekst={t("routes.kosten.detail.verwijderenVraag")} knop={t("common.verwijderen")} onJa={() => doe(() => verwijderUitgave(kost.id), t("routes.kosten.detail.verwijderd"))}/> : <button className={`${actieKnop} text-accent-warm`} onClick={() => setVraag("verwijderen")}>{t("common.verwijderen")}<Chevron className="size-4 text-ink-soft"/></button>) : null}
        </div> : null}

        <Button variant="ghost" aria-expanded={meer} onClick={() => setMeer((v) => !v)} className="mt-4 min-h-12 w-full justify-between rounded-full border border-border bg-card px-5 text-sm font-semibold text-brand hover:bg-brand-soft">{meer ? t("routes.kosten.nieuw.minderOpties") : t("routes.kosten.nieuw.meerOpties")} <Chevron richting="omlaag" open={meer} className="size-4 text-ink-soft"/></Button>
        {meer ? <>

        {kost.opmerkingen.length ? (<div className="mt-4"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand">{t("routes.kosten.detail.opmerkingen")}</p>
            {kost.opmerkingen.map((o) => <p key={o.id} className="mt-1 text-sm">{o.tekst}<span className="ml-1 text-[11px] text-ink-soft">· {o.door === "ik" ? t("common.jij") : t("routes.kosten.nieuw.andereOuder")}</span></p>)}
          </div>) : null}

        <div className="mt-5 divide-y divide-border border-y border-border">
          {/* Geen losse betaling per uitgave: betalen gaat altijd via de gezamenlijke afrekening. */}
          {open && kost.gedeeld ? <button className={actieKnop} onClick={onVerrekenen}>{t("routes.kosten.detail.bekijkAfrekening")}<Chevron className="size-4 text-ink-soft"/></button> : null}
          <BestandKnop label={t("routes.kosten.detail.bonToevoegen")} icoon={Receipt} accept="image/*,application/pdf" onKies={async (b) => { if (await voegBijlageToe(kost.id, b.data, b.naam, "bon"))
            bevestig(t("routes.kosten.detail.bijlageOpgeslagen")); }}/>
          <BestandKnop label={t("routes.kosten.bon.andereBijlage")} icoon={Paperclip} accept="image/*,application/pdf" onKies={async (b) => { if (await voegBijlageToe(kost.id, b.data, b.naam, "bijlage"))
            bevestig(t("routes.kosten.detail.bijlageOpgeslagen")); }}/>
          <div className="py-3">
            <div className="flex gap-2">
              <input value={opm} onChange={(e) => setOpm(e.target.value)} maxLength={1000} placeholder={t("routes.kosten.detail.opmerkingToevoegen")} aria-label={t("routes.kosten.detail.opmerking")} className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"/>
              <button disabled={!opm.trim() || bezig} onClick={async () => { setBezig(true); const ok = await voegOpmerkingToe(kost.id, opm.trim()); setBezig(false); if (ok)
            setOpm(""); }} className="min-h-11 shrink-0 rounded-full border border-border px-4 text-xs font-semibold disabled:opacity-40">{t("routes.kosten.detail.plaats")}</button>
            </div>
          </div>
          {kost.gedeeld && !magWijzigen && status !== "verrekend" && status !== "betwist" && status !== "ingetrokken" && kost.bron !== "kindrekening" ? (!wijzig ? (<button className={actieKnop} onClick={() => setWijzig(true)}>{t("routes.kosten.detail.foutMelden")}<Chevron className="size-4 text-ink-soft"/></button>) : (<div className="py-3">
              <p className="text-xs text-ink-soft">{t("routes.kosten.detail.pasNaAkkoord")}</p>
              <div className="mt-2 flex gap-2">
                <GeldInvoer value={nieuwBedrag} onChange={setNieuwBedrag} label={t("routes.kosten.detail.nieuwBedrag")} className="flex-1"/>
                <input value={nieuweVerdeling} onChange={(e) => setNieuweVerdeling(e.target.value)} placeholder={t("routes.kosten.detail.verdelingPlaceholder")} aria-label={t("routes.kosten.detail.andereVerdeling")} className="w-28 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"/>
                <Button size="sm" disabled={bezig} onClick={async () => {
                const n = leesGeld(nieuwBedrag) ?? 0;
                const vd = nieuweVerdeling.trim();
                const mijnPct = vd ? leesVerdeling(vd) : null;
                if ((nieuwBedrag && n <= 0) || (vd && mijnPct === null) || (!(n > 0) && mijnPct === null))
                    return;
                const notitie = `${open ? t("routes.kosten.detail.correctieVoorgesteld") : t("common.anderVoorstel")}:${n > 0 ? ` ${t("routes.kosten.detail.notitieBedrag", { bedrag: euro(n) })}` : ""}${vd ? ` ${t("routes.kosten.detail.notitieVerdeling", { verdeling: `${mijnPct} / ${100 - mijnPct}` })}` : ""}`;
                setBezig(true);
                // Alleen wie aan zet is doet een ander voorstel; anders (of na akkoord) blijft het een correctie-opmerking en gelden de bedragen.
                const gelukt = ikReageer
                    ? await reageerOpKost(kost.id, "ander_voorstel", { ...(n > 0 ? { amount: n } : {}), ...(mijnPct !== null ? { payer_pct: kost.betaaldDoor === "ik" ? mijnPct : 100 - mijnPct } : {}) })
                    : await voegOpmerkingToe(kost.id, notitie);
                setBezig(false);
                if (!gelukt)
                    return;
                setWijzig(false);
                setNieuwBedrag("");
                setNieuweVerdeling("");
                bevestig(ikReageer ? tegenvoorstelVerstuurdTekst() : t("routes.kosten.detail.correctieVastgelegd"));
                onSluit();
            }}>{t("routes.kosten.budgetten.voorstellen")}</Button>
              </div>
            </div>)) : null}
          <div className="flex items-center justify-between py-3 text-sm font-semibold">{t("routes.kosten.detail.geschiedenis")}<GeschiedenisKnop soort="kosten" itemId={kost.id} naam={kost.omschrijving}/></div>
        </div>
        </> : null}
      </SheetContent>
    </Sheet>);
}
// --- Kostenafspraken: hoe jullie verdelen, wanneer jullie afrekenen en het grensbedrag ---
function EigenAfspraken({ onTerug }) {
    const { t } = useTranslation();
    const st = useStart();
    const bron = useKostenPaar();
    const a = useKostenAfspraak();
    const gekoppeld = !!bron.partnerId;
    const vanAnder = a.open && !a.open.doorIk ? a.open : null;
    const basis = a.open?.doorIk ? a.open : a.geldt;
    const [concept, setConcept] = useState({ wijze: basis.wijze, pctIk: basis.pctIk, moment: basis.moment, grens: basis.grens === null || basis.grens === undefined ? "" : bewerkGeld(basis.grens) });
    const [bezig, setBezig] = useState(false);
    const zet = (p) => setConcept((c) => ({ ...c, ...p }));
    const keuze = (actief) => `flex w-full min-h-11 items-start gap-3 py-2.5 text-left text-sm ${actief ? "font-semibold text-brand" : ""}`;
    const grens = concept.grens.trim() ? leesGeld(concept.grens) : null;
    const grensGeldig = !concept.grens.trim() || (grens !== null && grens >= 0);
    const samenvatting = (x) => `${x.wijze === "eigen" ? `${x.pctIk} / ${100 - x.pctIk}` : kostenWijzen.find((w) => w.id === x.wijze)?.naam}${x.wijze !== "alleen" ? ` · ${t("routes.kosten.eigen.afrekenen", { moment: kostenMomenten.find((m) => m.id === x.moment)?.naam.toLowerCase() })}` : ""}${x.grens !== null && x.grens !== undefined ? ` · ${t("routes.kosten.eigen.grensKort", { grens: euro(x.grens) })}` : ""}`;
    const opslaan = async () => {
        if (!grensGeldig)
            return;
        setBezig(true);
        const gelukt = await zetKostenAfspraak({ wijze: concept.wijze, pctIk: concept.pctIk, moment: concept.moment, grens });
        setBezig(false);
        if (gelukt) {
            bevestig(gekoppeld ? t("routes.kosten.eigen.voorgelegd") : t("routes.kosten.eigen.opgeslagen"));
            onTerug();
        }
    };
    const antwoord = async (r) => {
        setBezig(true);
        const gelukt = await reageerOpAfspraak(r);
        setBezig(false);
        if (gelukt)
            bevestig(r === "akkoord" ? t("routes.kosten.eigen.bevestigdMelding") : t("routes.kosten.eigen.afgewezenMelding"));
    };
    return (<AppShell>
      <div className="flex items-start gap-3">
        <TerugKnop onClick={onTerug}/>
        <div>
          <h1 className="lora text-[30px] leading-tight">{t("routes.kosten.eigen.afspraken")}</h1>
          <p className="mt-1 text-sm text-ink-soft">{gekoppeld ? t("routes.kosten.eigen.samenIntro") : t("routes.kosten.eigen.vrijblijvend")}</p>
        </div>
      </div>
      {a.huidig ? <p className="mt-4 text-sm"><span className="font-semibold">{a.bevestigd ? t("routes.kosten.eigen.bevestigd") : t("routes.kosten.eigen.voorlopigKop")}</span> <span className="text-ink-soft">{samenvatting(a.huidig)}</span></p> : null}
      {vanAnder ? <section className="mt-4 rounded-[22px] border border-white/85 bg-white/60 px-4 py-3">
        <p className="text-sm font-black">{t("routes.kosten.eigen.voorstelVanAnder")}</p>
        <p className="mt-1 text-sm text-ink-soft">{samenvatting(vanAnder)}</p>
        <div className="mt-3 flex gap-2">
          <Button disabled={bezig} onClick={() => antwoord("akkoord")} className="min-h-11 flex-1 text-xs">{t("common.akkoord")}</Button>
          <Button disabled={bezig} variant="outline" onClick={() => antwoord("niet_akkoord")} className="min-h-11 flex-1 text-xs">{t("common.nietAkkoord")}</Button>
        </div>
        <p className="mt-2 text-xs text-ink-soft">{t("routes.kosten.eigen.anderVoorstelUitleg")}</p>
      </section> : a.open?.doorIk ? <p className="mt-4 flex items-center gap-1.5 text-sm text-ink-soft"><Clock aria-hidden="true" strokeWidth={2} className="size-4"/>{t("routes.kosten.eigen.wachtOpAnder")}</p> : null}
      <section className="mt-5">
        <h2 className="font-display text-lg font-bold">{t("routes.kosten.eigen.hoeVerdelen")}</h2>
        <div className="mt-2 divide-y divide-border border-y border-border">
          {kostenWijzen.map((w) => (<label key={w.id} className={keuze(concept.wijze === w.id)}>
              <input type="radio" name="wijze" checked={concept.wijze === w.id} onChange={() => zet({ wijze: w.id })} className="mt-1 size-4 accent-[var(--color-brand)]"/>
              <span>{w.naam}<span className="block text-xs font-normal text-ink-soft">{w.uitleg}</span></span>
            </label>))}
        </div>
        {concept.wijze === "eigen" ? (<div className="mt-3 flex items-center gap-2 text-sm">
            <span className="text-ink-soft">{st.naam || t("common.jij")}</span>
            <input type="number" min={0} max={100} aria-label={t("routes.kosten.eigen.jouwPercentage")} value={concept.pctIk} onChange={(e) => zet({ pctIk: Math.min(100, Math.max(0, Number(e.target.value))) })} className="w-16 rounded-md border border-border bg-card px-2 py-1 text-sm"/>
            <span className="text-ink-soft">{t("routes.kosten.eigen.andereOuderPct", { pct: 100 - concept.pctIk })}</span>
          </div>) : null}
      </section>
      {concept.wijze !== "alleen" ? (<section className="mt-6">
          <h2 className="font-display text-lg font-bold">{t("routes.kosten.instellingen.wanneer")}</h2>
          <div className="mt-2 divide-y divide-border border-y border-border">
            {kostenMomenten.map((m) => (<label key={m.id} className={keuze(concept.moment === m.id)}>
                <input type="radio" name="moment" checked={concept.moment === m.id} onChange={() => zet({ moment: m.id })} className="mt-1 size-4 accent-[var(--color-brand)]"/>
                <span>{m.naam}</span>
              </label>))}
          </div>
        </section>) : null}
      {concept.wijze !== "alleen" ? (<section className="mt-6">
          <h2 className="font-display text-lg font-bold">{t("routes.kosten.eigen.grens")}</h2>
          <p className="mt-1 text-xs text-ink-soft">{t("routes.kosten.eigen.grensUitleg")}</p>
          <GeldInvoer value={concept.grens} onChange={(g) => zet({ grens: g })} label={t("routes.kosten.eigen.grens")} placeholder={t("routes.kosten.eigen.grensLeeg")} className="mt-2"/>
        </section>) : null}
      <p className="mt-5 text-xs text-ink-soft">{gekoppeld ? t("routes.kosten.eigen.plan") : t("routes.kosten.eigen.naKoppelen")}</p>
      <Button disabled={bezig || !grensGeldig} onClick={opslaan} className="mt-4 min-h-11 w-full shadow-none">{gekoppeld ? t("routes.kosten.eigen.voorleggen") : t("common.klaar")}</Button>
    </AppShell>);
}
const RUST_SLEUTEL = "kosten-rust-v1";
function leesRust() {
    try {
        const r = localStorage.getItem(RUST_SLEUTEL);
        if (r) {
            const p = JSON.parse(r);
            return { open: p.open ?? {} };
        }
    }
    catch { /* standaard rustig */ }
    return { open: {} };
}
/** Ingeklapt onderdeel: alleen titel, aantal en een korte regel; inhoud pas na tikken. */
function Klap({ id, titel, sub, rechts, open, wissel, children }) {
    return (<section aria-labelledby={`klap-${id}`} className="mt-3 rounded-[22px] border border-white/85 bg-white/60 px-4 py-3.5">
      <button type="button" id={`klap-${id}`} onClick={wissel} aria-expanded={open} className="flex w-full items-center gap-3 text-left">
        <span className="min-w-0 flex-1"><span className="block font-display text-[18px] font-black">{titel}</span>{sub && !open ? <span className="mt-0.5 block truncate text-sm text-ink-soft">{sub}</span> : null}</span>
        {rechts}
        <Chevron richting="omlaag" open={open} className="size-5 text-ink-soft duration-200"/>
      </button>
      {open ? <div className="mt-3">{children}</div> : null}
    </section>);
}
