import { Mijlpalen, useMijlpalenLijst, voegMijlpaal } from "@/components/Mijlpalen";
import { BewerkPotlood } from "@/components/ui-kit";
import { useKring, adresboek, persoonLabel } from "@/lib/kring-store";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { AppShell, BackButton, PageHeader } from "@/components/AppShell";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import i18n, { taalLocale } from "@/i18n";
import { datumWeergave, documentCategorieLabel, documenten, gezondheidLabel, kindbank, kinderen, useGezondheid, bewaarGezondheid } from "@/lib/demo-data";
import { Button } from "@/components/ui/button";
import { DeelMomentje, MomentjeKaart } from "@/components/Momentjes";
import { useMomentjes } from "@/lib/momentjes-store";
import { AppIcon } from "@/components/AppIcon";
import { Plus } from "lucide-react";
import { Chevron, MetChevron } from "@/components/Tekens";
import { useStart, leeftijdTekst, gezagKeuzes, kindKleuren, start } from "@/lib/start-store";
import { bevestig } from "@/lib/feedback";
import { GezagSheet } from "@/components/EersteHome";
import { MedischGezag } from "@/components/MedischGezag";
import { BeeldKiezer, ProfielBeeld } from "@/components/ProfielBeeld";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
export const Route = createFileRoute("/kinderen/$kindId")({
    loader: ({ params }) => {
        const kind = kinderen.find((k) => k.id === params.kindId);
        // Eigen kinderen hebben een server-id (uuid); of het kind bij dit account hoort, bepaalt het component.
        if (!kind && !/^[0-9a-f-]{36}$|^(k|tmp)-/i.test(params.kindId))
            throw notFound();
        return { naam: kind?.naam ?? i18n.t("routes.kinderenKindId.kindprofiel") };
    },
    head: ({ loaderData }) => {
        const t = loaderData ? i18n.t("common.metaTitel", { titel: loaderData.naam }) : i18n.t("routes.kinderenKindId.meta.nietGevonden");
        return {
            meta: [
                { title: t },
                { name: "description", content: i18n.t("routes.kinderenKindId.meta.beschrijving") },
                { property: "og:title", content: t },
                { property: "og:description", content: i18n.t("routes.kinderenKindId.meta.beschrijving") },
                { property: "og:type", content: "profile" },
                { name: "twitter:card", content: "summary" },
            ],
        };
    },
    notFoundComponent: KindNietGevonden,
    component: KindProfielWrap,
});
function KindNietGevonden() {
    const { t } = useTranslation();
    return (<AppShell>
      <PageHeader titel={t("routes.kinderenKindId.nietGevonden")} terug="/kinderen"/>
    </AppShell>);
}
function KindProfielWrap() {
    const { kindId } = Route.useParams();
    const st = useStart();
    if (!st.eigen)
        return kinderen.some((x) => x.id === kindId) ? <KindProfiel /> : <KindNietGevonden />;
    const k = st.kinderen.find((x) => x.id === kindId);
    if (!k)
        return <KindNietGevonden />;
    const leeftijd = leeftijdTekst(k.geboortedatum);
    return <EigenProfiel kindId={k.id} naam={k.naam} geboortedatum={k.geboortedatum} leeftijd={leeftijd} kleur={k.kleur} beeld={k.beeld}/>;
}
function EigenProfiel({ kindId, naam, geboortedatum, leeftijd, kleur, beeld }) {
    const { t } = useTranslation();
    const st = useStart();
    const [gezagOpen, setGezagOpen] = useState(false);
    const [beeldOpen, setBeeldOpen] = useState(false);
    const k = { naam, geboortedatum };
    const g = st.gezag;
    const kleurHex = kleur ?? "#6F7F68";
    return (<AppShell>
      <PageHeader titel={k.naam} subtitel={leeftijd ?? t("routes.kinderenKindId.kindprofiel")} terug="/kinderen"/>
      <div className="mt-4 flex items-center gap-4">
        <button type="button" onClick={() => setBeeldOpen(true)} aria-label={t("routes.kinderenKindId.eigen.beeldWijzigen", { naam: k.naam })} className="relative shrink-0">
          <ProfielBeeld beeld={beeld} naam={k.naam} kleur={kleurHex} maat={56}/>
          <span aria-hidden="true" className="absolute -bottom-0.5 -right-0.5 grid size-6 place-items-center rounded-full border border-border bg-card"><AppIcon functie="notitie" maat="sm" vorm="kaal"/></span>
        </button>
        <Sheet open={beeldOpen} onOpenChange={setBeeldOpen}>
          <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-3xl bg-background">
            <SheetHeader><SheetTitle className="font-display">{t("routes.kinderenKindId.eigen.beeldTitel", { naam: k.naam })}</SheetTitle></SheetHeader>
            <div className="px-4 pb-6"><BeeldKiezer beeld={beeld} naam={k.naam} overslaanTekst={t("common.sluiten")} onKies={(b) => { if (!b && !beeld) {
        setBeeldOpen(false);
        return;
    } start.zetKindBeeld(kindId, b); bevestig(b ? t("routes.kinderenKindId.eigen.beeldOpgeslagen") : t("routes.kinderenKindId.eigen.beeldVerwijderd")); setBeeldOpen(false); }}/></div>
          </SheetContent>
        </Sheet>
        <div>
          <p className="text-xs text-ink-soft">{t("routes.kinderenKindId.eigen.kleurVan", { naam: k.naam })}</p>
          <div className="mt-1 flex gap-2" role="group" aria-label={t("routes.kinderenKindId.eigen.kleurKiezen", { naam: k.naam })}>
            {kindKleuren.map((c) => (<button key={c.id} onClick={() => { start.zetKindKleur(kindId, c.hex); bevestig(t("routes.kinderenKindId.eigen.kleurOpgeslagen")); }} aria-label={t("routes.kinderenKindId.eigen.kleur", { naam: c.naam })} aria-pressed={kleurHex === c.hex} className="size-8 rounded-full border-2" style={{ backgroundColor: c.hex, borderColor: kleurHex === c.hex ? c.hex : "transparent", opacity: kleurHex === c.hex ? 1 : 0.45 }}/>))}
          </div>
        </div>
      </div>
      <dl className="mt-6 divide-y divide-border border-y border-border text-sm">
        <div className="flex justify-between py-3"><dt className="text-ink-soft">{t("routes.kinderenKindId.naam")}</dt><dd className="font-semibold">{k.naam}</dd></div>
        <div className="flex justify-between py-3"><dt className="text-ink-soft">{t("routes.kinderenKindId.eigen.geboortedatum")}</dt><dd>{k.geboortedatum ? new Date(k.geboortedatum).toLocaleDateString(taalLocale(), { day: "numeric", month: "long", year: "numeric" }) : t("routes.kinderenKindId.eigen.nogNietIngevuld")}</dd></div>
        <div className="flex items-start justify-between gap-4 py-3"><dt className="text-ink-soft">{t("routes.kinderenKindId.eigen.gezag")}</dt><dd className="text-right">
          {g ? <><span className="font-semibold">{gezagKeuzes.find((x) => x.id === g.situatie)?.naam}</span><span className="block text-xs text-ink-soft">{t("routes.kinderenKindId.eigen.ingevuldDoor", { naam: g.ingevuldDoor })}</span></> : t("routes.kinderenKindId.eigen.nogNietIngevuld")}
          <button onClick={() => setGezagOpen(true)} className="mt-1 block min-h-[44px] w-full text-right text-xs font-semibold text-brand">{g ? t("common.wijzigen") : t("routes.kinderenKindId.eigen.invullen")}</button>
        </dd></div>
      </dl>
      <p className="mt-4 text-sm text-ink-soft">{t("routes.kinderenKindId.eigen.later", { naam: k.naam })}</p>
      <GezagSheet open={gezagOpen} onClose={() => setGezagOpen(false)}/>
    </AppShell>);
}
function KindProfiel() {
    const { t } = useTranslation();
    const { kindId } = Route.useParams();
    const k = kinderen.find((x) => x.id === kindId);
    const b = kindbank[kindId];
    const medisch = useGezondheid(kindId);
    useKring();
    const [gezondheidConcept, setGezondheidConcept] = useState(null);
    const [gezondheidOpgeslagen, setGezondheidOpgeslagen] = useState(false);
    const { lijst } = useMomentjes();
    const mijn = lijst.filter((m) => m.kindId === kindId);
    const mijlpalen = useMijlpalenLijst().filter((m) => m.kind === kindId);
    const [deelOpen, setDeelOpen] = useState(false);
    const [toevoegen, setToevoegen] = useState(false);
    const [mijlpaalTekst, setMijlpaalTekst] = useState("");
    const [alleMomenten, setAlleMomenten] = useState(false);
    const [open, setOpen] = useState(null);
    const [omschrijving, setOmschrijving] = useState(null);
    const [bewerkKind, setBewerkKind] = useState(null);
    const [cadeaus, setCadeaus] = useState(() => [
        { id: 1, tekst: t("routes.kinderenKindId.cadeau.lego"), door: "" },
        { id: 2, tekst: t("routes.kinderenKindId.cadeau.stiften"), door: t("routes.kinderenKindId.cadeau.omaEls") },
    ]);
    const [nieuwCadeau, setNieuwCadeau] = useState("");
    if (!k || !b || !medisch)
        return <KindNietGevonden />;
    const docs = documenten.filter((d) => d.kind.includes(k.naam));
    const contacten = [...k.contacten, ...(b.trainer ? [b.trainer] : [])];
    const kring = adresboek(k.id).map(persoonLabel);
    const mensen = ["Sanne", "Joris", ...kring];
    const groep = b.klas.split("·")[0]?.trim() ?? "";
    const groepen = [
        { id: "basis", icoon: "persoon", titel: t("routes.kinderenKindId.groep.basis"), samenvatting: t("routes.kinderenKindId.groep.geborenOp", { datum: datumWeergave(k.geboortedatum) }), rijen: [
                { label: t("routes.kinderenKindId.naam"), waarde: `${k.naam} ${k.achternaam}` },
                { label: t("routes.kinderenKindId.groep.geboren"), waarde: datumWeergave(k.geboortedatum) },
                ...b.huishoudens.map((h, i) => ({ label: t("routes.kinderenKindId.groep.huishouden", { n: i + 1 }), waarde: h })),
            ] },
        { id: "school", icoon: "school", titel: t("routes.kinderenKindId.groep.school"), samenvatting: [k.school, k.school.toLowerCase().includes(groep.toLowerCase()) ? "" : groep].filter(Boolean).join(" · "), rijen: [
                { label: t("routes.kinderenKindId.groep.schoolLabel"), waarde: k.school },
                { label: t("routes.kinderenKindId.groep.klas"), waarde: b.klas },
                { label: t("routes.kinderenKindId.groep.opvang"), waarde: k.opvang },
                { label: t("routes.kinderenKindId.groep.belangrijk"), waarde: b.schoolInfo },
            ].filter((r) => r.waarde) },
        { id: "gezondheid", icoon: "gezondheid", titel: t("routes.kinderenKindId.groep.gezondheid"), samenvatting: [medisch.huisarts && gezondheidLabel("huisarts"), medisch.tandarts && t("routes.kinderenKindId.groep.tandartsKlein"), medisch.apotheek && t("routes.kinderenKindId.groep.apotheekKlein")].filter(Boolean).join(", "), rijen: [
                { label: gezondheidLabel("huisarts"), waarde: medisch.huisarts },
                { label: gezondheidLabel("tandarts"), waarde: medisch.tandarts },
                { label: gezondheidLabel("apotheek"), waarde: medisch.apotheek },
                { label: gezondheidLabel("allergieen"), waarde: medisch.allergieen },
                { label: gezondheidLabel("medicatie"), waarde: medisch.medicatie },
                { label: gezondheidLabel("verzekering"), waarde: medisch.verzekering },
                { label: gezondheidLabel("bijzonderheden"), waarde: medisch.bijzonderheden },
            ], voet: t("routes.kinderenKindId.groep.gezondheidVoet") },
        { id: "maten", icoon: "kledingmaten", titel: t("routes.kinderenKindId.groep.maten"), samenvatting: [b.maten.kleding && t("routes.kinderenKindId.groep.kledingMaat", { maat: b.maten.kleding }), b.maten.schoen && t("routes.kinderenKindId.groep.schoenMaat", { maat: b.maten.schoen })].filter(Boolean).join(" · "), rijen: [
                { label: t("routes.kinderenKindId.groep.kleding"), waarde: b.maten.kleding },
                { label: t("routes.kinderenKindId.groep.schoenen"), waarde: b.maten.schoen },
                ...(b.maten.sport ? [{ label: t("routes.kinderenKindId.groep.sport"), waarde: b.maten.sport }] : []),
            ], voet: t("routes.kinderenKindId.groep.laatstGewijzigd", { datum: b.maten.gewijzigd }) },
        { id: "activiteiten", icoon: "activiteiten", titel: t("routes.kinderenKindId.groep.activiteiten"), samenvatting: b.activiteiten.map((a) => `${a.naam} ${a.wanneer.split(" ")[0]?.toLowerCase()}`).join(" · "), rijen: b.activiteiten.map((a) => ({ label: a.naam, waarde: a.wanneer })) },
    ];
    const momenten = [
        ...mijn.map((m) => ({ soort: "Momentje", sleutel: m.datum ?? "0", m })),
        ...mijlpalen.map((p) => ({ soort: "Mijlpaal", sleutel: `${p.jaar}-00`, p })),
    ].sort((a, b2) => b2.sleutel.localeCompare(a.sleutel));
    const zichtbaar = alleMomenten ? momenten : momenten.slice(0, 2);
    const Rij = ({ id, icoon, titel, samenvatting, rechts }) => {
        const isOpen = open === id;
        return (<button onClick={() => setOpen(isOpen ? null : id)} className="flex min-h-14 w-full items-center gap-3 py-2.5 text-left" aria-expanded={isOpen}>
        {icoon}
        <span className="min-w-0 flex-1">
          <span className="block text-[15.5px] font-black">{titel}</span>
          <span className="block truncate text-xs text-ink-soft">{samenvatting || t("routes.kinderenKindId.nogNiets")}</span>
        </span>
        {rechts ?? (samenvatting || isOpen ? <Chevron richting="omlaag" open={isOpen} className="size-4 text-ink-soft"/> : <Plus aria-hidden="true" strokeWidth={2} className="size-4 shrink-0 text-ink-soft"/>)}
      </button>);
    };
    const goedOmTeWeten = [medisch.allergieen, medisch.medicatie].map((x) => x?.trim()).filter(Boolean).join(", ");
    const toonGroep = (g) => (<div key={g.id} id={`onderdeel-${g.id}`} className="scroll-mt-20">
            <Rij id={g.id} icoon={<AppIcon functie={g.icoon} maat="md"/>} titel={g.titel} samenvatting={g.samenvatting}/>
            {open === g.id ? (<div className="mb-3 space-y-2">
                {g.rijen.map((r) => (<div key={r.label} className="rounded-md bg-white/60 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{r.label}</p>
                    <p className="text-sm">{r.waarde}</p>
                  </div>))}
                {g.voet ? <p className="text-[11px] text-ink-soft">{g.voet}</p> : null}
                {g.id === "gezondheid" ? (gezondheidConcept ? <form className="space-y-3 border-t border-border pt-3" onSubmit={(e) => { e.preventDefault(); bewaarGezondheid(kindId, gezondheidConcept); setGezondheidConcept(null); setGezondheidOpgeslagen(true); }}>
                    {["huisarts", "tandarts", "apotheek", "allergieen", "medicatie", "verzekering", "bijzonderheden"].map((veld) => [veld, gezondheidLabel(veld)]).map(([veld, label]) => <label key={veld} className="block text-xs font-semibold">{label}<textarea aria-label={label} value={gezondheidConcept[veld]} onChange={(e) => setGezondheidConcept((v) => v ? { ...v, [veld]: e.target.value } : v)} rows={2} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-normal"/></label>)}
                    <p className="text-xs text-ink-soft">{t("routes.kinderenKindId.gezondheid.delen")}</p>
                    <div className="flex flex-wrap gap-2"><Button type="submit" className="min-h-11 bg-brand text-primary-foreground shadow-none">{t("routes.kinderenKindId.gezondheid.opslaan")}</Button><Button type="button" variant="ghost" onClick={() => setGezondheidConcept(null)}>{t("common.annuleren")}</Button></div>
                  </form> : <><Button variant="ghost" className="min-h-11 gap-1.5 text-brand" onClick={() => { setGezondheidConcept({ ...medisch }); setGezondheidOpgeslagen(false); }}><AppIcon functie="notitie" maat="sm" vorm="kaal"/>{t("routes.kinderenKindId.gezondheid.aanpassen")}</Button>{gezondheidOpgeslagen ? <p role="status" className="text-xs text-brand">{t("routes.kinderenKindId.gezondheid.bijgewerkt")}</p> : null}<MedischGezag kindId={k.id} naam={k.naam} leeftijd={k.leeftijd}/></>) : null}
              </div>) : null}
          </div>);
    return (<AppShell>
      <div className="flex items-center gap-3">
        <BackButton terug="/kinderen"/>
        <h1 className="lora min-w-0 flex-1 text-[32px] leading-tight">{t("routes.kinderenKindId.allesOver", { naam: k.naam })}</h1>
      </div>
      <section className={`${GLAS} relative mt-4 p-4`}>
        <div className="flex items-center gap-3.5 pr-10">
          <img src={k.avatar} alt={k.naam} className="size-[72px] shrink-0 rounded-full border-[3px] object-cover" style={{ borderColor: k.kleur ?? "#8A7E72" }}/>
          <div className="min-w-0">
            <p className="text-[19px] font-black">{t("routes.kinderenKindId.naamLeeftijd", { naam: k.naam, leeftijd: k.leeftijd })}</p>
            <p className="mt-0.5 text-sm leading-snug">{omschrijving ?? k.praktisch}</p>
          </div>
        </div>
        <div className="absolute right-3 top-3"><BewerkPotlood onClick={() => setBewerkKind(omschrijving ?? k.praktisch)} label={t("routes.kinderenKindId.gegevensAanpassen", { naam: k.naam })}/></div>
        {goedOmTeWeten ? (<div className="mt-3 flex items-start gap-2 rounded-[14px] bg-[#E9EFE3] px-3 py-2.5">
            <AppIcon functie="info" maat="sm" vorm="kaal"/>
            <p className="text-[13.5px] leading-snug text-[#2F4A3A]"><Trans i18nKey="routes.kinderenKindId.goedOmTeWeten" values={{ tekst: goedOmTeWeten }} components={{ b: <b/> }}/></p>
          </div>) : null}
      </section>
      {bewerkKind !== null ? (<form className="mt-2 space-y-3 border-y border-border py-3" onSubmit={(e) => { e.preventDefault(); setOmschrijving(bewerkKind.trim() || k.praktisch); setBewerkKind(null); }}>
          <label className="block text-xs font-semibold">{t("routes.kinderenKindId.korteOmschrijving")}<textarea aria-label={t("routes.kinderenKindId.korteOmschrijving")} rows={2} value={bewerkKind} onChange={(e) => setBewerkKind(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-normal"/></label>
          <p className="text-xs text-ink-soft">{t("routes.kinderenKindId.onderBasis")}</p>
          <div className="flex gap-2"><Button type="submit" className="min-h-11 bg-brand text-primary-foreground shadow-none">{t("common.opslaan")}</Button><Button type="button" variant="ghost" onClick={() => setBewerkKind(null)}>{t("common.annuleren")}</Button></div>
        </form>) : null}

      <div className={`${GLAS} mt-3 px-4`}>
        <Link to="/kring/$kindId" params={{ kindId: k.id }} className="flex min-h-14 items-center gap-3 py-3">
          <AppIcon functie="contact" maat="md"/>
          <span className="min-w-0 flex-1">
            <span className="block text-[15.5px] font-black">{t("routes.kinderenKindId.belangrijkePersonen")}</span>
            <span className="block truncate text-xs text-ink-soft">{t("routes.kinderenKindId.mensen", { count: mensen.length })} · {mensen.slice(0, 2).join(", ")}{mensen.length > 2 ? t("routes.kinderenKindId.enMeer", { n: mensen.length - 2 }) : ""}</span>
          </span>
          <Chevron className="size-5 text-ink-soft"/>
        </Link>
        {contacten.length ? <button onClick={() => setOpen(open === "contact" ? null : "contact")} aria-expanded={open === "contact"} className="flex min-h-12 w-full items-center gap-3 border-t border-[#E9E1D5] py-2.5 text-left">
          <AppIcon functie="bellen" maat="md"/>
          <span className="min-w-0 flex-1"><span className="block text-[15.5px] font-black">{t("routes.kinderenKindId.telefoonnummers")}</span><span className="block truncate text-xs text-ink-soft">{contacten.map((c) => c.naam).join(", ")}</span></span>
          <Chevron richting="omlaag" open={open === "contact"} className="size-4 text-ink-soft"/>
        </button> : null}
        {open === "contact" ? (<div className="mb-3 space-y-2">
            {contacten.map((c) => (<div key={c.naam} className="flex items-center justify-between gap-3 rounded-md bg-white/60 px-3 py-2">
                <div><p className="text-sm font-semibold">{c.naam}</p><p className="text-xs text-ink-soft">{c.rol}</p></div>
                <a href={`tel:${c.telefoon.replace(/\D/g, "")}`} className="flex min-h-11 shrink-0 items-center gap-1.5 text-xs font-semibold text-brand"><AppIcon functie="bellen" maat="sm" vorm="kaal"/>{c.telefoon}</a>
              </div>))}
          </div>) : null}
      </div>

      <h2 className="mt-6 px-1 text-[13px] font-black uppercase tracking-[0.08em] text-ink-soft">{t("routes.kinderenKindId.vaakNodig")}</h2>
      <div className={`${GLAS} mt-2 divide-y divide-[#E9E1D5] px-4`}>
        {groepen.filter((g) => g.id !== "basis" && g.id !== "maten").map(toonGroep)}
      </div>

      <h2 className="mt-6 px-1 text-[13px] font-black uppercase tracking-[0.08em] text-ink-soft">{t("routes.kinderenKindId.afEnToe")}</h2>
      <div className={`${GLAS} mt-2 divide-y divide-[#E9E1D5] px-4`}>
        {groepen.filter((g) => g.id === "maten").map(toonGroep)}
        <div id="onderdeel-docs">
          <Rij id="docs" icoon={<AppIcon functie="documenten" maat="md"/>} titel={t("routes.kinderenKindId.documenten")} samenvatting={docs.length ? t("routes.kinderenKindId.aantalDocumenten", { count: docs.length }) : ""}/>
          {open === "docs" ? (<div className="mb-3 space-y-2">
              {docs.map((d) => (<Link key={d.id} to="/documenten" className="flex min-h-11 items-center gap-2 rounded-md bg-white/60 px-3 py-2 text-sm"><span className="flex-1">{d.naam}</span><span className="text-[11px] text-ink-soft">{documentCategorieLabel(d.categorie)}</span></Link>))}
              {docs.length === 0 ? <Link to="/documenten" className="inline-flex min-h-10 items-center text-xs font-semibold text-brand"><MetChevron>{t("routes.kinderenKindId.documentToevoegen")}</MetChevron></Link> : null}
            </div>) : null}
        </div>

        <div id="onderdeel-feest">
          <Rij id="feest" icoon={<AppIcon functie="verjaardag" maat="md"/>} titel={t("routes.kinderenKindId.feest.titel")} samenvatting={`${jarigOver(k.geboortedatum)}${t("routes.kinderenKindId.feest.cadeaulijstAantal", { n: cadeaus.length })}`}/>
          {open === "feest" ? (<div className="mb-3 space-y-2">
              <Button asChild variant="ghost" className="min-h-11 w-full justify-between"><Link to="/planning" search={{ toevoegen: "bijzonder", periode: t("routes.kinderenKindId.feest.verjaardag", { naam: k.naam }) }}>{t("routes.kinderenKindId.feest.wieViert")}<Chevron className="size-4 text-ink-soft"/></Link></Button>
              <Button asChild variant="ghost" className="min-h-11 w-full justify-between"><Link to="/taken" search={{ taak: t("routes.kinderenKindId.feest.traktatieTaak", { naam: k.naam }), kind: k.id }}>{t("routes.kinderenKindId.feest.traktatie")}<Chevron className="size-4 text-ink-soft"/></Link></Button>
              <Button asChild variant="ghost" className="min-h-11 w-full justify-between"><Link to="/taken" search={{ taak: t("routes.kinderenKindId.feest.uitnodigingenTaak", { naam: k.naam }), kind: k.id }}>{t("routes.kinderenKindId.feest.uitnodigingen")}<Chevron className="size-4 text-ink-soft"/></Link></Button>
              <div className="border-t border-border pt-3">
                <p className="font-display text-sm font-bold">{t("routes.kinderenKindId.feest.cadeaulijst")}</p>
                <div className="mt-2 space-y-2">
                  <div className="flex gap-2">
                    <input value={nieuwCadeau} onChange={(e) => setNieuwCadeau(e.target.value)} placeholder={t("routes.kinderenKindId.feest.wensVan", { naam: k.naam })} className="flex-1 rounded-md bg-white/60 px-3 py-2 text-sm"/>
                    <button onClick={() => { if (nieuwCadeau.trim()) {
            setCadeaus((c) => [...c, { id: Date.now(), tekst: nieuwCadeau.trim(), door: "" }]);
            setNieuwCadeau("");
        } }} className="min-h-11 rounded-md bg-brand px-4 text-sm font-semibold text-primary-foreground">{t("common.toevoegen")}</button>
                  </div>
                  {cadeaus.map((c) => (<div key={c.id} className="flex items-center justify-between gap-3 rounded-md bg-white/60 px-3 py-2 text-sm">
                      <div><p className="flex items-center gap-1.5 font-medium"><AppIcon functie="cadeau" maat="sm" vorm="kaal"/>{c.tekst}</p>{c.door ? <p className="text-xs text-ink-soft">{t("routes.kinderenKindId.feest.gekochtDoor", { naam: c.door })}</p> : null}</div>
                      {!c.door ? <button onClick={() => setCadeaus((l) => l.map((x) => (x.id === c.id ? { ...x, door: t("routes.kinderenKindId.feest.sanneJij") } : x)))} className="shrink-0 rounded-full bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand">{t("routes.kinderenKindId.feest.ikKoop")}</button> : null}
                    </div>))}
                  <p className="text-[11px] text-ink-soft">{t("routes.kinderenKindId.feest.geenDubbel", { naam: k.naam })}</p>
                </div>
              </div>
            </div>) : null}
        </div>
        {groepen.filter((g) => g.id === "basis").map(toonGroep)}
      </div>

      <section className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-[19px] font-black">{t("routes.kinderenKindId.momenten.titel", { naam: k.naam })}</h2>
          <button onClick={() => setToevoegen((v) => !v)} className="inline-flex min-h-11 items-center gap-1 text-[13.5px] font-extrabold text-brand"><Plus aria-hidden="true" strokeWidth={2.25} className="size-4 shrink-0"/>{t("routes.kinderenKindId.momenten.toevoegen").replace(/^\+\s*/, "")}</button>
        </div>
        {toevoegen ? (<div className="mt-2 space-y-2 border-y border-border py-3">
            <Button variant="ghost" className="min-h-11 w-full justify-between" onClick={() => { setToevoegen(false); setDeelOpen(true); }}>{t("routes.kinderenKindId.momenten.delen")}<Chevron className="size-4 text-ink-soft"/></Button>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!mijlpaalTekst.trim())
            return; voegMijlpaal({ kind: k.id, jaar: new Date().getFullYear(), tekst: mijlpaalTekst.trim() }); setMijlpaalTekst(""); setToevoegen(false); }}>
              <input aria-label={t("routes.kinderenKindId.momenten.mijlpaal")} className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder={t("routes.kinderenKindId.momenten.mijlpaalPlaceholder")} value={mijlpaalTekst} onChange={(e) => setMijlpaalTekst(e.target.value)}/>
              <button className="min-h-11 rounded-md bg-brand px-3 text-sm font-semibold text-primary-foreground">{t("routes.kinderenKindId.momenten.bewaar")}</button>
            </form>
          </div>) : null}
        <div className={`${GLAS} mt-2 space-y-3 px-4 py-3`}>
          {zichtbaar.map((x) => x.soort === "Momentje"
            ? <div key={`momentje-${x.m.id}`}><p className="mb-1 text-[11px] font-semibold text-ink-soft">{t("routes.kinderenKindId.momenten.momentje")}</p><MomentjeKaart m={x.m}/></div>
            : <div key={`mijlpaal-${x.p.id}`} className="flex items-start gap-2 border-b border-border pb-3"><AppIcon functie="mijlpaal" maat="sm"/><div><p className="text-sm font-semibold">{x.p.tekst}</p><p className="text-[11px] text-ink-soft">{t("routes.kinderenKindId.momenten.mijlpaalJaar", { jaar: x.p.jaar })}</p></div></div>)}
          {momenten.length === 0 ? <p className="text-sm text-ink-soft">{t("routes.kinderenKindId.momenten.leeg", { naam: k.naam })} <button type="button" onClick={() => setDeelOpen(true)} className="font-semibold text-brand">{t("routes.kinderenKindId.momenten.eerste")}</button></p> : null}
        </div>
        {momenten.length > 2 || alleMomenten ? (<button onClick={() => setAlleMomenten((v) => !v)} className="mt-3 min-h-11 text-sm font-semibold text-brand">{alleMomenten ? t("routes.kinderenKindId.momenten.minder") : <MetChevron>{t("routes.kinderenKindId.momenten.alle")}</MetChevron>}</button>) : null}
        {alleMomenten ? <Mijlpalen kindId={k.id} naam={k.naam} momentjesPerJaar={mijn.reduce((acc, m) => { const j = m.datum ? Number(m.datum.slice(0, 4)) : NaN; return Number.isFinite(j) ? { ...acc, [j]: (acc[j] ?? 0) + 1 } : acc; }, {})}/> : null}
      </section>
      <DeelMomentje open={deelOpen} onSluit={() => setDeelOpen(false)} kindId={k.id}/>
    </AppShell>);
}
const GLAS = "rounded-[22px] border border-white/85 bg-white/60";
/** "Over 5 maanden jarig · " uit een Nederlandse datum zoals "14 april 2016"; leeg als die niet te lezen is. */
function jarigOver(geboren) {
    // De bron is altijd Nederlandse tekst ("14 april 2016"); de uitkomst volgt de huidige taal.
    const maanden = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
    const m = geboren.toLowerCase().match(/(\d{1,2})\s+([a-z]+)/);
    const mi = m ? maanden.indexOf(m[2]) : -1;
    if (!m || mi < 0)
        return "";
    const nu = new Date();
    nu.setHours(0, 0, 0, 0);
    let volgende = new Date(nu.getFullYear(), mi, Number(m[1]));
    if (volgende < nu)
        volgende = new Date(nu.getFullYear() + 1, mi, Number(m[1]));
    const dagen = Math.round((volgende.getTime() - nu.getTime()) / 864e5);
    if (dagen === 0)
        return i18n.t("routes.kinderenKindId.jarig.vandaag");
    if (dagen < 32)
        return i18n.t("routes.kinderenKindId.jarig.dagen", { count: dagen });
    const mnd = (volgende.getFullYear() - nu.getFullYear()) * 12 + volgende.getMonth() - nu.getMonth();
    return i18n.t("routes.kinderenKindId.jarig.maanden", { count: mnd });
}
