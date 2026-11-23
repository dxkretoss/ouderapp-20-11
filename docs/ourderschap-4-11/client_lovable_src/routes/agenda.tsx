import { BewerkPotlood } from "@/components/ui-kit";
import { useBevestigPopup } from "@/lib/feedback";
import { Assistent } from "@/components/Assistent";
import { GeschiedenisKnop } from "@/components/Geschiedenis";
import { leg, leg as legAudit, legVerschillen as legVerschillenAudit } from "@/lib/audit-store";
import { createFileRoute, Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { X, MoreHorizontal, ArrowLeftRight, CalendarPlus, CircleHelp, FilePen, ListChecks, Palmtree, Lock } from "lucide-react";
import { AppShell, BackButton, Card } from "@/components/AppShell";
import { ContextToevoegen } from "@/components/ContextToevoegen";
import { HulpKnop } from "@/components/HulpVragen";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { afspraken, categorieMeta, gesprekken, type Categorie } from "@/lib/demo-data";
import { kindNamen, useZorg, zorgDag, type KindId } from "@/lib/zorg-store";
import { useTaken, voegTaakToe } from "@/lib/taken-store";
import { nieuwBudget } from "@/lib/budget-store";
import { Button } from "@/components/ui/button";
import { bijzondereDagOp } from "@/lib/bijzondere-dagen";
import { useVoorkeuren } from "@/lib/voorkeuren-store";
import { controleerAfspraak, controleerPrive, afstemStatus, ikGa, koppelAfstem, type Controle, type PriveBotsing } from "@/lib/slimme-hulp";
import { startNuAfstemmen } from "@/lib/nu-afstemmen-store";
import { useRegio, vakantieOp, vakantiesTussen, regioLabel } from "@/lib/schoolvakanties";
import { geldigeRegeling, useStart, start, plekOp, type Regeling } from "@/lib/start-store";
import { Pictogram } from "@/components/AppIcon";
import { uur } from "@/lib/tijd-tekst";
import { iso, dt, plusDagen, maandagVan, voorkomens } from "@/lib/agenda-datum";
import { AppIcon } from "@/components/AppIcon";
import { VoorstelIntrekken } from "@/components/VoorstelIntrekken";
import { AanwezigheidBlok, AanwezigheidFormulier } from "@/components/AanwezigheidAfstemmen";
import { aanwezigVoor, startAfstemming, statusRegel, useAanwezigheid, type AanwezigKeuze, type Wie } from "@/lib/aanwezigheid-store";

export const Route = createFileRoute("/agenda")({
  validateSearch: z.object({ nieuw: z.boolean().optional(), voorstel: z.boolean().optional(), persoonlijk: z.boolean().optional(), vanuitBericht: z.boolean().optional(), locatie: z.string().optional(), omschrijving: z.string().optional(), categorie: z.string().optional(), titel: z.string().optional(), datum: z.string().optional(), tijd: z.string().optional(), herhaling: z.enum(["wekelijks", "tweewekelijks", "maandelijks"]).optional(), kind: z.string().optional(), dag: z.string().optional(), importBedrag: z.number().positive().max(100000).optional(), importTaak: z.string().max(300).optional(), importMee: z.string().max(300).optional(), afspraak: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Gedeelde agenda — Ouderschap & Co" },
      { name: "description", content: "School, sport, opvang, medische afspraken, verjaardagen en vakanties in één gedeelde agenda." },
      { property: "og:title", content: "Gedeelde agenda — Ouderschap & Co" },
      { property: "og:description", content: "Eén agenda voor beide ouders, met duidelijke categorieën en verantwoordelijkheid." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgendaPagina,
});

type Weergave = "dag" | "week" | "maand";
type Freq = "geen" | "wekelijks" | "tweewekelijks" | "maandelijks" | "aangepast";
type Herhaling = { freq: Freq; interval: number; eenheid: "weken" | "maanden"; eind?: string | undefined };
type ExtraAfspraak = { id: string; titel: string; datum: string; tijd: string; categorie: string; kind: string; herhaling?: Herhaling | undefined; overslaan?: string[] | undefined;
  /** Gedeeld met de andere ouder (standaard). Persoonlijke afspraken mag je direct wijzigen. */
  gedeeld?: boolean | undefined; locatie?: string | undefined; toelichting?: string | undefined; herinnering?: Herinnering | undefined; eindtijd?: string | undefined };
type Voorkomen = { a: ExtraAfspraak; datum: string };
type Bereik = "alleen" | "toekomst" | "reeks";

const DEMO_VANDAAG = "2025-03-12"; // demo-vandaag
/** Eigen gezin gebruikt de echte datum (zelfde bron als Home); het voorbeeldgezin blijft op de demo-datum. Wordt per render gezet in AgendaPage. */
let VANDAAG = DEMO_VANDAAG;
const weekNr = (s: string) => { const d = dt(s); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7)); const j = new Date(d.getFullYear(), 0, 4); return 1 + Math.round(((d.getTime() - j.getTime()) / 864e5 - 3 + ((j.getDay() + 6) % 7)) / 7); };
const lang = (s: string) => dt(s).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });
const kort = (s: string) => dt(s).toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
const maandNaam = (d: Date) => d.toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
const freqLabel: Record<Freq, string> = { geen: "Niet herhalen", wekelijks: "Wekelijks", tweewekelijks: "Om de week", maandelijks: "Maandelijks", aangepast: "Aangepast" };

/** Demo-zorgregeling is ingevuld voor maart 2026. */
const verblijf = (zorg: ReturnType<typeof useZorg>, kind: KindId, s: string) => (s.startsWith("2025-03") ? zorgDag(zorg, kind, dt(s).getDate()) : undefined);
const isWissel = (zorg: ReturnType<typeof useZorg>, s: string) => {
  const nu = verblijf(zorg, "emma", s), gister = verblijf(zorg, "emma", plusDagen(s, -1));
  return !!nu && !!gister && nu.ouder !== gister.ouder;
};
const demoOp = (s: string) => (s.startsWith("2025-03") ? afspraken.filter((a) => a.dag === dt(s).getDate()) : []);

