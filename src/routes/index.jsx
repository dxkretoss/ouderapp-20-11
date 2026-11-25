import i18n, { taalLocale } from "@/i18n";
import { AfspraakFormulier } from "@/components/AfspraakFormulier";
import { useTranslation } from "react-i18next";
import { agendaItems, iso, plusDagen, voorkomens, dt } from "@/lib/agenda-datum";
import { uur } from "@/lib/tijd-tekst";
import { AppIcon } from "@/components/AppIcon";
import { Chevron, MetChevron, MetVinkje, Vinkje } from "@/components/Tekens";
import { itemsVoor, urenTot, useOverdracht, useWisselMomenten, volgendeVan } from "@/lib/overdracht-store";
import { useAgenda } from "@/lib/agenda-store";
import { EigenKinderen, EigenVandaag, EigenVolgende } from "@/components/EersteHome";
import { useStart } from "@/lib/start-store";
import { NuAfstemmenKaart } from "@/components/NuAfstemmen";
import { openNuAfstemmen, useNuAfstemmen } from "@/lib/nu-afstemmen-store";
import { markeerVanOverzicht, neemHeropen } from "@/lib/terug-store";
import { accepteer as accepteerZorg, wijsAf as wijsAfZorg } from "@/lib/zorg-store";
import { reageer as reageerBudget, useBudgetten } from "@/lib/budget-store";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AppShell } from "@/components/AppShell";
import { ActiviteitenBel, useActiviteiten } from "@/components/Activiteiten";
import { useZorg } from "@/lib/zorg-store";
import { eigenOpenVoorstellen, useAfspraken } from "@/lib/afspraken-store";
import { useVakanties } from "@/lib/vakantie-store";
import { useTeControleren } from "@/lib/import-store";
import { LivingSfeer } from "@/components/LivingHome";
import { begroeting } from "@/lib/living-home";
import { useVoorkeuren } from "@/lib/voorkeuren-store";
import { useKostenPaar } from "@/lib/kosten-store";
import { beoordeelKosten, wachtOpJouwAkkoord } from "@/lib/kosten-akkoord";
import { berekenSaldo } from "@/lib/verrekening";
import { kindLabel } from "@/components/KostenTabs";
import { useTaken } from "@/lib/taken-store";
import { categorieMeta } from "@/lib/demo-data";
import { mijnKringen, useKring } from "@/lib/kring-store";
import { useAuth } from "@/lib/auth-store";
import { PaginaSkelet } from "@/components/Laden";
export const Route = createFileRoute("/")({
    head: () => ({
        meta: [
            { title: i18n.t("common.metaTitel", { titel: i18n.t("routes.index.meta.titel") }) },
            {
                name: "description",
                content: i18n.t("routes.index.meta.beschrijving"),
            },
            { property: "og:title", content: i18n.t("common.metaTitel", { titel: i18n.t("routes.index.meta.titel") }) },
            { property: "og:description", content: i18n.t("routes.index.meta.ogBeschrijving") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: HomePagina,
});
/** Eén Home. Bij een eigen gezin vallen voorbeeldbronnen weg en groeien de onderdelen mee met wat echt bekend is. */
/** Uitkomst van de kringcontrole per account, zodat Home niet bij elk bezoek opnieuw wacht. */
let verzorgerCache = { id: null, waarde: undefined };
function HomePagina() {
    const st = useStart();
    const nav = useNavigate();
    const mijnId = useAuth().gebruiker?.id ?? null;
    // Alleen kringlid (geen eigen kinderen, geen gekoppelde ouder) met actieve kringtoegang: meteen naar de kringweergave.
    const misschienVerzorger = !st.kinderen.length && !st.coOuders?.length;
    const bekend = verzorgerCache.id === mijnId ? verzorgerCache.waarde : undefined;
    const [verzorger, setVerzorger] = useState(misschienVerzorger ? bekend : false);
    useEffect(() => {
        if (!misschienVerzorger) {
            setVerzorger(false);
            return;
        }
        if (verzorgerCache.id === mijnId && verzorgerCache.waarde !== undefined) {
            setVerzorger(verzorgerCache.waarde);
            return;
        }
        let weg = false;
        const klaar = (w) => { verzorgerCache = { id: mijnId, waarde: w }; if (!weg)
            setVerzorger(w); };
        mijnKringen().then((v) => klaar(v.length > 0)).catch(() => klaar(false));
        return () => { weg = true; };
    }, [misschienVerzorger, mijnId]);
    useEffect(() => { if (verzorger)
        nav({ to: "/verzorger", replace: true }); }, [verzorger, nav]);
    // Nog aan het controleren (of onderweg naar de kringweergave): app-skelet met onderbalk, nooit een leeg scherm.
    if (verzorger !== false)
        return <AppShell><PaginaSkelet /></AppShell>;
    return <Dashboard />;
}
const toevoegOpties = [
    { id: "afspraak", icoon: "agenda" },
    { id: "voorstel", to: "/afspraken", icoon: "voorstel" },
    { id: "taak", to: "/taken", icoon: "taken" },
    { id: "kosten", to: "/kosten", icoon: "kosten" },
    { id: "momentje", to: "/momentjes", icoon: "momentjes" },
    { id: "document", to: "/documenten", icoon: "documenten" },
    { id: "overdracht", to: "/overdracht", icoon: "overdracht" },
];
/** Afspraak vanaf Home: eerst de soort kiezen, daarna opent het agendaformulier alvast bij de juiste soort. */
const afspraakOpties = Object.entries(categorieMeta).map(([key, meta]) => ({
    to: "/agenda",
    search: { nieuw: true, categorie: key },
    get label() { return meta.label; },
}));
/** Voorstel doen vanaf Home: direct de soort kiezen, daarna opent de bestaande flow. */
const voorstelOpties = [
    { id: "wisselmoment", to: "/zorgregeling", search: { actie: "wijziging", bron: "home" } },
    { id: "tijd", to: "/veranderd", search: { situatie: "afspraak" } },
    { id: "ruilen", to: "/zorgregeling", search: { actie: "wijziging", bron: "home" } },
    { id: "extra", to: "/zorgregeling", search: { actie: "wijziging", bron: "home" } },
    { id: "nieuweAfspraak", to: "/afspraken", search: { nieuw: "voorstel", bron: "home" } },
    { id: "vakantie", to: "/planning", search: { toevoegen: "vakantie" } },
    { id: "halen", to: "/veranderd", search: { situatie: "halen" } },
    { id: "budget", to: "/kosten", search: { budget: "nieuw" } },
    { id: "rust", to: "/afspraken", search: { nieuw: "voorstel", bron: "rust" } },
    { id: "anders", to: "/afspraken", search: { nieuw: "voorstel", bron: "home" } },
];
const euro = (n) => n.toLocaleString(taalLocale(), { style: "currency", currency: "EUR" });
const nu = new Date();
function OverdrachtIcoon() {
    return (<svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 7V5.75A1.75 1.75 0 0 1 9.75 4h4.5A1.75 1.75 0 0 1 16 5.75V7"/>
      <path d="M5.5 7.5h13A1.5 1.5 0 0 1 20 9v8.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5V9a1.5 1.5 0 0 1 1.5-1.5Z"/>
      <path d="M4 12h16M9 11v2M15 11v2"/>
    </svg>);
}
function WisselIcoon() {
    return (<svg aria-hidden="true" viewBox="0 0 16 16" className="size-[13px]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 5.75h9"/>
      <path d="M10.25 3.25 12.75 5.75 10.25 8.25"/>
      <path d="M12.5 10.25h-9"/>
      <path d="M5.75 7.75 3.25 10.25 5.75 12.75"/>
    </svg>);
}
function Dashboard() {
    const { t } = useTranslation();
    const vandaagNaam = nu.toLocaleDateString(taalLocale(), { weekday: "long" });
    const vandaagDatum = nu.toLocaleDateString(taalLocale(), { day: "numeric", month: "long" });
    const statusLabel = (s) => (s === "Wacht op jou" ? t("routes.index.status.wachtOpJou") : t("routes.index.status.loopt"));
    const st = useStart();
    const [toevoegenOpen, setToevoegenOpen] = useState(false);
    const [voorstelMenu, setVoorstelMenu] = useState(false);
    const [afspraakMenu, setAfspraakMenu] = useState(false);
    // "Nieuwe afspraak" opent hetzelfde formulier als in Agenda, direct hier op Home.
    const [afspraakOpen, setAfspraakOpen] = useState(false);
    const [puntenOpen, setPuntenOpen] = useState(false);
    useEffect(() => { if (neemHeropen())
        setPuntenOpen(true); }, []);
    const kring = useKring();
    const nuAfstemmen = useNuAfstemmen();
    useTaken();
    const overdrachtSt = useOverdracht();
    // Kosten van het gekozen ouderpaar (bij meerdere andere ouders per kind: het paar dat op Kosten
    // gekozen is), zodat het saldo nooit bedragen van verschillende ouders optelt.
    const kostenBron = useKostenPaar();
    const kostenLijst = kostenBron.kosten;
    const saldoDetail = berekenSaldo(kostenLijst, kostenBron.budgetten);
    const saldo = -saldoDetail.netto; // positief: jij betaalt de andere ouder
    const [kostenOpen, setKostenOpen] = useState(false);
    const heeftSaldo = !!kostenBron.partnerId && Math.abs(saldo) >= 0.01;
    const saldoTekst = euro(Math.abs(saldo));
    // Status komt uit de bron: wat elders is afgehandeld, verdwijnt hier vanzelf.
    const alleBudgetten = useBudgetten();
    const alleZorg = useZorg().voorstellen;
    const alleVakanties = useVakanties();
    // Afgerond: uit dezelfde bronnen, alleen-lezen, zodat niets dubbel wordt opgeslagen.
    const afgerond = [
        ...alleBudgetten.filter((b) => b.status === "akkoord").map((b) => ({ id: `ab-${b.id}`, titel: t("routes.index.afgerond.budget", { wat: b.wat }), naar: "/kosten" })),
        ...alleZorg.filter((v) => v.status !== "open").map((v) => ({ id: `az-${v.id}`, titel: `${v.datumLabel} · ${t(`routes.index.zorgStatus.${v.status}`, { defaultValue: v.status })}`, naar: "/zorgregeling" })),
        ...alleVakanties.filter((v) => v.status === "afgesproken").map((v) => ({ id: `av-${v.id}`, titel: t("routes.index.afgerond.vakantie", { naam: v.naam }), naar: "/planning" })),
    ];
    const budgetItems = alleBudgetten.filter((b) => b.status === "wacht" || b.status === "tegenvoorstel").map((b) => ({
        id: `budget-${b.id}`, icoon: "kosten", titel: b.status === "tegenvoorstel" ? t("routes.index.budget.tegenvoorstel") : t("routes.index.budget.voorstel"),
        sub: `${b.wat} · ${kindLabel(b.kind)} · ${euro([...b.stappen].reverse().find((s) => s.bedrag !== undefined)?.bedrag ?? b.max)}`, status: b.aanZet === "ik" ? "Wacht op jou" : "Afstemming loopt", naar: "/kosten", search: { budget: b.id },
        snel: b.aanZet === "ik" ? [{ label: t("common.akkoord"), doe: () => reageerBudget(b.id, "ik", "akkoord") }] : undefined,
    }));
    // Uitgaven die op jouw akkoord wachten (zelfde regel als het kostenoverzicht).
    const kostBeoordeling = beoordeelKosten(kostenLijst, alleBudgetten);
    const kostItems = kostenLijst.filter((k) => k.gedeeld && wachtOpJouwAkkoord(k, kostBeoordeling.get(k.id))).map((k) => ({
        id: `kost-${k.id}`, icoon: "kosten", titel: t("routes.index.kosten.uitgaveAkkoord", { omschrijving: k.omschrijving }), sub: `${euro(k.bedrag)} · ${kindLabel(k.kind)}`, status: "Wacht op jou", naar: "/kosten",
    }));
    const zorgItems = alleZorg.filter((v) => v.status === "open").map((v) => ({
        id: `zorg-${v.id}`, icoon: "zorgregeling", titel: v.soort === "eenmalig" ? t("routes.index.zorg.eenmalig") : t("routes.index.zorg.vast"),
        voorstelId: v.id, voorstelKind: v.kinderen[0], sub: v.datumLabel, status: v.vanMij ? "Afstemming loopt" : "Wacht op jou", naar: "/zorgregeling",
        snel: v.vanMij ? undefined : [{ label: t("common.akkoord"), doe: () => accepteerZorg(v.id) }, { label: t("routes.index.afwijzen"), doe: () => wijsAfZorg(v.id) }],
    }));
    const agendaSt = useAgenda();
    // Eigen gezin: voorstellen voor gedeelde afspraken uit de agenda (alleen die op jouw reactie wachten of van jou lopen).
    const agendaVoorstelItems = agendaSt.voorstellen.filter((p) => !p.status).map((p) => {
        const a = agendaSt.events.find((e) => e.id === p.eventId);
        return { id: `agenda-${p.id}`, icoon: "agenda", titel: p.mine ? t("routes.index.agendaVoorstel.jouw") : t("routes.index.agendaVoorstel.vanAnder"), sub: p.velden?.titel ?? a?.titel ?? "", status: p.mine ? "Afstemming loopt" : "Wacht op jou", naar: "/agenda" };
    });
    const afspraakItems = eigenOpenVoorstellen(useAfspraken()).map((v) => ({
        id: `afspraak-${v.id}`, icoon: "voorstel", titel: t("routes.index.jouwVoorstel"), sub: `${v.titel} · ${v.kind}`, status: "Afstemming loopt", naar: "/afspraken",
    }));
    const vakantieItems = alleVakanties.filter((v) => v.status === "voorstel").map((v) => ({
        id: `vakantie-${v.id}`, icoon: "vakantie", titel: v.van === "Sanne" ? t("routes.index.vakantie.jouw") : t("routes.index.vakantie.voorstel"), sub: `${v.naam} · ${v.periode}`,
        status: v.van === "Sanne" ? "Afstemming loopt" : "Wacht op jou", naar: "/planning",
    }));
    const importOpen = useTeControleren();
    const importItems = importOpen > 0 ? [{
            id: "import-ouderschapsplan", icoon: "documenten", titel: t("routes.index.import.titel"),
            sub: t("routes.index.import.sub", { count: importOpen }), status: "Wacht op jou", naar: "/documenten",
        }] : [];
    // Geld komt eerst in "Nog te regelen": zo staat het niet los bovenaan, maar tussen de punten die jouw actie vragen.
    const saldoItems = heeftSaldo ? [{
            id: "kosten-openstaand", icoon: "kosten", titel: t("routes.index.kosten.nogTeBetalen"),
            sub: saldo > 0 ? t("routes.index.kosten.betalen", { bedrag: saldoTekst }) : t("routes.index.kosten.ontvangen", { bedrag: saldoTekst }),
            status: saldo > 0 ? "Wacht op jou" : "Afstemming loopt", naar: "/kosten",
        }] : [];
    const openActies = [...saldoItems, ...kostItems, ...budgetItems, ...zorgItems, ...vakantieItems, ...agendaVoorstelItems, ...importItems, ...afspraakItems];
    // Wat op jou wacht eerst; wat al loopt bij de ander daarna. Binnen een groep blijft de volgorde gelijk.
    const voorJou = useActiviteiten().voorstellen.filter((v) => v.aanJou && !["akkoord", "afgerond", "afgewezen", "ingetrokken"].includes(v.status)).length;
    const toonActies = [...openActies].sort((a, b) => Number(a.status !== "Wacht op jou") - Number(b.status !== "Wacht op jou")).slice(0, 3);
    const vk = useVoorkeuren();
    const [klokNu, setKlokNu] = useState(null);
    useEffect(() => setKlokNu(new Date()), []);
    const eigenVandaag = klokNu ? iso(klokNu) : "";
    const eigenKomend = eigenVandaag ? agendaItems(agendaSt.events).flatMap((a) => voorkomens(a, eigenVandaag, plusDagen(eigenVandaag, 365)).map((datum) => ({ a, datum }))).sort((x, y) => (x.datum + x.a.tijd).localeCompare(y.datum + y.a.tijd)).slice(0, 2) : [];
    const { moment: volgendeWissel } = volgendeVan(useWisselMomenten(14));
    const paklijst = volgendeWissel ? itemsVoor(overdrachtSt, volgendeWissel.id) : [];
    const paklijstTonen = !!volgendeWissel && klokNu && urenTot(volgendeWissel.datum, volgendeWissel.tijd, klokNu) <= 48;
    return (<AppShell>
      <AfspraakFormulier open={afspraakOpen} onSluit={() => setAfspraakOpen(false)}/>
      <LivingSfeer moment={null}/>

      {/* header (stijl A6): Co, meldingen en je profiel rechtsboven */}
      <div className="relative flex items-center justify-end gap-2">
        <Link to="/verhaal" aria-label={t("routes.index.praatMetCo")} className="grid size-11 place-items-center rounded-full border border-[#C9D6C3] bg-[#E9EFE3] text-[15px] font-black text-[#3F5747] shadow-[0_4px_14px_rgba(60,50,40,.08)]">Co</Link>
        <div className="flex items-center gap-1 rounded-full border border-white/90 bg-white/80 p-[3px] shadow-[0_4px_14px_rgba(60,50,40,.08)]">
          <ActiviteitenBel inBalk/>
          <Link to="/instellingen" aria-label={t("routes.index.instellingen")} className="grid size-[38px] place-items-center rounded-full bg-brand-soft font-display text-[15px] font-black text-brand">
            {st.naam.slice(0, 1).toUpperCase()}
          </Link>
        </div>
      </div>

      {/* begroeting */}
      <div className="relative mt-4">
        <h1 className="lora text-[30px] leading-tight">{vk.livingHome && klokNu ? begroeting(klokNu, st.naam) : t("routes.index.fijneDag", { dag: i18n.resolvedLanguage === "en" ? vandaagNaam : vandaagNaam.toLowerCase(), naam: st.naam })}</h1>
        {/* kinderen: tikken opent de kindpagina */}
        <EigenKinderen />
      </div>

      {/* Nu afstemmen doorbreekt tijdelijk de rust */}
      {openNuAfstemmen(nuAfstemmen).filter((n) => n.id !== "na-demo").map((n) => <NuAfstemmenKaart key={n.id} n={n}/>)}

      {/* vandaag: datum, bij wie de kinderen zijn, volgende wissel en de weeklijn */}
      <EigenVandaag />

      {eigenKomend.length ? <section className="relative mt-6">
        <div className="flex items-center justify-between gap-3"><h2 className="min-w-0 font-display text-[21px] font-black">{t("routes.index.binnenkort")}</h2><Link to="/agenda" className="inline-flex min-h-10 shrink-0 items-center text-[15px] font-extrabold text-brand">{t("routes.index.alleAfspraken")}</Link></div>
        <ul className="mt-2.5 overflow-hidden rounded-[22px] border border-white/85 bg-white/60">{eigenKomend.map(({ a, datum }) => <li key={a.id + datum} className="border-b border-[#E9E1D5] last:border-0"><Link to="/agenda" search={{ afspraak: a.id, dag: datum }} className="flex items-center gap-4 px-4 py-3"><span className="w-[4.75rem] shrink-0 whitespace-nowrap leading-tight"><span className="block text-[15px] font-extrabold">{dt(datum).toLocaleDateString(taalLocale(), { weekday: "short", day: "numeric" })}</span><span className="block text-sm text-ink-soft">{a.tijd ? uur(a.tijd) : ""}</span></span><span className="min-w-0 flex-1 truncate text-[16px] font-black">{a.titel}</span></Link></li>)}</ul>
      </section> : null}

      {/* Nog te regelen: één kaart, alleen wat op jou wacht */}
      {voorJou > 0 ? (<Link to="/activiteiten" search={{ onderdeel: "regelen" }} className="relative mt-4 flex items-center gap-4 rounded-[22px] border border-white/85 bg-white/60 px-4 py-3.5">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#DCE3D3] font-display text-lg font-black text-[#3F5747]">{voorJou}</span>
          <span className="min-w-0 flex-1"><span className="block font-display text-[17px] font-black">{t("routes.index.nogTeRegelen")}</span><span className="block truncate text-sm text-ink-soft">{toonActies[0] ? (voorJou > 1 ? t("routes.index.enAndere", { titel: toonActies[0].titel, count: voorJou - 1 }) : toonActies[0].titel) : t("routes.index.actiesVoorJou", { count: voorJou })}</span></span>
          <Chevron className="size-5 shrink-0 text-ink-soft"/>
        </Link>) : (<div className="relative mt-4 flex items-center gap-4 rounded-[22px] border border-white/85 bg-white/60 px-4 py-3.5">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#DCE3D3] text-[#3F5747]" aria-hidden><Vinkje className="size-5"/></span>
          <span className="min-w-0 flex-1"><span className="block font-display text-[17px] font-black">{t("routes.index.nogTeRegelen")}</span><span className="block text-sm text-ink-soft">{t("routes.index.allesAfgestemdPunt")}</span></span>
        </div>)}

      {paklijstTonen ? (<Link to="/overdracht" className="relative mt-2.5 flex items-center gap-4 rounded-[22px] border border-white/85 bg-white/60 px-4 py-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#E9EFE3] text-[#3F5747]"><OverdrachtIcoon /></span>
          <span className="min-w-0 flex-1"><span className="block text-[15px] font-black first-letter:uppercase">{t("routes.index.paklijst.titel", { dag: volgendeWissel.dag })}</span><span className="block text-sm text-ink-soft">{paklijst.length ? t("routes.index.paklijst.ingepakt", { n: paklijst.filter((i) => i.ingepakt).length, totaal: paklijst.length }) : t("routes.index.paklijst.leeg")}</span></span>
          <Chevron className="size-5 text-ink-soft"/>
        </Link>) : null}

      <EigenVolgende />

      {toevoegenOpen ? (<div className="app-modal-achter z-30" onClick={() => { setToevoegenOpen(false); setVoorstelMenu(false); setAfspraakMenu(false); }}>
          <div className="app-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border"/>
            {voorstelMenu ? <p className="font-display text-lg font-bold">{t("routes.index.toevoegen.watRegelen")}</p> : afspraakMenu ? <p className="font-display text-lg font-bold">{t("routes.index.toevoegen.watVoorAfspraak")}</p> : null}
            {!voorstelMenu && !afspraakMenu ? (<>
                <Link to="/veranderd" className="mt-3 flex items-center gap-3 rounded-lg bg-[color-mix(in_oklch,var(--ic-koraal)_14%,transparent)] px-3 py-3">
                  <AppIcon functie="afstemmen"/>
                  <span className="flex-1">
                    <span className="block text-sm font-bold">{t("routes.index.toevoegen.nuAfstemmen")}</span>
                    <span className="block text-xs font-semibold text-ink">{t("routes.index.toevoegen.onverwacht")}</span>
                    <span className="block text-xs text-ink-soft">{t("routes.index.toevoegen.bijvoorbeeld")}</span>
                  </span>
                  <Chevron className="size-4 text-ink-soft"/>
                </Link>
                <div className="my-4 h-px bg-border"/>
                <p className="font-display text-lg font-bold">{t("routes.index.toevoegen.watToevoegen")}</p>
              </>) : null}
            <ul className="mt-3 space-y-0.5">
              {voorstelMenu
                ? voorstelOpties.map((o) => (<li key={o.id}>
                      <Link to={o.to} search={o.search} className="flex items-center gap-3 py-3 text-sm font-semibold">
                        <span className="flex-1">{t(`routes.index.voorstelOptie.${o.id}`)}</span>
                        <Chevron className="size-4 text-ink-soft"/>
                      </Link>
                    </li>))
                : afspraakMenu
                    ? afspraakOpties.map((o) => (<li key={o.label}>
                        <Link to={o.to} search={o.search} onClick={() => { setToevoegenOpen(false); setAfspraakMenu(false); }} className="flex items-center gap-3 py-3 text-sm font-semibold">
                          <span className="flex-1">{o.label}</span>
                          <Chevron className="size-4 text-ink-soft"/>
                        </Link>
                      </li>))
                    : toevoegOpties.map((o) => (<li key={o.id}>
                      {o.id === "voorstel" ? (<button onClick={() => setVoorstelMenu(true)} className="flex w-full items-center gap-3 py-3 text-left text-sm font-semibold">
                          <AppIcon functie={o.icoon}/>
                          <span className="flex-1">{t("routes.index.toevoegen.voorstelDoen")}</span>
                          <Chevron className="size-4 text-ink-soft"/>
                        </button>) : o.id === "afspraak" ? (<button onClick={() => { setToevoegenOpen(false); setAfspraakOpen(true); }} className="flex w-full items-center gap-3 py-3 text-left text-sm font-semibold">
                          <AppIcon functie={o.icoon}/>
                          <span className="flex-1">{t("routes.index.toevoegOptie.afspraak")}</span>
                          <Chevron className="size-4 text-ink-soft"/>
                        </button>) : (<Link to={o.to} search={("search" in o ? o.search : undefined)} className="flex items-center gap-3 py-3 text-sm font-semibold">
                          <AppIcon functie={o.icoon}/>
                          <span className="flex-1">{t(`routes.index.toevoegOptie.${o.id}`)}</span>
                          <Chevron className="size-4 text-ink-soft"/>
                        </Link>)}
                    </li>))}
            </ul>
            <button onClick={() => (voorstelMenu ? setVoorstelMenu(false) : afspraakMenu ? setAfspraakMenu(false) : setToevoegenOpen(false))} className="mt-3 min-h-11 w-full rounded-full border border-border bg-card px-5 text-sm font-semibold text-ink-soft">
              {voorstelMenu || afspraakMenu ? t("common.terug") : t("common.sluiten")}
            </button>
          </div>
        </div>) : null}
      <Sheet open={puntenOpen} onOpenChange={setPuntenOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-xl bg-card">
          <SheetHeader><SheetTitle className="font-display">{t("routes.index.punten.titel", { count: openActies.length })}</SheetTitle></SheetHeader>
          {openActies.length === 0 ? <p className="px-4 pb-4 text-sm text-brand"><MetVinkje>{t("routes.index.punten.allesAfgestemd")}</MetVinkje></p> : (<div className="px-4 pb-4">
              {["Wacht op jou", "Afstemming loopt"].map((groep) => {
                const items = openActies.filter((a) => (groep === "Wacht op jou" ? a.status === "Wacht op jou" : a.status !== "Wacht op jou"));
                if (items.length === 0)
                    return null;
                return (<section key={groep} className="mt-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{statusLabel(groep)} · {items.length}</h3>
                    <ul className="divide-y divide-border">
                      {items.map((a) => (<li key={a.id}>
                          <Link to={a.naar} search={("voorstelId" in a ? { voorstel: a.voorstelId, kind: a.voorstelKind } : a.search)} onClick={(e) => { setPuntenOpen(false); if (a.id === "kosten-openstaand") {
                        e.preventDefault();
                        setKostenOpen(true);
                    }
                    else
                        markeerVanOverzicht(); }} className="flex items-center gap-3 py-3">
                            <AppIcon functie={a.icoon} maat="sm"/>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold leading-snug">{a.titel}</p>
                              <p className="truncate text-xs text-ink-soft">{a.sub}</p>
                            </div>
                            <Chevron className="size-4 text-ink-soft"/>
                          </Link>
                          {"snel" in a && a.snel ? (<div className="-mt-1 flex flex-wrap gap-2 pb-3 pl-9">
                              {a.snel.map((s) => (<button key={s.label} type="button" onClick={s.doe} className="min-h-9 rounded-full border border-border px-3.5 text-xs font-semibold text-ink hover:bg-muted">{s.label}</button>))}
                            </div>) : null}
                        </li>))}
                    </ul>
                  </section>);
            })}
            </div>)}
          {afgerond.length > 0 ? (<details className="group px-4 pb-6">
              <summary className="flex list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden min-h-11 cursor-pointer text-xs font-semibold uppercase tracking-wide text-ink-soft"><Chevron className="size-4 shrink-0 group-open:rotate-90"/>{t("routes.index.afgerond.kop", { n: afgerond.length })}</summary>
              <ul className="mt-2 divide-y divide-border">
                {afgerond.map((a) => (<li key={a.id}>
                    <Link to={a.naar} onClick={() => { setPuntenOpen(false); markeerVanOverzicht(); }} className="flex items-center gap-3 py-2.5 text-sm text-ink-soft">
                      <Vinkje className="size-4 shrink-0 text-brand"/><span className="min-w-0 flex-1">{a.titel}</span><Chevron className="size-4"/>
                    </Link>
                  </li>))}
              </ul>
            </details>) : null}
        </SheetContent>
      </Sheet>
      <Sheet open={kostenOpen} onOpenChange={setKostenOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-xl bg-card">
          <SheetHeader><SheetTitle className="font-display">{saldo > 0 ? t("routes.index.kosten.betalen", { bedrag: saldoTekst }) : t("routes.index.kosten.ontvangen", { bedrag: saldoTekst })}</SheetTitle></SheetHeader>
          <div className="space-y-4 px-4 pb-4">
            {[[t("routes.index.kosten.jouwAandeel"), saldoDetail.ikAanAnder], [t("routes.index.kosten.aandeelAnder"), saldoDetail.anderAanIk]].map(([titel, kant]) => kant.posten.length === 0 ? null : (<div key={titel}>
                  <p className="text-xs font-semibold text-ink-soft">{titel}</p>
                  <ul className="mt-1 divide-y divide-border">
                    {kant.posten.map(({ post, aandeel }) => (<li key={post.id} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                        <span className="min-w-0"><span className="block truncate font-semibold">{post.omschrijving}</span><span className="text-xs text-ink-soft">{t("routes.index.kosten.totaal", { bedrag: euro(post.bedrag) })}</span></span>
                        <span className="shrink-0 font-semibold">{euro(aandeel)}</span>
                      </li>))}
                  </ul>
                </div>))}
            <div className="flex justify-between border-t border-border pt-3 text-sm font-semibold"><span>{t("routes.index.kosten.nogTeBetalen")}</span><span>{saldoTekst}</span></div>
            <Link to="/kosten" onClick={() => setKostenOpen(false)} className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-border bg-card px-5 text-sm font-semibold text-brand"><MetChevron>{t("routes.index.kosten.betalingBekijken")}</MetChevron></Link>
          </div>
        </SheetContent>
      </Sheet>
    </AppShell>);
}
