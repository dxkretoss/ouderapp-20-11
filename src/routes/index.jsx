import i18n, { taalLocale } from "@/i18n";
import { useTranslation } from "react-i18next";
import { agendaItems, iso, plusDagen, voorkomens, dt } from "@/lib/agenda-datum";
import { uur } from "@/lib/tijd-tekst";
import { AppIcon } from "@/components/AppIcon";
import { Chevron, MetChevron, MetVinkje, Vinkje } from "@/components/Tekens";
import { demoUrenTotWissel, useOverdracht } from "@/lib/overdracht-store";
import { IkBenLater } from "@/components/IkBenLater";
import { EigenKinderen, EigenVandaag, EigenVolgende } from "@/components/EersteHome";
import { useStart } from "@/lib/start-store";
import { NuAfstemmenKaart } from "@/components/NuAfstemmen";
import { openNuAfstemmen, useNuAfstemmen } from "@/lib/nu-afstemmen-store";
import { markeerVanOverzicht, neemHeropen } from "@/lib/terug-store";
import { accepteer as accepteerZorg, wijsAf as wijsAfZorg } from "@/lib/zorg-store";
import { reageer as reageerBudget } from "@/lib/budget-store";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AppShell } from "@/components/AppShell";
import { ActiviteitenBel, useActiviteiten } from "@/components/Activiteiten";
import { useBudgetten } from "@/lib/budget-store";
import { useZorg } from "@/lib/zorg-store";
import { eigenOpenVoorstellen, useAfspraken } from "@/lib/afspraken-store";
import { useVakanties } from "@/lib/vakantie-store";
import { useTeControleren } from "@/lib/import-store";
import { useActiesVerwerkt } from "@/lib/acties-store";
import { useProWerk, voorOudersVan } from "@/lib/pro-journaal-store";
import { LivingSfeer } from "@/components/LivingHome";
import { begroeting, bijzonderMoment } from "@/lib/living-home";
import { useVoorkeuren } from "@/lib/voorkeuren-store";
import { nogTeVerrekenen, useKosten } from "@/lib/kosten-store";
import { berekenSaldo } from "@/lib/verrekening";
import { useWissel } from "@/lib/wissel-store";
import { meeLijst, useTaken } from "@/lib/taken-store";
import { afspraken, categorieMeta, kinderen, kleurVanKind, zorgweek } from "@/lib/demo-data";
import { useMomentjes } from "@/lib/momentjes-store";
import { regelStatus, toggleMee, useKring } from "@/lib/kring-store";
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
function HomePagina() {
    return <Dashboard />;
}
const acties = [
    // status is een interne waarde ("Wacht op jou" / "Afstemming loopt"); de weergave gaat via statusLabel.
    { id: "afspraak-voorstel", icoon: "voorstel", get titel() { return i18n.t("routes.index.demoActie.titel"); }, get sub() { return i18n.t("routes.index.demoActie.sub"); }, status: "Wacht op jou", naar: "/afspraken" },
];
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
    const eigen = st.eigen;
    const [toevoegenOpen, setToevoegenOpen] = useState(false);
    const [voorstelMenu, setVoorstelMenu] = useState(false);
    const [afspraakMenu, setAfspraakMenu] = useState(false);
    const [puntenOpen, setPuntenOpen] = useState(false);
    const PLAN_GEZIEN = "onzeapp-plan-wijziging-gezien-8-maart";
    const [planGezien, setPlanGezien] = useState(false);
    useEffect(() => { try {
        setPlanGezien(localStorage.getItem(PLAN_GEZIEN) === "1");
    }
    catch { /* geen opslag */ } }, []);
    useEffect(() => { if (neemHeropen())
        setPuntenOpen(true); }, []);
    const [spullenOpen, setSpullenOpen] = useState(false);
    const verwerkt = useActiesVerwerkt();
    const kring = useKring();
    const nuAfstemmen = useNuAfstemmen();
    useTaken();
    // Eén bron voor wat er mee moet: dezelfde lijst als Overdracht en Even vooruitkijken.
    const wisselMoment = kring.momenten.find((m) => m.soort === "wissel");
    const meeItems = wisselMoment ? meeLijst(wisselMoment) : [];
    const meeKlaar = wisselMoment ? kring.meeKlaar[wisselMoment.id] ?? [] : [];
    const ophalen = regelStatus("w1");
    const wissel = useWissel();
    const overdrachtSt = useOverdracht();
    const kostenLijst = useKosten();
    const saldo = nogTeVerrekenen(kostenLijst);
    const saldoDetail = berekenSaldo(kostenLijst);
    const [kostenOpen, setKostenOpen] = useState(false);
    const { lijst: momentjes } = useMomentjes();
    const heeftSaldo = Math.abs(saldo) >= 0.01;
    const saldoTekst = euro(Math.abs(saldo));
    // Wat de professional aan deze ouder vraagt, komt uit dezelfde bron als in de professionele werkruimte.
    const vanPro = voorOudersVan(useProWerk(), "bakker", "Sanne");
    const proItems = [
        ...vanPro.acties.filter((a) => !a.klaar).map((a) => ({ id: `pro-${a.id}`, icoon: "taken", titel: a.tekst, sub: t("routes.index.pro.gevraagd"), status: "Wacht op jou", naar: "/ondersteuning" })),
        ...vanPro.gezamenlijk.filter((g) => !g.akkoord["Sanne"] && !g.nietAkkoord?.["Sanne"]).map((g) => ({ id: `pro-${g.id}`, icoon: "afspraak", titel: t("routes.index.pro.terBevestiging"), sub: g.tekst, status: "Wacht op jou", naar: "/ondersteuning" })),
        ...vanPro.berichten.filter((b) => !b.gezien["Sanne"]).map((b) => ({ id: `pro-${b.id}`, icoon: "post", titel: t("routes.index.pro.bericht"), sub: b.onderwerp, status: "Wacht op jou", naar: "/ondersteuning" })),
    ];
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
        sub: `${b.wat} · ${b.kind} · ${euro(b.stappen.at(-1)?.bedrag ?? b.max)}`, status: b.aanZet === "Sanne" ? "Wacht op jou" : "Afstemming loopt", naar: "/kosten",
        snel: b.aanZet === "Sanne" ? [{ label: t("common.akkoord"), doe: () => reageerBudget(b.id, "Sanne", "akkoord") }] : undefined,
    }));
    const zorgItems = alleZorg.filter((v) => v.status === "open").map((v) => ({
        id: `zorg-${v.id}`, icoon: "zorgregeling", titel: v.soort === "eenmalig" ? t("routes.index.zorg.eenmalig") : t("routes.index.zorg.vast"),
        voorstelId: v.id, voorstelKind: v.kinderen[0], sub: v.datumLabel, status: v.van === "Sanne" ? "Afstemming loopt" : "Wacht op jou", naar: "/zorgregeling",
        snel: v.van === "Sanne" ? undefined : [{ label: t("common.akkoord"), doe: () => accepteerZorg(v.id) }, { label: t("routes.index.afwijzen"), doe: () => wijsAfZorg(v.id) }],
    }));
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
    const openActies = eigen ? [...afspraakItems] : [
        // Geld komt eerst in "Nog te regelen": zo staat het niet los bovenaan, maar tussen de punten die jouw actie vragen.
        ...(heeftSaldo
            ? [{
                    id: "kosten-openstaand",
                    icoon: "kosten",
                    titel: t("routes.index.kosten.nogTeBetalen"),
                    sub: saldo > 0 ? t("routes.index.kosten.betalen", { bedrag: saldoTekst }) : t("routes.index.kosten.ontvangen", { bedrag: saldoTekst }),
                    status: "Wacht op jou",
                    naar: "/kosten",
                }]
            : []),
        ...budgetItems,
        ...vakantieItems,
        ...importItems,
        ...afspraakItems,
        ...zorgItems,
        ...acties.filter((a) => !verwerkt.has(a.id)),
        ...proItems,
    ];
    // Wat op jou wacht eerst; wat al loopt bij de ander daarna. Binnen een groep blijft de volgorde gelijk.
    const zorgVoorJou = eigen ? [] : alleZorg.filter((v) => v.status === "open" && v.van !== "Sanne");
    const voorJou = useActiviteiten().voorstellen.filter((v) => v.aanJou && !["akkoord", "afgerond", "afgewezen", "ingetrokken"].includes(v.status)).length;
    const toonActies = [...openActies].sort((a, b) => Number(a.status !== "Wacht op jou") - Number(b.status !== "Wacht op jou")).slice(0, 3);
    const vk = useVoorkeuren();
    const [klokNu, setKlokNu] = useState(null);
    useEffect(() => setKlokNu(new Date()), []);
    const spullenTeGaan = meeItems.filter((x) => !meeKlaar.includes(x)).length;
    const huidigeDag = 12;
    const wisseldag = zorgweek.find((dag) => dag.wissel);
    const huidigeIndex = zorgweek.findIndex((dag) => dag.datum === huidigeDag);
    const wisselIndex = zorgweek.findIndex((dag) => dag.wissel);
    const wisselPct = ((wisselIndex + 14.5 / 24) / zorgweek.length) * 100;
    const huidigePct = ((huidigeIndex + 0.5) / zorgweek.length) * 100;
    const dagenTotWissel = wisseldag ? wisseldag.datum - huidigeDag : 2;
    const zwemtasNodig = !wissel.klaar.has("zwemtas");
    const dagen = zorgweek.filter((d) => d.datum >= 12 && d.datum <= 15);
    const vorigJaar = new Date(nu.getFullYear() - 1, nu.getMonth(), nu.getDate());
    const vorigJaarIso = `${vorigJaar.getFullYear()}-${String(vorigJaar.getMonth() + 1).padStart(2, "0")}-${String(vorigJaar.getDate()).padStart(2, "0")}`;
    const jaarMomentjes = momentjes.filter((m) => m.datum === vorigJaarIso && !m.prive);
    const moment = bijzonderMoment({ kinderen, wisselTijd: dagenTotWissel === 0 ? "14:30" : undefined, nu });
    const tip = dagenTotWissel <= 2
        ? t("routes.index.tip.spullen")
        : t("routes.index.tip.overdracht");
    const overdrachtDichtbij = dagenTotWissel <= 1;
    // Vertrekmodus: op de wisseldag in de 3 uur vóór 14:30; na de wissel verdwijnt hij.
    const uurNu = new Date().getHours() + new Date().getMinutes() / 60;
    const vertrekModus = dagenTotWissel <= 0 && uurNu >= 11.5 && uurNu < 14.5;
    const wisselLabel = t(`routes.index.wisselLabel.${dagenTotWissel <= 0 ? "vandaag" : dagenTotWissel === 1 ? "morgen" : "vrijdag"}`);
    const komend = afspraken
        .filter((a) => a.dag >= huidigeDag && a.categorie !== "wissel")
        .sort((a, b) => a.dag - b.dag || a.tijd.localeCompare(b.tijd))
        .slice(0, 3);
    const dagNaam = (n) => zorgweek.find((d) => d.datum === n)?.dag ?? "";
    const eigenVandaag = klokNu ? iso(klokNu) : "";
    const eigenKomend = eigenVandaag ? agendaItems(st.agenda).flatMap((a) => voorkomens(a, eigenVandaag, plusDagen(eigenVandaag, 365)).map((datum) => ({ a, datum }))).sort((x, y) => (x.datum + x.a.tijd).localeCompare(y.datum + y.a.tijd)).slice(0, 2) : [];
    const maandKort = "mrt"; // demo-maand, gelijk aan de agenda
    return (<AppShell>
      <LivingSfeer moment={eigen ? null : moment}/>

      {/* header (stijl A6): Co, meldingen en je profiel rechtsboven */}
      <div className="relative flex items-center justify-end gap-2">
        <Link to="/verhaal" aria-label={t("routes.index.praatMetCo")} className="grid size-11 place-items-center rounded-full border border-[#C9D6C3] bg-[#E9EFE3] text-[15px] font-black text-[#3F5747] shadow-[0_4px_14px_rgba(60,50,40,.08)]">Co</Link>
        <div className="flex items-center gap-1 rounded-full border border-white/90 bg-white/80 p-[3px] shadow-[0_4px_14px_rgba(60,50,40,.08)]">
          <ActiviteitenBel inBalk/>
          <Link to="/instellingen" aria-label={t("routes.index.instellingen")} className="grid size-[38px] place-items-center rounded-full bg-brand-soft font-display text-[15px] font-black text-brand">
            {(eigen ? st.naam : "Sanne").slice(0, 1).toUpperCase()}
          </Link>
        </div>
      </div>

      {/* begroeting */}
      <div className="relative mt-4">
        <h1 className="lora text-[30px] leading-tight">{vk.livingHome && klokNu ? begroeting(klokNu, eigen ? st.naam : "Sanne") : t("routes.index.fijneDag", { dag: i18n.resolvedLanguage === "en" ? vandaagNaam : vandaagNaam.toLowerCase(), naam: eigen ? st.naam : "Sanne" })}</h1>
        {!eigen && vk.livingHome && vk.bijzondereMomenten && moment && <p className="mt-1 text-xs font-semibold text-accent-warm">{moment.tekst}</p>}
        {/* kinderen: tikken opent de kindpagina */}
        {eigen ? <EigenKinderen /> : <div className="mt-3 flex flex-wrap gap-2.5" role="group" aria-label={t("routes.index.kindPagina")}>
          {kinderen.map((kind) => (<Link key={kind.id} to="/kinderen/$kindId" params={{ kindId: kind.id }} className="flex items-center gap-2.5 rounded-full border border-white/85 bg-white/60 py-1 pl-1 pr-4 text-[15px]">
              <span className="grid size-9 place-items-center rounded-full font-display text-base font-black text-white" style={{ background: kind.kleur }}>{kind.naam.slice(0, 1)}</span>
              <span className="font-extrabold">{kind.naam}</span>
            </Link>))}
        </div>}
      </div>

      {/* Nu afstemmen doorbreekt tijdelijk de rust */}
      {openNuAfstemmen(nuAfstemmen).filter((n) => !eigen || n.id !== "na-demo").map((n) => <NuAfstemmenKaart key={n.id} n={n}/>)}

      {/* vandaag: datum, bij wie de kinderen zijn, volgende wissel en de weeklijn */}
      {eigen ? <EigenVandaag /> : <section className="relative mt-5 rounded-[26px] border border-white/85 bg-white/60 px-5 pb-4 pt-4 shadow-[0_8px_24px_rgba(60,50,40,.06)]">
        <p className="text-[12.5px] font-extrabold uppercase tracking-[0.1em] text-brand">{vandaagNaam} {vandaagDatum}</p>
        <p className="mt-1 font-display text-[21px] font-black leading-snug">{dagenTotWissel <= 0 ? t("routes.index.vandaag.wisseldag") : t("routes.index.vandaag.bijJou")}</p>
        <p className="mt-0.5 text-[15px] text-brand">{t(`routes.index.vandaag.wissel.${dagenTotWissel <= 0 ? "vandaag" : dagenTotWissel === 1 ? "morgen" : "vrijdag"}`)}</p>

        <div className="relative mx-3 mt-5 h-7" aria-label={t("routes.index.weeklijn")}>
          <span className="absolute left-0 right-0 top-1/2 h-[4px] -translate-y-1/2 rounded-full" style={{ background: `linear-gradient(to right, #6F8F78 ${wisselPct}%, #A88B72 ${wisselPct}%)` }}/>
          <span className="home-vandaag-punt absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#3F5747]" style={{ left: `${huidigePct}%`, boxShadow: "0 0 0 3px #fff" }}/>
          <span className="absolute top-1/2 grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-[#6F8F78] bg-white text-[#3F5747]" style={{ left: `${wisselPct}%` }}><WisselIcoon /></span>
        </div>
        <div className="mt-2 grid grid-cols-7">
          {zorgweek.map((d) => (<span key={d.datum} className={`text-center text-[11px] uppercase tracking-[0.12em] ${d.datum === huidigeDag ? "font-black text-ink" : "font-semibold text-ink-soft"}`}>{d.dag}</span>))}
        </div>

        {/* overdracht: pas binnen 24 uur */}
        {vertrekModus && meeItems.length && !wissel.overdrachtIngevuld ? (<div className="mt-4 rounded-2xl bg-[#E9EFE3] px-3.5 py-3">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-brand">{t("routes.index.bijnaTijd", { label: wisselLabel })}</p>
            {wisselMoment ? <IkBenLater momentId={wisselMoment.id}/> : null}
            <ul className="mt-2 space-y-1.5">
              {meeItems.map((item) => {
                    const klaar = meeKlaar.includes(item);
                    return (<li key={item}>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={klaar} onChange={() => wisselMoment && toggleMee(wisselMoment.id, item)} className="size-4 accent-[var(--brand)]"/>
                      <span className={klaar ? "text-ink-soft line-through" : ""}>{item}</span>
                    </label>
                  </li>);
                })}
            </ul>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-ink-soft">{spullenTeGaan === 0 ? <MetVinkje achter>{t("routes.index.mee.allesAf")}</MetVinkje> : t("routes.index.mee.nietAf", { count: spullenTeGaan })}</span>
              <Link to="/overdracht" className="inline-flex min-h-10 items-center text-xs font-bold text-brand"><MetChevron>{t("routes.index.mee.linkPijl")}</MetChevron></Link>
            </div>
          </div>) : overdrachtDichtbij ? (<Link to="/overdracht" className="mt-4 flex items-center gap-3 rounded-2xl bg-[#E9EFE3] px-3.5 py-3">
            <span className="text-brand"><OverdrachtIcoon /></span>
            <span className="flex-1">
              <span className="block text-sm font-extrabold">{wissel.overdrachtIngevuld || spullenTeGaan === 0 ? t("routes.index.mee.allesKlaar") : t("routes.index.mee.titel")}</span>
              <span className="text-xs text-ink-soft">{wisselLabel}{spullenTeGaan > 0 && !wissel.overdrachtIngevuld ? ` · ${t("routes.index.mee.nogMee", { count: spullenTeGaan })}` : ""}</span>
            </span>
            <Chevron className="size-4 text-ink-soft"/>
          </Link>) : null}
      </section>}

      {/* Overdracht: herinnering vóór de wissel (24 uur; in het voorbeeldgezin staat de wissel over 2 dagen, daar al zichtbaar) */}
      {!eigen && !overdrachtSt.gedeeld.some((o) => o.momentId === "w1") && demoUrenTotWissel(wisseldag?.datum) > 0 && demoUrenTotWissel(wisseldag?.datum) <= 48 ? (<Link to="/overdracht" hash="overdracht" className="relative mt-4 flex items-center gap-3.5 rounded-[22px] border-2 border-[#A9BCA8] px-4 py-3.5" style={{ background: "linear-gradient(135deg, rgba(220,230,210,.95), rgba(233,239,227,.9))" }}>
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/80 text-[#3F5747]"><AppIcon functie="documenten" maat="sm" vorm="kaal"/></span>
          <span className="min-w-0 flex-1"><span className="block font-display text-[17px] font-black text-[#2F4A3A]">{t("routes.index.overdracht.titel")}</span><span className="block text-sm text-[#3F5747]">{t(`routes.index.overdracht.wissel.${dagenTotWissel <= 0 ? "vandaag" : dagenTotWissel === 1 ? "morgen" : "vrijdag"}`)} {/school|opvang|childcare|nursery/i.test(kring.momenten.find((m) => m.id === "w1")?.plek ?? "") ? t("routes.index.overdracht.nietZien") : t("routes.index.overdracht.invullen")}</span></span>
          <Chevron className="size-5 text-[#3F5747]"/>
        </Link>) : null}

      {/* Binnenkort: maximaal drie afspraken, met de kindkleur */}
      {!eigen && komend.length ? (<section className="relative mt-6">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-[21px] font-black">{t("routes.index.binnenkort")}</h2>
            <Link to="/agenda" className="text-[15px] font-extrabold text-brand">{t("routes.index.alleAfspraken")}</Link>
          </div>
          <ul className="mt-2.5 overflow-hidden rounded-[22px] border border-white/85 bg-white/60">
            {komend.map((a) => (<li key={a.id} className="border-b border-[#E9E1D5] last:border-0">
                <Link to="/agenda" search={{ afspraak: a.id }} className="flex items-center gap-4 px-4 py-3">
                  <span className="w-[4.75rem] shrink-0 whitespace-nowrap leading-tight"><span className="block text-[15px] font-extrabold">{dagNaam(a.dag)} {a.dag}</span><span className="block text-sm text-ink-soft">{uur(a.tijd)}</span></span>
                  <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: kleurVanKind(a.kind.split(/ & | en /)[0] ?? a.kind) }}/>
                  <span className="min-w-0 flex-1 truncate text-[16px] font-black">{a.titel.split(" · ")[0]}</span>
                </Link>
              </li>))}
          </ul>
        </section>) : null}

      {eigen && eigenKomend.length ? <section className="relative mt-6">
        <div className="flex items-baseline justify-between"><h2 className="font-display text-[21px] font-black">{t("routes.index.binnenkort")}</h2><Link to="/agenda" className="text-[15px] font-extrabold text-brand">{t("routes.index.alleAfspraken")}</Link></div>
        <ul className="mt-2.5 overflow-hidden rounded-[22px] border border-white/85 bg-white/60">{eigenKomend.map(({ a, datum }) => <li key={a.id + datum} className="border-b border-[#E9E1D5] last:border-0"><Link to="/agenda" search={{ afspraak: a.id, dag: datum }} className="flex items-center gap-4 px-4 py-3"><span className="w-[4.75rem] shrink-0 whitespace-nowrap leading-tight"><span className="block text-[15px] font-extrabold">{dt(datum).toLocaleDateString(taalLocale(), { weekday: "short", day: "numeric" })}</span><span className="block text-sm text-ink-soft">{a.tijd ? uur(a.tijd) : ""}</span></span><span className="min-w-0 flex-1 truncate text-[16px] font-black">{a.titel}</span></Link></li>)}</ul>
      </section> : null}

      {/* Nog te regelen: één kaart, alleen wat op jou wacht */}
      {voorJou > 0 ? (<Link to="/activiteiten" search={{ onderdeel: "regelen" }} className="relative mt-4 flex items-center gap-4 rounded-[22px] border border-white/85 bg-white/60 px-4 py-3.5">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#DCE3D3] font-display text-lg font-black text-[#3F5747]">{voorJou}</span>
          <span className="min-w-0 flex-1"><span className="block font-display text-[17px] font-black">{t("routes.index.nogTeRegelen")}</span><span className="block truncate text-sm text-ink-soft">{toonActies[0] ? (voorJou > 1 ? t("routes.index.enAndere", { titel: toonActies[0].titel, count: voorJou - 1 }) : toonActies[0].titel) : t("routes.index.actiesVoorJou", { count: voorJou })}</span></span>
          <Chevron className="size-5 text-ink-soft"/>
        </Link>) : (<div className="relative mt-4 flex items-center gap-4 rounded-[22px] border border-white/85 bg-white/60 px-4 py-3.5">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#DCE3D3] text-[#3F5747]" aria-hidden><Vinkje className="size-5"/></span>
          <span><span className="block font-display text-[17px] font-black">{t("routes.index.nogTeRegelen")}</span><span className="block text-sm text-ink-soft">{t("routes.index.allesAfgestemdPunt")}</span></span>
        </div>)}

      {eigen ? <EigenVolgende /> : null}

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
                        </button>) : o.id === "afspraak" ? (<Link to="/agenda" search={{ nieuw: true }} onClick={() => setToevoegenOpen(false)} className="flex w-full items-center gap-3 py-3 text-left text-sm font-semibold">
                          <AppIcon functie={o.icoon}/>
                          <span className="flex-1">{t("routes.index.toevoegOptie.afspraak")}</span>
                          <Chevron className="size-4 text-ink-soft"/>
                        </Link>) : (<Link to={o.to} search={("search" in o ? o.search : undefined)} className="flex items-center gap-3 py-3 text-sm font-semibold">
                          <AppIcon functie={o.icoon}/>
                          <span className="flex-1">{t(`routes.index.toevoegOptie.${o.id}`)}</span>
                          <Chevron className="size-4 text-ink-soft"/>
                        </Link>)}
                    </li>))}
            </ul>
            <button onClick={() => (voorstelMenu ? setVoorstelMenu(false) : afspraakMenu ? setAfspraakMenu(false) : setToevoegenOpen(false))} className="mt-3 w-full py-2 text-sm font-semibold text-ink-soft">
              {voorstelMenu || afspraakMenu ? t("common.terug") : t("common.sluiten")}
            </button>
          </div>
        </div>) : null}
      <Sheet open={puntenOpen} onOpenChange={setPuntenOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-xl bg-card">
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
                          <Link to={a.naar} search={("voorstelId" in a ? { voorstel: a.voorstelId, kind: a.voorstelKind } : undefined)} onClick={(e) => { setPuntenOpen(false); if (a.id === "kosten-openstaand") {
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
                          {"snel" in a && a.snel ? (<div className="-mt-1 flex gap-2 pb-3 pl-9">
                              {a.snel.map((s) => (<button key={s.label} type="button" onClick={s.doe} className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-ink hover:bg-muted">{s.label}</button>))}
                            </div>) : null}
                        </li>))}
                    </ul>
                  </section>);
            })}
            </div>)}
          {afgerond.length > 0 ? (<details className="group px-4 pb-6">
              <summary className="flex list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden cursor-pointer text-xs font-semibold uppercase tracking-wide text-ink-soft"><Chevron className="size-4 shrink-0 group-open:rotate-90"/>{t("routes.index.afgerond.kop", { n: afgerond.length })}</summary>
              <ul className="mt-2 divide-y divide-border">
                {afgerond.map((a) => (<li key={a.id}>
                    <Link to={a.naar} onClick={() => { setPuntenOpen(false); markeerVanOverzicht(); }} className="flex items-center gap-3 py-2.5 text-sm text-ink-soft">
                      <Vinkje className="size-4 text-brand"/><span className="flex-1">{a.titel}</span><Chevron className="size-4"/>
                    </Link>
                  </li>))}
              </ul>
            </details>) : null}
        </SheetContent>
      </Sheet>
      <Sheet open={spullenOpen} onOpenChange={setSpullenOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-xl bg-card">
          <SheetHeader><SheetTitle className="font-display">{spullenTeGaan === 0 ? t("routes.index.spullen.klaar") : t("routes.index.spullen.meenemen", { count: spullenTeGaan })}</SheetTitle></SheetHeader>
          <ul className="divide-y divide-border px-4">
            {meeItems.map((item) => {
            const klaar = meeKlaar.includes(item);
            return (<li key={item}>
                  <label className="flex cursor-pointer items-center gap-3 py-3">
                    <input type="checkbox" checked={klaar} onChange={() => wisselMoment && toggleMee(wisselMoment.id, item)} className="size-4 accent-[var(--brand)]"/>
                    <span className={`text-sm ${klaar ? "text-ink-soft line-through" : ""}`}>{item}</span>
                  </label>
                </li>);
        })}
          </ul>
          <Link to="/overdracht" onClick={() => setSpullenOpen(false)} className="mx-4 mb-4 mt-2 inline-block text-sm font-semibold text-brand"><MetChevron>{t("routes.index.spullen.heleOverdracht")}</MetChevron></Link>
        </SheetContent>
      </Sheet>
      <Sheet open={kostenOpen} onOpenChange={setKostenOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-xl bg-card">
          <SheetHeader><SheetTitle className="font-display">{saldo > 0 ? t("routes.index.kosten.betalen", { bedrag: saldoTekst }) : t("routes.index.kosten.ontvangen", { bedrag: saldoTekst })}</SheetTitle></SheetHeader>
          <div className="space-y-4 px-4 pb-4">
            {[[t("routes.index.kosten.jouwAandeel"), saldoDetail.sanneAanJoris], [t("routes.index.kosten.aandeelAnder"), saldoDetail.jorisAanSanne]].map(([titel, kant]) => kant.posten.length === 0 ? null : (<div key={titel}>
                  <p className="text-xs font-semibold text-ink-soft">{titel}</p>
                  <ul className="mt-1 divide-y divide-border">
                    {kant.posten.map(({ post, aandeel }) => (<li key={post.id} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                        <span className="min-w-0"><span className="block truncate font-semibold">{post.omschrijving}</span><span className="text-xs text-ink-soft">{t("routes.index.kosten.totaal", { bedrag: euro(post.bedrag) })}</span></span>
                        <span className="shrink-0 font-semibold">{euro(aandeel)}</span>
                      </li>))}
                  </ul>
                </div>))}
            <div className="flex justify-between border-t border-border pt-3 text-sm font-semibold"><span>{t("routes.index.kosten.nogTeBetalen")}</span><span>{saldoTekst}</span></div>
            <Link to="/kosten" onClick={() => setKostenOpen(false)} className="inline-block text-sm font-semibold text-brand"><MetChevron>{t("routes.index.kosten.betalingBekijken")}</MetChevron></Link>
          </div>
        </SheetContent>
      </Sheet>
    </AppShell>);
}