function AgendaPagina() {
  const router = useRouter();
  const zorg = useZorg();
  const regio = useRegio();
  const { taken } = useTaken();
  const [weergave, setWeergave] = useState<Weergave>("week");
  const [nieuwOpen, setNieuwOpen] = useState(false);
  const [bewerk, setBewerk] = useState<Voorkomen | null>(null);
  const [bereik, setBereik] = useState<Bereik>("alleen");
  const [verwijderVk, setVerwijderVk] = useState<Voorkomen | null>(null);
  const [annuleringNietNodig, setAnnuleringNietNodig] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);
  useBevestigPopup(melding);
  const [controle, setControle] = useState<Controle[] | null>(null);
  const vkSlim = useVoorkeuren();
  const [detail, setDetail] = useState<Voorkomen | null>(null);
  const [voorstellen, setWachtend] = useState<Wachtend[]>([]);
  const wachtend = voorstellen.filter((w) => !w.status);
  const [voorstelNieuw, setVoorstelNieuw] = useState(false);
  const [verborgen, setVerborgen] = useState<string[]>([]);
  const [modus, setModus] = useState<Modus>("aanpassen");
  const [gedeeld, setGedeeld] = useState(true);
  const [locatie, setLocatie] = useState("");
  const [toelichting, setToelichting] = useState("");
  const [herinnering, setHerinnering] = useState<Herinnering>("geen");
  const [titel, setTitel] = useState("");
  const [aanwezigKeuze, setAanwezigKeuze] = useState<AanwezigKeuze | null>(null);
  const [aanwezigWieGaat, setAanwezigWieGaat] = useState<Wie | "onbekend" | null>(null);
  const [aanwezigContactWie, setAanwezigContactWie] = useState<Wie | "nog" | null>(null);
  const [verlatenVraag, setVerlatenVraag] = useState(false);
  const sluitNieuw = () => { if (titel.trim() && !bewerk) setVerlatenVraag(true); else setNieuwOpen(false); };
  const [datum, setDatum] = useState("");
  const [tijd, setTijd] = useState("");
  const [eindtijd, setEindtijd] = useState("");
  const [priveBotsing, setPriveBotsing] = useState<PriveBotsing[] | null>(null);
  const [afstemTekst, setAfstemTekst] = useState<string | null>(null);
  const [categorie, setCategorie] = useState<string>("medisch");
  const [kind, setKind] = useState("");
  const [herhaling, setHerhaling] = useState<Herhaling>({ freq: "geen", interval: 2, eenheid: "weken" });
  const [demoExtra, setDemoExtra] = useState<ExtraAfspraak[]>([]);
  const [importExtra, setImportExtra] = useState<{ bedrag: string; taak: string; mee: string } | null>(null);
  const [maandOffset, setMaandOffset] = useState(0);
  const [weekOffset, setWeekOffset] = useState(0);
  // Bewaar de bestaande opslagnaam; de standaardingang opent altijd deze week.
  const AGENDA_GEHEUGEN = "onzeapp-agenda-weergave";
  const bewaar = (w: Weergave, wo: number, mo: number) => { try { localStorage.setItem(AGENDA_GEHEUGEN, JSON.stringify({ w, wo, mo })); } catch { /* geen opslag */ } };
  const zetWeergave = (w: Weergave) => { setWeergave(w); bewaar(w, weekOffset, maandOffset); };
  const zetWeekOffset = (f: number | ((x: number) => number)) => setWeekOffset((x) => { const n = typeof f === "function" ? f(x) : f; bewaar(weergave, n, maandOffset); return n; });
  const zetMaandOffset = (f: number | ((x: number) => number)) => setMaandOffset((x) => { const n = typeof f === "function" ? f(x) : f; bewaar(weergave, weekOffset, n); return n; });
  // Vanuit zoeken naar een afspraak: maandweergave, zodat het item zeker zichtbaar is.
  const doelHash = useRouterState({ select: (s) => s.location.hash });
  useEffect(() => { if (doelHash.startsWith("item-")) setWeergave("maand"); }, [doelHash]);
  const [gekozenDag, setGekozenDag] = useState<string | null>(null);
  const [weekDag, setWeekDag] = useState<string | null>(null);
  // Eigen gezin: geen voorbeelddata; wel de eigen regeling als dagkleuring.
  const startSt = useStart();
  const eigen = startSt.eigen;
  VANDAAG = eigen ? iso(new Date()) : DEMO_VANDAAG;
  // Eigen gezin: afspraken en kinderen uit de eigen gezinsgegevens; voorbeeldgezin blijft apart.
  const extra: ExtraAfspraak[] = eigen ? (startSt.agenda as ExtraAfspraak[]) : demoExtra;
  const setExtra = (f: (l: ExtraAfspraak[]) => ExtraAfspraak[]) => (eigen ? start.zetAgenda((l) => f(l as ExtraAfspraak[])) : setDemoExtra(f));
  const kindKeuzes = eigen ? [...startSt.kinderen.map((k) => k.naam), ...(startSt.kinderen.length > 1 ? ["Alle kinderen"] : [])] : ["Emma", "Noah", "Allebei"];
  /** Zelfde kindkeuze, maar dan in de vorm die het hulpverzoek gebruikt. */
  const hulpKind = () => (kind === "Alle kinderen" ? "alle" : kind === "Allebei" ? "beide" : startSt.kinderen.find((k) => k.naam === kind)?.id ?? (kind === "Noah" ? "noah" : "emma"));
  const standaardKind = eigen ? (startSt.kinderen[0]?.naam ?? "") : "Emma";
  const alleNamen = eigen ? startSt.kinderen.map((k) => k.naam) : ["Emma", "Noah"];
  const eigenRegeling: Regeling | null = startSt.regeling && startSt.regeling !== "later" && geldigeRegeling(startSt.regeling) ? startSt.regeling : null;
  const [filter, setFilter] = useState<"alles" | "kinderen" | "prive">("alles");
  const heeftPrive = extra.some((a) => a.gedeeld === false);
  const demoVoor = (s: string) => (eigen || filter === "prive" ? [] : demoOp(s));
  const eigenPlekVan = (d: string) => (eigenRegeling ? plekOp(eigenRegeling, dt(d)) : undefined);
  const eigenWisselVan = (d: string) => (eigenRegeling ? plekOp(eigenRegeling, dt(d)) !== plekOp(eigenRegeling, dt(plusDagen(d, -1))) : undefined);

  const getoondeMaand = new Date(dt(VANDAAG).getFullYear(), dt(VANDAAG).getMonth() + maandOffset, 1);
  const weekStart = plusDagen(maandagVan(VANDAAG), weekOffset * 7);
  const weekDagen = Array.from({ length: 7 }, (_, i) => plusDagen(weekStart, i));
  const vk = (van: string, tot: string): Voorkomen[] =>
    extra.filter((a) => !verborgen.includes(a.id) && (filter === "alles" || (filter === "prive") === (a.gedeeld === false))).flatMap((a) => voorkomens(a, van, tot).map((d) => ({ a, datum: d }))).sort((x, y) => (x.datum + x.a.tijd).localeCompare(y.datum + y.a.tijd));
  const wachtOp = (id: string) => wachtend.some((w) => w.vk.a.id === id);

  const openNieuw = (vooraf = weekDag ?? VANDAAG) => {
    setVoorstelNieuw(false);
    setBewerk(null); setModus("aanpassen");
    setTitel(""); setDatum(vooraf); setTijd(""); setEindtijd(""); setPriveBotsing(null); setAfstemTekst(null); setCategorie("overig"); setKind(standaardKind);
    setLocatie(""); setToelichting(""); setHerinnering("geen"); setGedeeld(true);
    setHerhaling({ freq: "geen", interval: 2, eenheid: "weken" });
    setGekozenDag(null);
    setImportExtra(null);
    setNieuwOpen(true);
  };
  // Vooraf ingevuld vanuit de assistent: alleen invullen, de ouder slaat zelf op.
  const zoek = Route.useSearch();
  useEffect(() => {
    if (!zoek.nieuw) return;
    openNieuw(zoek.datum ?? zoek.dag ?? VANDAAG);
    if (zoek.titel) setTitel(zoek.titel);
    if (zoek.voorstel) { setVoorstelNieuw(true); setDatum(zoek.datum ?? ""); setKind(zoek.kind ?? ""); }
    if (zoek.vanuitBericht) { setDatum(zoek.datum ?? ""); setKind(zoek.kind ?? ""); }
    if (zoek.persoonlijk) setGedeeld(false);
    if (zoek.locatie) setLocatie(zoek.locatie);
    if (zoek.omschrijving) setToelichting(zoek.omschrijving);
    if (zoek.tijd) setTijd(zoek.tijd);
    if (zoek.kind) setKind(zoek.kind === "emma" ? "Emma" : zoek.kind === "noah" ? "Noah" : kindKeuzes.includes(zoek.kind) ? zoek.kind : standaardKind);
    if (zoek.categorie && zoek.categorie in categorieMeta) setCategorie(zoek.categorie);
    if (zoek.herhaling) setHerhaling({ freq: zoek.herhaling, interval: 2, eenheid: "weken" });
    if (zoek.importBedrag || zoek.importTaak || zoek.importMee) {
      setImportExtra({ bedrag: zoek.importBedrag ? String(zoek.importBedrag) : "", taak: zoek.importTaak ?? "", mee: zoek.importMee ?? "" });
      setCategorie("school");
    }
    if (zoek.titel && /zwem|sport|voetbal|training/i.test(zoek.titel)) setCategorie("sport");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoek.nieuw]);
  // Doorklik vanuit Home (Deze week / Morgen): open direct die dag.
  useEffect(() => {
    if (zoek.dag && /^\d{4}-\d{2}-\d{2}$/.test(zoek.dag)) {
      setWeekOffset(Math.round((dt(maandagVan(zoek.dag)).getTime() - dt(maandagVan(VANDAAG)).getTime()) / 604800000));
      setWeekDag(zoek.dag);
      if (!zoek.nieuw && !zoek.afspraak) setGekozenDag(zoek.dag);
    }
  }, [zoek.dag]);
  const doelAfspraak = !eigen && zoek.afspraak ? afspraken.find((x) => x.id === zoek.afspraak) : undefined;
  const doelEigen = zoek.afspraak ? extra.find((x) => x.id === zoek.afspraak) : undefined;
  useEffect(() => {
    if (doelEigen) setDetail({ a: doelEigen, datum: zoek.dag ?? doelEigen.datum });
  }, [zoek.afspraak, zoek.dag]);
  const [doelOpen, setDoelOpen] = useState(false);
  useEffect(() => { setDoelOpen(!!zoek.afspraak); }, [zoek.afspraak]);
  const openBewerk = (v: Voorkomen, m: Modus = "aanpassen") => {
    setBewerk(v); setModus(m); setBereik(m === "herhaling" ? "toekomst" : "alleen");
    setTitel(v.a.titel); setDatum(v.datum); setTijd(v.a.tijd); setEindtijd(v.a.eindtijd ?? ""); setCategorie(v.a.categorie); setKind(v.a.kind); setPriveBotsing(null);
    setLocatie(v.a.locatie ?? ""); setToelichting(v.a.toelichting ?? ""); setHerinnering(v.a.herinnering ?? "geen"); setGedeeld(v.a.gedeeld !== false);
    setHerhaling(v.a.herhaling ?? { freq: "geen", interval: 2, eenheid: "weken" });
    setNieuwOpen(true);
  };
  const isReeks = (a: ExtraAfspraak) => !!a.herhaling && a.herhaling.freq !== "geen";
  /** Direct wijzigen: persoonlijke afspraak, of eigen gezin waarin nog geen andere ouder meedoet (geen voorstel aan niemand). */
  const direct = (a: ExtraAfspraak) => a.gedeeld === false || (eigen && !startSt.uitgenodigd);
  const wordtVoorstel = bewerk ? !direct(bewerk.a) : voorstelNieuw && gedeeld;
  const toon = (v: "titel" | "datum" | "herhaling" | "rest") =>
    !bewerk || modus === "aanpassen" || (modus === "verplaatsen" && v === "datum") || (modus === "herhaling" && v === "herhaling");

  const verwijder = (v: Voorkomen, b: Bereik) => {
    const { a, datum: d } = v;
    const leg: typeof legAudit = (...args) => { if (a.gedeeld !== false) legAudit(...args); };
    if (!isReeks(a) || b === "reeks" || (b === "toekomst" && d === a.datum)) {
      leg("afspraak", a.id, a.titel, "verwijderd");
      setExtra((l) => l.filter((x) => x.id !== a.id));
    } else if (b === "alleen") {
      leg("afspraak", a.id, `${a.titel} (${kort(d)})`, "verwijderd");
      setExtra((l) => l.map((x) => (x.id === a.id ? { ...x, overslaan: [...(x.overslaan ?? []), d] } : x)));
    } else {
      leg("afspraak", a.id, `${a.titel} vanaf ${kort(d)}`, "verwijderd");
      setExtra((l) => l.map((x) => (x.id === a.id ? { ...x, herhaling: { ...x.herhaling!, eind: plusDagen(d, -1) } } : x)));
    }
    setVerwijderVk(null);
  };

  const labels = { titel: "titel", datum: "datum", tijd: "tijd", categorie: "categorie", kind: "kind", locatie: "locatie" };
  /** Voert een definitieve wijziging uit (direct bij persoonlijk, of na akkoord bij gedeeld). */
  const pasToe = (bv: Voorkomen, velden: Velden, b: Bereik) => {
    const oud = bv.a;
    const nieuwId = `nieuw-${Date.now()}`;
    const legVerschillen: typeof legVerschillenAudit = (...args) => { if (velden.gedeeld !== false) legVerschillenAudit(...args); };
    if (!isReeks(oud) || b === "reeks" || (b === "toekomst" && bv.datum === oud.datum)) {
      const nieuw = { ...oud, ...velden, datum: isReeks(oud) && b !== "toekomst" ? oud.datum : velden.datum };
      if (oud.gedeeld === false && velden.gedeeld !== false) leg("afspraak", oud.id, nieuw.titel, "toegevoegd", undefined, "Sanne", { kinderen: /allebei|alle kinderen|&/i.test(nieuw.kind) ? alleNamen : [nieuw.kind] });
      else legVerschillen("afspraak", oud.id, nieuw.titel, oud, nieuw, labels);
      setExtra((l) => l.map((x) => (x.id === oud.id ? nieuw : x)));
    } else if (b === "alleen") {
      setExtra((l) => [...l.map((x) => (x.id === oud.id ? { ...x, overslaan: [...(x.overslaan ?? []), bv.datum] } : x)), { id: nieuwId, ...velden, herhaling: undefined }]);
      legVerschillen("afspraak", oud.id, velden.titel, { ...oud, datum: bv.datum }, { ...oud, ...velden }, labels);
    } else {
      setExtra((l) => [...l.map((x) => (x.id === oud.id ? { ...x, herhaling: { ...x.herhaling!, eind: plusDagen(bv.datum, -1) } } : x)), { id: nieuwId, ...velden }]);
      legVerschillen("afspraak", oud.id, velden.titel, { ...oud, datum: bv.datum }, { ...oud, ...velden }, labels);
    }
  };
  const accepteer = (w: Wachtend) => {
    if (!wachtend.includes(w)) return;
    setWachtend((l) => l.map((x) => x === w ? { ...x, status: "geaccepteerd" } : x));
    leg("afspraak", w.vk.a.id, w.vk.a.titel, "ACCEPTED");
    const velden = w.velden;
    if (w.soort === "nieuw" && velden) setExtra((l) => [...l, { id: w.vk.a.id, ...velden }]);
    else if (w.soort === "verwijder") verwijder(w.vk, w.bereik);
    else if (w.velden) pasToe(w.vk, w.velden, w.bereik);
    setMelding("De andere ouder ging akkoord. De agenda is bijgewerkt.");
  };

  const opslaan = (tochToevoegen = false, vastId?: string) => {
    if (!titel.trim() || !datum || (gedeeld && !kind.trim())) return;
    if (!tochToevoegen && !gedeeld) {
      const b = controleerPrive({ datum, tijd, eindtijd }, extra.filter((x) => x.gedeeld !== false && x.id !== bewerk?.a.id).map((x) => ({ id: x.id, titel: x.titel, datum: x.datum, tijd: x.tijd, kind: x.kind })));
      if (b.length) { setPriveBotsing(b); setAfstemTekst(null); return; }
    }
    setPriveBotsing(null); setAfstemTekst(null);
    if (!tochToevoegen && gedeeld && vkSlim.conflictControle) {
      const c = controleerAfspraak({ datum, tijd, eindtijd, kind, titel, categorie }, extra.filter((x) => x.gedeeld !== false).flatMap((x) => voorkomens(x, datum, datum).map((d) => ({ id: x.id, titel: x.titel, datum: d, tijd: x.tijd, eindtijd: x.eindtijd, kind: x.kind }))), bewerk?.a.id, !eigen);
      if (c.length) { setControle(c); return; }
    }
    setControle(null);
    const velden: Velden = { titel: titel.trim(), datum, tijd, eindtijd: eindtijd || undefined, categorie, kind, herhaling: herhaling.freq === "geen" ? undefined : herhaling, locatie: locatie.trim() || undefined, toelichting: toelichting.trim() || undefined, herinnering, gedeeld };
    if (bewerk) {
      if (wordtVoorstel) {
        setWachtend((l) => [...l.filter((x) => x.vk.a.id !== bewerk.a.id), { vk: bewerk, soort: "wijzig", bereik: isReeks(bewerk.a) ? bereik : "reeks", velden }]);
        if (gedeeld) leg("afspraak", bewerk.a.id, titel.trim(), "CREATED", undefined, "Sanne", { meta: { status: "Wacht op de ander", voorstel: "Wijziging", datum, tijd } });
        setMelding("Wijziging voorgesteld. De huidige afspraak blijft gelden tot de andere ouder akkoord geeft.");
      } else {
        pasToe(bewerk, velden, isReeks(bewerk.a) ? bereik : "reeks");
        setMelding(gedeeld ? "Afspraak is nu gedeeld met de andere ouder." : "Afspraak aangepast.");
      }
    } else {
      const id = vastId ?? `nieuw-${Date.now()}`;
      const meta = categorieMeta[categorie as Categorie];
      if (wordtVoorstel) {
        setWachtend((l) => [...l, { vk: { a: { id, ...velden }, datum }, soort: "nieuw", bereik: "reeks", velden }]);
        leg("afspraak", id, velden.titel, "CREATED", undefined, "Sanne", { kinderen: [kind], meta: { status: "Wacht op de ander", voorstel: "Nieuwe afspraak", datum, tijd } });
        setMelding("Afspraak voorgesteld in het voorbeeldgezin. Nog niet bevestigd in de agenda.");
        setNieuwOpen(false); setBewerk(null); return;
      }
      setExtra((l) => [...l, { id, ...velden }]);
      // Aanwezigheid afstemmen: alleen bij een gedeelde afspraak voor een kind; "later" bewaart de keuze zonder voorstel.
      if (gedeeld && aanwezigKeuze) {
        const taakKind = /allebei|&|alle kinderen/i.test(kind) ? "beide" : kind.toLowerCase();
        startAfstemming(id, aanwezigKeuze, "sanne", { ...(aanwezigWieGaat ? { wieGaat: aanwezigWieGaat } : {}), ...(aanwezigContactWie ? { contactWie: aanwezigContactWie } : {}), kind: taakKind, afspraakTitel: velden.titel });
      }
      setAanwezigKeuze(null); setAanwezigWieGaat(null); setAanwezigContactWie(null);
      // Privé: niets in de gedeelde geschiedenis, export of meldingen.
      if (gedeeld) leg("afspraak", id, velden.titel, "toegevoegd", undefined, "Sanne", { kinderen: /allebei|alle kinderen|&/i.test(kind) ? alleNamen : [kind] });
      if (importExtra) {
        const taakKind = /allebei|&/i.test(kind) ? "beide" : kind === "Noah" ? "noah" : "emma";
        for (const tekst of new Set([importExtra.taak.trim(), importExtra.mee.trim()].filter(Boolean))) {
          voegTaakToe({ tekst, kind: taakKind, wie: "", herhaling: "eenmalig", deadline: datum });
        }
        const bedrag = Number(importExtra.bedrag.replace(",", "."));
        if (bedrag > 0) nieuwBudget({ wat: titel.trim(), kind: /allebei|&/i.test(kind) ? "Emma & Noah" : kind, max: bedrag, pctSanne: 50, toelichting: `Uit de schoolbrief · ${lang(datum)}. Nog geen betaling geregistreerd.` });
        setImportExtra(null);
      }
      if (gedeeld) gesprekken.unshift({ ...gesprekken[0], id: `afspraak-${id}`, onderwerp: velden.titel, icoon: meta?.icoon ?? "📌", laatste: "Nog geen berichten", laatsteTijd: "Nu", ongelezen: 0, berichten: [] });
      setMelding(eigen ? "Afspraak toegevoegd op dit apparaat." : gedeeld ? "Afspraak toegevoegd in het voorbeeldgezin." : "Persoonlijke afspraak toegevoegd. Alleen jij ziet hem.");
    }
    setBewerk(null);
    setNieuwOpen(false);
  };

  const maandVan = iso(getoondeMaand);
  const maandTot = iso(new Date(getoondeMaand.getFullYear(), getoondeMaand.getMonth() + 1, 0));
  const leeg = (getoondeMaand.getDay() + 6) % 7;
  const maandDagen = Array.from({ length: dt(maandTot).getDate() }, (_, i) => plusDagen(maandVan, i));
  const vakInMaand = vakantiesTussen(regio, maandVan, maandTot);

  return (
    <AppShell>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <BackButton terug="/" />
          <div>
            <h1 className="font-display text-2xl font-extrabold leading-tight">Agenda</h1>
            <p className="mt-1 text-sm text-ink-soft">Samen bijgehouden · <Link to="/veranderd" className="font-semibold text-brand">Nu afstemmen</Link></p>
          </div>
        </div>
        <div className="flex items-center gap-2"><Assistent pagina="Agenda" />
        <ContextToevoegen titel="Wat wil je toevoegen?" acties={[
          { titel: "Afspraak", uitleg: "Zet iets in de gedeelde agenda, eventueel herhalend.", icoon: CalendarPlus, onKies: () => openNieuw() },
          { titel: "Wisselmoment", uitleg: "Stel een wijziging van een wisselmoment voor.", icoon: ArrowLeftRight, onKies: () => router.navigate({ to: "/zorgregeling", search: { actie: "wijziging", bron: "agenda" } }) },
          { titel: "Voorstel", uitleg: "Leg iets voor om samen af te spreken.", icoon: FilePen, onKies: () => router.navigate({ to: "/afspraken" }) },
          { titel: "Vakantie / bijzondere dag", uitleg: "Stel een vakantie of bijzondere dag voor.", icoon: Palmtree, onKies: () => router.navigate({ to: "/planning", search: { toevoegen: "vakantie" } }) },
          { titel: "Taak", uitleg: "Iets dat geregeld moet worden.", icoon: ListChecks, onKies: () => router.navigate({ to: "/taken" }) },
          { titel: "Hulp vragen aan je netwerk", uitleg: "Vraag opa, oma of iemand anders die kan ophalen of overnemen.", icoon: CircleHelp, functie: "hulp", onKies: () => router.navigate({ to: "/taken", search: { hulp: true } }) },
        ]} /></div>
      </div>

      {melding ? <div className="mt-4 rounded-md border border-brand/20 bg-brand-soft p-3 text-sm text-brand">{melding}</div> : null}
      {voorstellen.some((w) => w.soort === "nieuw") ? <section className="mt-4 border-y border-border py-3"><h2 className="text-sm font-semibold">Afspraakvoorstellen</h2>{voorstellen.filter((w) => w.soort === "nieuw").map((w) => <div key={w.vk.a.id} className="mt-2 flex items-center gap-2"><Button variant="ghost" className="h-auto min-w-0 flex-1 justify-start whitespace-normal text-left" onClick={() => setDetail(w.vk)}><span>{w.vk.a.titel}<span className="block text-xs font-normal text-ink-soft">{w.status === "ingetrokken" ? "Ingetrokken" : w.status === "geaccepteerd" ? "Afgesproken" : "Wacht op de ander · nog niet in de agenda"}</span></span></Button><GeschiedenisKnop soort="afspraak" itemId={w.vk.a.id} naam={w.vk.a.titel} /></div>)}</section> : null}

      <div className="mt-4 flex rounded-md border border-border p-1">
        {(["dag", "week", "maand"] as Weergave[]).map((w) => (
          <button key={w} onClick={() => zetWeergave(w)} className={`flex-1 rounded py-2 text-sm font-semibold capitalize transition-colors ${weergave === w ? "bg-brand text-primary-foreground" : "text-ink-soft"}`}>{w}</button>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-4 px-1 text-[11px] text-ink-soft">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-brand" /> {eigen ? "Bij jou" : "Sanne"}</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-accent-warm" /> {eigen ? "Bij de andere ouder" : "Joris"}</span>
        <span className="flex items-center gap-1.5"><span className="size-1.5 rotate-45 rounded-[1px] bg-ink" /> {eigen ? "Wisselmoment" : "Wissel op vrijdag"}</span>
      </div>

      {heeftPrive ? (
        <div className="mt-3 flex gap-2" role="group" aria-label="Agenda filteren">
          {([["alles", "Alles"], ["kinderen", "Kinderen"], ["prive", "Privé"]] as const).map(([k, l]) => <Chip key={k} actief={filter === k} onClick={() => setFilter(k)}>{l}</Chip>)}
        </div>
      ) : null}

      {eigen && extra.length === 0 ? (
        <section className="mt-4 rounded-lg border border-border bg-card px-5 py-4">
          <p className="font-display text-lg font-bold">Jullie afspraken op één plek</p>
          <p className="mt-1 text-sm text-ink-soft">Voeg schoolactiviteiten, sport, afspraken en andere belangrijke momenten toe. Zo houd je overzicht en zie je op tijd wat eraan komt.</p>
          <button onClick={() => openNieuw()} className="mt-3 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground">Eerste afspraak toevoegen</button>
        </section>
      ) : null}

      {weergave === "dag" ? (
        <div className="mt-4 space-y-2.5">
          <Card>
            <p className="text-xs font-semibold tracking-wider text-brand uppercase">Vandaag · {lang(VANDAAG)}</p>
            <p className="mt-1 font-display text-lg font-bold">
              {eigen
                ? startSt.kinderen.length
                  ? `${startSt.kinderen.map((k) => k.naam).join(" & ")} ${eigenRegeling ? `zijn ${plekOp(eigenRegeling, dt(VANDAAG)) === "ik" ? "bij jou" : "bij de andere ouder"}` : "vandaag"}`
                  : "Je eigen agenda"
                : "Emma & Noah zijn bij Sanne"}
            </p>
          </Card>
          {demoVoor(VANDAAG).map((a) => <AfspraakRij key={a.id} id={a.id} />)}
          {vk(VANDAAG, VANDAAG).map((v) => <ExtraAfspraakRij key={v.a.id + v.datum} v={v} onOpen={setDetail} wacht={wachtOp(v.a.id)} onAkkoord={wachtOp(v.a.id) ? () => { const w = wachtend.find((x) => x.vk.a.id === v.a.id); if (w) accepteer(w); } : undefined} />)}
          <button onClick={() => setGekozenDag(VANDAAG)} className="text-xs font-semibold text-brand">Alles van vandaag bekijken →</button>
        </div>
      ) : null}

      {weergave === "week" ? (
        <>
          <Card className="mt-4">
            <div className="flex items-center justify-between">
              <button onClick={() => { zetWeekOffset((w) => w - 1); setWeekDag(null); }} aria-label="Vorige week" className="grid size-8 place-items-center rounded-full border border-border text-ink-soft">‹</button>
              <div className="text-center">
                <p className="font-display text-base font-bold">Week {weekNr(weekStart)}{weekOffset === 0 ? " · deze week" : ""}</p>
                <p className="text-[11px] text-ink-soft">{kort(weekStart)} – {kort(plusDagen(weekStart, 6))}</p>
              </div>
              <button onClick={() => { zetWeekOffset((w) => w + 1); setWeekDag(null); }} aria-label="Volgende week" className="grid size-8 place-items-center rounded-full border border-border text-ink-soft">›</button>
            </div>
            <div className="mt-3 grid grid-cols-7 gap-1.5">
              {weekDagen.map((d) => <DagCel key={d} d={d} groot zorg={zorg} regio={regio} heeftIets={demoVoor(d).length + vk(d, d).length > 0} onKies={setWeekDag} geselecteerd={d === weekDag} eigenPlek={eigenPlekVan(d)} eigenWissel={eigenWisselVan(d)} />)}
            </div>
            {weekOffset !== 0 ? <button onClick={() => { zetWeekOffset(0); setWeekDag(null); }} className="mt-3 text-xs font-semibold text-brand">Terug naar deze week</button> : null}
          </Card>
          <div className="mt-3 space-y-2.5">
            {weekDag ? <div className="flex items-center justify-between gap-3 border-b border-border pb-2"><p className="text-sm font-semibold capitalize">{lang(weekDag)}</p><Button variant="ghost" size="icon" aria-label="Afspraak toevoegen op geselecteerde dag" onClick={() => openNieuw(weekDag)}><AppIcon functie="toevoegen" maat="sm" vorm="kaal" /></Button></div> : null}
            {(weekDag ? [weekDag] : weekDagen).flatMap((d) => demoVoor(d)).map((a) => <AfspraakRij key={a.id} id={a.id} />)}
            {vk(weekDag ?? weekStart, weekDag ?? plusDagen(weekStart, 6)).map((v) => <ExtraAfspraakRij key={v.a.id + v.datum} v={v} onOpen={setDetail} wacht={wachtOp(v.a.id)} onAkkoord={wachtOp(v.a.id) ? () => { const w = wachtend.find((x) => x.vk.a.id === v.a.id); if (w) accepteer(w); } : undefined} />)}
            {weekDag && !demoVoor(weekDag).length && !vk(weekDag, weekDag).length ? <p className="text-sm text-ink-soft">Geen afspraken op deze dag.</p> : null}
          </div>
          <Card className="mt-4">
            <p className="text-sm font-semibold">Komende 4 weken</p>
            <div className="mt-3 space-y-1.5">
              {[0, 1, 2, 3].map((w) => {
                const start = plusDagen(maandagVan(VANDAAG), (weekOffset + w) * 7);
                const nu = start === maandagVan(VANDAAG);
                return (
                  <div key={start} className={`flex items-center gap-2 rounded-md px-1.5 py-1 ${nu ? "bg-secondary" : ""}`}>
                    <span className={`w-9 shrink-0 text-[11px] ${nu ? "font-bold text-ink" : "text-ink-soft"}`}>{nu ? "Nu" : `wk ${weekNr(start)}`}</span>
                    <div className="grid flex-1 grid-cols-7 gap-1">
                      {Array.from({ length: 7 }, (_, i) => plusDagen(start, i)).map((d) => <DagCel key={d} d={d} zorg={zorg} regio={regio} heeftIets={demoVoor(d).length + vk(d, d).length > 0} onKies={setGekozenDag} eigenPlek={eigenPlekVan(d)} eigenWissel={eigenWisselVan(d)} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      ) : null}

      {weergave === "maand" ? (
        <>
          <Card className="mt-4">
            <div className="flex items-center justify-between">
              <button onClick={() => zetMaandOffset((m) => m - 1)} className="grid size-9 place-items-center rounded-full border border-border text-ink-soft" aria-label="Vorige maand">‹</button>
              <p className="font-display text-base font-bold capitalize">{getoondeMaand.toLocaleDateString("nl-NL", { month: "long", year: "numeric" })}</p>
              <button onClick={() => zetMaandOffset((m) => m + 1)} className="grid size-9 place-items-center rounded-full border border-border text-ink-soft" aria-label="Volgende maand">›</button>
            </div>
            <div className="mt-3 grid grid-cols-7 gap-1.5 text-center text-[11px] text-ink-soft">
              {["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"].map((d) => <span key={d}>{d}</span>)}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-1.5">
              {Array.from({ length: leeg }).map((_, i) => <span key={`l${i}`} />)}
              {maandDagen.map((d) => <DagCel key={d} d={d} zorg={zorg} regio={regio} heeftIets={demoVoor(d).length + vk(d, d).length > 0} onKies={setGekozenDag} eigenPlek={eigenPlekVan(d)} eigenWissel={eigenWisselVan(d)} />)}
            </div>
          </Card>
          {vakInMaand.map((v) => (
            <div key={v.naam + v.van} className="mt-3 flex items-center justify-between gap-3 border-b border-border px-1 pb-3">
              <div>
                <p className="text-sm font-semibold">{v.naam}</p>
                <p className="text-xs text-ink-soft">{kort(v.van)} – {kort(v.tot)} · {regioLabel[regio]} · schoolkalender</p>
              </div>
              <Link to="/planning" search={{ toevoegen: "verdelen", periode: v.naam }} className="shrink-0 text-xs font-semibold text-brand">Toevoegen aan onze planning</Link>
            </div>
          ))}
          <div className="mt-3 space-y-2.5">
            {maandDagen.flatMap((d) => demoVoor(d)).map((a) => <AfspraakRij key={a.id} id={a.id} />)}
            {vk(maandVan, maandTot).map((v) => <ExtraAfspraakRij key={v.a.id + v.datum} v={v} onOpen={setDetail} wacht={wachtOp(v.a.id)} onAkkoord={wachtOp(v.a.id) ? () => { const w = wachtend.find((x) => x.vk.a.id === v.a.id); if (w) accepteer(w); } : undefined} />)}
            {maandDagen.every((d) => demoVoor(d).length === 0) && vk(maandVan, maandTot).length === 0 ? <Card className="text-sm text-ink-soft">Deze maand is nog rustig. <button type="button" onClick={() => openNieuw()} className="font-semibold text-brand">Afspraak toevoegen</button></Card> : null}
          </div>
        </>
      ) : null}

      <DagSheet
        dag={gekozenDag}
        onSluit={() => setGekozenDag(null)}
        zorg={zorg}
        regio={regio}
        eigen={eigen}
        eigenKinderen={eigen && eigenRegeling && gekozenDag ? startSt.kinderen.map((k) => ({ naam: k.naam, plek: plekOp(eigenRegeling, dt(gekozenDag)) })) : undefined}
        eigenWissel={gekozenDag ? eigenWisselVan(gekozenDag) : undefined}
        extra={gekozenDag ? vk(gekozenDag, gekozenDag) : []}
        taken={gekozenDag && !eigen ? taken.filter((t) => t.deadline === gekozenDag && !t.klaar) : []}
        onToevoegen={() => openNieuw(gekozenDag ?? "")}
        onOpen={(v) => { setGekozenDag(null); setDetail(v); }}
      />

      <AfspraakDetail
        v={detail}
        direct={detail ? direct(detail.a) : false}
        wacht={detail ? wachtend.find((w) => w.vk.a.id === detail.a.id) : undefined}
        ingetrokken={detail ? voorstellen.some((w) => w.vk.a.id === detail.a.id && w.status === "ingetrokken") : false}
        onSluit={() => setDetail(null)}
        onActie={(m) => { const d = detail; if (!d) return; setDetail(null); if (m === "verwijderen") setVerwijderVk(d); else openBewerk(d, m); }}
        onIntrekken={() => { const w = wachtend.find((x) => x.vk.a.id === detail?.a.id); if (w) { setWachtend((l) => l.map((x) => x === w ? { ...x, status: "ingetrokken" } : x)); leg("afspraak", w.vk.a.id, w.vk.a.titel, "CANCELLED", { veld: "status", oud: "Wacht op de ander", nieuw: "Ingetrokken" }); setMelding("Voorstel ingetrokken. De huidige agenda blijft gelden."); } setDetail(null); }}
        onAkkoord={() => { const w = wachtend.find((x) => x.vk.a.id === detail?.a.id); if (w) accepteer(w); setDetail(null); }}
      />

      {/* Doorklik vanuit Home: precies deze afspraak openen, los van de gekozen weergave. */}
      {zoek.afspraak ? (doelAfspraak ? (doelAfspraak.categorie === "wissel"
        ? <WisselmomentSheet open={doelOpen} onSluit={() => setDoelOpen(false)} a={doelAfspraak} />
        : <VasteAfspraakSheet open={doelOpen} onSluit={() => setDoelOpen(false)} a={doelAfspraak} />)
        : doelOpen && !doelEigen ? <div role="alert" className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-md rounded-md border border-border bg-card p-4 text-sm"><p className="font-semibold">Deze afspraak bestaat niet meer</p><p className="mt-1 text-ink-soft">Hij is wellicht verplaatst of verwijderd. Bekijk de agenda voor de actuele planning.</p><button onClick={() => setDoelOpen(false)} className="mt-2 font-semibold text-brand">Sluiten</button></div> : null) : null}
      <Sheet open={!!verwijderVk} onOpenChange={(o) => !o && setVerwijderVk(null)}>
        <SheetContent side="bottom" className="left-1/2 w-full max-w-md -translate-x-1/2 rounded-t-2xl bg-background px-5 pb-8">
          <SheetHeader className="text-left">
            <SheetTitle className="font-display text-lg">Afspraak verwijderen?</SheetTitle>
            <SheetDescription>{verwijderVk ? `${verwijderVk.a.titel} · ${lang(verwijderVk.datum)}` : ""}</SheetDescription>
          </SheetHeader>
          {verwijderVk ? (
            <div className="mt-4 space-y-2">
              {!direct(verwijderVk.a) ? <p className="text-sm text-ink-soft">Deze afspraak wordt gedeeld. Hij verdwijnt pas voor iedereen als de andere ouder akkoord geeft.</p> : null}
              {afstemStatus(verwijderVk.a.id) === "akkoord" && annuleringNietNodig !== verwijderVk.a.id ? <section className="rounded-md border border-border p-3"><p className="text-sm">Deze afspraak was afgestemd met de andere ouder. Wil je laten weten dat hij niet doorgaat?</p><div className="mt-2 flex gap-4"><Link to="/berichten" search={{ concept: `De afspraak ${verwijderVk.a.titel} op ${lang(verwijderVk.datum)} om ${uur(verwijderVk.a.tijd)} gaat niet door. We hadden dit afgestemd; ik laat het je daarom weten. De verwijdering leg ik apart ter akkoord voor.` }} className="inline-flex min-h-11 items-center text-sm font-semibold text-brand">Bericht voorbereiden</Link><button onClick={() => setAnnuleringNietNodig(verwijderVk.a.id)} className="min-h-11 text-sm text-ink-soft">Niet nodig</button></div><p className="text-xs text-ink-soft">Je controleert het bericht vóór verzending. De afspraak blijft staan tot akkoord op de verwijdering.</p></section> : null}
              {isReeks(verwijderVk.a) ? (
                <fieldset className="rounded-md border border-border p-3">
                  <legend className="px-1 text-xs font-semibold text-ink-soft">Waarop wil je dit toepassen?</legend>
                  {(["alleen", "toekomst", "reeks"] as Bereik[]).map((b) => (
                    <label key={b} className="flex items-center gap-2 py-1 text-sm">
                      <input type="radio" name="vbereik" checked={bereik === b} onChange={() => setBereik(b)} className="accent-[var(--color-brand)]" />{bereikNaam[b]}
                    </label>
                  ))}
                </fieldset>
              ) : null}
              {!direct(verwijderVk.a) ? (
                <>
                  <button onClick={() => { setVerborgen((l) => [...l, verwijderVk.a.id]); setVerwijderVk(null); setMelding("Verborgen in jouw weergave. Voor de andere ouder blijft de afspraak staan."); }} className="w-full rounded-md border border-border px-4 py-3 text-left text-sm font-semibold">Alleen uit mijn eigen weergave verwijderen</button>
                  <button onClick={() => { setWachtend((l) => [...l, { vk: verwijderVk, soort: "verwijder", bereik: isReeks(verwijderVk.a) ? bereik : "reeks" }]); setVerwijderVk(null); setMelding("Verwijdering voorgesteld. De afspraak blijft staan tot de andere ouder akkoord geeft."); }} className="w-full rounded-md bg-brand px-4 py-3 text-left text-sm font-semibold text-primary-foreground">Verwijdering voorstellen</button>
                </>
              ) : (
                <button onClick={() => verwijder(verwijderVk, isReeks(verwijderVk.a) ? bereik : "reeks")} className="w-full rounded-md bg-brand px-4 py-3 text-left text-sm font-semibold text-primary-foreground">Verwijderen</button>
              )}
              <button onClick={() => setVerwijderVk(null)} className="w-full py-2 text-sm font-semibold text-ink-soft">Annuleren</button>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {nieuwOpen ? (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/30 px-5 pb-5" onClick={sluitNieuw}>
          <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-border bg-background p-5" onClick={(e) => e.stopPropagation()}>
            <button onClick={sluitNieuw} aria-label="Sluiten" className="knop-kruis absolute right-4 top-4 size-9"><X className="size-5" /></button>
            {verlatenVraag ? (
              <div className="mt-8 rounded-md border border-border bg-card p-4">
                <p className="font-display text-lg">Afspraak verlaten?</p>
                <p className="mt-1 text-sm text-ink-soft">Je wijzigingen zijn nog niet opgeslagen.</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm font-semibold">
                  <button onClick={() => setVerlatenVraag(false)} className="rounded-md bg-brand py-2 text-primary-foreground">Verder bewerken</button>
                  <button onClick={() => { setVerlatenVraag(false); setNieuwOpen(false); }} className="rounded-md border border-border py-2 text-ink-soft">Verlaten</button>
                </div>
              </div>
            ) : null}
            <p className="font-display text-lg font-bold">{!bewerk ? "Nieuwe afspraak" : modus === "verplaatsen" ? "Afspraak verplaatsen" : modus === "herhaling" ? "Herhalen aanpassen" : wordtVoorstel ? "Wijziging voorstellen" : "Afspraak aanpassen"}</p>
            {bewerk && isReeks(bewerk.a) ? (
              <fieldset className="mt-3 rounded-md border border-border p-3">
                <legend className="px-1 text-xs font-semibold text-ink-soft">Waarop wil je dit toepassen?</legend>
                {(modus === "herhaling" ? (["toekomst", "reeks"] as Bereik[]) : (["alleen", "toekomst", "reeks"] as Bereik[])).map((b) => (
                  <label key={b} className="flex items-center gap-2 py-1 text-sm">
                    <input type="radio" name="bereik" checked={bereik === b} onChange={() => setBereik(b)} className="accent-[var(--color-brand)]" />{bereikNaam[b]}
                  </label>
                ))}
              </fieldset>
            ) : null}
            {bewerk && modus === "verplaatsen" ? (
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-md border border-border p-3"><p className="text-xs text-ink-soft">Huidig</p><p className="font-semibold capitalize">{dt(bewerk.datum).toLocaleDateString("nl-NL", { weekday: "long" })} {uur(bewerk.a.tijd)}</p></div>
                <div className="rounded-md border border-brand/40 bg-brand-soft/50 p-3"><p className="text-xs text-ink-soft">Nieuw</p><p className="font-semibold capitalize">{datum ? dt(datum).toLocaleDateString("nl-NL", { weekday: "long" }) : "—"} {uur(tijd)}</p></div>
              </div>
            ) : null}
            <div className="mt-4 space-y-3">
              {toon("titel") ? <input value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="Titel, bijv. Tandarts" className="w-full rounded-md border border-border bg-card px-4 py-3 text-sm outline-none placeholder:text-ink-soft/70" /> : null}
              {toon("datum") ? (
                <div className="grid grid-cols-2 gap-2">
                  <label className="block"><span className="mb-1 block text-xs font-semibold text-ink-soft">Datum</span>
                    <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} className="w-full rounded-md border border-border bg-card px-3 py-2.5 text-sm outline-none" /></label>
                  <label className="block"><span className="mb-1 block text-xs font-semibold text-ink-soft">Begintijd</span>
                    <input type="time" value={tijd} onChange={(e) => setTijd(e.target.value)} className="w-full rounded-md border border-border bg-card px-3 py-2.5 text-sm outline-none" /></label>
                  <label className="col-span-2 block"><span className="mb-1 block text-xs font-semibold text-ink-soft">Eindtijd (optioneel)</span>
                    <input type="time" value={eindtijd} onChange={(e) => setEindtijd(e.target.value)} className="w-full rounded-md border border-border bg-card px-3 py-2.5 text-sm outline-none" /></label>
                </div>
              ) : null}
              {toon("herhaling") ? (
              <div>
                <span className="mb-1 block text-xs font-semibold text-ink-soft">Herhalen</span>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(freqLabel) as Freq[]).map((f) => (
                    <Chip key={f} actief={herhaling.freq === f} onClick={() => setHerhaling({ ...herhaling, freq: f })}>{freqLabel[f]}</Chip>
                  ))}
                </div>
                {herhaling.freq === "aangepast" ? (
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <span className="text-ink-soft">Elke</span>
                    <input type="number" min={1} max={12} value={herhaling.interval} onChange={(e) => setHerhaling({ ...herhaling, interval: Math.max(1, Number(e.target.value) || 1) })} className="w-16 rounded-md border border-border bg-card px-2 py-1.5" />
                    <select value={herhaling.eenheid} onChange={(e) => setHerhaling({ ...herhaling, eenheid: e.target.value as "weken" | "maanden" })} className="rounded-md border border-border bg-card px-2 py-1.5">
                      <option value="weken">weken</option><option value="maanden">maanden</option>
                    </select>
                  </div>
                ) : null}
                {herhaling.freq !== "geen" ? (
                  <label className="mt-2 block"><span className="mb-1 block text-xs text-ink-soft">Tot en met (optioneel)</span>
                    <input type="date" value={herhaling.eind ?? ""} onChange={(e) => setHerhaling({ ...herhaling, eind: e.target.value || undefined })} className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm" /></label>
                ) : null}
              </div>
              ) : null}
              {toon("rest") ? (
                <>
                  <fieldset>
                    <legend className="mb-1 text-xs font-semibold text-ink-soft">Voor wie is de afspraak?</legend>
                    {!bewerk ? (
                      <div className="flex flex-wrap gap-2">
                        {kindKeuzes.map((k) => <Chip key={k} actief={gedeeld && kind === k} onClick={() => { setKind(k); setGedeeld(true); }}>{/^(allebei|alle kinderen)$/i.test(k) && kindKeuzes.length === 3 ? "Beide kinderen" : k}</Chip>)}
                        <Chip actief={!gedeeld} onClick={() => { setGedeeld(false); setKind(""); }}><span className="inline-flex items-center gap-1"><Lock aria-hidden className="size-3.5" strokeWidth={1.8} />Voor mezelf</span></Chip>
                      </div>
                    ) : gedeeld ? (
                      <div className="flex flex-wrap gap-2">{kindKeuzes.map((k) => <Chip key={k} actief={kind === k} onClick={() => setKind(k)}>{/^(allebei|alle kinderen)$/i.test(k) && kindKeuzes.length === 3 ? "Beide kinderen" : k}</Chip>)}</div>
                    ) : <p className="inline-flex items-center gap-1 text-sm"><Lock aria-hidden className="size-3.5 text-ink-soft" strokeWidth={1.8} />Voor mezelf</p>}
                    {!gedeeld ? <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-ink-soft"><Lock aria-hidden className="size-3" strokeWidth={1.8} />Dit blijft privé en is alleen voor jouw eigen overzicht.</p> : null}
                  </fieldset>
                  <label className="block">
                    <span className="block text-xs font-semibold text-ink-soft">Categorie (optioneel)</span>
                    <span className="mb-1 block text-[11px] text-ink-soft">Kies een categorie om afspraken later makkelijker terug te vinden.</span>
                    <select value={categorie} onChange={(e) => setCategorie(e.target.value || "overig")} className="w-full rounded-md border border-border bg-card px-3 py-2.5 text-sm">
                      {Object.entries(categorieMeta).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
                    </select>
                  </label>
                  <input value={locatie} onChange={(e) => setLocatie(e.target.value)} placeholder="Locatie (optioneel)" className="w-full rounded-md border border-border bg-card px-4 py-2.5 text-sm outline-none placeholder:text-ink-soft/70" />
                  <textarea value={toelichting} onChange={(e) => setToelichting(e.target.value)} rows={2} placeholder="Toelichting (optioneel)" className="w-full rounded-md border border-border bg-card px-4 py-2.5 text-sm outline-none placeholder:text-ink-soft/70" />
                  <label className="block"><span className="mb-1 block text-xs font-semibold text-ink-soft">Herinnering</span>
                    <select value={herinnering} onChange={(e) => setHerinnering(e.target.value as Herinnering)} className="w-full rounded-md border border-border bg-card px-3 py-2.5 text-sm">
                      {(Object.keys(herinneringLabel) as Herinnering[]).map((h) => <option key={h} value={h}>{herinneringLabel[h]}</option>)}
                    </select></label>
                  {!bewerk && gedeeld && kind.trim() ? (
                    <AanwezigheidFormulier keuze={aanwezigKeuze} wieGaat={aanwezigWieGaat} contactWie={aanwezigContactWie} onKeuze={setAanwezigKeuze} onWieGaat={setAanwezigWieGaat} onContactWie={setAanwezigContactWie} />
                  ) : null}
                  {bewerk && bewerk.a.gedeeld === false ? (
                    <fieldset>
                      <legend className="mb-1 text-xs font-semibold text-ink-soft">Wie kan deze afspraak zien?</legend>
                      <div className="flex flex-wrap gap-2">
                        <Chip actief={gedeeld} onClick={() => { setGedeeld(true); if (!kind) setKind(standaardKind); }}>Bewust delen met de andere ouder</Chip>
                        <Chip actief={!gedeeld} onClick={() => setGedeeld(false)}>Alleen voor mij</Chip>
                      </div>
                      {gedeeld ? <p className="mt-1.5 rounded-md bg-muted p-2 text-xs">Na opslaan ziet de andere ouder: titel, datum, tijd, locatie en toelichting van deze afspraak.</p> : null}
                    </fieldset>
                  ) : null}
                </>
              ) : null}
              {voorstelNieuw ? <p className="text-xs text-ink-soft">De oorspronkelijke berichttekst staat bij Toelichting. Controleer zelf de datum, tijd, het kind en de omschrijving; er zijn geen ontbrekende details ingevuld.</p> : null}
              <p className="text-xs text-ink-soft">{wordtVoorstel ? "Dit wordt een voorstel. De huidige agenda blijft gelden tot de andere ouder akkoord geeft." : eigen ? "Bewaard op dit apparaat. Delen kan zodra de andere ouder echt gekoppeld is." : !bewerk && gedeeld ? "Deze afspraak wordt toegevoegd aan het voorbeeldgezin." : bewerk && gedeeld ? "Deze afspraak wordt bijgewerkt in het voorbeeldgezin." : "Alleen jij ziet deze afspraak; je wijziging wordt direct opgeslagen."}</p>
            </div>
            {priveBotsing ? (
              <div role="status" className="mt-4 rounded-md border border-border bg-muted p-3 text-sm">
                <p className="font-semibold">Dit lijkt te overlappen</p>
                <p className="mt-1 text-xs text-ink-soft">Je hebt op dit moment ook een persoonlijke afspraak. {priveBotsing.map((b) => b.tekst).join(" ")}</p>
                {afstemTekst === null ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button onClick={() => { setGekozenDag(datum); }} className="rounded-full border border-border px-3 py-1 text-xs font-semibold">Bekijk planning</button>
                    <button onClick={() => setAfstemTekst(priveBotsing[0]!.bericht)} className="rounded-full bg-brand px-3 py-1 text-xs font-semibold text-primary-foreground">Even afstemmen</button>
                    <button onClick={() => opslaan(true)} className="rounded-full border border-border px-3 py-1 text-xs font-semibold">Gewoon opslaan</button>
                  </div>
                ) : (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs">Wil je vragen of de andere ouder dit kan overnemen? Controleer het bericht eerst. Er staat niets in over je persoonlijke afspraak.</p>
                    <textarea aria-label="Bericht aan de andere ouder" value={afstemTekst} onChange={(e) => setAfstemTekst(e.target.value)} rows={3} className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm" />
                    <div className="flex flex-wrap gap-2">
                      <button disabled={!afstemTekst.trim()} onClick={() => {
                        const b = priveBotsing[0]!;
                        startNuAfstemmen({ categorie: "halen", kindIds: /allebei|&|kinderen/i.test(b.kind) ? ["emma", "noah"] : [b.kind.toLowerCase()], titel: `${b.titel} op ${kort(datum)}`, toelichting: afstemTekst.trim(), reactieGewenst: "zsm" });
                        opslaan(true);
                        setMelding("Persoonlijke afspraak bewaard en je vraag is verstuurd. De andere ouder ziet niets van je afspraak.");
                      }} className="rounded-full bg-brand px-3 py-1 text-xs font-semibold text-primary-foreground">Versturen</button>
                      <button onClick={() => setAfstemTekst(null)} className="rounded-full border border-border px-3 py-1 text-xs font-semibold">Terug</button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
            {controle ? (
              <div role="status" className="mt-4 rounded-md border border-border bg-muted p-3 text-sm">
                <p className="font-semibold">Even controleren</p>
                {controle.map((c, i) => <p key={`${c.soort}-${i}`} className="mt-1 text-xs text-ink-soft">{c.tekst}</p>)}
                <div className="mt-2 flex flex-wrap gap-2">
                  {controle.some((c) => c.soort !== "overlap") ? (
                    <button onClick={() => {
                      const nieuwId = `nieuw-${Date.now()}`;
                      const verzoek = startNuAfstemmen({
                        categorie: "planning",
                        kindIds: /allebei|&/i.test(kind) ? ["emma", "noah"] : [kind.toLowerCase()],
                        titel: `${titel.trim()} op ${kort(datum)}`,
                        toelichting: `${controle.map((c) => c.tekst).join(" ")} Komt ${titel.trim()}${tijd ? ` om ${uur(tijd)}` : ""} uit?`,
                        reactieGewenst: "zsm",
                      });
                      koppelAfstem(bewerk ? bewerk.a.id : nieuwId, verzoek);
                      opslaan(true, bewerk ? undefined : nieuwId);
                      setMelding("De afspraak wordt nog afgestemd. Gezien is nog geen akkoord, en geen reactie ook niet.");
                    }} className="rounded-full bg-brand px-3 py-1 text-xs font-semibold text-primary-foreground">Ja, even vragen</button>
                  ) : null}
                  <Button variant="outline" size="sm" onClick={() => opslaan(true)}>Toch opslaan</Button>
                  <button onClick={() => setControle(null)} className="rounded-full border border-border px-3 py-1 text-xs font-semibold">Andere tijd kiezen</button>
                  {controle.filter((c) => c.afspraakId).map((c) => <Button key={c.afspraakId} variant="outline" size="sm" onClick={() => { const a = extra.find((a) => a.id === c.afspraakId); if (a) setDetail({ a, datum }); else { setNieuwOpen(false); router.navigate({ to: "/agenda", search: { afspraak: c.afspraakId, dag: datum } }); } }}>Bekijk afspraak</Button>)}
                </div>
                {controle.some((c) => c.soort !== "overlap") ? <p className="mt-2 text-xs text-ink-soft">Kies je "Ja, even vragen", dan staat de afspraak erin als "wordt afgestemd". Gezien betekent nog geen akkoord, en geen reactie ook niet.</p> : null}
                {controle.some((c) => c.soort === "verblijf" || c.soort === "wissel") ? (
                  <div className="mt-3 border-t border-border pt-2">
                    <p className="text-xs font-semibold">Wie brengt of haalt {/allebei|&/i.test(kind) ? "de kinderen" : kind}?</p>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      <button onClick={() => { const nieuwId = `nieuw-${Date.now()}`; opslaan(true, bewerk ? undefined : nieuwId); ikGa(bewerk ? bewerk.a.id : nieuwId, titel.trim()); }} className="rounded-full bg-brand px-3 py-1 text-xs font-semibold text-primary-foreground">Ik</button>
                      <button onClick={() => { startNuAfstemmen({ categorie: "halen", kindIds: /allebei|&/i.test(kind) ? ["emma", "noah"] : [kind.toLowerCase()], titel: `${titel.trim()} op ${kort(datum)}`, toelichting: `Wie wil ${titel.trim()} op ${kort(datum)} brengen of ophalen?`, reactieGewenst: "zsm" }); setMelding("Afspraak toegevoegd en de vraag naar wie het regelt is gestuurd."); opslaan(true); }} className="rounded-full border border-border px-3 py-1 text-xs font-semibold">Andere ouder vragen</button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            {importExtra && !bewerk ? <fieldset className="mt-4 space-y-3 border-t border-border pt-3"><legend className="text-sm font-semibold">Ook meenemen uit de schoolbrief</legend>
              {importExtra.bedrag ? <label className="block text-xs font-semibold">Budget voorstellen (€)<input aria-label="Budget uit schoolbrief" type="number" min="0.01" max="100000" step="0.01" value={importExtra.bedrag} onChange={(e) => setImportExtra((v) => v ? { ...v, bedrag: e.target.value } : v)} className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm" /></label> : null}
              {importExtra.taak ? <label className="block text-xs font-semibold">Taak<input aria-label="Taak uit schoolbrief" value={importExtra.taak} onChange={(e) => setImportExtra((v) => v ? { ...v, taak: e.target.value } : v)} className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm" /></label> : null}
              {importExtra.mee ? <label className="block text-xs font-semibold">Voorbereiding<input aria-label="Voorbereiding uit schoolbrief" value={importExtra.mee} onChange={(e) => setImportExtra((v) => v ? { ...v, mee: e.target.value } : v)} className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm" /></label> : null}
              <p className="text-xs text-ink-soft">Taken komen bij Taken, met deze datum en nog niemand toegewezen. Het budget is een voorstel, geen betaling.</p>
              <Button variant="ghost" onClick={() => setImportExtra(null)}>Alleen de afspraak bewaren</Button>
            </fieldset> : null}
            {gedeeld ? <div className="mt-4">
              <HulpKnop voorstel={{ kind: hulpKind(), ...(titel ? { wat: titel } : {}), ...(datum ? { datum } : {}), ...(tijd ? { tijd } : {}) }} />
            </div> : null}
            <div className="sticky bottom-0 -mx-1 bg-background px-1 pb-1 pt-3">
            <Button onClick={() => opslaan()} disabled={!titel.trim() || !datum || (gedeeld && !kind.trim()) || (voorstelNieuw && eigen) || (importExtra?.bedrag ? !(Number(importExtra.bedrag.replace(",", ".")) > 0) : false)} className="min-h-11 w-full bg-brand text-primary-foreground shadow-none">
              {importExtra && !bewerk ? "Selectie bevestigen" : wordtVoorstel ? (bewerk ? "Wijziging voorstellen" : "Afspraak voorstellen") : !bewerk ? "Afspraak opslaan" : "Wijziging opslaan"}
            </Button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

const bereikNaam: Record<Bereik, string> = { alleen: "Alleen deze afspraak", toekomst: "Deze en toekomstige afspraken", reeks: "Hele reeks" };
type Herinnering = "geen" | "uur" | "dag" | "twee";
const herinneringLabel: Record<Herinnering, string> = { geen: "Geen herinnering", uur: "1 uur van tevoren", dag: "1 dag van tevoren", twee: "2 dagen van tevoren" };
type Modus = "aanpassen" | "verplaatsen" | "herhaling";
type Wachtend = { vk: Voorkomen; soort: "nieuw" | "wijzig" | "verwijder"; bereik: Bereik; velden?: Velden; status?: "ingetrokken" | "geaccepteerd" };
type Velden = Omit<ExtraAfspraak, "id" | "overslaan">;

function Chip({ actief, onClick, children }: { actief: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${actief ? "border-brand bg-brand text-primary-foreground" : "border-border bg-card"}`}>{children}</button>
  );
}

function DagCel({ d, zorg, regio, heeftIets, onKies, groot, geselecteerd, eigenPlek, eigenWissel }: { d: string; zorg: ReturnType<typeof useZorg>; regio: ReturnType<typeof useRegio>; heeftIets: boolean; onKies: (d: string) => void; groot?: boolean; geselecteerd?: boolean; eigenPlek?: "ik" | "ander" | undefined; eigenWissel?: boolean | undefined }) {
  const ze = verblijf(zorg, "emma", d), zn = verblijf(zorg, "noah", d);
  const ouder = eigenPlek ? (eigenPlek === "ik" ? "sanne" : "joris") : ze && zn && ze.ouder === zn.ouder ? ze.ouder : undefined;
  const vandaag = d === VANDAAG;
  const wissel = eigenWissel ?? isWissel(zorg, d);
  const vak = vakantieOp(regio, d);
  const { bijzonderTonen } = useVoorkeuren();
  const bd = bijzonderTonen ? bijzondereDagOp(d) : undefined;
  const datum = dt(d);
  return (
    <button
      type="button"
      onClick={() => onKies(d)}
      aria-pressed={!!geselecteerd}
      aria-label={`${lang(d)}${vandaag ? ", vandaag" : ""}${wissel ? ", wisselmoment" : ""}${vak ? `, ${vak.naam}` : ""}${bd ? `, ${bd.naam}` : ""}`}
      className={`relative rounded-lg text-center ${groot ? "py-2" : "py-1"} ${ouder === "sanne" ? "bg-brand/15" : ouder === "joris" ? "bg-accent-warm/20" : "bg-card"} ${geselecteerd ? "ring-2 ring-brand ring-offset-2 ring-offset-background" : vandaag ? "ring-2 ring-ink/70" : ""}`}
    >
      {groot ? <span className="block text-[11px] capitalize text-ink-soft">{datum.toLocaleDateString("nl-NL", { weekday: "short" })}</span> : null}
      <span className={`block ${groot ? "text-sm" : "text-[11px]"} ${vandaag ? "font-extrabold" : "font-semibold"} ${ouder === "sanne" ? "text-brand" : ouder === "joris" ? "text-accent-warm" : "text-ink"}`}>{datum.getDate()}</span>
      <span className="mx-auto mt-0.5 flex h-2 items-center justify-center gap-0.5">
        {wissel ? <ArrowLeftRight className="size-2 text-ink" strokeWidth={2.5} /> : null}
        {heeftIets ? <span className="size-1 rounded-full bg-ink/50" /> : null}
        {bd ? <span className="size-1 rounded-full bg-accent-warm" /> : null}
      </span>
      {vak ? <span className="absolute inset-x-1.5 bottom-0.5 h-0.5 rounded bg-ink-soft/40" /> : null}
      {vandaag && groot ? <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-ink px-1.5 text-[8px] font-bold text-background">vandaag</span> : null}
    </button>
  );
}

function DagSheet({ dag, onSluit, zorg, regio, extra, taken, onToevoegen, onOpen, eigen, eigenKinderen, eigenWissel }: {
  dag: string | null; onSluit: () => void; zorg: ReturnType<typeof useZorg>; regio: ReturnType<typeof useRegio>;
  extra: Voorkomen[]; taken: { id: string; tekst: string }[]; onToevoegen: () => void; onOpen: (v: Voorkomen) => void;
  eigen?: boolean; eigenKinderen?: { naam: string; plek: "ik" | "ander" }[] | undefined; eigenWissel?: boolean | undefined;
}) {
  const d = dag ?? VANDAAG;
  const kinderen = eigen
    ? (eigenKinderen ?? []).map((k) => ({ k: k.naam, v: { ouder: k.plek === "ik" ? "sanne" : "joris", uitzondering: undefined as string | undefined } }))
    : (["emma", "noah"] as KindId[]).map((k) => ({ k, v: verblijf(zorg, k, d) })).filter((x) => x.v);
  const demo = eigen ? [] : demoOp(d);
  const school = demo.filter((a) => a.categorie === "school" || a.categorie === "sport");
  const overig = demo.filter((a) => a.categorie !== "school" && a.categorie !== "sport" && a.categorie !== "wissel");
  const wisselDemo = demo.filter((a) => a.categorie === "wissel");
  const wissel = eigenWissel ?? (!eigen && isWissel(zorg, d));
  const vak = vakantieOp(regio, d);
  const { bijzonderTonen } = useVoorkeuren();
  const bd = bijzonderTonen ? bijzondereDagOp(d) : undefined;
  const bijzonder = [vak ? `${vak.naam} (schoolkalender)` : null, bd ? `${bd.naam} (kalender)` : null, ...kinderen.map((x) => (x.v?.uitzondering ? `${eigen ? x.k : kindNamen[x.k as KindId]}: ${x.v.uitzondering}` : null))].filter(Boolean) as string[];
  const Sectie = ({ titel, children }: { titel: string; children: React.ReactNode }) => (
    <div className="py-3"><p className="text-[11px] font-semibold tracking-wider text-ink-soft uppercase">{titel}</p><div className="mt-1.5 space-y-1 text-sm">{children}</div></div>
  );
  return (
    <Sheet open={!!dag} onOpenChange={(o) => !o && onSluit()}>
      <SheetContent side="bottom" className="left-1/2 max-h-[85vh] w-full max-w-md -translate-x-1/2 overflow-y-auto rounded-t-2xl bg-background px-5 pb-8">
        <SheetHeader className="text-left">
          <div className="flex items-center justify-between pr-7"><SheetTitle className="font-display text-xl font-medium first-letter:uppercase">{lang(d)}</SheetTitle><Button variant="ghost" size="icon" aria-label="Afspraak toevoegen op deze dag" onClick={onToevoegen}><AppIcon functie="toevoegen" maat="sm" vorm="kaal" /></Button></div>
          <SheetDescription className="sr-only">Wat er op deze dag speelt</SheetDescription>
        </SheetHeader>
        <div className="mt-2 divide-y divide-border border-y border-border">
          {kinderen.length ? <Sectie titel="Verblijf volgens planning">{kinderen.map((x) => <p key={x.k}>{eigen ? x.k : kindNamen[x.k as KindId]} is bij {x.v!.ouder === "sanne" ? "jou" : "de andere ouder"}</p>)}</Sectie> : null}
          {wissel || wisselDemo.length ? <Sectie titel="Wisselmoment">{wisselDemo.length ? wisselDemo.map((a) => <p key={a.id}>{a.tijd} · {a.locatie}</p>) : <p>Vandaag wisselen de kinderen van huis</p>}</Sectie> : null}
          {overig.length || extra.length ? (
            <Sectie titel="Afspraken">
              {overig.map((a) => <p key={a.id}>{a.tijd} · {a.titel} · {a.kind}</p>)}
              {extra.map((v) => <button key={v.a.id} type="button" onClick={() => onOpen(v)} className="flex min-h-[44px] w-full items-center justify-between gap-2 text-left" aria-label={`${v.a.titel} openen`}><span>{v.a.tijd ? uur(v.a.tijd) : "Hele dag"} · {v.a.titel} · {v.a.kind}{afstemStatus(v.a.id) === "akkoord" ? " · Afgestemd ✓" : ""}{v.a.herhaling ? " · herhalend" : ""}</span><span aria-hidden className="text-ink-soft">›</span></button>)}
            </Sectie>
          ) : null}
          {school.length ? <Sectie titel="School & activiteiten">{school.map((a) => <p key={a.id}>{a.tijd} · {a.titel}</p>)}</Sectie> : null}
          {taken.length ? <Sectie titel="Taken">{taken.map((t) => <p key={t.id}>{t.tekst}</p>)}</Sectie> : null}
          {bijzonder.length ? <Sectie titel="Bijzonder">{bijzonder.map((b) => <p key={b}>{b}</p>)}</Sectie> : null}
          {!kinderen.length && !demo.length && !extra.length && !taken.length && !bijzonder.length && !wissel ? <p className="py-3 text-sm text-ink-soft">Niets gepland op deze dag.</p> : null}
        </div>
        <button onClick={onToevoegen} className="mt-4 w-full rounded-md border border-brand/40 py-3 text-sm font-semibold text-brand">+ Toevoegen</button>
      </SheetContent>
    </Sheet>
  );
}

function ExtraAfspraakRij({ v, onOpen, wacht, onAkkoord }: { v: Voorkomen; onOpen: (v: Voorkomen) => void; wacht?: boolean; onAkkoord?: (() => void) | undefined }) {
  const { a } = v;
  useAanwezigheid();
  const { taken } = useTaken();
  const aan = a.gedeeld !== false ? aanwezigVoor(a.id) : undefined;
  const aanTaak = aan?.contactTaakId ? taken.find((t) => t.id === aan.contactTaakId) : undefined;
  const aanRegel = aan && !wacht ? statusRegel(aan, aanTaak?.contactStatus) : null;
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-center gap-3">
        <button onClick={() => onOpen(v)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`${a.titel} openen`}>
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-lg"><Pictogram waarde={categorieMeta[a.categorie as Categorie]?.icoon ?? "📌"} maat="md" vorm="kaal" /></div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{a.titel}</p>
            <p className="text-xs text-ink-soft">
              {dt(v.datum).toLocaleDateString("nl-NL", { day: "numeric", month: "long" })}{a.tijd ? ` · ${uur(a.tijd)}` : ""} · {a.kind}
              {a.herhaling && a.herhaling.freq !== "geen" ? ` · ${freqLabel[a.herhaling.freq].toLowerCase()}` : ""}
              {a.gedeeld === false ? <span className="ml-1.5 rounded-full border border-border px-1.5 py-px text-[11px] font-semibold">Privé</span> : null}
            </p>
            {wacht ? <p className="text-[11px] font-semibold text-ink-soft">Reactie open · huidige afspraak blijft gelden</p> : null}
            {aanRegel ? <p className="text-[11px] text-ink-soft">{aanRegel}</p> : null}
          </div>
        </button>
        <GeschiedenisKnop soort="afspraak" itemId={a.id} naam={a.titel} />
      </div>
      {wacht && onAkkoord ? (
        <div className="mt-2 flex gap-2 pl-14 text-xs font-semibold">
          {import.meta.env.DEV ? <button onClick={onAkkoord} className="min-h-[36px] rounded-full bg-brand-soft px-3.5 text-brand">Demo: akkoord</button> : null}
          <button onClick={() => onOpen(v)} className="min-h-[36px] rounded-full border border-border px-3.5 text-ink-soft">Bekijk voorstel</button>
        </div>
      ) : null}
    </div>
  );
}

const freqTekst = (h?: Herhaling) => (h && h.freq !== "geen" ? freqLabel[h.freq] : "Niet herhalend");

/** Detailweergave van een afspraak met een rustige ••• knop: alleen opties die bij deze afspraak passen. */
function AfspraakDetail({ v, direct, wacht, ingetrokken, onSluit, onActie, onIntrekken, onAkkoord }: {
  v: Voorkomen | null; direct: boolean; wacht: Wachtend | undefined; ingetrokken: boolean; onSluit: () => void;
  onActie: (a: Modus | "verwijderen") => void; onIntrekken: () => void; onAkkoord: () => void;
}) {
  const [menu, setMenu] = useState(false);
  useEffect(() => setMenu(false), [v]);
  if (!v) return null;
  const { a } = v;
  const gedeeld = !direct;
  const reeks = !!a.herhaling && a.herhaling.freq !== "geen";
  const opties: { id: Modus | "verwijderen"; label: string }[] = [
    ...(gedeeld ? [] : [{ id: "aanpassen" as const, label: "Aanpassen" }]),
    { id: "verplaatsen", label: "Verplaatsen" },
    { id: "verwijderen", label: "Verwijderen" },
    ...(reeks ? [{ id: "herhaling" as const, label: "Herhalen aanpassen" }] : []),
    ...(gedeeld ? [{ id: "aanpassen" as const, label: "Voorstel tot wijziging doen" }] : []),
  ];
  const rij = (l: string, w?: string) => (w ? <div className="flex justify-between gap-3 py-2"><dt className="text-ink-soft">{l}</dt><dd className="text-right font-semibold">{w}</dd></div> : null);
  if (ingetrokken) return <Sheet open onOpenChange={(o) => !o && onSluit()}><SheetContent side="bottom" className="left-1/2 w-full max-w-md -translate-x-1/2 rounded-t-2xl bg-background"><SheetHeader><SheetTitle>{a.titel}</SheetTitle><SheetDescription>Ingetrokken · dit voorstel kan niet meer worden goedgekeurd. De huidige agenda blijft gelden.</SheetDescription></SheetHeader><div className="mt-3 flex items-center gap-2"><GeschiedenisKnop soort="afspraak" itemId={a.id} naam={a.titel} /><span className="text-sm">Wijzigingsgeschiedenis</span></div></SheetContent></Sheet>;
  return (
    <Sheet open onOpenChange={(o) => !o && onSluit()}>
      <SheetContent side="bottom" className="left-1/2 max-h-[90vh] w-full max-w-md -translate-x-1/2 overflow-y-auto rounded-t-2xl bg-background px-5 pb-8">
        <SheetHeader className="pr-20 text-left">
          <SheetTitle className="font-display text-xl font-medium">{a.titel}</SheetTitle>
          <SheetDescription>{lang(v.datum)}{a.tijd ? ` · ${uur(a.tijd)}` : ""}</SheetDescription>
        </SheetHeader>
        {!wacht ? (
          <button onClick={() => setMenu((m) => !m)} aria-label="Meer opties" aria-expanded={menu} className="absolute right-12 top-4 grid size-8 place-items-center rounded-full text-ink-soft hover:bg-secondary">
            <MoreHorizontal className="size-5" strokeWidth={1.6} />
          </button>
        ) : null}
        {!wacht ? <BewerkPotlood onClick={() => onActie("aanpassen")} label={gedeeld ? "Wijziging voorstellen" : "Afspraak bewerken"} className="right-20! top-2!" /> : null}
        {menu ? (
          <div className="mt-3 divide-y divide-border rounded-md border border-border bg-card">
            {opties.map((o) => <button key={o.label} onClick={() => onActie(o.id)} className="block w-full px-4 py-3 text-left text-sm font-semibold">{o.label}</button>)}
            <Link to="/kosten" search={{ uitgave: a.titel }} onClick={onSluit} className="block w-full px-4 py-3 text-left text-sm font-semibold">Kosten toevoegen</Link>
          </div>
        ) : null}
        <dl className="mt-4 divide-y divide-border border-y border-border text-sm">
          {rij("Kind", a.kind)}
          {rij("Soort", categorieMeta[a.categorie as Categorie]?.label)}
          {rij("Locatie", a.locatie)}
          {rij("Herhaling", freqTekst(a.herhaling))}
          {rij("Herinnering", a.herinnering && a.herinnering !== "geen" ? herinneringLabel[a.herinnering] : undefined)}
          {rij("Zichtbaar voor", a.gedeeld !== false ? "Beide ouders" : "Alleen jij")}
        </dl>
        {a.toelichting ? <p className="mt-3 text-sm text-ink-soft">{a.toelichting}</p> : null}
        {a.gedeeld !== false && !wacht ? <AanwezigheidBlok afspraakId={a.id} titel={a.titel} kind={a.kind} datum={v.datum} /> : null}
        {a.gedeeld !== false ? <div className="mt-3 flex items-center gap-2 text-xs text-ink-soft"><GeschiedenisKnop soort="afspraak" itemId={a.id} naam={a.titel} /><span>Wijzigingsgeschiedenis</span></div> : null}
        {!wacht ? (
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm font-semibold">
            <button onClick={() => onActie("aanpassen")} className="min-h-[44px] rounded-md border border-brand/40 text-brand">{gedeeld ? "Wijziging voorstellen" : "Bewerken"}</button>
            <button onClick={() => onActie("verwijderen")} className="min-h-[44px] rounded-md border border-border text-ink-soft">Afspraak verwijderen</button>
          </div>
        ) : null}
        {gedeeld && !wacht ? <p className="mt-3 text-[11px] text-ink-soft">Gedeelde afspraak: wijzigen of verwijderen gaat via een voorstel aan de andere ouder.</p> : null}
        {wacht ? (
          <div className="mt-4 rounded-md border border-border bg-card p-3 text-sm">
            <p className="font-semibold">{wacht.soort === "nieuw" ? "Nieuwe afspraak voorgesteld" : wacht.soort === "verwijder" ? "Verwijdering voorgesteld" : "Wijziging voorgesteld"}</p>
            {wacht.velden ? <p className="mt-1 text-xs text-ink-soft">Nieuw: {lang(wacht.velden.datum)}{wacht.velden.tijd ? ` · ${uur(wacht.velden.tijd)}` : ""}{wacht.velden.titel !== a.titel ? ` · ${wacht.velden.titel}` : ""}</p> : null}
            <p className="mt-1 text-xs text-ink-soft">Reactie open · de huidige afspraak blijft gelden. Geen reactie betekent geen akkoord.</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold">
              <VoorstelIntrekken onBevestig={onIntrekken} />
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/** Detail van een vaste (voorbeeld)afspraak: wijzigen loopt via een voorstel. */
function VasteAfspraakSheet({ open, onSluit, a }: { open: boolean; onSluit: () => void; a: (typeof afspraken)[number] }) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onSluit()}>
      <SheetContent side="bottom" className="left-1/2 w-full max-w-md -translate-x-1/2 rounded-t-2xl bg-background px-5 pb-8">
        <SheetHeader className="pr-20 text-left">
          <SheetTitle className="font-display text-xl font-medium">{a.titel}</SheetTitle>
          <SheetDescription>{a.datumLabel} · {uur(a.tijd)} · {a.kind}</SheetDescription>
        </SheetHeader>
        <button onClick={() => setMenu((m) => !m)} aria-label="Meer opties" className="absolute right-12 top-4 grid size-8 place-items-center rounded-full text-ink-soft hover:bg-secondary"><MoreHorizontal className="size-5" strokeWidth={1.6} /></button>
        {menu ? (
          <div className="mt-3 divide-y divide-border rounded-md border border-border bg-card">
            <button onClick={() => router.navigate({ to: "/veranderd", search: { situatie: "afspraak" } })} className="block w-full px-4 py-3 text-left text-sm font-semibold">Verplaatsen</button>
            <button onClick={() => router.navigate({ to: "/afspraken", search: { nieuw: "voorstel", bron: "agenda" } })} className="block w-full px-4 py-3 text-left text-sm font-semibold">Voorstel tot wijziging doen</button>
          </div>
        ) : null}
        <p className="mt-4 text-sm">{a.locatie}</p>
        <button onClick={() => router.navigate({ to: "/afspraken", search: { nieuw: "voorstel", bron: "agenda" } })} className="mt-4 min-h-[44px] w-full rounded-md border border-brand/40 text-sm font-semibold text-brand">Afspraak bewerken</button>
        <p className="mt-3 text-[11px] text-ink-soft">Gedeelde afspraak: wijzigen gaat via een voorstel aan de andere ouder.</p>
      </SheetContent>
    </Sheet>
  );
}

function AfspraakRij({ id }: { id: string }) {
  const a = afspraken.find((x) => x.id === id)!;
  const bijSanne = a.ouder === "sanne";
  const [open, setOpen] = useState(false);
  // Vanuit zoeken: dit item direct in beeld en open, zonder opnieuw te zoeken.
  const doel = useRouterState({ select: (s) => s.location.hash }) === `item-${id}`;
  useEffect(() => { if (doel) setOpen(true); }, [doel]);
  const isWisselMoment = a.categorie === "wissel";
  const inhoud = (
    <>
      <div className={`grid size-11 shrink-0 place-items-center rounded-xl text-lg ${bijSanne ? "bg-brand-soft" : "bg-accent-soft"}`}><Pictogram waarde={categorieMeta[a.categorie].icoon} maat="md" vorm="kaal" /></div>
      <div className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm font-semibold">{a.titel}</p>
        <p className="text-xs text-ink-soft">{a.datumLabel} · {uur(a.tijd)} · {a.kind}</p>
        <p className="text-[11px] text-ink-soft/80">{a.locatie}</p>
      </div>
    </>
  );
  return (
    <div id={`item-${a.id}`} className="zoekdoel flex items-center gap-3 rounded-md border border-border bg-card p-3">
      <button onClick={() => setOpen(true)} className="flex min-w-0 flex-1 items-center gap-3" aria-label={`${isWisselMoment ? "Wisselmoment" : a.titel} ${a.datumLabel} ${a.tijd} openen`}>{inhoud}</button>
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${bijSanne ? "bg-brand-soft text-brand" : "bg-accent-soft text-accent-warm"}`}>{bijSanne ? "Sanne" : "Joris"}</span>
      <GeschiedenisKnop soort="afspraak" itemId={a.id} naam={a.titel} />
      {isWisselMoment ? <WisselmomentSheet open={open} onSluit={() => setOpen(false)} a={a} /> : <VasteAfspraakSheet open={open} onSluit={() => setOpen(false)} a={a} />}
    </div>
  );
}

/** Detail van een wisselmoment: direct vanuit de Agenda, met alleen relevante acties. */
function WisselmomentSheet({ open, onSluit, a }: { open: boolean; onSluit: () => void; a: (typeof afspraken)[number] }) {
  const router = useRouter();
  const { spullen } = useTaken();
  const aantalMee = spullen.filter((s) => s.type === "mee").length;
  const knop = "w-full rounded-md border border-border px-4 py-3 text-left text-sm font-semibold";
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onSluit()}>
      <SheetContent side="bottom" className="left-1/2 w-full max-w-md -translate-x-1/2 rounded-t-2xl bg-background px-5 pb-8">
        <SheetHeader className="pr-8 text-left">
          <SheetTitle className="font-display text-xl font-medium">Wisselmoment</SheetTitle>
          <SheetDescription className="text-sm text-ink">{a.datumLabel} · {uur(a.tijd)}</SheetDescription>
        </SheetHeader>
        <dl className="mt-3 divide-y divide-border border-y border-border text-sm">
          <div className="flex justify-between py-2.5"><dt className="text-ink-soft">Locatie</dt><dd className="font-semibold">{a.locatie}</dd></div>
          <div className="flex justify-between py-2.5"><dt className="text-ink-soft">Kind</dt><dd className="font-semibold">{a.kind}</dd></div>
          <div className="flex justify-between py-2.5"><dt className="text-ink-soft">Mee te nemen</dt><dd className="font-semibold">{aantalMee} {aantalMee === 1 ? "ding" : "dingen"}</dd></div>
        </dl>
        <div className="mt-4 space-y-2">
          <button className={knop} onClick={() => router.navigate({ to: "/overdracht" })}>Overdracht voorbereiden</button>
          <button className={knop} onClick={() => router.navigate({ to: "/zorgregeling", search: { actie: "wijziging", bron: "agenda" } })}>Wijziging voorstellen</button>
          {a.locatie ? <a className={`${knop} block`} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.locatie)}`} target="_blank" rel="noreferrer">Route / locatie bekijken</a> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
