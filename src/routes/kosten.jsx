import { Afrekenen } from "@/components/Afrekenen";
import { GeldInvoer } from "@/components/GeldInvoer";
import { bewerkGeld, leesGeld } from "@/lib/geld-invoer";
import { Trans, useTranslation } from "react-i18next";
import i18n, { taalLocale } from "@/i18n";
import { zichtbareKostenActies } from "@/lib/kosten-overzicht";
import { Assistent } from "@/components/Assistent";
import { NIET_AKKOORD_STATUS, aanZetBij, beoordeelKosten, budgetMelding, isGedekt, nietAkkoordKostTekst, tegenvoorstelVerstuurdTekst, toonDatumTekst, wachtOpJouwAkkoord } from "@/lib/kosten-akkoord";
import { useKeuzeTeksten } from "@/components/RustigTip";
import { VasteLasten } from "@/components/VasteLasten";
import { GeschiedenisKnop } from "@/components/Geschiedenis";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Camera, Clock, Paperclip, Receipt, X } from "lucide-react";
import { Chevron, MetChevron, Vinkje } from "@/components/Tekens";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { koppelUitgave, useBudgetten } from "@/lib/budget-store";
import { bevestig } from "@/lib/feedback";
import { AppShell, BackButton, TerugKnop } from "@/components/AppShell";
import { AppIcon, Pictogram } from "@/components/AppIcon";
import { BonScanner } from "@/components/BonScanner";
import { BudgetVoorstel } from "@/components/BudgetVoorstel";
import { Badge } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { EigenLeeg } from "@/components/EigenLeeg";
import { KindPil, KostenTabs, kindLabel } from "@/components/KostenTabs";
import { ContextToevoegen } from "@/components/ContextToevoegen";
import { HandCoins, ListPlus, PiggyBank, ReceiptText } from "lucide-react";
import { useStart, start as startActie, kostenWijzen, kostenMomenten, standaardPct } from "@/lib/start-store";
import { kinderen } from "@/lib/demo-data";
import { setKosten, useKosten, useVerrekenInstellingen, setSleutel, setModus, setOntvangerBevestigt, reageerOpVerrekening, voegBijlageToe, voegOpmerkingToe, useKostExtra, heeftBijlagen, } from "@/lib/kosten-store";
import { DEMO_VANDAAG } from "@/lib/slimme-hulp";
import { Zichtbaar } from "@/components/Zichtbaar";
import { afrekenWeergave, verrekeningStatus, berekenSaldo, categorieLabel, sleutelVoor, statusLabel, } from "@/lib/verrekening";
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
function KostenPagina() {
    const { t } = useTranslation();
    const [scherm, setScherm] = useState("overzicht");
    const [berekeningTerug, setBerekeningTerug] = useState("overzicht");
    const [periode, setPeriode] = useState("maand");
    const { uitgave, kind: voorKind, budget, benodigdheid, bronItem, bron: zoekBron } = Route.useSearch();
    const [nieuwOpen, setNieuwOpen] = useState(!!uitgave);
    const [vanBudget, setVanBudget] = useState(null);
    const [detailId, setDetailId] = useState(null);
    const alle = useKosten();
    const { sleutels, modus, ontvangerBevestigt, historie } = useVerrekenInstellingen();
    const saldo = berekenSaldo(alle);
    const netto = saldo.netto; // positief: Joris → Sanne
    const weergave = afrekenWeergave(modus, DEMO_VANDAAG);
    // Alleen wat op jou (Sanne) wacht: een kost die Sanne zelf invoerde wacht op Joris.
    const budgetten = useBudgetten();
    const beoordeling = beoordeelKosten(alle, budgetten, DEMO_VANDAAG);
    const opJou = alle.filter((k) => wachtOpJouwAkkoord(k, beoordeling.get(k.id)));
    const gedekt = alle.filter((k) => isGedekt(k, beoordeling.get(k.id)));
    const keuze = useKeuzeTeksten();
    const [wijzigStart, setWijzigStart] = useState(false);
    const afspraken = budgetten.filter((v) => v.status === "akkoord" || v.status === "uitgegeven");
    const [toonBudgetten, setToonBudgetten] = useState(true);
    const [voorstelKey, setVoorstelKey] = useState(0);
    const [toonAlle, setToonAlle] = useState(false);
    const [alleActies, setAlleActies] = useState(false);
    const [budgetDetail, setBudgetDetail] = useState(budget && budget !== "nieuw" ? budget : null);
    const [manier, setManier] = useState(undefined);
    const [betaalStart, setBetaalStart] = useState(false);
    const navigeer = useNavigate();
    const [rust, setRust] = useState({ toonBedrag: false, open: {} });
    useEffect(() => { setRust(leesRust()); }, []);
    const zetRust = (r) => { setRust(r); try {
        localStorage.setItem(RUST_SLEUTEL, JSON.stringify(r));
    }
    catch { /* alleen deze sessie */ } };
    const klap = (id) => zetRust({ ...rust, open: { ...rust.open, [id]: !rust.open[id] } });
    const maandVan = (k) => k.datum.split(" ").slice(1).join(" ");
    const dezeMaand = alle[0] ? maandVan(alle[0]) : "";
    const uitgavenDezeMaand = alle.filter((k) => maandVan(k) === dezeMaand);
    // Eigen gezin: begin leeg in plaats van met het voorbeeldgezin.
    const startSt = useStart();
    if (startSt.eigen)
        return (<>
        <EigenKosten st={startSt} onNieuw={() => setNieuwOpen(true)}/>
        {budget === "nieuw" ? <p className="mx-auto max-w-md px-5 py-3 text-sm text-ink-soft">{t("routes.kosten.eigenBudgetNietMogelijk")}</p> : null}
        {nieuwOpen ? <NieuweUitgave eigen={startSt} sleutels={sleutels} voorinvul={uitgave} voorKind={voorKind} onSluit={() => setNieuwOpen(false)}/> : null}
      </>);
    if (scherm === "berekening")
        return <BerekeningScherm saldo={saldo} onTerug={() => { setScherm(berekeningTerug); setBerekeningTerug("overzicht"); }}/>;
    if (scherm === "verrekenen")
        return (<Afrekenen periode={periode} startVerzoek={betaalStart} onTerug={() => { setBetaalStart(false); setScherm("overzicht"); }} onBerekening={() => { setBerekeningTerug("verrekenen"); setScherm("berekening"); }}/>);
    if (scherm === "instellingen")
        return (<InstellingenScherm sleutels={sleutels} modus={modus} ontvangerBevestigt={ontvangerBevestigt} onTerug={() => setScherm("overzicht")}/>);
    if (scherm === "historie")
        return <HistorieScherm historie={historie} onTerug={() => setScherm("overzicht")}/>;
    const openPosten = [...saldo.jorisAanSanne.posten, ...saldo.sanneAanJoris.posten].map((p) => p.post);
    const totaalOpen = openPosten.reduce((s, k) => s + k.bedrag, 0);
    const acties = [
        ...opJou.map((k) => ({ id: k.id, titel: k.omschrijving, bedrag: k.bedrag, status: t("routes.kosten.status.jouwReactie"), open: () => setDetailId(k.id) })),
    ];
    const ontvangenBudgetten = budgetten.filter((b) => b.aanZet === "Sanne" && (b.status === "wacht" || b.status === "tegenvoorstel"));
    const wachtBevestiging = historie.some((v) => v.status === "wacht-op-ontvanger");
    const opmaak = (nieuweManier) => { setManier(nieuweManier); setNieuwOpen(true); };
    return (<AppShell>
      <div className="flex items-center justify-between">
        <h1 className="lora text-[32px] leading-tight">{t("routes.kosten.titel")}</h1>
        <div className="flex items-center gap-1.5">
          <Assistent pagina="Kosten"/>
          <ContextToevoegen titel={t("routes.kosten.toevoegen.titel")} acties={[
            { titel: t("routes.kosten.toevoegen.uitgave"), uitleg: t("routes.kosten.toevoegen.uitgaveUitleg"), icoon: ReceiptText, onKies: () => opmaak() },
            { titel: t("routes.kosten.toevoegen.budget"), uitleg: t("routes.kosten.toevoegen.budgetUitleg"), icoon: PiggyBank, onKies: () => { setToonBudgetten(true); setVoorstelKey((k) => k + 1); } },
            { titel: t("routes.kosten.toevoegen.betaalverzoek"), uitleg: t("routes.kosten.toevoegen.betaalverzoekUitleg"), icoon: HandCoins, onKies: () => { setBetaalStart(true); setScherm("verrekenen"); } },
            { titel: t("routes.kosten.toevoegen.nogNodig"), uitleg: t("routes.kosten.toevoegen.nogNodigUitleg"), apart: t("routes.kosten.toevoegen.nogNietGekocht"), icoon: ListPlus, onKies: () => navigeer({ to: "/boodschappen" }) },
        ]}/>
        </div>
      </div>
      <KostenTabs actief="uitgaven"/>
      <Zichtbaar voor="samen" className="mt-2.5"/>

      <div className="mt-2 animate-in fade-in duration-300">
          {/* Rustige weergave (advies mediator): bedragen verborgen tot je ze zelf opent, onderdelen ingeklapt. Keuzes blijven op dit apparaat. */}
          <section aria-label={t("routes.kosten.saldo.titel")} className="mt-4 rounded-[26px] border-2 border-[#A9BCA8] px-5 pb-4 pt-4" style={{ background: "linear-gradient(135deg, rgba(220,230,210,.9), rgba(233,239,227,.85))" }}>
            <p className="text-[12.5px] font-extrabold uppercase tracking-[0.1em] text-brand">{t("routes.kosten.saldo.titel")}</p>
            {saldo.aantalPosten === 0 || Math.abs(netto) < 0.01 ? (<p className="mt-1 text-[17px] font-black text-[#2F4A3A]">{wachtBevestiging ? t("routes.kosten.saldo.wachtJoris") : t("routes.kosten.saldo.allesVerrekend")}</p>) : rust.toonBedrag ? (<>
                <p className="mt-1 text-[15px] font-extrabold text-[#2F4A3A]">{netto > 0 ? t("routes.kosten.saldo.jorisBetaaltJou") : t("routes.kosten.saldo.jijBetaaltJoris")}</p>
                <p className="font-display text-[36px] font-black leading-none tabular-nums">{euro(Math.abs(netto))}</p>
              </>) : (<><p className="mt-1 text-[17px] font-black text-[#2F4A3A]">{t("routes.kosten.saldo.klaar")}</p><p className="text-sm text-[#3F5747]">{t("routes.kosten.saldo.nietNu")}</p></>)}
            {weergave === "tussenstand" && Math.abs(netto) >= 0.01 && rust.toonBedrag ? <p className="mt-1 text-xs text-ink-soft">{t("routes.kosten.saldo.tussenstand")}</p> : null}
            <div className="mt-3 flex gap-2">
              {saldo.aantalPosten > 0 && Math.abs(netto) >= 0.01 ? <button onClick={() => zetRust({ ...rust, toonBedrag: !rust.toonBedrag })} className="h-11 flex-1 rounded-full border border-white/90 bg-white/80 text-[14.5px] font-black text-[#2F4A3A]">{rust.toonBedrag ? t("routes.kosten.saldo.verberg") : t("routes.kosten.saldo.toon")}</button> : null}
              {(saldo.aantalPosten > 0 && Math.abs(netto) >= 0.01 && weergave !== "tussenstand") || historie.some((v) => v.status !== "afgerond" && v.kostIds?.length) ? <Button onClick={() => setScherm("verrekenen")} className="h-11 flex-1 rounded-full text-[14.5px] font-black shadow-none">{t("routes.kosten.saldo.verrekenen")}</Button> : null}
            </div>
            {rust.toonBedrag ? <div className="mt-3 flex items-start justify-between gap-3 border-t border-[#A9BCA8]/50 pt-2.5 text-sm text-ink-soft">
              <span>{t("routes.kosten.saldo.afspraak", { jij: sleutelVoor(sleutels, "Algemeen").sanne, joris: sleutelVoor(sleutels, "Algemeen").joris })}</span>
              <button onClick={() => setScherm("instellingen")} className="shrink-0 font-extrabold text-brand">{t("common.wijzigen")}</button>
            </div> : null}
            {rust.toonBedrag ? <button onClick={() => setScherm("berekening")} className="mt-1 text-xs font-bold text-brand">{t("routes.kosten.overzicht.berekening")}</button> : null}
          </section>

          {acties.length || ontvangenBudgetten.length ? (<Klap id="wacht" titel={t("routes.kosten.wacht.titel")} rechts={<span className="grid size-8 place-items-center rounded-full bg-[#DCE3D3] text-sm font-black text-[#3F5747]">{acties.length + ontvangenBudgetten.length}</span>} sub={[...ontvangenBudgetten.map((b) => b.wat), ...acties.map((a) => a.titel)].slice(0, 3).join(", ").toLowerCase().replace(/^./, (c) => c.toUpperCase())} open={!!rust.open["wacht"]} wissel={() => klap("wacht")}>
              <div className="space-y-2">
                {ontvangenBudgetten.map((b) => <div key={b.id} className="flex items-center gap-3 rounded-[16px] bg-white px-3.5 py-2.5">
                  <span className="min-w-0 flex-1"><span className="block text-[15.5px] font-black">{b.wat}</span><span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-ink-soft">{b.kind.split(/ & /).map((n) => <KindPil key={n} naam={n}/>)}<span>{t("routes.kosten.wacht.budgetvoorstel")}</span></span></span>
                  <Button onClick={() => setBudgetDetail(b.id)} className="h-10 shrink-0 rounded-full px-4 text-sm font-black shadow-none">{t("common.bekijken")}</Button>
                </div>)}
                {zichtbareKostenActies(acties, alleActies).map((a) => {
                const k = alle.find((x) => x.id === a.id);
                return <div key={a.id} className="flex items-center gap-3 rounded-[16px] bg-white px-3.5 py-2.5">
                  <span className="min-w-0 flex-1"><span className="block text-[15.5px] font-black">{a.titel}</span><span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-ink-soft">{k ? <KindPil naam={k.kind}/> : null}<span>{k ? (k.betaaldDoor === "sanne" ? t("routes.kosten.wacht.vanJou") : t("routes.kosten.wacht.vanNaam", { naam: "Joris" })) : ""}</span></span></span>
                  <Button onClick={a.open} aria-label={t("routes.kosten.wacht.openLabel", { titel: a.titel })} className="h-10 shrink-0 rounded-full px-4 text-sm font-black shadow-none">{t("common.bekijken")}</Button>
                </div>;
            })}
              </div>
              {acties.length > 3 ? <Button variant="link" onClick={() => setAlleActies((v) => !v)} className="min-h-11 px-0">{alleActies ? t("routes.kosten.wacht.toonMinder") : t("routes.kosten.wacht.bekijkAlle")}</Button> : null}
              <p className="mt-2 text-xs text-ink-soft">{t("routes.kosten.wacht.bedragenPas")}</p>
            </Klap>) : null}

          <Klap id="budgetten" titel={t("routes.kosten.budgetten.titel")} rechts={<span className="text-sm font-bold text-ink-soft">{t("routes.kosten.budgetten.afgesproken", { aantal: afspraken.length })}</span>} open={!!rust.open["budgetten"] || budget === "nieuw" || voorstelKey > 0} wissel={() => klap("budgetten")}>
            <h3 className="text-[15px] font-black">{t("routes.kosten.budgetten.voorstellen")}</h3>
            <p className="mt-0.5 text-xs text-ink-soft">{t("routes.kosten.budgetten.nietInSaldo")}</p>
            <BudgetVoorstel key={voorstelKey} zonderKop filter="lopend" bronItem={bronItem} voorinvul={benodigdheid} voorKind={voorKind} startOpen={budget === "nieuw" || voorstelKey > 0} onUitgave={(b) => { setVanBudget(b); setNieuwOpen(true); }}/>
            <h3 className="mt-4 text-[15px] font-black">{t("routes.kosten.budgetten.afgesprokenKop")}</h3>
            <BudgetVoorstel zonderKop filter="afgesproken" onUitgave={(b) => { setVanBudget(b); setNieuwOpen(true); }}/>
            <h3 className="mt-4 text-[15px] font-black">{t("routes.kosten.budgetten.eerder")}</h3>
            <p className="mt-0.5 text-xs text-ink-soft">{t("routes.kosten.budgetten.eerderUitleg")}</p>
            <BudgetVoorstel zonderKop filter="eerder" onUitgave={(b) => { setVanBudget(b); setNieuwOpen(true); }}/>
            <Button variant="link" onClick={() => setScherm("instellingen")} className="mt-1 px-0">{t("routes.kosten.instellingen.titel")}</Button>
          </Klap>

          <Klap id="uitgaven" titel={t("routes.kosten.uitgavenMaand", { maand: toonDatumTekst(dezeMaand) })} rechts={<span className="text-sm font-bold text-ink-soft">{uitgavenDezeMaand.length}</span>} open={!!rust.open["uitgaven"]} wissel={() => klap("uitgaven")}>
            <div className="space-y-2.5">{uitgavenDezeMaand.map((k) => <KostRij key={k.id} k={k} onOpen={() => setDetailId(k.id)}/>)}</div>
            <button onClick={() => setToonAlle((o) => !o)} aria-expanded={toonAlle} className="mt-3 flex min-h-11 w-full items-center justify-between rounded-full border border-white/90 bg-white/70 px-4 text-sm font-black text-[#2F4A3A]">
              {t("routes.kosten.eerdereMaanden")} <Chevron richting="omlaag" open={toonAlle} className="size-4 text-ink-soft"/>
            </button>
            {toonAlle ? <Transacties alle={alle} historie={historie} onOpen={setDetailId}/> : null}
          </Klap>
          <VasteLasten />

          <Klap id="overzicht" titel={t("routes.kosten.overzicht.titel")} sub={t("routes.kosten.overzicht.sub")} open={!!rust.open["overzicht"]} wissel={() => klap("overzicht")}>
            <div className="divide-y divide-[#E9E1D5]">
              {[["berekening", t("routes.kosten.overzicht.berekening"), t("routes.kosten.overzicht.berekeningUitleg")], ["historie", t("routes.kosten.overzicht.historie"), t("routes.kosten.overzicht.historieUitleg")], ["instellingen", t("routes.kosten.overzicht.instellingen"), t("routes.kosten.overzicht.instellingenUitleg")]].map(([naar, titel, uitleg]) => (<button key={naar} onClick={() => setScherm(naar)} className="flex min-h-12 w-full items-center gap-3 py-2.5 text-left">
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

      {nieuwOpen ? <NieuweUitgave sleutels={sleutels} budget={vanBudget} voorinvul={uitgave} startBron={zoekBron} voorKind={voorKind} startManier={manier} onSluit={() => { setNieuwOpen(false); setVanBudget(null); setManier(undefined); }}/> : null}
      {budgetDetail ? <Sheet open onOpenChange={(o) => { if (!o)
        setBudgetDetail(null); }}><SheetContent side="bottom" className="left-1/2 max-h-[90vh] w-full max-w-md -translate-x-1/2 overflow-y-auto rounded-t-2xl bg-background px-5 pb-8 pt-4"><SheetHeader className="pr-8 text-left"><SheetTitle>{t("routes.kosten.budgetDetails.titel")}</SheetTitle><SheetDescription>{t("routes.kosten.budgetDetails.beschrijving")}</SheetDescription></SheetHeader><div className="mt-3"><BudgetVoorstel doelId={budgetDetail} onKlaar={() => setBudgetDetail(null)} onUitgave={(b) => { setBudgetDetail(null); setVanBudget(b); setNieuwOpen(true); }}/></div></SheetContent></Sheet> : null}
      <KostDetail key={detailId ?? ""} startWijzig={wijzigStart} kost={alle.find((k) => k.id === detailId) ?? null} onSluit={() => { setDetailId(null); setWijzigStart(false); }} onVerrekenen={() => { setDetailId(null); setScherm("verrekenen"); }}/>
    </AppShell>);
}
function kostStatus(k) {
    const s = k.status;
    if (s === "betaald" || s === "verrekend")
        return { label: i18n.t("routes.kosten.status.afgerekend"), toon: "klaar", afgerekend: true };
    if (s === "openstaand" || s === "bevestigd")
        return { label: i18n.t("routes.kosten.saldo.titel"), toon: "info" };
    if (s === "wacht")
        return { label: aanZetBij(k) === "sanne" ? i18n.t("routes.kosten.status.jouwReactie") : i18n.t("routes.kosten.status.wachtOpAnder"), toon: "actie" };
    return { label: statusLabel[s] ?? s, toon: "neutraal" };
}
function KostRij({ k, onOpen }) {
    const { t } = useTranslation();
    const kostenBron = useKosten();
    const budgetBron = useBudgetten();
    const gedekt = beoordeelKosten(kostenBron, budgetBron, DEMO_VANDAAG).get(k.id)?.soort === "gedekt";
    const st = gedekt ? { label: t("routes.kosten.status.binnenBudget"), toon: "klaar" } : kostStatus(k);
    const ikBetaalde = k.betaaldDoor === "sanne";
    const deelAnder = ikBetaalde ? k.bedrag - k.aandeelSanne : k.aandeelSanne;
    const deelTekst = ikBetaalde ? t("routes.kosten.rij.deelNaam", { naam: "Joris", bedrag: euro(deelAnder) }) : t("routes.kosten.rij.jouwDeel", { bedrag: euro(deelAnder) });
    const vanKindrekening = k.verdeling === "Kindrekening";
    return (<div id={`item-${k.id}`} role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter")
        onOpen(); }} className="zoekdoel cursor-pointer rounded-[22px] border border-white/85 bg-white/60 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex min-w-0 items-center gap-1 text-[17px] font-black"><span className="truncate">{k.omschrijving}</span>{heeftBijlagen(k.id) ? <Paperclip className="size-3.5 shrink-0 text-ink-soft" aria-label={t("routes.kosten.rij.metBijlage")}/> : null}</p>
        <p className="shrink-0 text-[17px] font-black tabular-nums">{euro(k.bedrag)}</p>
      </div>
      <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-ink-soft"><KindPil naam={k.kind}/><span>{ikBetaalde ? t("common.jij") : "Joris"}{k.verdeling === "Kindrekening" ? ` · ${t("routes.kosten.rij.kindrekening")}` : ""} · {categorieLabel(k.categorie)} · {toonDatumTekst(k.datum)}</span></p>
      <p className={`mt-1.5 text-sm font-extrabold ${st.toon === "klaar" ? "text-brand" : st.toon === "actie" ? "text-[#7A5E44]" : "text-ink-soft"}`}>{st.toon === "klaar" ? <Vinkje className="mr-1 inline size-4 align-[-3px]"/> : st.toon === "actie" ? <Clock aria-hidden="true" strokeWidth={2} className="mr-1 inline size-4 align-[-3px]"/> : null}{vanKindrekening ? (heeftBijlagen(k.id) ? t("routes.kosten.rij.vanKindrekeningBon") : t("routes.kosten.rij.vanKindrekeningGeenBon")) : <>{st.label}{st.afgerekend ? "" : ` · ${deelTekst}`}</>}</p>
    </div>);
}
function Transacties({ alle, historie, onOpen }) {
    const { t } = useTranslation();
    const [kind, setKind] = useState("Alle");
    const [cat, setCat] = useState("Alle");
    const [status, setStatus] = useState("Alle");
    const [periode, setPeriode] = useState("Alle");
    const maanden = [...new Set(alle.map((k) => k.datum.split(" ").slice(1).join(" ")).filter(Boolean))];
    const lijst = alle.filter((k) => (kind === "Alle" || k.kind === kind) &&
        (cat === "Alle" || k.categorie === cat) &&
        (status === "Alle" || kostStatus(k).label === status) &&
        (periode === "Alle" || k.datum.endsWith(periode)));
    // "Alle" en de opties blijven bronwaarden voor het filter; alleen de weergave wordt vertaald.
    const Kies = ({ label, waarde, opties, onChange, toon = (o) => o }) => (<label className="flex flex-col gap-1 text-[11px] font-semibold text-ink-soft">{label}
      <select value={waarde} onChange={(e) => onChange(e.target.value)} className="min-h-10 rounded-md border border-border bg-card px-2 text-sm font-normal text-ink">
        {["Alle", ...opties].map((o) => <option key={o} value={o}>{o === "Alle" ? t("routes.kosten.filter.alle") : toon(o)}</option>)}
      </select>
    </label>);
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
      <h2 className="mt-6 font-display text-lg font-bold">{t("routes.kosten.afrekeningenBetalingen")}</h2>
      <div className="mt-2 divide-y divide-border border-y border-border">
        {historie.map((v) => (<div key={v.id} className="flex items-center gap-3 py-3">
            <AppIcon functie="portemonnee" maat="sm"/>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{v.maand}</p>
              <p className="text-xs text-ink-soft">{toonDatumTekst(v.datum)} · {v.wijze}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold tabular-nums">{euro(v.bedrag)}</p>
              <Badge toon={v.status === "afgerond" ? "klaar" : "actie"} className="mt-1">{verrekeningStatus(v.status)}</Badge>
            </div>
          </div>))}
      </div>
      <p className="mt-3 text-xs text-ink-soft">{t("routes.kosten.betalenNogNiet")}</p>
    </div>);
}
// --- Berekening: exact zichtbaar hoe het saldo is opgebouwd ---
function BerekeningScherm({ saldo, onTerug }) {
    const { t } = useTranslation();
    const posten = [...saldo.jorisAanSanne.posten, ...saldo.sanneAanJoris.posten].map((p) => p.post);
    const totaal = posten.reduce((n, k) => n + k.bedrag, 0);
    const jouw = posten.reduce((n, k) => n + k.aandeelSanne, 0);
    return (<AppShell>
      <div className="flex items-start gap-3">
        <TerugKnop onClick={onTerug}/>
        <div>
          <h1 className="lora text-[30px] leading-tight">{t("routes.kosten.berekening.titel")}</h1>
          <p className="mt-1 text-sm text-ink-soft">{t("routes.kosten.berekening.intro")}</p>
        </div>
      </div>

      <dl className="mt-5 divide-y divide-border border-y border-border text-sm">
        {[[t("routes.kosten.berekening.totaal"), totaal], [t("routes.kosten.berekening.jouwAandeel"), jouw], [t("routes.kosten.berekening.aandeelNaam", { naam: "Joris" }), totaal - jouw], [t("routes.kosten.berekening.voorgeschotenJou"), posten.filter((k) => k.betaaldDoor === "sanne").reduce((n, k) => n + k.bedrag, 0)], [t("routes.kosten.berekening.voorgeschotenNaam", { naam: "Joris" }), posten.filter((k) => k.betaaldDoor !== "sanne").reduce((n, k) => n + k.bedrag, 0)]].map(([label, bedrag]) => <div key={label} className="flex justify-between gap-3 py-2.5"><dt className="text-ink-soft">{label}</dt><dd className="font-semibold">{euro(Number(bedrag))}</dd></div>)}
      </dl>

      <section className="mt-5">
        <h2 className="font-display text-lg font-bold">{t("routes.kosten.berekening.teBetalen", { van: "Joris", aan: "Sanne" })}</h2>
        <ul className="mt-2 divide-y divide-border">
          {saldo.jorisAanSanne.posten.map(({ post, aandeel }) => (<li key={post.id} className="flex items-center justify-between py-2.5 text-sm">
              <span className="flex items-center gap-2"><Pictogram waarde={post.icoon} maat="sm" vorm="kaal"/>{post.omschrijving}</span>
              <span className="font-semibold">{euro(aandeel)}</span>
            </li>))}
        </ul>
        <p className="border-t border-border pt-2.5 text-right text-sm font-bold">{t("routes.kosten.berekening.totaalBedrag", { bedrag: euro(saldo.jorisAanSanne.totaal) })}</p>
      </section>

      <section className="mt-6">
        <h2 className="font-display text-lg font-bold">{t("routes.kosten.berekening.teBetalen", { van: "Sanne", aan: "Joris" })}</h2>
        <ul className="mt-2 divide-y divide-border">
          {saldo.sanneAanJoris.posten.map(({ post, aandeel }) => (<li key={post.id} className="flex items-center justify-between py-2.5 text-sm">
              <span className="flex items-center gap-2"><Pictogram waarde={post.icoon} maat="sm" vorm="kaal"/>{post.omschrijving}</span>
              <span className="font-semibold">{euro(aandeel)}</span>
            </li>))}
        </ul>
        <p className="border-t border-border pt-2.5 text-right text-sm font-bold">{t("routes.kosten.berekening.totaalBedrag", { bedrag: euro(saldo.sanneAanJoris.totaal) })}</p>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-card p-5 text-center">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-brand uppercase">{t("routes.kosten.berekening.naVerrekening")}</p>
        <p className="mt-2 text-sm text-ink-soft">
          {euro(saldo.jorisAanSanne.totaal)} − {euro(saldo.sanneAanJoris.totaal)}
        </p>
        <p className="mt-1 font-display text-2xl font-extrabold text-accent-warm">
          {saldo.netto >= 0 ? "Joris → Sanne" : "Sanne → Joris"}: {euro(Math.abs(saldo.netto))}
        </p>
      </section>
    </AppShell>);
}
// --- Instellingen: verdeelsleutels, modus, ontvangerbevestiging ---
function InstellingenScherm({ sleutels, modus, ontvangerBevestigt, onTerug, }) {
    const { t } = useTranslation();
    return (<AppShell>
      <div className="flex items-start gap-3">
        <TerugKnop onClick={onTerug}/>
        <div>
          <h1 className="lora text-[30px] leading-tight">{t("routes.kosten.instellingen.titel")}</h1>
          <p className="mt-1 text-sm text-ink-soft">{t("routes.kosten.instellingen.intro")}</p>
        </div>
      </div>

      <section className="mt-5">
        <h2 className="font-display text-lg font-bold">{t("routes.kosten.instellingen.standaard")}</h2>
        <p className="text-xs text-ink-soft">{t("routes.kosten.instellingen.standaardUitleg")}</p>
        <div className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
          {Object.entries(sleutels).map(([cat, s]) => (<div key={cat} className="flex items-center justify-between px-4 py-3">
              <p className="text-sm font-semibold">{categorieLabel(cat)}</p>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-ink-soft">Sanne</span>
                <select value={s.sanne} onChange={(e) => setSleutel(cat, Number(e.target.value))} className="rounded-md border border-border bg-background px-2 py-1 text-sm">
                  {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((p) => (<option key={p} value={p}>{p}%</option>))}
                </select>
                <span className="text-ink-soft">/ Joris {s.joris}%</span>
              </div>
            </div>))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="font-display text-lg font-bold">{t("routes.kosten.instellingen.wanneer")}</h2>
        <p className="mt-2 text-sm text-ink-soft">{t("routes.kosten.instellingen.wanneerUitleg")}</p>
        <div className="mt-3 space-y-2 rounded-lg border border-border bg-card p-4">
          {[
            ["direct", t("routes.kosten.instellingen.modus.direct")],
            ["maandelijks", t("routes.kosten.instellingen.modus.maandelijks")],
            ["zelf", t("routes.kosten.instellingen.modus.zelf")],
        ].map(([m, label]) => (<label key={m} className="flex items-start gap-3 text-sm">
              <input type="radio" name="modus" checked={modus === m} onChange={() => setModus(m)} className="mt-0.5 size-4 accent-[var(--color-brand)]"/>
              {label}
            </label>))}
        </div>
      </section>

      <section className="mt-6">
        <label className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-sm">
          <input type="checkbox" checked={ontvangerBevestigt} onChange={(e) => setOntvangerBevestigt(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-brand)]"/>
          <span>
            <Trans i18nKey="routes.kosten.instellingen.ontvangerBevestigt" components={{ b: <b/> }}/>
          </span>
        </label>
      </section>
    </AppShell>);
}
// --- Historie ---
function HistorieScherm({ historie, onTerug, }) {
    const { t } = useTranslation();
    return (<AppShell>
      <div className="flex items-start gap-3">
        <TerugKnop onClick={onTerug}/>
        <div>
          <h1 className="lora text-[30px] leading-tight">{t("routes.kosten.historie.titel")}</h1>
          <p className="mt-1 text-sm text-ink-soft">{t("routes.kosten.historie.intro")}</p>
        </div>
      </div>
      <ul className="mt-5 divide-y divide-border">
        {historie.map((v) => (<li key={v.id} className="py-3.5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{v.maand}</p>
              <Badge>{verrekeningStatus(v.status)}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-soft">
              {v.bedrag === 0
                ? t("routes.kosten.historie.geenBetaling")
                : `${euro(v.bedrag)} · ${v.van === "joris" ? "Joris → Sanne" : "Sanne → Joris"} · ${v.wijze}`}
            </p>
            <p className="text-[11px] text-ink-soft/80">{toonDatumTekst(v.datum)}</p>
            {v.status === "wacht-op-ontvanger" && v.aan === "sanne" ? (<Button className="mt-2 min-h-11 shadow-none" onClick={() => { if (reageerOpVerrekening(v.id, "sanne", "ontvangen"))
                bevestig(t("routes.kosten.historie.ontvangstBevestigd")); }}>{t("routes.kosten.historie.ikHebOntvangen", { bedrag: euro(v.bedrag) })}</Button>) : null}
            {v.status === "ontvangst-bevestigd" && v.aan === "sanne" ? <Button className="mt-2" onClick={() => { if (reageerOpVerrekening(v.id, "sanne", "afronden"))
            bevestig(t("routes.kosten.historie.afgerond")); }}>{t("routes.kosten.historie.afronden")}</Button> : null}
          </li>))}
      </ul>
    </AppShell>);
}
let bewaardConcept = null;
/** Gescande bon wordt een gewone kostenpost die wacht op de andere ouder — nooit automatisch goedgekeurd. */
function bonAlsKost(b) {
    const m = b.verdeling.match(/^(\d+) \/ (\d+)$/);
    const pct = b.verdeling === "Volledig Sanne" ? 100 : b.verdeling === "Volledig Joris" ? 0 : m ? Number(m[1]) : 50;
    setKosten((l) => [{ ...l[0], id: b.id ?? String(Date.now()), omschrijving: b.omschrijving, categorie: "Bon", icoon: "bon", kind: b.kind, datum: b.datum ?? "12 maart", bedrag: b.bedrag, betaaldDoor: "sanne", verdeling: `${pct} / ${100 - pct}`, aandeelSanne: Math.round(b.bedrag * pct) / 100, status: "wacht" }, ...l]);
    bevestig(i18n.t("routes.kosten.melding.opgeslagen"), { uitleg: i18n.t("routes.kosten.saldo.wachtJoris") });
}
function NieuweUitgave({ sleutels, budget: startBudget, voorinvul, voorKind, onSluit, eigen, startManier, startBron, }) {
    const { t } = useTranslation();
    const budgetten = useBudgetten();
    const bronKosten = useKosten();
    const [budget, setBudget] = useState(startBudget ?? null);
    const ikNaam = eigen ? eigen.naam || t("common.jij") : "Sanne";
    const anderNaam = eigen ? t("routes.kosten.nieuw.andereOuder") : "Joris";
    const eigenPct = eigen ? standaardPct(eigen.kostenAfspraak) : 50;
    const kindKeuzes = eigen ? [...eigen.kinderen.map((k) => k.naam), ...(eigen.kinderen.length > 1 ? ["Alle kinderen"] : []), "Gezin/algemeen"] : [...kinderen.map((k) => k.naam), "Beide kinderen", "Gezin/algemeen"];
    // Uit een bericht: bedrag alleen voorstellen als er een herkenbaar €-bedrag in staat; gebruiker controleert altijd.
    const bedragUitTekst = voorinvul?.match(/€\s?(\d+(?:[.,]\d{1,2})?)/)?.[1] ?? "";
    const start = !budget && !voorinvul && !eigen ? bewaardConcept : null;
    const [omschrijving, setOmschrijving] = useState(start?.omschrijving ?? budget?.wat ?? voorinvul?.replace(/€\s?\d+(?:[.,]\d{1,2})?/, "").replace(/\s+/g, " ").trim().slice(0, 60) ?? "");
    const [bedragTekst, setBedragTekst] = useState(start?.bedragTekst ?? (budget ? bewerkGeld(budget.max) : bedragUitTekst));
    const [betaaldDoor, setBetaaldDoor] = useState(start?.betaaldDoor ?? "sanne");
    const [kind, setKind] = useState(start?.kind ?? (budget ? (budget.kind.includes("&") ? "Beide kinderen" : budget.kind) : voorKind === "Allebei" ? "Beide kinderen" : voorKind ?? (eigen ? kindKeuzes[0] : "Emma")));
    const [categorie, setCategorie] = useState(start?.categorie ?? "School");
    const [manier, setManier] = useState(startManier ?? "hand");
    const [datum, setDatum] = useState(new Date().toLocaleDateString("sv-SE"));
    const [toelichting, setToelichting] = useState("");
    const [meer, setMeer] = useState(false);
    const [vraagSluiten, setVraagSluiten] = useState(false);
    const [verdeling, setVerdeling] = useState(budget ? (budget.pctSanne === 50 ? "50" : "anders") : eigen?.kostenAfspraak.wijze === "per-uitgave" ? "50" : "standaard");
    const [pctSanne, setPctSanne] = useState(budget?.pctSanne ?? 60);
    const [bon, setBon] = useState("");
    // Betaald van: eigen rekening (daarna verrekenen) of de gezamenlijke kindrekening (niets te verrekenen; bon erbij).
    const [bron, setBron] = useState(startBron ?? "eigen");
    const [bijlage, setBijlage] = useState("");
    const [extraKeuze, setExtraKeuze] = useState(null);
    const navigeer = useNavigate();
    const bedrag = leesGeld(bedragTekst) ?? 0;
    const sleutel = eigen ? { sanne: eigenPct ?? 100, joris: 100 - (eigenPct ?? 100) } : sleutelVoor(sleutels, categorie);
    const alleenBijhouden = !!eigen && eigenPct === null;
    const effectiefSanne = verdeling === "standaard" ? sleutel.sanne : verdeling === "50" ? 50 : verdeling === "volledig" ? 100 : pctSanne;
    const deelSanne = Math.round(bedrag * effectiefSanne) / 100;
    const deelJoris = Math.round((bedrag - deelSanne) * 100) / 100;
    const ingevuld = manier === "hand" && !budget && !voorinvul && !!(omschrijving.trim() || bedragTekst.trim() || bon || bijlage);
    const probeerSluiten = () => (ingevuld ? setVraagSluiten(true) : onSluit());
    useEffect(() => {
        const esc = (e) => { if (e.key === "Escape")
            probeerSluiten(); };
        window.addEventListener("keydown", esc);
        return () => window.removeEventListener("keydown", esc);
    });
    const budgetBeoordeling = budget ? beoordeelKosten([...bronKosten, { id: "invoer", omschrijving, categorie: budget.categorie ?? categorie, kind, datum, bedrag, status: "wacht", betaaldDoor, aandeelSanne: Math.round(bedrag * budget.pctSanne) / 100, budgetId: budget.id }], budgetten, datum).get("invoer") : null;
    const budgetRest = budgetBeoordeling?.soort === "boven" ? budgetBeoordeling.rest : budget?.max ?? 0;
    const overschot = budget ? Math.round((bedrag - budgetRest) * 100) / 100 : 0;
    const overschreden = budgetBeoordeling?.soort === "boven" && overschot > 0.009;
    const opslaan = () => {
        if (!omschrijving.trim() || bedrag <= 0 || !datum || !kind)
            return;
        if (overschreden && !extraKeuze)
            return;
        if (eigen) {
            startActie.kostToevoegen({ id: `ek-${Date.now()}`, omschrijving, categorie, kind, datum, bedrag, pctIk: alleenBijhouden ? null : effectiefSanne, bon: bon || undefined });
            bevestig(t("routes.kosten.melding.opgeslagen"), { uitleg: omschrijving });
            onSluit();
            return;
        }
        bewaardConcept = null;
        const id = String(Date.now());
        // Bij overschrijding: het afgesproken deel volgt de budgetverdeling; het extra deel apart.
        const basis = overschreden ? budgetRest : bedrag;
        const pctBasis = budget ? budget.pctSanne : effectiefSanne;
        const pctExtra = extraKeuze === "eigen" ? (betaaldDoor === "sanne" ? 100 : 0) : pctBasis;
        setKosten((l) => [
            ...(overschreden ? [{
                    ...l[0],
                    id: `${id}-extra`,
                    omschrijving: t("routes.kosten.nieuw.extraBovenBudget", { omschrijving }),
                    categorie,
                    icoon: "bon",
                    kind,
                    datum,
                    bedrag: overschot,
                    betaaldDoor,
                    verdeling: `${pctExtra} / ${100 - pctExtra}`,
                    aandeelSanne: Math.round(overschot * pctExtra) / 100,
                    // Eigen rekening: geen verrekening nodig. Ter afstemming: wacht op instemming van de andere ouder.
                    status: (extraKeuze === "eigen" ? "verrekend" : "wacht"),
                }] : []),
            {
                ...l[0],
                id,
                omschrijving,
                categorie,
                icoon: "bon",
                kind,
                datum,
                bedrag: basis,
                betaaldDoor,
                verdeling: `${pctBasis} / ${100 - pctBasis}`,
                aandeelSanne: Math.round(basis * pctBasis) / 100,
                budgetId: budget?.id,
                ...(bron === "kindrekening" ? { verdeling: "Kindrekening", status: "verrekend" } : { status: "wacht" }),
            },
            ...l,
        ]);
        if (bon)
            voegBijlageToe(id, bon, "bon", omschrijving);
        if (bijlage)
            voegBijlageToe(id, bijlage, "bijlage", omschrijving);
        if (toelichting.trim())
            voegOpmerkingToe(id, toelichting.trim(), omschrijving);
        if (budget)
            koppelUitgave(budget.id, id, bedrag);
        bevestig(t("routes.kosten.melding.opgeslagen"), { uitleg: omschrijving });
        onSluit();
    };
    return (<div className="app-modal-achter z-30" onClick={probeerSluiten}>
      <div role="dialog" aria-modal="true" aria-label={budget ? t("routes.kosten.nieuw.uitgaveToevoegen") : t("routes.kosten.nieuw.nieuweUitgave")} className="app-modal" onClick={(e) => e.stopPropagation()} onTouchStart={(e) => { e.currentTarget.dataset["y"] = String(e.touches[0]?.clientY ?? 0); }} onTouchEnd={(e) => { const el = e.currentTarget; const dy = (e.changedTouches[0]?.clientY ?? 0) - Number(el.dataset["y"] ?? 0); if (dy > 90 && el.scrollTop <= 0)
        probeerSluiten(); }}>
        <button type="button" onClick={probeerSluiten} aria-label={t("common.sluiten")} className="knop-kruis absolute right-2 top-2 size-11"><X className="size-5"/></button>
        <p className="pr-10 font-display text-lg font-bold">{budget ? t("routes.kosten.nieuw.uitgaveToevoegen") : t("routes.kosten.nieuw.nieuweUitgave")}</p>
        {vraagSluiten ? (<div className="mt-4 space-y-2 border-y border-border py-4">
            <p className="text-sm font-semibold">{t("routes.kosten.nieuw.concept.vraag")}</p>
            <button onClick={() => { bewaardConcept = { omschrijving, bedragTekst, betaaldDoor, kind, categorie }; bevestig(t("routes.kosten.nieuw.concept.bewaard")); onSluit(); }} className="min-h-11 w-full rounded-md bg-brand text-sm font-semibold text-primary-foreground">{t("routes.kosten.nieuw.concept.bewaren")}</button>
            <button onClick={() => { bewaardConcept = null; onSluit(); }} className="min-h-11 w-full rounded-md border border-border text-sm font-semibold text-ink-soft">{t("common.verwijderen")}</button>
            <button onClick={() => setVraagSluiten(false)} className="min-h-11 w-full text-sm font-semibold text-brand">{t("routes.kosten.nieuw.concept.verder")}</button>
          </div>) : manier === "kies" ? (<div className="mt-4 space-y-2">
            <button onClick={() => setManier("scan")} className="flex min-h-14 w-full items-center gap-3 rounded-md border border-border px-3 text-left text-sm font-semibold"><AppIcon functie="foto" maat="md"/>{t("routes.kosten.nieuw.bonScannen")}</button>
            <button onClick={() => setManier("hand")} className="flex min-h-14 w-full items-center gap-3 rounded-md border border-border px-3 text-left text-sm font-semibold"><AppIcon functie="notitie" maat="md"/>{t("routes.kosten.nieuw.handmatig")}</button>
          </div>) : manier === "scan" ? (<div className="mt-4 space-y-2">
            <p className="text-xs text-ink-soft">{t("routes.kosten.nieuw.scanUitleg")}</p>
            <BonScanner standaardPct={eigen ? eigenPct ?? 100 : sleutel.sanne} onKosten={(b) => { if (eigen)
            startActie.kostToevoegen({ id: `ek-${Date.now()}`, omschrijving: b.omschrijving, categorie: "Bon", kind: kindKeuzes[0], datum: new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }) /* bronwaarde (Nederlandse maandnaam); weergave via toonDatumTekst */, bedrag: b.bedrag, pctIk: eigenPct });
        else
            bonAlsKost(b); onSluit(); }} onDocument={() => onSluit()}/>
            <button onClick={() => setManier("hand")} className="min-h-11 text-sm font-semibold text-brand">{t("routes.kosten.nieuw.lieverHandmatig")}</button>
          </div>) : <>
        {budget ? <p className="mt-1 text-xs text-ink-soft">{t("routes.kosten.nieuw.afgesprokenBudget", { bedrag: euro(budget.max), sanne: budget.pctSanne, ander: 100 - budget.pctSanne })}</p> : null}
        <Button variant="link" className="px-0" onClick={() => setManier("scan")}><AppIcon functie="foto" maat="sm" vorm="kaal"/>{t("routes.kosten.nieuw.bonScannen")}</Button>
        <div className="mt-4 space-y-3">
          <input value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} placeholder={eigen ? t("routes.kosten.nieuw.omschrijvingEigen") : t("routes.kosten.nieuw.omschrijving")} className="w-full rounded-md border border-border bg-card px-4 py-3 text-sm outline-none placeholder:text-ink-soft/70"/>
          <GeldInvoer value={bedragTekst} onChange={setBedragTekst} label={t("routes.kosten.nieuw.bedrag")}/>
          {!eigen ? <label className="block text-xs font-semibold">{t("routes.kosten.nieuw.budgetVrijwillig")}<select aria-label={t("routes.kosten.nieuw.budgetLabel")} value={budget?.id ?? ""} onChange={(e) => { const b = budgetten.find((b) => b.id === e.target.value) ?? null; setBudget(b); if (b) {
            setKind(b.kind);
            setCategorie(b.categorie ?? categorie);
            setVerdeling(b.pctSanne === 50 ? "50" : "anders");
            setPctSanne(b.pctSanne);
        } }} className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"><option value="">{t("routes.kosten.nieuw.geenBudget")}</option>{budgetten.filter((b) => b.status === "akkoord" || b.status === "uitgegeven").map((b) => <option key={b.id} value={b.id}>{b.wat}</option>)}</select></label> : null}
          {budget && budgetMelding(budgetBeoordeling) ? <p className="text-xs text-accent-warm">{budgetMelding(budgetBeoordeling)}</p> : null}
          <label className="block text-xs font-semibold">{t("routes.kosten.nieuw.datum")}<input type="date" aria-label={t("routes.kosten.nieuw.datum")} value={datum} onChange={(e) => setDatum(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"/></label>

          <p className="text-xs font-semibold text-ink-soft">{t("routes.kosten.nieuw.betaaldDoor")}</p>
          {eigen ? <p className="rounded-md border border-brand bg-brand-soft px-3 py-2 text-sm font-semibold text-brand">{ikNaam}<span className="block text-[11px] font-normal text-ink-soft">{t("routes.kosten.nieuw.eigenNietGekoppeld")}</span></p> : <div className="flex gap-2">
            {["sanne", "joris"].map((o) => (<button key={o} onClick={() => setBetaaldDoor(o)} className={`flex-1 rounded-md border py-2 text-sm font-semibold ${betaaldDoor === o ? "border-brand bg-brand-soft text-brand" : "border-border text-ink-soft"}`}>
                {o === "sanne" ? "Sanne" : "Joris"}
              </button>))}
          </div>}

          {!eigen ? <>
          <p className="text-xs font-semibold text-ink-soft">{t("routes.kosten.nieuw.betaaldVan")}</p>
          <div className="flex gap-2" role="group" aria-label={t("routes.kosten.nieuw.betaaldVan")}>
            {[["eigen", t("routes.kosten.nieuw.bron.eigen"), t("routes.kosten.nieuw.bron.eigenSub")], ["kindrekening", t("routes.kosten.nieuw.bron.kind"), t("routes.kosten.nieuw.bron.kindSub")]].map(([v, l, sub]) => (<button key={v} type="button" onClick={() => setBron(v)} aria-pressed={bron === v} className={`flex-1 rounded-2xl border px-3 py-2 text-left text-sm font-black ${bron === v ? "border-brand bg-brand-soft text-brand" : "border-border text-ink-soft"}`}>{l}<span className="block text-[11px] font-normal">{sub}</span></button>))}
          </div>
          {bron === "kindrekening" ? <div className="rounded-2xl bg-[#E9EFE3] p-3"><p className="text-sm font-black text-[#2F4A3A]">{t("routes.kosten.nieuw.bonToevoegen")}</p><p className="text-xs text-[#3F5747]">{t("routes.kosten.nieuw.bonUitleg", { naam: anderNaam })}</p><BonKeuze gekozen={bon} onKies={setBon}/></div> : null}
          </> : null}

          <p className="text-xs font-semibold text-ink-soft">{t("routes.kosten.nieuw.voor")}</p>
          <div className="flex flex-wrap gap-2">
            {kindKeuzes.map((k) => (<button key={k} onClick={() => setKind(k)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${kind === k ? "border-brand bg-brand-soft text-brand" : "border-border text-ink-soft"}`}>
                {kindLabel(k)}
              </button>))}
          </div>

          {meer ? <>
          <p className="text-xs font-semibold text-ink-soft">{t("routes.kosten.filter.categorie")}</p>
          <div className="flex flex-wrap gap-2">
            {categorieen.map((c) => (<button key={c} onClick={() => setCategorie(c)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${categorie === c ? "border-brand bg-brand-soft text-brand" : "border-border text-ink-soft"}`}>
                {categorieLabel(c)}
              </button>))}
          </div>
          </> : null}

          {alleenBijhouden ? <p className="text-xs text-ink-soft">{t("routes.kosten.nieuw.alleenBijhouden")}</p> : <>
          <p className="text-xs font-semibold text-ink-soft">{eigen ? t("routes.kosten.nieuw.voorlopig") : t("routes.kosten.nieuw.hoeVerdelen")}</p>
          <div className="space-y-2">
            {[
                    ...(eigen?.kostenAfspraak.wijze === "per-uitgave" ? [] : [["standaard", eigen ? t("routes.kosten.nieuw.volgensAfspraak", { sanne: sleutel.sanne, joris: sleutel.joris }) : t("routes.kosten.nieuw.volgensStandaard", { sanne: sleutel.sanne, joris: sleutel.joris })]]),
                    ["50", "50 / 50"],
                    ["anders", t("routes.kosten.nieuw.anderPercentage")],
                    ["volledig", t("routes.kosten.nieuw.volledig")],
                ].map(([v, label]) => (<label key={v} className="flex items-center gap-3 text-sm">
                <input type="radio" name="verdeling" checked={verdeling === v} onChange={() => setVerdeling(v)} className="size-4 accent-[var(--color-brand)]"/>
                {label}
              </label>))}
            {verdeling === "anders" ? (<div className="flex items-center gap-2 pl-7 text-sm">
                <span className="text-ink-soft">{ikNaam}</span>
                <input type="number" min={0} max={100} value={pctSanne} onChange={(e) => setPctSanne(Math.min(100, Math.max(0, Number(e.target.value))))} className="w-16 rounded-md border border-border bg-card px-2 py-1 text-sm"/>
                <span className="text-ink-soft">% / {anderNaam} {100 - pctSanne}%</span>
              </div>) : null}
          </div>

          {bedrag > 0 ? (<div className="rounded-md border border-border bg-card p-3 text-sm">
              <p className="flex justify-between"><span>{ikNaam}</span><b>{euro(deelSanne)}</b></p>
              <p className="mt-1 flex justify-between"><span>{anderNaam}</span><b>{euro(deelJoris)}</b></p>
            </div>) : null}
          </>}

          {overschreden ? (<div role="status" className="rounded-md border border-accent-warm/50 bg-muted p-3 text-sm">
              <p className="font-semibold">{t("routes.kosten.nieuw.overschreden", { bedrag: euro(overschot) })}</p>
              <p className="mt-0.5 text-xs text-ink-soft">{t("routes.kosten.nieuw.binnenAfspraak", { budget: euro(budget.max), extra: euro(overschot) })}</p>
              <div className="mt-2 space-y-1.5">
                {[["eigen", t("routes.kosten.nieuw.extra.eigen"), t("routes.kosten.nieuw.extra.eigenSub")], ["afstemmen", t("routes.kosten.nieuw.extra.voorstellen", { naam: anderNaam }), t("routes.kosten.nieuw.extra.voorstellenSub", { naam: anderNaam })]].map(([v, l, sub]) => (<label key={v} className="flex items-start gap-3">
                    <input type="radio" name="extra" checked={extraKeuze === v} onChange={() => setExtraKeuze(v)} className="mt-1 size-4 accent-[var(--color-brand)]"/>
                    <span>{l}<span className="block text-[11px] text-ink-soft">{sub}</span></span>
                  </label>))}
              </div>
            </div>) : null}
          {!meer && bron !== "kindrekening" && <BonKeuze gekozen={bon} onKies={setBon}/>}
          {meer ? <BijlageKiezers bon={bon} bijlage={bijlage} onBon={setBon} onBijlage={setBijlage}/> : (<button type="button" onClick={() => setMeer(true)} className="min-h-11 text-sm font-semibold text-brand"><span className="inline-flex items-center gap-0.5">{t("routes.kosten.nieuw.meerOpties")}<Chevron className="size-4"/></span><span className="block text-[11px] font-normal text-ink-soft">{t("routes.kosten.nieuw.meerOptiesSub", { categorie: categorieLabel(categorie) })}</span></button>)}
        </div>
        <label className="mt-3 block text-xs font-semibold">{t("routes.kosten.nieuw.toelichting")}<textarea value={toelichting} onChange={(e) => setToelichting(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"/></label>
        <Button onClick={opslaan} disabled={!omschrijving.trim() || bedrag <= 0 || !datum || !kind || (overschreden && !extraKeuze)} className="mt-4 w-full rounded-md bg-brand py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40">
          {t("routes.kosten.nieuw.opslaan")}
        </Button>
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
function BestandKnop({ label, gekozen, icoon: Icon, accept, capture, onKies }) {
    return (<label className="flex cursor-pointer items-center gap-2 py-2.5 text-sm font-semibold text-brand">
      <Icon className="size-4" strokeWidth={1.6}/>
      <span className="flex-1">{label}</span>
      {gekozen ? <span className="truncate text-xs font-normal text-ink-soft">{gekozen}</span> : null}
      <input type="file" accept={accept} capture={capture ? "environment" : undefined} className="sr-only" onChange={(e) => { const n = e.target.files?.[0]?.name; if (n)
        onKies(n); e.target.value = ""; }}/>
    </label>);
}
function BijlageKiezers({ bon, bijlage, onBon, onBijlage }) {
    const { t } = useTranslation();
    return (<div className="divide-y divide-border border-y border-border">
      <BonKeuze gekozen={bon} onKies={onBon}/>
      <BestandKnop label={t("routes.kosten.bon.andereBijlage")} gekozen={bijlage} icoon={Paperclip} accept="image/*,application/pdf,.doc,.docx,.txt" onKies={onBijlage}/>
    </div>);
}
function KostDetail({ kost, onSluit, onVerrekenen, startWijzig = false }) {
    const { t } = useTranslation();
    const extra = useKostExtra(kost?.id ?? "");
    const bronKosten = useKosten();
    const bronBudgetten = useBudgetten();
    const beoordeling = beoordeelKosten(bronKosten, bronBudgetten, DEMO_VANDAAG).get(kost?.id ?? "");
    const keuze = useKeuzeTeksten();
    const [opm, setOpm] = useState("");
    const [wijzig, setWijzig] = useState(startWijzig);
    const [nieuwBedrag, setNieuwBedrag] = useState("");
    const [nieuweVerdeling, setNieuweVerdeling] = useState("");
    const [meer, setMeer] = useState(startWijzig);
    if (!kost)
        return null;
    const status = kost.status;
    const gedekt = status === "wacht" && beoordeling?.soort === "gedekt";
    const label = status === "betaald" || status === "verrekend" ? t("routes.kosten.status.afgerekend") : status === "openstaand" || status === "bevestigd" || gedekt ? t("routes.kosten.detail.toegevoegd") : (statusLabel[status] ?? status);
    const pct = Math.round((kost.aandeelSanne / kost.bedrag) * 100);
    const open = status === "openstaand" || status === "bevestigd" || gedekt;
    const actieKnop = "flex w-full items-center justify-between py-3 text-left text-sm font-semibold";
    return (<Sheet open onOpenChange={(o) => { if (!o) {
        setWijzig(false);
        setOpm("");
        onSluit();
    } }}>
      <SheetContent side="bottom" className="left-1/2 max-h-[90vh] w-full max-w-md -translate-x-1/2 overflow-y-auto rounded-t-2xl bg-background px-5 pb-8 pt-4">
        <SheetHeader className="pr-8 text-left">
          <SheetTitle className="font-display text-2xl font-medium">{kost.omschrijving}</SheetTitle>
          <SheetDescription className="text-xs">{kindLabel(kost.kind)} · {toonDatumTekst(kost.datum)} · {kost.betaaldDoor === "sanne" ? t("routes.kosten.detail.betaaldDoorJou") : t("routes.kosten.detail.betaaldDoorAnder")}</SheetDescription>
        </SheetHeader>
        <p className="mt-3 font-display text-3xl">{euro(kost.bedrag)}</p>
        <dl className="mt-4 divide-y divide-border border-y border-border text-sm">
          <div className="flex justify-between py-2.5"><dt className="text-ink-soft">{t("routes.kosten.detail.verdeling")}</dt><dd>{pct} / {100 - pct}</dd></div>
          <div className="flex justify-between py-2.5"><dt className="text-ink-soft">{t("routes.kosten.detail.jouwDeel")}</dt><dd className="font-semibold">{euro(kost.aandeelSanne)}</dd></div>
          <div className="flex justify-between py-2.5"><dt className="text-ink-soft">{t("routes.kosten.filter.status")}</dt><dd>{label}</dd></div>
        </dl>

        {wachtOpJouwAkkoord(kost, beoordeling) ? <div className="mt-4">
          <p className="text-xs text-ink-soft">{t("routes.kosten.detail.nogGeenAkkoord")}</p>
          {budgetMelding(beoordeling) ? <p className="mt-1 text-xs font-semibold text-accent-warm">{budgetMelding(beoordeling)}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => { setKosten((l) => l.map((x) => x.id === kost.id ? { ...x, status: "openstaand" } : x)); voegOpmerkingToe(kost.id, t("common.akkoord"), kost.omschrijving); bevestig(t("routes.kosten.detail.afgesproken")); onSluit(); }} className="min-h-11 flex-1 text-xs">{keuze.akkoord}</Button>
            <Button variant="outline" onClick={() => { setMeer(true); setWijzig(true); }} className="min-h-11 flex-1 text-xs">{keuze.ander}</Button>
            <Button variant="outline" onClick={() => { setKosten((l) => l.map((x) => x.id === kost.id ? { ...x, status: NIET_AKKOORD_STATUS } : x)); voegOpmerkingToe(kost.id, t("common.nietAkkoord"), kost.omschrijving); bevestig(nietAkkoordKostTekst()); onSluit(); }} className="min-h-11 flex-1 text-xs">{keuze.niet}</Button>
          </div>
        </div> : gedekt && beoordeling?.soort === "gedekt" ? <div className="mt-3"><p className="text-xs text-ink-soft">{t("routes.kosten.detail.gedekt", { wat: beoordeling.budget.wat, sanne: beoordeling.budget.pctSanne, ander: 100 - beoordeling.budget.pctSanne })}</p><p className="mt-1 text-xs text-brand">{t("routes.kosten.detail.gedektToegevoegd")}</p></div> : null}

        <Button variant="ghost" aria-expanded={meer} onClick={() => setMeer((v) => !v)} className="mt-3 w-full justify-between px-0">{t("routes.kosten.nieuw.meerOpties")} <Chevron richting="omlaag" open={meer} className="size-4 text-ink-soft"/></Button>
        {meer ? <>

        {extra.bijlagen.length ? (<div className="mt-4"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand">{t("routes.kosten.detail.bijlagen")}</p>
            {extra.bijlagen.map((b) => <p key={b.id} className="mt-1 flex items-center gap-2 text-sm">{b.soort === "bon" ? <Receipt className="size-3.5"/> : <Paperclip className="size-3.5"/>}{b.naam}<span className="text-[11px] text-ink-soft">{b.soort === "bon" ? t("lib.kostenStore.veld.bon") : t("lib.kostenStore.veld.bijlage")}</span></p>)}
          </div>) : null}
        {extra.opmerkingen.length ? (<div className="mt-4"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand">{t("routes.kosten.detail.opmerkingen")}</p>
            {extra.opmerkingen.map((o) => <p key={o.id} className="mt-1 text-sm">{o.tekst}<span className="ml-1 text-[11px] text-ink-soft">· {o.door}</span></p>)}
          </div>) : null}

        <div className="mt-5 divide-y divide-border border-y border-border">
          {/* Geen losse betaling per uitgave: betalen gaat altijd via de gezamenlijke afrekening. */}
          {open ? <button className={actieKnop} onClick={onVerrekenen}>{t("routes.kosten.detail.bekijkAfrekening")}<Chevron className="size-4 text-ink-soft"/></button> : null}
          <BestandKnop label={t("routes.kosten.detail.bonToevoegen")} icoon={Receipt} accept="image/*,application/pdf" onKies={(n) => voegBijlageToe(kost.id, n, "bon", kost.omschrijving)}/>
          <BestandKnop label={t("routes.kosten.bon.andereBijlage")} icoon={Paperclip} accept="image/*,application/pdf,.doc,.docx,.txt" onKies={(n) => voegBijlageToe(kost.id, n, "bijlage", kost.omschrijving)}/>
          <div className="py-3">
            <div className="flex gap-2">
              <input value={opm} onChange={(e) => setOpm(e.target.value)} placeholder={t("routes.kosten.detail.opmerkingToevoegen")} aria-label={t("routes.kosten.detail.opmerking")} className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"/>
              <button disabled={!opm.trim()} onClick={() => { voegOpmerkingToe(kost.id, opm.trim(), kost.omschrijving); setOpm(""); }} className="rounded-md border border-border px-3 text-xs font-semibold disabled:opacity-40">{t("routes.kosten.detail.plaats")}</button>
            </div>
          </div>
          {status !== "betaald" ? (!wijzig ? (<button className={actieKnop} onClick={() => setWijzig(true)}>{t("routes.kosten.detail.foutMelden")}<Chevron className="size-4 text-ink-soft"/></button>) : (<div className="py-3">
              <p className="text-xs text-ink-soft">{t("routes.kosten.detail.pasNaAkkoord")}</p>
              <div className="mt-2 flex gap-2">
                <GeldInvoer value={nieuwBedrag} onChange={setNieuwBedrag} label={t("routes.kosten.detail.nieuwBedrag")} className="flex-1"/>
                <input value={nieuweVerdeling} onChange={(e) => setNieuweVerdeling(e.target.value)} placeholder={t("routes.kosten.detail.verdelingPlaceholder")} aria-label={t("routes.kosten.detail.andereVerdeling")} className="w-28 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"/>
                <Button size="sm" onClick={() => { const n = leesGeld(nieuwBedrag) ?? 0; const vd = nieuweVerdeling.trim(); if (nieuwBedrag && n <= 0)
                return; if (n > 0 || vd) {
                voegOpmerkingToe(kost.id, `${open ? t("routes.kosten.detail.correctieVoorgesteld") : t("common.anderVoorstel")}:${n > 0 ? ` ${t("routes.kosten.detail.notitieBedrag", { bedrag: euro(n) })}` : ""}${vd ? ` ${t("routes.kosten.detail.notitieVerdeling", { verdeling: vd })}` : ""}`, kost.omschrijving);
                if (!open)
                    setKosten((l) => l.map((x) => (x.id === kost.id ? { ...x, status: "wacht", aanZet: "joris" } : x)));
                setWijzig(false);
                setNieuwBedrag("");
                setNieuweVerdeling("");
                bevestig(open ? t("routes.kosten.detail.correctieVastgelegd") : tegenvoorstelVerstuurdTekst());
                onSluit();
            } }}>{t("routes.kosten.budgetten.voorstellen")}</Button>
              </div>
            </div>)) : null}
          <div className="flex items-center justify-between py-3 text-sm font-semibold">{t("routes.kosten.detail.geschiedenis")}<GeschiedenisKnop soort="kosten" itemId={kost.id} naam={kost.omschrijving}/></div>
        </div>
        </> : null}
      </SheetContent>
    </Sheet>);
}
// --- Eigen gezin: eigen uitgaven en vrijblijvende, voorlopige kostenafspraken ---
function EigenKosten({ st, onNieuw }) {
    const { t } = useTranslation();
    const [instellen, setInstellen] = useState(false);
    const [historieOpen, setHistorieOpen] = useState(false);
    const a = st.kostenAfspraak;
    const totaal = st.kosten.reduce((s, k) => s + k.bedrag, 0);
    const wijze = kostenWijzen.find((w) => w.id === a.wijze) ?? kostenWijzen[0];
    const samenvatting = a.wijze === "alleen" ? wijze?.naam : `${a.wijze === "eigen" ? `${a.pctIk} / ${100 - a.pctIk}` : wijze?.naam} · ${t("routes.kosten.eigen.afrekenen", { moment: kostenMomenten.find((m) => m.id === a.moment)?.naam.toLowerCase() })}`;
    if (instellen)
        return <EigenAfspraken st={st} onTerug={() => setInstellen(false)}/>;
    if (!st.kosten.length)
        return (<EigenLeeg titel={t("routes.kosten.titel")} icoon="kosten" tekst={t("routes.kosten.eigen.leegTekst")} knop={t("routes.kosten.eigen.eersteUitgave")} onKnop={onNieuw} extra={<button onClick={() => setInstellen(true)} className="mt-3 min-h-11 text-sm font-semibold text-brand"><MetChevron>{t("routes.kosten.eigen.afsprakenInstellen")}</MetChevron></button>}/>);
    return (<AppShell>
      <div className="flex items-start gap-3">
        <BackButton terug="/"/>
        <div className="flex-1">
          <h1 className="lora text-[30px] leading-tight">{t("routes.kosten.titel")}</h1>
          <p className="mt-1 text-sm text-ink-soft">{t("routes.kosten.eigen.uitgavenVoor", { namen: st.kinderen.map((k) => k.naam).join(" & ") || t("routes.kosten.eigen.deKinderen") })}</p>
        </div>

      </div>
      <p className="mt-4 text-sm text-ink-soft"><Trans i18nKey="routes.kosten.eigen.totaal" values={{ bedrag: euro(totaal) }} components={{ b: <b className="text-ink"/> }}/></p>
      <button onClick={() => setInstellen(true)} className="mt-3 flex min-h-11 w-full items-center justify-between border-y border-border py-2 text-left text-sm">
        <span><span className="font-semibold">{t("routes.kosten.eigen.afspraken")}</span><span className="block text-xs text-ink-soft">{t("routes.kosten.eigen.voorlopig", { samenvatting })}</span></span>
        <Chevron className="size-4 text-ink-soft"/>
      </button>
      <Button onClick={onNieuw} className="mt-4 min-h-12 w-full"><AppIcon functie="toevoegen" vorm="kaal"/>{t("routes.kosten.nieuw.uitgaveToevoegen")}</Button>
      <Button variant="ghost" onClick={() => setHistorieOpen((v) => !v)} aria-expanded={historieOpen} className="mt-4 min-h-14 w-full justify-between border-y border-border px-0"><span>{t("routes.kosten.eigen.alleKosten", { aantal: st.kosten.length })}</span><Chevron richting="omlaag" open={historieOpen} className="size-4 text-ink-soft"/></Button>
      {historieOpen ? <ul className="mt-2 divide-y divide-border">
        {st.kosten.map((k) => (<li key={k.id} className="flex items-center gap-3 py-3">
            <AppIcon functie="kosten" maat="md"/>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{k.omschrijving}</p>
              <p className="text-xs text-ink-soft">{kindLabel(k.kind)} · {toonDatumTekst(k.datum)} · {st.naam ? t("routes.kosten.eigen.betaaldDoor", { naam: st.naam }) : t("routes.kosten.detail.betaaldDoorJou")}{k.pctIk === null ? "" : ` · ${t("routes.kosten.eigen.voorlopigVerdeling", { ik: k.pctIk, ander: 100 - k.pctIk })}`}</p>
            </div>
            <b className="text-sm">{euro(k.bedrag)}</b>
          </li>))}
      </ul> : null}
    </AppShell>);
}
function EigenAfspraken({ st, onTerug }) {
    const { t } = useTranslation();
    const a = st.kostenAfspraak;
    const keuze = (actief) => `flex w-full min-h-11 items-start gap-3 py-2.5 text-left text-sm ${actief ? "font-semibold text-brand" : ""}`;
    return (<AppShell>
      <div className="flex items-start gap-3">
        <TerugKnop onClick={onTerug}/>
        <div>
          <h1 className="lora text-[30px] leading-tight">{t("routes.kosten.eigen.afspraken")}</h1>
          <p className="mt-1 text-sm text-ink-soft">{t("routes.kosten.eigen.vrijblijvend")}</p>
        </div>
      </div>
      <section className="mt-5">
        <h2 className="font-display text-lg font-bold">{t("routes.kosten.eigen.hoeVerdelen")}</h2>
        <div className="mt-2 divide-y divide-border border-y border-border">
          {kostenWijzen.map((w) => (<label key={w.id} className={keuze(a.wijze === w.id)}>
              <input type="radio" name="wijze" checked={a.wijze === w.id} onChange={() => startActie.zetKostenAfspraak({ wijze: w.id })} className="mt-1 size-4 accent-[var(--color-brand)]"/>
              <span>{w.naam}<span className="block text-xs font-normal text-ink-soft">{w.uitleg}</span></span>
            </label>))}
        </div>
        {a.wijze === "eigen" ? (<div className="mt-3 flex items-center gap-2 text-sm">
            <span className="text-ink-soft">{st.naam || t("common.jij")}</span>
            <input type="number" min={0} max={100} aria-label={t("routes.kosten.eigen.jouwPercentage")} value={a.pctIk} onChange={(e) => startActie.zetKostenAfspraak({ pctIk: Math.min(100, Math.max(0, Number(e.target.value))) })} className="w-16 rounded-md border border-border bg-card px-2 py-1 text-sm"/>
            <span className="text-ink-soft">{t("routes.kosten.eigen.andereOuderPct", { pct: 100 - a.pctIk })}</span>
          </div>) : null}
      </section>
      {a.wijze !== "alleen" ? (<section className="mt-6">
          <h2 className="font-display text-lg font-bold">{t("routes.kosten.instellingen.wanneer")}</h2>
          <div className="mt-2 divide-y divide-border border-y border-border">
            {kostenMomenten.map((m) => (<label key={m.id} className={keuze(a.moment === m.id)}>
                <input type="radio" name="moment" checked={a.moment === m.id} onChange={() => startActie.zetKostenAfspraak({ moment: m.id })} className="mt-1 size-4 accent-[var(--color-brand)]"/>
                <span>{m.naam}</span>
              </label>))}
          </div>
        </section>) : null}
      <p className="mt-5 text-xs text-ink-soft">{t("routes.kosten.eigen.naKoppelen")}</p>
      <Button onClick={onTerug} className="mt-4 min-h-11 w-full shadow-none">{t("common.klaar")}</Button>
    </AppShell>);
}
const RUST_SLEUTEL = "kosten-rust-v1";
function leesRust() {
    try {
        const r = localStorage.getItem(RUST_SLEUTEL);
        if (r) {
            const p = JSON.parse(r);
            return { toonBedrag: !!p.toonBedrag, open: p.open ?? {} };
        }
    }
    catch { /* standaard rustig */ }
    return { toonBedrag: false, open: {} };
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
