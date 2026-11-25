import { ZorgAfstemmen } from "@/components/ZorgAfstemmen";
import { AgendaWissels } from "@/components/AgendaWissels";
import { AgendaVakanties } from "@/components/AgendaVakanties";
import { useActiviteiten } from "@/components/Activiteiten";
import { agendaReacties, weekBereik } from "@/lib/agenda-presentatie";
import { agendaZorgOp, ouderLabel, magOverdrachtVoorbereiden } from "@/lib/agenda-zorg";
import { useVakanties } from "@/lib/vakantie-store";
import { BewerkPotlood } from "@/components/ui-kit";
import { useBevestigPopup } from "@/lib/feedback";
import { Assistent } from "@/components/Assistent";
import { GeschiedenisKnop } from "@/components/Geschiedenis";
import { createFileRoute, Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n, { taalLocale, tLijst } from "@/i18n";
import { z } from "zod";
import { Plus, X, MoreHorizontal, ArrowLeftRight, CalendarPlus, CircleHelp, Palmtree, Lock } from "lucide-react";
import { AppShell, Card } from "@/components/AppShell";
import { ContextToevoegen } from "@/components/ContextToevoegen";
import { HulpKnop } from "@/components/HulpVragen";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { categorieMeta } from "@/lib/demo-data";
/** Het voorbeeldgezin bestaat niet meer: geen vaste voorbeeldafspraken; kleur komt uit het kindprofiel. */
const afspraken = [];
const kleurVanKind = () => "#8A7E72";
import { kindNamen, useZorg, zorgDag } from "@/lib/zorg-store";
import { useTaken, voegTaakToe } from "@/lib/taken-store";
import { nieuwBudget } from "@/lib/budget-store";
import { Button } from "@/components/ui/button";
import { bijzondereDagOp } from "@/lib/bijzondere-dagen";
import { useVoorkeuren } from "@/lib/voorkeuren-store";
import { controleerAfspraak, controleerPrive, afstemStatus, ikGa, koppelAfstem } from "@/lib/slimme-hulp";
import { startNuAfstemmen } from "@/lib/nu-afstemmen-store";
import { useRegio, vakantieOp, vakantiesTussen, regioLabel } from "@/lib/schoolvakanties";
import { geldigeRegeling, useStart, start, plekOp } from "@/lib/start-store";
import { Pictogram } from "@/components/AppIcon";
import { Chevron, MetChevron, MetVinkje } from "@/components/Tekens";
import { uur } from "@/lib/tijd-tekst";
import { iso, dt, plusDagen, maandagVan, voorkomens } from "@/lib/agenda-datum";
import { AppIcon } from "@/components/AppIcon";
import { VoorstelIntrekken } from "@/components/VoorstelIntrekken";
import { AanwezigheidBlok, AanwezigheidFormulier } from "@/components/AanwezigheidAfstemmen";
import { AfspraakFormulier } from "@/components/AfspraakFormulier";
import { aanwezigVoor, startAfstemming, statusRegel, useAanwezigheid } from "@/lib/aanwezigheid-store";
import { kindIdsVan, maakAfspraak, reageerOpAfspraakVoorstel, trekAfspraakVoorstelIn, useAgenda, verwijderAfspraak, wijzigAfspraak } from "@/lib/agenda-store";
import { useGezin } from "@/lib/gezin";
export const Route = createFileRoute("/agenda")({
    validateSearch: z.object({ onderdeel: z.enum(["kalender", "vakanties"]).optional(), zorgActie: z.enum(["wijziging", "regeling"]).optional(), zorgVoorstel: z.string().optional(), vakantieNieuw: z.enum(["vakantie", "bijzonder"]).optional(), nieuw: z.boolean().optional(), voorstel: z.boolean().optional(), persoonlijk: z.boolean().optional(), vanuitBericht: z.boolean().optional(), locatie: z.string().optional(), omschrijving: z.string().optional(), categorie: z.string().optional(), titel: z.string().optional(), datum: z.string().optional(), tijd: z.string().optional(), herhaling: z.enum(["wekelijks", "tweewekelijks", "maandelijks"]).optional(), kind: z.string().optional(), dag: z.string().optional(), importBedrag: z.number().positive().max(100000).optional(), importTaak: z.string().max(300).optional(), importMee: z.string().max(300).optional(), afspraak: z.string().optional() }),
    head: () => ({
        meta: [
            { title: i18n.t("routes.agenda.meta.titel") },
            { name: "description", content: i18n.t("routes.agenda.meta.beschrijving") },
            { property: "og:title", content: i18n.t("routes.agenda.meta.titel") },
            { property: "og:description", content: i18n.t("routes.agenda.meta.ogBeschrijving") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: AgendaPagina,
});
const DEMO_VANDAAG = "2025-03-12"; // demo-vandaag
/** Eigen gezin gebruikt de echte datum (zelfde bron als Home); het voorbeeldgezin blijft op de demo-datum. Wordt per render gezet in AgendaPage. */
let VANDAAG = DEMO_VANDAAG;
const weekNr = (s) => { const d = dt(s); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7)); const j = new Date(d.getFullYear(), 0, 4); return 1 + Math.round(((d.getTime() - j.getTime()) / 864e5 - 3 + ((j.getDay() + 6) % 7)) / 7); };
const lang = (s) => dt(s).toLocaleDateString(taalLocale(), { weekday: "long", day: "numeric", month: "long" });
const kort = (s) => dt(s).toLocaleDateString(taalLocale(), { day: "numeric", month: "short" });
const maandNaam = (d) => d.toLocaleDateString(taalLocale(), { month: "long", year: "numeric" });
const freqLabel = {
    get geen() { return i18n.t("routes.agenda.freq.geen"); },
    get wekelijks() { return i18n.t("routes.agenda.freq.wekelijks"); },
    get tweewekelijks() { return i18n.t("routes.agenda.freq.tweewekelijks"); },
    get maandelijks() { return i18n.t("routes.agenda.freq.maandelijks"); },
    get aangepast() { return i18n.t("routes.agenda.freq.aangepast"); },
};
/** Korte weekdagkoppen (Ma, Di …) in de taal van de app. */
const weekKoppen = () => tLijst("common.dagenKort").map((d) => d.charAt(0).toUpperCase() + d.slice(1));
/** Weergave van een kindkeuze; de waarde ("Allebei", "Alle kinderen", naam) blijft ongewijzigd. */
const kindWeergave = (k) => (k === "Allebei" ? i18n.t("common.allebei") : k === "Alle kinderen" ? i18n.t("common.alleKinderen") : k);
/** Demo-zorgregeling is ingevuld voor maart 2026. */
const verblijf = (zorg, kind, s) => (s.startsWith("2025-03") ? zorgDag(zorg, kind, dt(s).getDate()) : undefined);
const isWissel = (zorg, s) => {
    const nu = verblijf(zorg, "emma", s), gister = verblijf(zorg, "emma", plusDagen(s, -1));
    return !!nu && !!gister && nu.ouder !== gister.ouder;
};
const demoOp = (s) => (s.startsWith("2025-03") ? afspraken.filter((a) => a.dag === dt(s).getDate()) : []);
function AgendaPagina() {
    const { t } = useTranslation();
    const router = useRouter();
    const zorg = useZorg();
    const regio = useRegio();
    const activiteiten = useActiviteiten();
    const reacties = agendaReacties(activiteiten.voorstellen);
    const [voorstellenOpen, setVoorstellenOpen] = useState(false);
    const vakanties = useVakanties();
    const [kindFilter, setKindFilter] = useState("alle");
    const { taken } = useTaken();
    const [weergave, setWeergave] = useState("week");
    const [nieuwOpen, setNieuwOpen] = useState(false);
    const [bewerk, setBewerk] = useState(null);
    const [bereik, setBereik] = useState("alleen");
    const [verwijderVk, setVerwijderVk] = useState(null);
    const [annuleringNietNodig, setAnnuleringNietNodig] = useState(null);
    const [melding, setMelding] = useState(null);
    useBevestigPopup(melding);
    const [controle, setControle] = useState(null);
    const vkSlim = useVoorkeuren();
    const [detail, setDetail] = useState(null);
    const [demoVoorstellen, setWachtend] = useState([]);
    const [voorstelNieuw, setVoorstelNieuw] = useState(false);
    const [verborgen, setVerborgen] = useState([]);
    const [modus, setModus] = useState("aanpassen");
    const [gedeeld, setGedeeld] = useState(true);
    const [locatie, setLocatie] = useState("");
    const [toelichting, setToelichting] = useState("");
    const [herinnering, setHerinnering] = useState("geen");
    const [titel, setTitel] = useState("");
    const [aanwezigKeuze, setAanwezigKeuze] = useState(null);
    const [aanwezigWieGaat, setAanwezigWieGaat] = useState(null);
    const [aanwezigContactWie, setAanwezigContactWie] = useState(null);
    const [verlatenVraag, setVerlatenVraag] = useState(false);
    const sluitNieuw = () => { if (titel.trim() && !bewerk)
        setVerlatenVraag(true);
    else
        setNieuwOpen(false); };
    const [datum, setDatum] = useState("");
    const [tijd, setTijd] = useState("");
    const [eindtijd, setEindtijd] = useState("");
    const [priveBotsing, setPriveBotsing] = useState(null);
    const [afstemTekst, setAfstemTekst] = useState(null);
    const [categorie, setCategorie] = useState("medisch");
    const [kind, setKind] = useState("");
    const [herhaling, setHerhaling] = useState({ freq: "geen", interval: 2, eenheid: "weken" });
    // Oude voorbeeldmodus: alleen nog lege lijst (alle afspraken komen van de server).
    const [demoExtra, setDemoExtra] = useState([]);
    const [importExtra, setImportExtra] = useState(null);
    const [maandOffset, setMaandOffset] = useState(0);
    const [weekOffset, setWeekOffset] = useState(0);
    // Bewaar de bestaande opslagnaam; de standaardingang opent altijd deze week.
    const AGENDA_GEHEUGEN = "onzeapp-agenda-weergave";
    const bewaar = (w, wo, mo) => { try {
        localStorage.setItem(AGENDA_GEHEUGEN, JSON.stringify({ w, wo, mo }));
    }
    catch { /* geen opslag */ } };
    const zetWeergave = (w) => { setWeergave(w); bewaar(w, weekOffset, maandOffset); };
    const zetWeekOffset = (f) => setWeekOffset((x) => { const n = typeof f === "function" ? f(x) : f; bewaar(weergave, n, maandOffset); return n; });
    const zetMaandOffset = (f) => setMaandOffset((x) => { const n = typeof f === "function" ? f(x) : f; bewaar(weergave, weekOffset, n); return n; });
    // Vanuit zoeken naar een afspraak: maandweergave, zodat het item zeker zichtbaar is.
    const doelHash = useRouterState({ select: (s) => s.location.hash });
    useEffect(() => { if (doelHash.startsWith("item-"))
        setWeergave("maand"); }, [doelHash]);
    const [gekozenDag, setGekozenDag] = useState(null);
    const [weekDag, setWeekDag] = useState(null);
    // Eigen gezin: geen voorbeelddata; wel de eigen regeling als dagkleuring.
    const startSt = useStart();
    const eigen = startSt.eigen;
    const agendaSt = useAgenda();
    const gezin = useGezin();
    /** Is er een gekoppelde andere ouder? De server beslist per afspraak; dit is alleen voor de tekst vooraf. */
    const verbonden = agendaSt.geladen ? agendaSt.verbonden : gezin.gekoppeld;
    VANDAAG = eigen ? iso(new Date()) : DEMO_VANDAAG;
    // Eigen gezin: afspraken en kinderen uit de eigen gezinsgegevens; voorbeeldgezin blijft apart.
    const extra = eigen ? agendaSt.events : demoExtra;
    const setExtra = (f) => (eigen ? undefined : setDemoExtra(f));
    // Voorstellen van het eigen gezin komen van de server (één bron); dezelfde vorm als voorheen in deze pagina.
    const voorstellen = eigen ? agendaSt.voorstellen.map((p) => {
        const bestaand = p.eventId ? extra.find((e) => e.id === p.eventId) : undefined;
        const a = bestaand ?? { id: p.eventId ?? p.id, ...(p.velden ?? {}), gedeeld: true };
        return { id: p.id, mine: p.mine, vk: { a, datum: p.datum ?? a.datum }, soort: p.soort, bereik: p.bereik, velden: p.velden ?? undefined, status: p.status, meerTijd: p.meerTijd };
    }) : demoVoorstellen;
    const wachtend = voorstellen.filter((w) => !w.status);
    const kindKeuzes = [...startSt.kinderen.map((k) => k.naam), ...(startSt.kinderen.length > 1 ? ["Alle kinderen"] : [])];
    /** Zelfde kindkeuze, maar dan in de vorm die het hulpverzoek gebruikt. */
    const hulpKind = () => (kind === "Alle kinderen" ? "alle" : kind === "Allebei" ? "beide" : startSt.kinderen.find((k) => k.naam === kind)?.id ?? "alle");
    const standaardKind = startSt.kinderen[0]?.naam ?? "";
    const eigenRegeling = startSt.regeling && startSt.regeling !== "later" && geldigeRegeling(startSt.regeling) ? startSt.regeling : null;
    const [filter, setFilter] = useState("alles");
    const heeftPrive = extra.some((a) => a.gedeeld === false);
    const demoVoor = (s) => (eigen || filter === "prive" ? [] : demoOp(s).filter((a) => !verborgen.includes(a.id) && !extra.some((x) => x.id === a.id) && a.categorie !== "wissel" && (kindFilter === "alle" || /allebei|&|kinderen/i.test(a.kind) || a.kind === profielen.find((k) => k.id === kindFilter)?.naam)));
    const eigenPlekVan = (d) => (eigenRegeling ? plekOp(eigenRegeling, dt(d)) : undefined);
    const eigenWisselVan = (d) => (eigenRegeling ? plekOp(eigenRegeling, dt(d)) !== plekOp(eigenRegeling, dt(plusDagen(d, -1))) : undefined);
    const getoondeMaand = new Date(dt(VANDAAG).getFullYear(), dt(VANDAAG).getMonth() + maandOffset, 1);
    const weekStart = plusDagen(maandagVan(VANDAAG), weekOffset * 7);
    const weekDagen = Array.from({ length: 7 }, (_, i) => plusDagen(weekStart, i));
    /** Kindkleur (A6): eigen gezin uit het kindprofiel, anders het voorbeeldgezin. */
    const kleurNaam = (naam) => {
        const eerste = naam.split(/ & | en |, /)[0] ?? naam;
        if (eigen)
            return startSt.kinderen.find((k) => k.naam === eerste)?.kleur ?? "#8A7E72";
        return /allebei|kinderen/i.test(naam) ? "#8A7E72" : kleurVanKind(eerste);
    };
    /** Wisseldag: waar gaan de kinderen heen? Afgeleid van de dag erna (bij de ander = naar ander). */
    const wisselRichting = (d) => {
        if (!zorgVan(d).wissels.length)
            return undefined;
        const na = zorgVan(plusDagen(d, 1)).kleur, voor = zorgVan(plusDagen(d, -1)).kleur;
        if (na === "ander" || voor === "ik")
            return "ander";
        if (na === "ik" || voor === "ander")
            return "ik";
        return undefined;
    };
    const celItems = (d) => [
        ...demoVoor(d).map((a) => ({ titel: a.titel.split(" · ")[0] ?? a.titel, kleur: kleurNaam(a.kind), prive: false })),
        ...vk(d, d).map((v) => ({ titel: v.a.titel, kleur: kleurNaam(v.a.kind), prive: v.a.gedeeld === false })),
    ];
    const vk = (van, tot) => extra.filter((a) => (kindFilter === "alle" || a.gedeeld === false || a.kind === geselecteerdeNaam || /allebei|alle kinderen|&/i.test(a.kind)) && !verborgen.includes(a.id) && (filter === "alles" || (filter === "prive") === (a.gedeeld === false))).flatMap((a) => voorkomens(a, van, tot).map((d) => ({ a, datum: d }))).sort((x, y) => (x.datum + x.a.tijd).localeCompare(y.datum + y.a.tijd));
    const wachtOp = (id) => wachtend.find((w) => w.vk.a.id === id);
    // Nieuwe afspraak: hetzelfde formulier als op Home (components/AfspraakFormulier).
    const [nieuwForm, setNieuwForm] = useState(null);
    const openNieuw = (vooraf = weekDag ?? VANDAAG) => {
        setGekozenDag(null);
        setNieuwForm({ datum: vooraf, ...(kindFilter !== "alle" ? { kindId: kindFilter } : {}) });
    };
    /** Oud inline-formulier: alleen nog voor voorstellen vanuit een bericht en de import uit een schoolbrief. */
    const openInline = (vooraf = weekDag ?? VANDAAG) => {
        setVoorstelNieuw(false);
        setBewerk(null);
        setModus("aanpassen");
        setTitel("");
        setDatum(vooraf);
        setTijd("");
        setEindtijd("");
        setPriveBotsing(null);
        setAfstemTekst(null);
        setCategorie("overig");
        setKind(standaardKind);
        setLocatie("");
        setToelichting("");
        setHerinnering("geen");
        setGedeeld(true);
        setHerhaling({ freq: "geen", interval: 2, eenheid: "weken" });
        setGekozenDag(null);
        setImportExtra(null);
        setNieuwOpen(true);
    };
    // Vooraf ingevuld vanuit de assistent: alleen invullen, de ouder slaat zelf op.
    const zoek = Route.useSearch();
    const zorgVan = (d) => agendaZorgOp(zorg, vakanties, startSt, d, kindFilter);
    const profielen = startSt.kinderen;
    useEffect(() => { if (zoek.kind && profielen.some((k) => k.id === zoek.kind))
        setKindFilter(zoek.kind); }, [zoek.kind]);
    const geselecteerdeNaam = profielen.find((k) => k.id === kindFilter)?.naam;
    const sluitZorg = () => router.navigate({ to: "/agenda", search: { onderdeel: "kalender" }, replace: true });
    useEffect(() => {
        if (!zoek.nieuw)
            return;
        if (!zoek.voorstel && !zoek.importBedrag && !zoek.importTaak && !zoek.importMee) {
            setGekozenDag(null);
            setNieuwForm({ datum: zoek.datum ?? zoek.dag ?? VANDAAG, titel: zoek.titel, tijd: zoek.tijd, kindId: zoek.kind, persoonlijk: !!zoek.persoonlijk, locatie: zoek.locatie, omschrijving: zoek.omschrijving });
            return;
        }
        openInline(zoek.datum ?? zoek.dag ?? VANDAAG);
        if (zoek.titel)
            setTitel(zoek.titel);
        if (zoek.voorstel) {
            setVoorstelNieuw(true);
            setDatum(zoek.datum ?? "");
            setKind(zoek.kind ?? "");
        }
        if (zoek.vanuitBericht) {
            setDatum(zoek.datum ?? "");
            setKind(zoek.kind ?? "");
        }
        if (zoek.persoonlijk)
            setGedeeld(false);
        if (zoek.locatie)
            setLocatie(zoek.locatie);
        if (zoek.omschrijving)
            setToelichting(zoek.omschrijving);
        if (zoek.tijd)
            setTijd(zoek.tijd);
        if (zoek.kind)
            setKind(startSt.kinderen.find((k) => k.id === zoek.kind)?.naam ?? (kindKeuzes.includes(zoek.kind) ? zoek.kind : standaardKind));
        if (zoek.categorie && zoek.categorie in categorieMeta)
            setCategorie(zoek.categorie);
        if (zoek.herhaling)
            setHerhaling({ freq: zoek.herhaling, interval: 2, eenheid: "weken" });
        if (zoek.importBedrag || zoek.importTaak || zoek.importMee) {
            setImportExtra({ bedrag: zoek.importBedrag ? String(zoek.importBedrag) : "", taak: zoek.importTaak ?? "", mee: zoek.importMee ?? "" });
            setCategorie("school");
        }
        if (zoek.titel && /zwem|sport|voetbal|training/i.test(zoek.titel))
            setCategorie("sport");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [zoek.nieuw]);
    // Doorklik vanuit Home (Deze week / Morgen): open direct die dag.
    useEffect(() => {
        if (zoek.dag && /^\d{4}-\d{2}-\d{2}$/.test(zoek.dag)) {
            setWeekOffset(Math.round((dt(maandagVan(zoek.dag)).getTime() - dt(maandagVan(VANDAAG)).getTime()) / 604800000));
            setWeekDag(zoek.dag);
            if (!zoek.nieuw && !zoek.afspraak && !zoek.zorgActie)
                setGekozenDag(zoek.dag);
        }
    }, [zoek.dag]);
    const doelAfspraak = !eigen && zoek.afspraak ? afspraken.find((x) => x.id === zoek.afspraak) : undefined;
    const doelEigen = zoek.afspraak ? extra.find((x) => x.id === zoek.afspraak) : undefined;
    useEffect(() => {
        if (doelEigen)
            setDetail({ a: doelEigen, datum: zoek.dag ?? doelEigen.datum });
    }, [zoek.afspraak, zoek.dag, doelEigen?.id]);
    const [doelOpen, setDoelOpen] = useState(false);
    useEffect(() => { setDoelOpen(!!zoek.afspraak); }, [zoek.afspraak]);
    const openBewerk = (v, m = "aanpassen") => {
        setBewerk(v);
        setModus(m);
        setBereik(m === "herhaling" ? "toekomst" : "alleen");
        setTitel(v.a.titel);
        setDatum(v.datum);
        setTijd(v.a.tijd);
        setEindtijd(v.a.eindtijd ?? "");
        setCategorie(v.a.categorie);
        setKind(v.a.kind);
        setPriveBotsing(null);
        setLocatie(v.a.locatie ?? "");
        setToelichting(v.a.toelichting ?? "");
        setHerinnering(v.a.herinnering ?? "geen");
        setGedeeld(v.a.gedeeld !== false);
        setHerhaling(v.a.herhaling ?? { freq: "geen", interval: 2, eenheid: "weken" });
        setNieuwOpen(true);
    };
    const actieVast = (a, actie) => {
        const v = { a: { id: a.id, titel: a.titel, datum: `2025-03-${String(a.dag).padStart(2, "0")}`, tijd: a.tijd, locatie: a.locatie, categorie: a.categorie, kind: a.kind, gedeeld: true }, datum: `2025-03-${String(a.dag).padStart(2, "0")}` };
        setDoelOpen(false);
        if (actie === "verwijderen")
            setVerwijderVk(v);
        else
            openBewerk(v, actie);
    };
    const isReeks = (a) => !!a.herhaling && a.herhaling.freq !== "geen";
    /** Direct wijzigen: persoonlijke afspraak, of eigen gezin waarin nog geen andere ouder meedoet (geen voorstel aan niemand). */
    const direct = (a) => a.gedeeld === false || (eigen && !verbonden);
    const wordtVoorstel = bewerk ? !direct(bewerk.a) : voorstelNieuw && gedeeld;
    const toon = (v) => !bewerk || (modus === "verplaatsen" && v === "datum") || (modus === "herhaling" && v === "herhaling");
    const verwijder = (v, b) => {
        const { a, datum: d } = v;
        // Eigen gezin: de server beslist (direct bij privé of zonder gekoppelde ouder, anders een voorstel) en legt de historie vast.
        if (eigen) {
            verwijderAfspraak(a.id, b, d);
            setVerwijderVk(null);
            return;
        }
        setVerwijderVk(null);
    };
    const labels = { titel: t("routes.agenda.veld.titel"), datum: t("routes.agenda.veld.datum"), tijd: t("routes.agenda.veld.tijd"), categorie: t("routes.agenda.veld.categorie"), kind: t("routes.agenda.veld.kind"), locatie: t("routes.agenda.veld.locatie") };
    /** Voert een definitieve wijziging uit (direct bij persoonlijk, of na akkoord bij gedeeld). */
    const pasToe = (bv, velden, b) => {
        const oud = bv.a;
        if (eigen) {
            wijzigAfspraak(oud.id, velden, b, bv.datum);
            return;
        }
    };
    const accepteer = (w) => {
        if (!wachtend.includes(w))
            return;
        if (eigen) {
            if (!w.mine)
                reageerOpAfspraakVoorstel(w.id, "akkoord");
            setMelding(t("routes.agenda.melding.akkoordGegeven"));
            return;
        }
        setWachtend((l) => l.map((x) => x === w ? { ...x, status: "geaccepteerd" } : x));
        const velden = w.velden;
        if (w.soort === "nieuw" && velden)
            setExtra((l) => [...l, { id: w.vk.a.id, ...velden }]);
        else if (w.soort === "verwijder")
            verwijder(w.vk, w.bereik);
        else if (w.velden)
            pasToe(w.vk, w.velden, w.bereik);
        setMelding(t("routes.agenda.melding.akkoord"));
    };
    const opslaan = (tochToevoegen = false, vastId, naOpslaan) => {
        if (!titel.trim() || !datum || (gedeeld && !kind.trim()))
            return;
        if (!tochToevoegen && !gedeeld) {
            const b = controleerPrive({ datum, tijd, eindtijd }, extra.filter((x) => x.gedeeld !== false && x.id !== bewerk?.a.id).map((x) => ({ id: x.id, titel: x.titel, datum: x.datum, tijd: x.tijd, kind: x.kind })));
            if (b.length) {
                setPriveBotsing(b);
                setAfstemTekst(null);
                return;
            }
        }
        setPriveBotsing(null);
        setAfstemTekst(null);
        if (!tochToevoegen && gedeeld && vkSlim.conflictControle) {
            const c = controleerAfspraak({ datum, tijd, eindtijd, kind, titel, categorie }, extra.filter((x) => x.gedeeld !== false).flatMap((x) => voorkomens(x, datum, datum).map((d) => ({ id: x.id, titel: x.titel, datum: d, tijd: x.tijd, eindtijd: x.eindtijd, kind: x.kind }))), bewerk?.a.id, !eigen);
            if (c.length) {
                setControle(c);
                return;
            }
        }
        setControle(null);
        const velden = { titel: titel.trim(), datum, tijd, eindtijd: eindtijd || undefined, categorie, kind, herhaling: herhaling.freq === "geen" ? undefined : herhaling, locatie: locatie.trim() || undefined, toelichting: toelichting.trim() || undefined, herinnering, gedeeld };
        // Een afspraak van de andere ouder: kinderen en delen blijven zoals ze zijn (alleen de maker mag die wijzigen).
        if (bewerk && bewerk.a.mine === false) {
            velden.kindIds = bewerk.a.kindIds?.length ? bewerk.a.kindIds : kindIdsVan(bewerk.a.kind);
            velden.gedeeld = bewerk.a.gedeeld !== false;
        }
        if (bewerk && eigen) {
            wijzigAfspraak(bewerk.a.id, velden, isReeks(bewerk.a) ? bereik : "reeks", bewerk.datum);
            setMelding(wordtVoorstel ? t("routes.agenda.melding.wijzigingVoorgesteld") : gedeeld && bewerk.a.gedeeld === false ? t("routes.agenda.melding.nuGedeeld") : t("routes.agenda.melding.aangepast"));
        }
        else if (bewerk) {
            if (wordtVoorstel) {
                setWachtend((l) => [...l.filter((x) => x.vk.a.id !== bewerk.a.id), { vk: bewerk, soort: "wijzig", bereik: isReeks(bewerk.a) ? bereik : "reeks", velden }]);
                setMelding(t("routes.agenda.melding.wijzigingVoorgesteld"));
            }
            else {
                pasToe(bewerk, velden, isReeks(bewerk.a) ? bereik : "reeks");
                setMelding(gedeeld ? t("routes.agenda.melding.nuGedeeld") : t("routes.agenda.melding.aangepast"));
            }
        }
        else {
            const id = vastId ?? `nieuw-${Date.now()}`;
            if (eigen) {
                // Eigen gezin: de server maakt de afspraak (of het voorstel); vervolgstappen krijgen het echte id.
                const keuze = aanwezigKeuze, wieGaat = aanwezigWieGaat, contactWie = aanwezigContactWie, imp = importExtra;
                const taakKind = kindIdsVan(kind)[0] ?? "beide";
                maakAfspraak(velden, { voorstel: wordtVoorstel }).then((r) => {
                    const echtId = r?.event?.id;
                    if (!echtId)
                        return;
                    if (gedeeld && keuze)
                        startAfstemming(echtId, keuze, "sanne", { ...(wieGaat ? { wieGaat } : {}), ...(contactWie ? { contactWie } : {}), kind: taakKind, afspraakTitel: velden.titel });
                    naOpslaan?.(echtId);
                    if (imp) {
                        for (const tekst of new Set([imp.taak.trim(), imp.mee.trim()].filter(Boolean)))
                            voegTaakToe({ tekst, kind: taakKind, wie: "", herhaling: "eenmalig", deadline: velden.datum, gedeeld: velden.gedeeld !== false });
                        const bedrag = Number(imp.bedrag.replace(",", "."));
                        if (bedrag > 0)
                            nieuwBudget({ wat: velden.titel, kindIds: kindIdsVan(kind), max: bedrag, pctIk: 50, toelichting: t("routes.agenda.budgetToelichting", { datum: lang(velden.datum) }) });
                    }
                });
                setAanwezigKeuze(null);
                setAanwezigWieGaat(null);
                setAanwezigContactWie(null);
                setImportExtra(null);
                setMelding(wordtVoorstel ? t("routes.agenda.melding.voorgesteldEigen") : !gedeeld ? t("routes.agenda.melding.toegevoegdPrive") : verbonden ? t("routes.agenda.melding.toegevoegdGedeeld") : t("routes.agenda.melding.toegevoegd"));
                setBewerk(null);
                setNieuwOpen(false);
                return;
            }
            if (wordtVoorstel) {
                setWachtend((l) => [...l, { vk: { a: { id, ...velden }, datum }, soort: "nieuw", bereik: "reeks", velden }]);
                setMelding(t("routes.agenda.melding.voorgesteld"));
                setNieuwOpen(false);
                setBewerk(null);
                return;
            }
            setExtra((l) => [...l, { id, ...velden }]);
            // Aanwezigheid afstemmen: alleen bij een gedeelde afspraak voor een kind; "later" bewaart de keuze zonder voorstel.
            if (gedeeld && aanwezigKeuze) {
                const taakKind = /allebei|&|alle kinderen/i.test(kind) ? "beide" : kind.toLowerCase();
                startAfstemming(id, aanwezigKeuze, "sanne", { ...(aanwezigWieGaat ? { wieGaat: aanwezigWieGaat } : {}), ...(aanwezigContactWie ? { contactWie: aanwezigContactWie } : {}), kind: taakKind, afspraakTitel: velden.titel });
            }
            setAanwezigKeuze(null);
            setAanwezigWieGaat(null);
            setAanwezigContactWie(null);
            if (importExtra) {
                const taakKind = kindIdsVan(kind)[0] ?? "beide";
                for (const tekst of new Set([importExtra.taak.trim(), importExtra.mee.trim()].filter(Boolean))) {
                    voegTaakToe({ tekst, kind: taakKind, wie: "", herhaling: "eenmalig", deadline: datum, gedeeld });
                }
                const bedrag = Number(importExtra.bedrag.replace(",", "."));
                if (bedrag > 0)
                    nieuwBudget({ wat: titel.trim(), kindIds: kindIdsVan(kind), max: bedrag, pctIk: 50, toelichting: t("routes.agenda.budgetToelichting", { datum: lang(datum) }) });
                setImportExtra(null);
            }
            setMelding(eigen ? t("routes.agenda.melding.toegevoegdApparaat") : gedeeld ? t("routes.agenda.melding.toegevoegdVoorbeeld") : t("routes.agenda.melding.toegevoegdPrive"));
        }
        setBewerk(null);
        setNieuwOpen(false);
    };
    const maandVan = iso(getoondeMaand);
    const maandTot = iso(new Date(getoondeMaand.getFullYear(), getoondeMaand.getMonth() + 1, 0));
    const leeg = (getoondeMaand.getDay() + 6) % 7;
    const maandDagen = Array.from({ length: dt(maandTot).getDate() }, (_, i) => plusDagen(maandVan, i));
    const vakInMaand = vakantiesTussen(regio, maandVan, maandTot);
    return (<AppShell>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
            <h1 className="lora text-[32px] leading-tight">{t("routes.agenda.titel")}</h1>
            <p className="text-base capitalize text-ink-soft">{(weergave === "maand" ? getoondeMaand : dt(weekStart)).toLocaleDateString(taalLocale(), { month: "long", year: "numeric" })}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1 [&>button]:m-0 [&>button]:size-11"><Assistent pagina="Agenda"/>
        <ContextToevoegen titel={t("routes.agenda.toevoegen.titel")} acties={[
            { titel: t("routes.agenda.toevoegen.afspraak.titel"), uitleg: t("routes.agenda.toevoegen.afspraak.uitleg"), icoon: CalendarPlus, functie: "agenda", onKies: () => openNieuw() },
            { titel: t("routes.agenda.toevoegen.zorg.titel"), uitleg: t("routes.agenda.toevoegen.zorg.uitleg"), icoon: ArrowLeftRight, functie: "zorgregeling", onKies: () => router.navigate({ to: "/agenda", search: { zorgActie: "wijziging" } }) },
            { titel: t("routes.agenda.toevoegen.vakantie.titel"), uitleg: t("routes.agenda.toevoegen.vakantie.uitleg"), icoon: Palmtree, functie: "vakantie", onKies: () => router.navigate({ to: "/agenda", search: { onderdeel: "vakanties", vakantieNieuw: "vakantie" } }) },
            { titel: t("routes.agenda.toevoegen.vandaag.titel"), uitleg: t("routes.agenda.toevoegen.vandaag.uitleg"), icoon: CircleHelp, functie: "afstemmen", onKies: () => router.navigate({ to: "/veranderd" }) },
        ]}/>
        </div>
      </div>
      {eigen && !verbonden ? <p className="mt-1 text-sm text-ink-soft">{t("routes.agenda.eigenAgenda")}</p> : null}

      {melding ? <div className="mt-4 rounded-md border border-brand/20 bg-brand-soft p-3 text-sm text-brand">{melding}</div> : null}
      <div className="mt-3 flex gap-2" role="group" aria-label={t("routes.agenda.onderdeel.label")}><Button variant="ghost" aria-pressed={zoek.onderdeel !== "vakanties"} className={`min-h-9 rounded-full px-4 text-sm font-extrabold ${zoek.onderdeel !== "vakanties" ? "bg-[#DCE3D3] text-[#3F5747]" : "text-ink-soft"}`} onClick={() => router.navigate({ to: "/agenda", search: {} })}>{t("routes.agenda.titel")}</Button><Button variant="ghost" aria-pressed={zoek.onderdeel === "vakanties"} className={`min-h-9 rounded-full px-4 text-sm font-extrabold ${zoek.onderdeel === "vakanties" ? "bg-[#DCE3D3] text-[#3F5747]" : "text-ink-soft"}`} onClick={() => router.navigate({ to: "/agenda", search: { onderdeel: "vakanties" } })}>{t("routes.agenda.onderdeel.vakanties")}</Button></div>
      {reacties.length ? <Button variant="ghost" className="mt-2 min-h-11 h-auto w-full justify-between gap-2 whitespace-normal border-b border-border px-0 text-left text-xs text-brand" onClick={() => setVoorstellenOpen(true)}><span>{t("routes.agenda.voorstellenWachten", { count: reacties.length })}</span><MetChevron className="shrink-0">{t("routes.agenda.bekijken")}</MetChevron></Button> : null}
      {zoek.onderdeel !== "vakanties" ? <ZorgAfstemmen weergave="verzoeken" kind={kindFilter} sluit={() => { }}/> : null}
      {zoek.onderdeel === "vakanties" ? <AgendaVakanties toevoegen={zoek.vakantieNieuw} onVerwerkt={() => router.navigate({ to: "/agenda", search: { onderdeel: "vakanties" }, replace: true })}/> : <>
      <div className="mt-2 flex min-h-11 items-center justify-between gap-2">
        <div className="flex flex-1 rounded-full bg-[rgba(226,216,203,.55)] p-1" role="group" aria-label={t("routes.agenda.weergave.label")}>
        {["week", "maand"].map((w) => (<button type="button" key={w} aria-pressed={weergave === w} onClick={() => zetWeergave(w)} className={`min-h-10 flex-1 rounded-full text-[15px] capitalize ${weergave === w ? "bg-white font-black text-[#3F5747] shadow-[0_2px_8px_rgba(60,50,40,.08)]" : "font-bold text-ink-soft"}`}>{t(`routes.agenda.weergave.${w}`)}</button>))}
        </div>
        {profielen.length > 1 ? <select aria-label={t("routes.agenda.kindFilter")} value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className="min-h-11 min-w-0 max-w-40 rounded-md border-none bg-background px-1 text-sm text-ink">{[{ id: "alle", naam: t("common.alleKinderen") }, ...profielen].map((k) => <option key={k.id} value={k.id}>{k.naam}</option>)}</select> : null}
      </div>

      {heeftPrive ? (<div className="mt-3 flex gap-2" role="group" aria-label={t("routes.agenda.filter.label")}>
          {[["alles", t("routes.agenda.filter.alles")], ["kinderen", t("routes.agenda.filter.kinderen")], ["prive", t("routes.agenda.prive")]].map(([k, l]) => <Chip key={k} actief={filter === k} onClick={() => setFilter(k)}>{l}</Chip>)}
        </div>) : null}

      {weergave === "dag" ? (<div className="mt-4 space-y-2.5">
          <ZorgLegenda />
          <Card>
            <p className="text-xs font-semibold tracking-wider text-brand uppercase">{t("routes.agenda.dag.vandaag", { datum: lang(VANDAAG) })}</p>
            <p className="mt-1 font-display text-lg font-bold">
              {zorgVan(VANDAAG).kinderen.map((k) => `${k.naam}: ${ouderLabel(k.ouder).toLowerCase()}`).join(" · ") || t("routes.agenda.dag.eigen")}
            </p>
          </Card>
          <AgendaWissels datum={VANDAAG} gegevens={zorgVan(VANDAAG)}/>
          {demoVoor(VANDAAG).map((a) => <AfspraakRij key={a.id} id={a.id} onActie={(actie) => actieVast(a, actie)}/>)}
          {vk(VANDAAG, VANDAAG).map((v) => <ExtraAfspraakRij key={v.a.id + v.datum} v={v} onOpen={setDetail} wacht={wachtOp(v.a.id)} onAkkoord={wachtOp(v.a.id) ? () => { const w = wachtend.find((x) => x.vk.a.id === v.a.id); if (w)
                accepteer(w); } : undefined}/>)}
          <button onClick={() => setGekozenDag(VANDAAG)} className="inline-flex min-h-10 items-center text-xs font-semibold text-brand"><MetChevron>{t("routes.agenda.dag.alles")}</MetChevron></button>
        </div>) : null}

      {weergave === "week" ? (<>
          <section className="mt-3 rounded-[26px] border border-white/85 bg-white/60 px-2 pb-3 pt-2 shadow-[0_8px_24px_rgba(60,50,40,.06)]" aria-label={t("routes.agenda.week.label")}>
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={() => { zetWeekOffset((w) => w - 1); setWeekDag(null); }} aria-label={t("routes.agenda.week.vorige")} className="size-11 shrink-0"><Chevron richting="links" className="size-5"/></Button>
              <div className="text-center">
                <h2 className="font-display text-lg font-black">{weekBereik(weekStart)}</h2>
              </div>
              <Button variant="ghost" size="icon" onClick={() => { zetWeekOffset((w) => w + 1); setWeekDag(null); }} aria-label={t("routes.agenda.week.volgende")} className="size-11 shrink-0"><Chevron className="size-5"/></Button>
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1 text-center text-[13px] font-extrabold text-ink-soft" aria-hidden="true">{weekKoppen().map((dag) => <span key={dag}>{dag}</span>)}</div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {weekDagen.map((d) => <DagCel key={d} d={d} groot items={celItems(d)} kleurVan={kleurNaam} wisselNaar={wisselRichting(d)} gegevens={zorgVan(d)} zorg={zorg} regio={regio} heeftIets={demoVoor(d).length + vk(d, d).length > 0} onKies={setWeekDag} geselecteerd={d === weekDag} eigenPlek={eigenPlekVan(d)} eigenWissel={eigenWisselVan(d)}/>)}
            </div>
            <ZorgLegenda kinderen={startSt.kinderen.map((k) => ({ naam: k.naam, kleur: k.kleur ?? "#8A7E72" }))}/>
            {weekOffset !== 0 ? <button onClick={() => { zetWeekOffset(0); setWeekDag(null); }} className="mt-2 px-2 text-xs font-bold text-brand">{t("routes.agenda.week.terug")}</button> : null}
          </section>
          {!weekDag ? <p className="mt-3 flex items-center gap-2.5 px-1 text-[15px] text-ink-soft"><span className="grid size-8 place-items-center rounded-full bg-white/80"><AppIcon functie="agenda" maat="sm" vorm="kaal"/></span>{t("routes.agenda.week.tik")}</p> : null}
          {eigen && extra.length === 0 ? <Button variant="link" className="min-h-11 px-0" onClick={() => openNieuw()}>{t("routes.agenda.eersteAfspraak")}</Button> : null}
          <div className="mt-3 space-y-2.5">
            {weekDag ? <div className="flex items-center justify-between gap-3 border-b border-border pb-2"><p className="text-sm font-semibold capitalize">{lang(weekDag)}</p><Button variant="ghost" size="icon" aria-label={t("routes.agenda.toevoegenGeselecteerd")} onClick={() => openNieuw(weekDag)}><AppIcon functie="toevoegen" maat="sm" vorm="kaal"/></Button></div> : null}
            {(weekDag ? [weekDag] : weekDagen).map((d) => <AgendaWissels key={d} datum={d} gegevens={zorgVan(d)}/>)}
            {weekDag && wieIsWaarNodig(zorgVan(weekDag).kinderen) ? <div className="rounded-[22px] border border-white/85 bg-white/60 px-4 py-2">
              <p className="pt-1 text-xs font-extrabold uppercase tracking-[0.1em] text-brand">{t("routes.agenda.wieIsWaar")}</p>
              {zorgVan(weekDag).kinderen.map((k) => {
                        const thuis = k.ouder === "sanne";
                        const c = kleurNaam(k.naam);
                        return (<div key={k.id} className="flex items-center gap-3 border-b border-[#E9E1D5] py-2.5 last:border-0">
                  <span className={`grid size-10 shrink-0 place-items-center rounded-full font-display text-base font-black ${thuis ? "text-white" : "border-2 border-solid bg-white"}`} style={thuis ? { background: c } : { borderColor: c, color: c }}>{k.naam.slice(0, 1)}</span>
                  <span className="min-w-0 flex-1 text-[16px] font-black">{k.naam}</span>
                  <span className={`text-sm font-extrabold ${thuis ? "text-brand" : "text-ink-soft"}`}>{thuis ? t("routes.agenda.thuisBijJou") : `⇄ ${ouderLabel(k.ouder).toLowerCase()}`}{k.uitzondering ? ` · ${k.uitzondering}` : ""}</span>
                </div>);
                    })}
            </div> : null}
            {(weekDag ? [weekDag] : weekDagen).flatMap((d) => demoVoor(d)).map((a) => <AfspraakRij key={a.id} id={a.id} onActie={(actie) => actieVast(a, actie)}/>)}
            {vk(weekDag ?? weekStart, weekDag ?? plusDagen(weekStart, 6)).map((v) => <ExtraAfspraakRij key={v.a.id + v.datum} v={v} onOpen={setDetail} wacht={wachtOp(v.a.id)} onAkkoord={wachtOp(v.a.id) ? () => { const w = wachtend.find((x) => x.vk.a.id === v.a.id); if (w)
                accepteer(w); } : undefined}/>)}
            {weekDag && !demoVoor(weekDag).length && !vk(weekDag, weekDag).length ? <p className="text-sm text-ink-soft">{t("routes.agenda.geenAfspraken")}</p> : null}
          </div>
        </>) : null}

      {weergave === "maand" ? (<>
          <section className="mt-3 rounded-[26px] border border-white/85 bg-white/60 px-2 pb-3 pt-2 shadow-[0_8px_24px_rgba(60,50,40,.06)]">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={() => zetMaandOffset((m) => m - 1)} className="size-11" aria-label={t("routes.agenda.maand.vorige")}><Chevron richting="links" className="size-5"/></Button>
              <p className="font-display text-lg font-black capitalize">{getoondeMaand.toLocaleDateString(taalLocale(), { month: "long", year: "numeric" })}</p>
              <Button variant="ghost" size="icon" onClick={() => zetMaandOffset((m) => m + 1)} className="size-11" aria-label={t("routes.agenda.maand.volgende")}><Chevron className="size-5"/></Button>
            </div>
            <div className="mt-2 grid grid-cols-7 gap-1.5 text-center text-[13px] font-extrabold text-ink-soft">
              {weekKoppen().map((d) => <span key={d}>{d}</span>)}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-1.5">
              {Array.from({ length: leeg }).map((_, i) => <span key={`l${i}`}/>)}
              {maandDagen.map((d) => <DagCel key={d} d={d} gegevens={zorgVan(d)} zorg={zorg} regio={regio} heeftIets={demoVoor(d).length + vk(d, d).length > 0} onKies={setGekozenDag} eigenPlek={eigenPlekVan(d)} eigenWissel={eigenWisselVan(d)} items={celItems(d)} kleurVan={kleurNaam} wisselNaar={wisselRichting(d)}/>)}
            </div>
            <ZorgLegenda kinderen={startSt.kinderen.map((k) => ({ naam: k.naam, kleur: k.kleur ?? "#8A7E72" }))}/>
          </section>
          {vakInMaand.map((v) => (<div key={v.naam + v.van} className="mt-3 flex items-center justify-between gap-3 border-b border-border px-1 pb-3">
              <div>
                <p className="text-sm font-semibold">{v.naam}</p>
                <p className="text-xs text-ink-soft">{kort(v.van)} – {kort(v.tot)} · {regioLabel[regio]} · {t("routes.agenda.schoolkalender")}</p>
              </div>
              <Link to="/agenda" search={{ onderdeel: "vakanties" }} className="shrink-0 text-xs font-semibold text-brand">{t("routes.agenda.verdelingVoorstellen")}</Link>
            </div>))}
          <div className="mt-3 space-y-2.5">
            {maandDagen.map((d) => <AgendaWissels key={d} datum={d} gegevens={zorgVan(d)}/>)}
            {maandDagen.flatMap((d) => demoVoor(d)).map((a) => <AfspraakRij key={a.id} id={a.id} onActie={(actie) => actieVast(a, actie)}/>)}
            {vk(maandVan, maandTot).map((v) => <ExtraAfspraakRij key={v.a.id + v.datum} v={v} onOpen={setDetail} wacht={wachtOp(v.a.id)} onAkkoord={wachtOp(v.a.id) ? () => { const w = wachtend.find((x) => x.vk.a.id === v.a.id); if (w)
                accepteer(w); } : undefined}/>)}
            {maandDagen.every((d) => demoVoor(d).length === 0) && vk(maandVan, maandTot).length === 0 ? <Card className="text-sm text-ink-soft">{t("routes.agenda.maand.rustig")} <button type="button" onClick={() => openNieuw()} className="font-semibold text-brand">{t("routes.agenda.afspraakToevoegen")}</button></Card> : null}
          </div>
        </>) : null}
      <Link to="/tijdlijn" className="mt-6 flex items-center justify-center gap-1.5 text-xs font-extrabold text-ink-soft"><AppIcon functie="geschiedenis" maat="sm" vorm="kaal"/>{t("routes.agenda.eerdereWijzigingen")}</Link>

      </>}
      {zoek.zorgActie ? <ZorgAfstemmen weergave="formulier" kind={kindFilter} startActie={zoek.zorgActie} doel={zoek.zorgVoorstel} datum={zoek.dag} sluit={sluitZorg}/> : null}
      {(voorstellenOpen || (zoek.zorgVoorstel && !zoek.zorgActie)) ? <Sheet open={voorstellenOpen || !!zoek.zorgVoorstel} onOpenChange={(o) => { if (!o) {
        setVoorstellenOpen(false);
        sluitZorg();
    } }}><SheetContent side="bottom" className="left-1/2 max-h-[90dvh] w-full max-w-md -translate-x-1/2 overflow-y-auto rounded-t-2xl bg-background px-5 pb-8"><SheetHeader className="pr-8 text-left"><SheetTitle>{t("routes.agenda.voorstellen.titel")}</SheetTitle><SheetDescription>{t("routes.agenda.voorstellen.beschrijving")}</SheetDescription></SheetHeader><ZorgAfstemmen kind={kindFilter} doel={zoek.zorgVoorstel} datum={zoek.dag} sluit={sluitZorg}/>{activiteiten.voorstellen.filter((v) => v.bron !== "zorg" && v.bron !== "budget" && v.bron !== "kost" && v.bron !== "agenda").map((v) => <Button asChild variant="ghost" key={v.sleutel} className="h-auto min-h-11 w-full justify-start whitespace-normal"><a href={v.naar}>{v.titel} · {v.aanJou ? t("routes.agenda.voorstellen.jouwReactie") : t("routes.agenda.bekijkVoorstel")}</a></Button>)}{voorstellen.map((w) => <div key={w.id ?? w.vk.a.id} className="flex items-center gap-2 border-b border-border py-2"><Button variant="ghost" className="h-auto min-h-11 flex-1 justify-start whitespace-normal text-left" onClick={() => { setVoorstellenOpen(false); setDetail(w.vk); }}><span>{w.vk.a.titel}<span className="block text-xs text-ink-soft">{w.status === "ingetrokken" ? t("routes.agenda.status.ingetrokken") : w.status === "geaccepteerd" ? t("routes.agenda.status.afgesproken") : w.status === "afgewezen" ? t("common.nietAkkoord") : w.status === "alternatief" ? t("common.anderVoorstel") : w.mine === false ? t("routes.agenda.voorstellen.jouwReactie") : t("routes.agenda.status.wachtOpAnder")}</span></span></Button><GeschiedenisKnop soort="afspraak" itemId={w.vk.a.id} naam={w.vk.a.titel}/></div>)}<Button asChild variant="link" className="min-h-11 px-0"><Link to="/activiteiten" search={{ onderdeel: "regelen" }}>{t("routes.agenda.voorstellen.overzicht")}</Link></Button></SheetContent></Sheet> : null}
      <DagSheet gegevens={gekozenDag ? zorgVan(gekozenDag) : zorgVan(VANDAAG)} dag={gekozenDag} onSluit={() => setGekozenDag(null)} zorg={zorg} regio={regio} eigen={eigen} eigenKinderen={eigen && eigenRegeling && gekozenDag ? startSt.kinderen.map((k) => ({ naam: k.naam, plek: plekOp(eigenRegeling, dt(gekozenDag)) })) : undefined} eigenWissel={gekozenDag ? eigenWisselVan(gekozenDag) : undefined} extra={gekozenDag ? vk(gekozenDag, gekozenDag) : []} taken={gekozenDag && !eigen ? taken.filter((t) => t.deadline === gekozenDag && !t.klaar) : []} onToevoegen={() => openNieuw(gekozenDag ?? "")} onWijziging={verbonden ? () => { const d = gekozenDag; setGekozenDag(null); router.navigate({ to: "/agenda", search: { zorgActie: "wijziging", dag: d ?? undefined } }); } : undefined} onOpen={(v) => { setGekozenDag(null); setDetail(v); }} onOpenVast={(id) => { setGekozenDag(null); if (zoek.afspraak === id)
        setDoelOpen(true);
    else
        router.navigate({ to: "/agenda", search: { afspraak: id } }); }}/>

      <AfspraakDetail v={detail} direct={detail ? direct(detail.a) : false} wacht={detail ? wachtend.find((w) => w.vk.a.id === detail.a.id) : undefined} ingetrokken={detail ? voorstellen.some((w) => w.vk.a.id === detail.a.id && w.status === "ingetrokken") : false} onSluit={() => setDetail(null)} onActie={(m) => { const d = detail; if (!d)
        return; setDetail(null); if (m === "verwijderen")
        setVerwijderVk(d);
    else
        openBewerk(d, m); }} onIntrekken={() => { const w = wachtend.find((x) => x.vk.a.id === detail?.a.id); if (w && eigen) {
        trekAfspraakVoorstelIn(w.id);
        setMelding(t("routes.agenda.melding.ingetrokken"));
    }
    else if (w) {
        setWachtend((l) => l.map((x) => x === w ? { ...x, status: "ingetrokken" } : x));
        setMelding(t("routes.agenda.melding.ingetrokken"));
    } setDetail(null); }} onAkkoord={() => { const w = wachtend.find((x) => x.vk.a.id === detail?.a.id); if (w)
        accepteer(w); setDetail(null); }} onReageer={(antwoord) => { const w = wachtend.find((x) => x.vk.a.id === detail?.a.id); const d = detail; setDetail(null); if (!w || !d)
        return; reageerOpAfspraakVoorstel(w.id, antwoord); setMelding(antwoord === "akkoord" ? t("routes.agenda.melding.akkoordGegeven") : antwoord === "niet-akkoord" ? t("routes.agenda.melding.nietAkkoordGegeven") : antwoord === "meer-tijd" ? t("routes.agenda.melding.meerTijdGevraagd") : t("routes.agenda.melding.anderVoorstelMaken")); if (antwoord === "ander-voorstel" && w.soort !== "verwijder" && d.a.id === w.vk.a.id && w.velden && w.soort === "wijzig")
        openBewerk({ a: { ...d.a, ...w.velden, id: d.a.id }, datum: d.datum }); }}/>

      {/* Doorklik vanuit Home: precies deze afspraak openen, los van de gekozen weergave. */}
      {zoek.afspraak ? (doelAfspraak ? (doelAfspraak.categorie === "wissel"
            ? <WisselmomentSheet open={doelOpen} onSluit={() => setDoelOpen(false)} a={doelAfspraak}/>
            : <VasteAfspraakSheet open={doelOpen} onSluit={() => setDoelOpen(false)} a={doelAfspraak} onActie={(actie) => actieVast(doelAfspraak, actie)}/>)
            : doelOpen && !doelEigen && (!eigen || agendaSt.geladen) ? <div role="alert" className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-md rounded-md border border-border bg-card p-4 text-sm"><p className="font-semibold">{t("routes.agenda.bestaatNiet.titel")}</p><p className="mt-1 text-ink-soft">{t("routes.agenda.bestaatNiet.tekst")}</p><button onClick={() => setDoelOpen(false)} className="mt-2 font-semibold text-brand">{t("common.sluiten")}</button></div> : null) : null}
      <Sheet open={!!verwijderVk} onOpenChange={(o) => !o && setVerwijderVk(null)}>
        <SheetContent side="bottom" className="left-1/2 w-full max-w-md -translate-x-1/2 rounded-t-2xl bg-background px-5 pb-8">
          <SheetHeader className="text-left">
            <SheetTitle className="font-display text-lg">{t("routes.agenda.annuleren.titel")}</SheetTitle>
            <SheetDescription>{verwijderVk ? `${verwijderVk.a.titel} · ${lang(verwijderVk.datum)}` : ""}</SheetDescription>
          </SheetHeader>
          {verwijderVk ? (<div className="mt-4 space-y-2">
              {!direct(verwijderVk.a) ? <p className="text-sm text-ink-soft">{t("routes.agenda.annuleren.melding")}</p> : null}
              {afstemStatus(verwijderVk.a.id) === "akkoord" && annuleringNietNodig !== verwijderVk.a.id ? <section className="rounded-md border border-border p-3"><p className="text-sm">{t("routes.agenda.annuleren.afgestemd")}</p><div className="mt-2 flex gap-4"><Link to="/berichten" search={{ concept: t("routes.agenda.annuleren.concept", { titel: verwijderVk.a.titel, datum: lang(verwijderVk.datum), tijd: uur(verwijderVk.a.tijd) }) }} className="inline-flex min-h-11 items-center text-sm font-semibold text-brand">{t("routes.agenda.annuleren.berichtVoorbereiden")}</Link><button onClick={() => setAnnuleringNietNodig(verwijderVk.a.id)} className="min-h-11 text-sm text-ink-soft">{t("routes.agenda.annuleren.nietNodig")}</button></div><p className="text-xs text-ink-soft">{t("routes.agenda.annuleren.controle")}</p></section> : null}
              {isReeks(verwijderVk.a) ? (<fieldset className="rounded-md border border-border p-3">
                  <legend className="px-1 text-xs font-semibold text-ink-soft">{t("routes.agenda.bereikVraag")}</legend>
                  {["alleen", "toekomst", "reeks"].map((b) => (<label key={b} className="flex items-center gap-2 py-1 text-sm">
                      <input type="radio" name="vbereik" checked={bereik === b} onChange={() => setBereik(b)} className="accent-[var(--color-brand)]"/>{bereikNaam[b]}
                    </label>))}
                </fieldset>) : null}
              {!direct(verwijderVk.a) ? (<>
                  <Button onClick={() => { setWachtend((l) => [...l.filter((x) => x.vk.a.id !== verwijderVk.a.id || x.status), { vk: verwijderVk, soort: "verwijder", bereik: isReeks(verwijderVk.a) ? bereik : "reeks" }]); setVerwijderVk(null); setMelding(t("routes.agenda.melding.annuleringVoorgesteld")); }} className="w-full">{t("routes.agenda.annuleren.voorstellen")}</Button>
                </>) : (<Button onClick={() => { verwijder(verwijderVk, isReeks(verwijderVk.a) ? bereik : "reeks"); setMelding(t("routes.agenda.melding.geannuleerd")); }} className="w-full">{t("routes.agenda.annuleren.knop")}</Button>)}
              <button onClick={() => setVerwijderVk(null)} className="w-full py-2 text-sm font-semibold text-ink-soft">{t("common.annuleren")}</button>
            </div>) : null}
        </SheetContent>
      </Sheet>

      <AfspraakFormulier open={!!nieuwForm} start={nieuwForm ?? {}} onSluit={() => { setNieuwForm(null); if (zoek.nieuw)
            router.navigate({ to: "/agenda", search: { onderdeel: zoek.onderdeel }, replace: true }); }}/>
      {nieuwOpen ? (<div className="app-modal-achter z-30" onClick={sluitNieuw}>
          <div className="app-modal" onClick={(e) => e.stopPropagation()}>
            <button onClick={sluitNieuw} aria-label={t("common.sluiten")} className="knop-kruis absolute right-4 top-4 size-9"><X className="size-5"/></button>
            {verlatenVraag ? (<div className="mt-8 rounded-md border border-border bg-card p-4">
                <p className="font-display text-lg">{t("routes.agenda.form.verlaten.titel")}</p>
                <p className="mt-1 text-sm text-ink-soft">{t("routes.agenda.form.verlaten.tekst")}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm font-semibold">
                  <button onClick={() => setVerlatenVraag(false)} className="rounded-md bg-brand py-2 text-primary-foreground">{t("routes.agenda.form.verlaten.verder")}</button>
                  <button onClick={() => { setVerlatenVraag(false); setNieuwOpen(false); }} className="rounded-md border border-border py-2 text-ink-soft">{t("routes.agenda.form.verlaten.verlaten")}</button>
                </div>
              </div>) : null}
            <p className="font-display text-lg font-bold">{!bewerk ? t("routes.agenda.form.titel.nieuw") : modus === "tijd" ? t("routes.agenda.tijdWijzigen") : modus === "locatie" ? t("routes.agenda.locatieWijzigen") : modus === "verplaatsen" ? t("routes.agenda.form.titel.verplaatsen") : modus === "herhaling" ? t("routes.agenda.herhalenAanpassen") : t("routes.agenda.afspraakBewerken")}</p>
            {bewerk && modus === "aanpassen" ? <div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" onClick={() => setModus("tijd")}><AppIcon functie="tijd" maat="sm" vorm="kaal"/>{t("routes.agenda.tijdWijzigen")}</Button><Button variant="outline" onClick={() => setModus("locatie")}><AppIcon functie="locatie" maat="sm" vorm="kaal"/>{t("routes.agenda.locatieWijzigen")}</Button><Button variant="outline" onClick={() => { setNieuwOpen(false); setVerwijderVk(bewerk); }}><AppIcon functie="niet" maat="sm" vorm="kaal"/>{t("routes.agenda.annuleren.knop")}</Button></div> : null}
            {bewerk && isReeks(bewerk.a) ? (<fieldset className="mt-3 rounded-md border border-border p-3">
                <legend className="px-1 text-xs font-semibold text-ink-soft">{t("routes.agenda.bereikVraag")}</legend>
                {(modus === "herhaling" ? ["toekomst", "reeks"] : ["alleen", "toekomst", "reeks"]).map((b) => (<label key={b} className="flex items-center gap-2 py-1 text-sm">
                    <input type="radio" name="bereik" checked={bereik === b} onChange={() => setBereik(b)} className="accent-[var(--color-brand)]"/>{bereikNaam[b]}
                  </label>))}
              </fieldset>) : null}
            {bewerk && modus === "verplaatsen" ? (<div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-md border border-border p-3"><p className="text-xs text-ink-soft">{t("routes.agenda.form.huidig")}</p><p className="font-semibold capitalize">{dt(bewerk.datum).toLocaleDateString(taalLocale(), { weekday: "long" })} {uur(bewerk.a.tijd)}</p></div>
                <div className="rounded-md border border-brand/40 bg-brand-soft/50 p-3"><p className="text-xs text-ink-soft">{t("routes.agenda.form.nieuw")}</p><p className="font-semibold capitalize">{datum ? dt(datum).toLocaleDateString(taalLocale(), { weekday: "long" }) : "—"} {uur(tijd)}</p></div>
              </div>) : null}
            <div className="mt-4 space-y-3">
              {bewerk && ["aanpassen", "tijd", "locatie"].includes(modus) ? <>
                <p className="text-sm font-semibold">{bewerk.a.titel} · {lang(bewerk.datum)}</p>
                {modus === "tijd" ? <><label className="block text-sm">{t("routes.agenda.form.begintijd")}<input type="time" value={tijd} onChange={(e) => setTijd(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2.5"/></label><label className="block text-sm">{t("routes.agenda.form.eindtijd")}<input type="time" value={eindtijd} onChange={(e) => setEindtijd(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2.5"/></label></> : null}
                {modus === "locatie" ? <label className="block text-sm">{t("routes.agenda.form.locatie")}<input value={locatie} onChange={(e) => setLocatie(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2.5"/></label> : null}
              </> : null}
              {toon("titel") ? <input value={titel} onChange={(e) => setTitel(e.target.value)} placeholder={t("routes.agenda.form.titelPlaceholder")} className="w-full rounded-md border border-border bg-card px-4 py-3 text-sm outline-none placeholder:text-ink-soft/70"/> : null}
              {toon("datum") ? (<div className="grid grid-cols-2 gap-2">
                  <label className="block"><span className="mb-1 block text-xs font-semibold text-ink-soft">{t("routes.agenda.form.datum")}</span>
                    <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} className="w-full rounded-md border border-border bg-card px-3 py-2.5 text-sm outline-none"/></label>
                  <label className="block"><span className="mb-1 block text-xs font-semibold text-ink-soft">{t("routes.agenda.form.begintijd")}</span>
                    <input type="time" value={tijd} onChange={(e) => setTijd(e.target.value)} className="w-full rounded-md border border-border bg-card px-3 py-2.5 text-sm outline-none"/></label>
                  <label className="col-span-2 block"><span className="mb-1 block text-xs font-semibold text-ink-soft">{t("routes.agenda.form.eindtijd")}</span>
                    <input type="time" value={eindtijd} onChange={(e) => setEindtijd(e.target.value)} className="w-full rounded-md border border-border bg-card px-3 py-2.5 text-sm outline-none"/></label>
                </div>) : null}
              {toon("herhaling") ? (<div>
                <span className="mb-1 block text-xs font-semibold text-ink-soft">{t("routes.agenda.form.herhalen")}</span>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(freqLabel).map((f) => (<Chip key={f} actief={herhaling.freq === f} onClick={() => setHerhaling({ ...herhaling, freq: f })}>{freqLabel[f]}</Chip>))}
                </div>
                {herhaling.freq === "aangepast" ? (<div className="mt-2 flex items-center gap-2 text-sm">
                    <span className="text-ink-soft">{t("routes.agenda.form.elke")}</span>
                    <input type="number" min={1} max={12} value={herhaling.interval} onChange={(e) => setHerhaling({ ...herhaling, interval: Math.max(1, Number(e.target.value) || 1) })} className="w-16 rounded-md border border-border bg-card px-2 py-1.5"/>
                    <select value={herhaling.eenheid} onChange={(e) => setHerhaling({ ...herhaling, eenheid: e.target.value })} className="rounded-md border border-border bg-card px-2 py-1.5">
                      <option value="weken">{t("routes.agenda.form.weken")}</option><option value="maanden">{t("routes.agenda.form.maanden")}</option>
                    </select>
                  </div>) : null}
                {herhaling.freq !== "geen" ? (<label className="mt-2 block"><span className="mb-1 block text-xs text-ink-soft">{t("routes.agenda.form.totEnMet")}</span>
                    <input type="date" value={herhaling.eind ?? ""} onChange={(e) => setHerhaling({ ...herhaling, eind: e.target.value || undefined })} className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"/></label>) : null}
              </div>) : null}
              {toon("rest") ? (<>
                  <fieldset>
                    <legend className="mb-1 text-xs font-semibold text-ink-soft">{t("routes.agenda.form.voorWie")}</legend>
                    {bewerk && bewerk.a.mine === false ? (<div>
                        <p className="text-sm">{kind ? (/^(allebei|alle kinderen)$/i.test(kind) && kindKeuzes.length === 3 ? t("routes.agenda.form.beideKinderen") : kindWeergave(kind)) : null}</p>
                        <p className="mt-1 text-xs text-ink-soft">{t("routes.agenda.form.alleenMaker")}</p>
                      </div>) : !bewerk ? (<div className="flex flex-wrap gap-2">
                        {kindKeuzes.map((k) => <Chip key={k} actief={gedeeld && kind === k} onClick={() => { setKind(k); setGedeeld(true); }}>{/^(allebei|alle kinderen)$/i.test(k) && kindKeuzes.length === 3 ? t("routes.agenda.form.beideKinderen") : kindWeergave(k)}</Chip>)}
                        <Chip actief={!gedeeld} onClick={() => { setGedeeld(false); setKind(""); }}><span className="inline-flex items-center gap-1"><Lock aria-hidden className="size-3.5" strokeWidth={1.8}/>{t("routes.agenda.form.voorMezelf")}</span></Chip>
                      </div>) : gedeeld ? (<div className="flex flex-wrap gap-2">{kindKeuzes.map((k) => <Chip key={k} actief={kind === k} onClick={() => setKind(k)}>{/^(allebei|alle kinderen)$/i.test(k) && kindKeuzes.length === 3 ? t("routes.agenda.form.beideKinderen") : kindWeergave(k)}</Chip>)}</div>) : <p className="inline-flex items-center gap-1 text-sm"><Lock aria-hidden className="size-3.5 text-ink-soft" strokeWidth={1.8}/>{t("routes.agenda.form.voorMezelf")}</p>}
                    {!gedeeld ? <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-ink-soft"><Lock aria-hidden className="size-3" strokeWidth={1.8}/>{t("routes.agenda.form.priveUitleg")}</p> : null}
                  </fieldset>
                  <input value={locatie} onChange={(e) => setLocatie(e.target.value)} aria-label={t("routes.agenda.form.locatieLabel")} placeholder={t("routes.agenda.form.locatieHint")} className="w-full rounded-md border border-border bg-card px-4 py-2.5 text-sm outline-none placeholder:text-ink-soft/70"/>
                  <textarea value={toelichting} onChange={(e) => setToelichting(e.target.value)} rows={2} aria-label={t("routes.agenda.form.toelichtingLabel")} placeholder={t("routes.agenda.form.toelichtingHint")} className="w-full rounded-md border border-border bg-card px-4 py-2.5 text-sm outline-none placeholder:text-ink-soft/70"/>
                  <label className="block"><span className="mb-1 block text-xs font-semibold text-ink-soft">{t("routes.agenda.form.herinnering")}</span>
                    <select value={herinnering} onChange={(e) => setHerinnering(e.target.value)} className="w-full rounded-md border border-border bg-card px-3 py-2.5 text-sm">
                      {Object.keys(herinneringLabel).map((h) => <option key={h} value={h}>{herinneringLabel[h]}</option>)}
                    </select></label>
                  {!bewerk && gedeeld && kind.trim() ? (<AanwezigheidFormulier keuze={aanwezigKeuze} wieGaat={aanwezigWieGaat} contactWie={aanwezigContactWie} onKeuze={setAanwezigKeuze} onWieGaat={setAanwezigWieGaat} onContactWie={setAanwezigContactWie}/>) : null}
                  {bewerk && bewerk.a.gedeeld === false && bewerk.a.mine !== false ? (<fieldset>
                      <legend className="mb-1 text-xs font-semibold text-ink-soft">{t("routes.agenda.form.zichtbaar")}</legend>
                      <div className="flex flex-wrap gap-2">
                        <Chip actief={gedeeld} onClick={() => { setGedeeld(true); if (!kind)
                    setKind(standaardKind); }}>{t("routes.agenda.form.delen")}</Chip>
                        <Chip actief={!gedeeld} onClick={() => setGedeeld(false)}>{t("routes.agenda.form.alleenMij")}</Chip>
                      </div>
                      {gedeeld ? <p className="mt-1.5 rounded-md bg-muted p-2 text-xs">{t("routes.agenda.form.naOpslaan")}</p> : null}
                    </fieldset>) : null}
                </>) : null}
              {voorstelNieuw ? <p className="text-xs text-ink-soft">{t("routes.agenda.form.vanuitBericht")}</p> : null}
              <p className="text-xs text-ink-soft">{wordtVoorstel ? t("routes.agenda.form.uitleg.voorstel") : !gedeeld ? t("routes.agenda.form.uitleg.prive") : verbonden ? t("routes.agenda.form.uitleg.gedeeld") : t("routes.agenda.form.uitleg.eigen")}</p>
            </div>
            {priveBotsing ? (<div role="status" className="mt-4 rounded-md border border-border bg-muted p-3 text-sm">
                <p className="font-semibold">{t("routes.agenda.priveOverlap.titel")}</p>
                <p className="mt-1 text-xs text-ink-soft">{t("routes.agenda.priveOverlap.tekst")} {priveBotsing.map((b) => b.tekst).join(" ")}</p>
                {afstemTekst === null ? (<div className="mt-2 flex flex-wrap gap-2">
                    <button onClick={() => { setGekozenDag(datum); }} className="rounded-full border border-border px-3 py-1 text-xs font-semibold">{t("routes.agenda.priveOverlap.planning")}</button>
                    <button onClick={() => setAfstemTekst(priveBotsing[0]?.bericht ?? "")} className="rounded-full bg-brand px-3 py-1 text-xs font-semibold text-primary-foreground">{t("routes.agenda.priveOverlap.afstemmen")}</button>
                    <button onClick={() => opslaan(true)} className="rounded-full border border-border px-3 py-1 text-xs font-semibold">{t("routes.agenda.priveOverlap.opslaan")}</button>
                  </div>) : (<div className="mt-2 space-y-2">
                    <p className="text-xs">{t("routes.agenda.priveOverlap.vraag")}</p>
                    <textarea aria-label={t("routes.agenda.priveOverlap.berichtLabel")} value={afstemTekst} onChange={(e) => setAfstemTekst(e.target.value)} rows={3} className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"/>
                    <div className="flex flex-wrap gap-2">
                      <button disabled={!afstemTekst.trim()} onClick={() => {
                        const b = priveBotsing[0];
                        if (!b)
                            return;
                        startNuAfstemmen({ categorie: "halen", kindIds: kindIdsVan(b.kind), titel: t("routes.agenda.afstem.titel", { titel: b.titel, datum: kort(datum) }), toelichting: afstemTekst.trim(), reactieGewenst: "zsm" });
                        opslaan(true);
                        setMelding(t("routes.agenda.melding.priveVraag"));
                    }} className="rounded-full bg-brand px-3 py-1 text-xs font-semibold text-primary-foreground">{t("common.versturen")}</button>
                      <button onClick={() => setAfstemTekst(null)} className="rounded-full border border-border px-3 py-1 text-xs font-semibold">{t("common.terug")}</button>
                    </div>
                  </div>)}
              </div>) : null}
            {controle ? (<div role="status" className="mt-4 rounded-md border border-border bg-muted p-3 text-sm">
                <p className="font-semibold">{t("routes.agenda.controle.titel")}</p>
                {controle.map((c, i) => <p key={`${c.soort}-${i}`} className="mt-1 text-xs text-ink-soft">{c.tekst}</p>)}
                <div className="mt-2 flex flex-wrap gap-2">
                  {controle.some((c) => c.soort !== "overlap") ? (<button onClick={() => {
                        const nieuwId = `nieuw-${Date.now()}`;
                        const verzoek = startNuAfstemmen({
                            categorie: "planning",
                            kindIds: kindIdsVan(kind),
                            titel: t("routes.agenda.afstem.titel", { titel: titel.trim(), datum: kort(datum) }),
                            toelichting: `${controle.map((c) => c.tekst).join(" ")} ${tijd ? t("routes.agenda.afstem.komtUitTijd", { titel: titel.trim(), tijd: uur(tijd) }) : t("routes.agenda.afstem.komtUit", { titel: titel.trim() })}`,
                            reactieGewenst: "zsm",
                        });
                        if (bewerk || !eigen)
                            koppelAfstem(bewerk ? bewerk.a.id : nieuwId, verzoek);
                        opslaan(true, bewerk ? undefined : nieuwId, (id) => koppelAfstem(id, verzoek));
                        setMelding(t("routes.agenda.melding.wordtAfgestemd"));
                    }} className="rounded-full bg-brand px-3 py-1 text-xs font-semibold text-primary-foreground">{t("routes.agenda.controle.vragen")}</button>) : null}
                  <Button variant="outline" size="sm" onClick={() => opslaan(true)}>{t("routes.agenda.controle.tochOpslaan")}</Button>
                  <button onClick={() => setControle(null)} className="rounded-full border border-border px-3 py-1 text-xs font-semibold">{t("routes.agenda.controle.andereTijd")}</button>
                  {controle.filter((c) => c.afspraakId).map((c) => <Button key={c.afspraakId} variant="outline" size="sm" onClick={() => { const a = extra.find((a) => a.id === c.afspraakId); if (a)
                setDetail({ a, datum });
            else {
                setNieuwOpen(false);
                router.navigate({ to: "/agenda", search: { afspraak: c.afspraakId, dag: datum } });
            } }}>{t("routes.agenda.controle.bekijk")}</Button>)}
                </div>
                {controle.some((c) => c.soort !== "overlap") ? <p className="mt-2 text-xs text-ink-soft">{t("routes.agenda.controle.uitleg")}</p> : null}
                {controle.some((c) => c.soort === "verblijf" || c.soort === "wissel") ? (<div className="mt-3 border-t border-border pt-2">
                    <p className="text-xs font-semibold">{t("routes.agenda.controle.wieBrengt", { wie: /allebei|&/i.test(kind) ? t("routes.agenda.controle.deKinderen") : kindWeergave(kind) })}</p>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      <button onClick={() => { const nieuwId = `nieuw-${Date.now()}`; const t2 = titel.trim(); opslaan(true, bewerk ? undefined : nieuwId, (id) => ikGa(id, t2)); if (bewerk || !eigen)
                    ikGa(bewerk ? bewerk.a.id : nieuwId, t2); }} className="rounded-full bg-brand px-3 py-1 text-xs font-semibold text-primary-foreground">{t("routes.agenda.controle.ik")}</button>
                      <button onClick={() => { startNuAfstemmen({ categorie: "halen", kindIds: kindIdsVan(kind), titel: t("routes.agenda.afstem.titel", { titel: titel.trim(), datum: kort(datum) }), toelichting: t("routes.agenda.afstem.wieBrengt", { titel: titel.trim(), datum: kort(datum) }), reactieGewenst: "zsm" }); setMelding(t("routes.agenda.melding.vraagGestuurd")); opslaan(true); }} className="rounded-full border border-border px-3 py-1 text-xs font-semibold">{t("routes.agenda.controle.anderVragen")}</button>
                    </div>
                  </div>) : null}
              </div>) : null}
            {importExtra && !bewerk ? <fieldset className="mt-4 space-y-3 border-t border-border pt-3"><legend className="text-sm font-semibold">{t("routes.agenda.import.titel")}</legend>
              {importExtra.bedrag ? <label className="block text-xs font-semibold">{t("routes.agenda.import.budget")}<input aria-label={t("routes.agenda.import.budgetLabel")} type="number" min="0.01" max="100000" step="0.01" value={importExtra.bedrag} onChange={(e) => setImportExtra((v) => v ? { ...v, bedrag: e.target.value } : v)} className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"/></label> : null}
              {importExtra.taak ? <label className="block text-xs font-semibold">{t("routes.agenda.import.taak")}<input aria-label={t("routes.agenda.import.taakLabel")} value={importExtra.taak} onChange={(e) => setImportExtra((v) => v ? { ...v, taak: e.target.value } : v)} className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"/></label> : null}
              {importExtra.mee ? <label className="block text-xs font-semibold">{t("routes.agenda.import.voorbereiding")}<input aria-label={t("routes.agenda.import.voorbereidingLabel")} value={importExtra.mee} onChange={(e) => setImportExtra((v) => v ? { ...v, mee: e.target.value } : v)} className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"/></label> : null}
              <p className="text-xs text-ink-soft">{t("routes.agenda.import.uitleg")}</p>
              <Button variant="ghost" onClick={() => setImportExtra(null)}>{t("routes.agenda.import.alleenAfspraak")}</Button>
            </fieldset> : null}
            {gedeeld && !bewerk ? <div className="mt-4">
              <HulpKnop voorstel={{ kind: hulpKind(), ...(titel ? { wat: titel } : {}), ...(datum ? { datum } : {}), ...(tijd ? { tijd } : {}) }}/>
            </div> : null}
            <div className="sticky bottom-0 -mx-1 bg-background px-1 pb-1 pt-3">
            {!(bewerk && modus === "aanpassen") ? <Button onClick={() => opslaan()} disabled={!titel.trim() || !datum || (gedeeld && !kind.trim()) || (importExtra?.bedrag ? !(Number(importExtra.bedrag.replace(",", ".")) > 0) : false)} className="min-h-11 w-full bg-brand text-primary-foreground shadow-none">
              {importExtra && !bewerk ? t("routes.agenda.form.knop.selectie") : wordtVoorstel ? (bewerk ? t("routes.agenda.wijzigingVoorstellen") : t("routes.agenda.form.knop.voorstellen")) : !bewerk ? t("routes.agenda.form.knop.opslaan") : t("routes.agenda.form.knop.wijzigingOpslaan")}
            </Button> : null}
            </div>
          </div>
        </div>) : null}
    </AppShell>);
}
const bereikNaam = {
    get alleen() { return i18n.t("routes.agenda.bereik.alleen"); },
    get toekomst() { return i18n.t("routes.agenda.bereik.toekomst"); },
    get reeks() { return i18n.t("routes.agenda.bereik.reeks"); },
};
const herinneringLabel = {
    get geen() { return i18n.t("routes.agenda.herinnering.geen"); },
    get uur() { return i18n.t("routes.agenda.herinnering.uur"); },
    get dag() { return i18n.t("routes.agenda.herinnering.dag"); },
    get twee() { return i18n.t("routes.agenda.herinnering.twee"); },
};
function Chip({ actief, onClick, children }) {
    return (<button type="button" onClick={onClick} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${actief ? "border-brand bg-brand text-primary-foreground" : "border-border bg-card"}`}>{children}</button>);
}
function ZorgLegenda({ kinderen = [] }) {
    const { t } = useTranslation();
    return (<div className="mt-3 space-y-1.5 px-2 text-[13.5px] font-bold text-ink-soft" aria-label={t("routes.agenda.legenda.label")}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="inline-flex items-center gap-1.5"><span className="zorg-ik inline-block size-4 rounded-[5px]"/>{t("routes.agenda.legenda.bijJou")}</span>
        <span className="inline-flex items-center gap-1.5"><span className="zorg-ander inline-block size-4 rounded-[5px]"/>{t("routes.agenda.legenda.bijAnder")}</span>
        <span className="inline-flex items-center gap-1.5"><span className="zorg-wissel-naar-ander inline-block size-4 rounded-[5px]"/>{t("routes.agenda.legenda.wisseldag")}</span>
      </div>
      {kinderen.length ? <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">{kinderen.map((k) => <span key={k.naam} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: k.kleur }}/>{k.naam}</span>)}<span className="inline-flex items-center gap-1.5"><Lock className="size-3.5" aria-hidden/>{t("routes.agenda.prive")}</span></div> : null}
    </div>);
}
function DagCel({ gegevens, d, zorg, regio, heeftIets, onKies, groot, geselecteerd, eigenPlek, eigenWissel, items = [], kleurVan = kleurVanKind, wisselNaar }) {
    const { t } = useTranslation();
    void zorg;
    void eigenPlek;
    void eigenWissel;
    const vandaag = d === VANDAAG;
    const wissel = gegevens.wissels.length > 0;
    const wisselTijd = gegevens.wissels[0]?.tijd;
    const vak = vakantieOp(regio, d);
    const { bijzonderTonen } = useVoorkeuren();
    const bd = bijzonderTonen ? bijzondereDagOp(d) : undefined;
    const datum = dt(d);
    const weg = gegevens.kinderen.filter((k) => k.ouder && k.ouder !== "sanne");
    const deels = weg.length > 0 && weg.length < gegevens.kinderen.length;
    const label = `${lang(d)}, ${gegevens.kleur === "gemengd" ? t("routes.agenda.cel.gemengd") : ""}${gegevens.kinderen.map((k) => `${k.naam}: ${ouderLabel(k.ouder)}`).join(", ")}${vandaag ? t("routes.agenda.cel.vandaag") : ""}${wissel ? t("routes.agenda.cel.wissel") : ""}${vak ? `, ${vak.naam}` : ""}${bd ? `, ${bd.naam}` : ""}${items.length ? t("routes.agenda.cel.afspraken", { count: items.length }) : ""}`;
    const vlak = wissel && wisselNaar ? (wisselNaar === "ander" ? "zorg-wissel-naar-ander" : "zorg-wissel-naar-ik") : gegevens.kleur === "ander" ? "zorg-ander" : gegevens.kleur === "ik" || gegevens.kleur === "gemengd" ? "zorg-ik" : "border border-white/85 bg-white/50";
    if (!groot) {
        return (<button type="button" onClick={() => onKies(d)} aria-pressed={!!geselecteerd} aria-label={label} className={`relative flex min-h-11 min-w-0 flex-col items-center rounded-[10px] py-1 ${vlak} ${geselecteerd ? "outline outline-2 outline-[#3F5747]" : ""}`}>
        <span className={`grid size-6 place-items-center rounded-full text-[13px] ${vandaag ? "border-2 border-[#3F5747] font-black" : "font-extrabold"}`}>{datum.getDate()}</span>
        <span className="mt-0.5 flex h-2 items-center justify-center gap-0.5">
          {wissel ? <span className="text-[9px] font-black leading-none text-[#3F5747]">⇄</span> : null}
          {items.slice(0, 3).map((it, i) => <span key={i} className="size-[5px] rounded-full" style={{ background: it.prive ? "#8A7E72" : it.kleur }}/>)}
          {!items.length && heeftIets ? <span className="size-[5px] rounded-full bg-ink/40"/> : null}
          {bd ? <span className="size-[5px] rounded-full bg-accent-warm"/> : null}
        </span>
        {vak ? <span className="absolute inset-x-1.5 bottom-0.5 h-0.5 rounded bg-ink-soft/40"/> : null}
      </button>);
    }
    return (<button type="button" onClick={() => onKies(d)} aria-pressed={!!geselecteerd} aria-label={label} className={`relative flex min-h-[84px] min-w-0 flex-col items-start overflow-hidden rounded-[12px] px-1 py-1 text-left ${vlak} ${geselecteerd ? "outline outline-2 outline-[#3F5747]" : ""}`}>
      <span className={`ml-0.5 grid size-7 place-items-center rounded-full text-[16px] ${vandaag ? "border-2 border-[#3F5747] font-black" : "font-black"}`}>{datum.getDate()}</span>
      <span className="mt-0.5 flex w-full min-w-0 flex-col gap-0.5">
        {wissel ? <span className="w-full truncate rounded-md bg-[#DCE6D2] px-0.5 text-center text-[10.5px] font-black text-[#3F5747]">⇄ {wisselTijd || ""}</span> : null}
        {bd ? <span className="w-full truncate rounded-md bg-[#DFE8F1] px-0.5 text-[10px] font-black text-[#2E4A68]">{bd.naam}</span> : null}
        {items.slice(0, wissel || bd ? 0 : 1).map((it, i) => it.prive
            ? <span key={i} className="flex w-full min-w-0 items-center gap-0.5 rounded-md bg-[#E8E0D5] px-0.5 text-[10px] font-extrabold"><Lock className="size-2.5 shrink-0" aria-hidden/><span className="truncate">{it.titel}</span></span>
            : <span key={i} className="flex w-full min-w-0 items-center gap-0.5 text-[10.5px] font-extrabold"><span className="size-[5px] shrink-0 rounded-full" style={{ background: it.kleur }}/><span className="truncate">{it.titel}</span></span>)}
        {items.length > (wissel || bd ? 0 : 1) ? <span className="px-0.5 text-[10px] font-extrabold text-ink-soft">+{items.length - (wissel || bd ? 0 : 1)}</span> : null}
      </span>
      {weg.length ? <span className="mt-auto flex gap-0.5 pt-1" aria-hidden>{weg.map((k) => <span key={k.id} className="grid size-[17px] place-items-center rounded-full border-[1.5px] border-solid bg-white text-[9px] font-black" style={{ borderColor: kleurVan(k.naam), color: kleurVan(k.naam) }}>{k.naam.slice(0, 1)}</span>)}</span> : null}
      {deels ? <span className="sr-only">{t("routes.agenda.cel.nietAlle")}</span> : null}
      {vak ? <span className="absolute inset-x-1.5 bottom-0.5 h-0.5 rounded bg-ink-soft/40"/> : null}
    </button>);
}
function DagSheet({ gegevens, dag, onSluit, zorg, regio, extra, taken, onToevoegen, onWijziging, onOpen, onOpenVast, eigen, eigenKinderen, eigenWissel }) {
    const { t } = useTranslation();
    const d = dag ?? VANDAAG;
    const kinderen = eigen
        ? gegevens.kinderen.map((k) => ({ k: k.naam, v: { ouder: k.ouder, uitzondering: k.uitzondering } }))
        : ["emma", "noah"].map((k) => ({ k, v: verblijf(zorg, k, d) })).filter((x) => x.v);
    const demo = eigen ? [] : demoOp(d).filter((a) => !extra.some((v) => v.a.id === a.id));
    const school = demo.filter((a) => a.categorie === "school" || a.categorie === "sport");
    const overig = demo.filter((a) => a.categorie !== "school" && a.categorie !== "sport" && a.categorie !== "wissel");
    const wisselDemo = demo.filter((a) => a.categorie === "wissel");
    const wissel = eigen ? gegevens.wissels.length > 0 : eigenWissel ?? isWissel(zorg, d);
    const vak = vakantieOp(regio, d);
    const { bijzonderTonen } = useVoorkeuren();
    const bd = bijzonderTonen ? bijzondereDagOp(d) : undefined;
    const bijzonder = [vak ? t("routes.agenda.dagSheet.schoolkalender", { naam: vak.naam }) : null, bd ? t("routes.agenda.dagSheet.kalender", { naam: bd.naam }) : null, ...kinderen.map((x) => (x.v?.uitzondering ? `${eigen ? x.k : kindNamen[x.k]}: ${x.v.uitzondering}` : null))].filter(Boolean);
    const Sectie = ({ titel, children }) => (<div className="py-3"><p className="text-[11px] font-semibold tracking-wider text-ink-soft uppercase">{titel}</p><div className="mt-1.5 space-y-1 text-sm">{children}</div></div>);
    return (<Sheet open={!!dag} onOpenChange={(o) => !o && onSluit()}>
      <SheetContent side="bottom" className="left-1/2 max-h-[85dvh] w-full max-w-md -translate-x-1/2 overflow-y-auto rounded-t-2xl bg-background px-5 pb-8">
        <SheetHeader className="text-left">
          <div className="flex items-center justify-between pr-7"><SheetTitle className="font-display text-xl font-medium first-letter:uppercase">{lang(d)}</SheetTitle><Button variant="ghost" size="icon" aria-label={t("routes.agenda.dagSheet.toevoegen")} onClick={onToevoegen}><AppIcon functie="toevoegen" maat="sm" vorm="kaal"/></Button></div>
          <SheetDescription className="sr-only">{t("routes.agenda.dagSheet.beschrijving")}</SheetDescription>
        </SheetHeader>
        <div className="mt-2 divide-y divide-border border-y border-border">
          {gegevens.kinderen.length ? <Sectie titel={t("routes.agenda.dagSheet.verblijf")}>{gegevens.kinderen.map((k) => <div key={k.id}><p>{k.naam} · {ouderLabel(k.ouder)}</p>{k.delen?.map((d, i) => <p key={i} className="text-xs text-ink-soft">{d.tijdVan ?? "00:00"}–{d.tijdTot ?? "23:59"} · {d.ouder === "Sanne" ? t("routes.agenda.bijJou") : d.ouder === "Joris" ? t("routes.agenda.bijAnder") : t("routes.agenda.samen")}</p>)}{k.overlap.length ? <p className="text-xs text-accent-warm">{t("routes.agenda.dagSheet.overlap", { lijst: k.overlap.join(t("routes.agenda.dagSheet.en")) })}</p> : null}</div>)}</Sectie> : null}
          <AgendaWissels datum={d} gegevens={gegevens}/>
          {overig.length || extra.length ? (<Sectie titel={t("routes.agenda.dagSheet.afspraken")}>
              {overig.map((a) => <Button key={a.id} variant="ghost" onClick={() => onOpenVast(a.id)} aria-label={t("routes.agenda.openen", { titel: a.titel })} className="h-auto min-h-11 w-full justify-between gap-2 whitespace-normal px-0 text-left"><span>{uur(a.tijd)} · {a.titel} · {kindWeergave(a.kind)}</span><AppIcon functie="oog" maat="sm" vorm="kaal"/></Button>)}
              {extra.map((v) => <button key={v.a.id} type="button" onClick={() => onOpen(v)} className="flex min-h-[44px] w-full items-center justify-between gap-2 text-left" aria-label={t("routes.agenda.openen", { titel: v.a.titel })}><span>{v.a.tijd ? uur(v.a.tijd) : t("routes.agenda.dagSheet.heleDag")} · {v.a.titel} · {kindWeergave(v.a.kind)}{afstemStatus(v.a.id) === "akkoord" ? <MetVinkje achter className="align-middle">{t("routes.agenda.dagSheet.afgestemd")}</MetVinkje> : ""}{v.a.herhaling ? t("routes.agenda.dagSheet.herhalend") : ""}</span><Chevron className="size-4 text-ink-soft"/></button>)}
            </Sectie>) : null}
          {school.length ? <Sectie titel={t("routes.agenda.dagSheet.school")}>{school.map((a) => <Button key={a.id} variant="ghost" onClick={() => onOpenVast(a.id)} aria-label={t("routes.agenda.openen", { titel: a.titel })} className="h-auto min-h-11 w-full justify-between gap-2 whitespace-normal px-0 text-left"><span>{uur(a.tijd)} · {a.titel}</span><AppIcon functie="oog" maat="sm" vorm="kaal"/></Button>)}</Sectie> : null}
          {taken.length ? <Sectie titel={t("routes.agenda.dagSheet.taken")}>{taken.map((x) => <p key={x.id}>{x.tekst}</p>)}</Sectie> : null}
          {bijzonder.length ? <Sectie titel={t("routes.agenda.dagSheet.bijzonder")}>{bijzonder.map((b) => <p key={b}>{b}</p>)}</Sectie> : null}
          {!kinderen.length && !demo.length && !extra.length && !taken.length && !bijzonder.length && !wissel ? <p className="py-3 text-sm text-ink-soft">{t("routes.agenda.dagSheet.niets")}</p> : null}
        </div>
        <button onClick={onToevoegen} className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-md border border-brand/40 py-3 text-sm font-semibold text-brand"><Plus aria-hidden="true" className="size-4 shrink-0"/>{t("routes.agenda.dagSheet.plusToevoegen").replace(/^\+\s*/, "")}</button>
        {onWijziging ? <button onClick={onWijziging} className="mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md py-2 text-sm font-semibold text-brand"><ArrowLeftRight aria-hidden="true" className="size-4 shrink-0"/>{t("routes.agenda.dagSheet.wijzigingVoorstellen")}</button> : null}
      </SheetContent>
    </Sheet>);
}
function ExtraAfspraakRij({ v, onOpen, wacht, onAkkoord }) {
    const { t } = useTranslation();
    const { a } = v;
    useAanwezigheid();
    const { taken } = useTaken();
    const aan = a.gedeeld !== false ? aanwezigVoor(a.id) : undefined;
    const aanTaak = aan?.contactTaakId ? taken.find((t) => t.id === aan.contactTaakId) : undefined;
    const aanRegel = aan && !wacht ? statusRegel(aan, aanTaak?.contactStatus) : null;
    return (<div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-center gap-3">
        <button onClick={() => onOpen(v)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={t("routes.agenda.openen", { titel: a.titel })}>
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-lg"><Pictogram waarde={categorieMeta[a.categorie]?.icoon ?? "overig"} maat="md" vorm="kaal"/></div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{a.titel}</p>
            <p className="text-xs text-ink-soft">
              {dt(v.datum).toLocaleDateString(taalLocale(), { day: "numeric", month: "long" })}{a.tijd ? ` · ${uur(a.tijd)}` : ""} · {kindWeergave(a.kind)}
              {a.herhaling && a.herhaling.freq !== "geen" ? ` · ${freqLabel[a.herhaling.freq].toLowerCase()}` : ""}
              {a.gedeeld === false ? <span className="ml-1.5 rounded-full border border-border px-1.5 py-px text-[11px] font-semibold">{t("routes.agenda.prive")}</span> : null}
            </p>
            {wacht ? <p className="text-[11px] font-semibold text-ink-soft">{wacht.mine === false ? t("routes.agenda.voorstellen.jouwReactie") : t("routes.agenda.reactieOpen")}</p> : null}
            {aanRegel ? <p className="text-[11px] text-ink-soft">{aanRegel}</p> : null}
          </div>
        </button>
        <GeschiedenisKnop soort="afspraak" itemId={a.id} naam={a.titel}/>
      </div>
      {wacht && onAkkoord ? (<div className="mt-2 flex gap-2 pl-14 text-xs font-semibold">
          <button onClick={() => onOpen(v)} className="min-h-[36px] rounded-full border border-border px-3.5 text-ink-soft">{t("routes.agenda.bekijkVoorstel")}</button>
        </div>) : null}
    </div>);
}
const freqTekst = (h) => (h && h.freq !== "geen" ? freqLabel[h.freq] : i18n.t("routes.agenda.nietHerhalend"));
/** Detailweergave van een afspraak met een rustige ••• knop: alleen opties die bij deze afspraak passen. */
function AfspraakDetail({ v, direct, wacht, ingetrokken, onSluit, onActie, onIntrekken, onAkkoord, onReageer }) {
    const { t } = useTranslation();
    const [menu, setMenu] = useState(false);
    useEffect(() => setMenu(false), [v]);
    if (!v)
        return null;
    const { a } = v;
    const gedeeld = !direct;
    const reeks = !!a.herhaling && a.herhaling.freq !== "geen";
    const opties = [
        ...(gedeeld ? [] : [{ id: "aanpassen", label: t("routes.agenda.detail.aanpassen") }]),
        { id: "verplaatsen", label: t("routes.agenda.detail.verplaatsen") },
        { id: "verwijderen", label: t("common.verwijderen") },
        ...(reeks ? [{ id: "herhaling", label: t("routes.agenda.herhalenAanpassen") }] : []),
        ...(gedeeld ? [{ id: "aanpassen", label: t("routes.agenda.detail.voorstelWijziging") }] : []),
    ];
    const rij = (l, w) => (w ? <div className="flex justify-between gap-3 py-2"><dt className="text-ink-soft">{l}</dt><dd className="text-right font-semibold">{w}</dd></div> : null);
    if (ingetrokken)
        return <Sheet open onOpenChange={(o) => !o && onSluit()}><SheetContent side="bottom" className="left-1/2 w-full max-w-md -translate-x-1/2 rounded-t-2xl bg-background"><SheetHeader><SheetTitle>{a.titel}</SheetTitle><SheetDescription>{t("routes.agenda.detail.ingetrokken")}</SheetDescription></SheetHeader><div className="mt-3 flex items-center gap-2"><GeschiedenisKnop soort="afspraak" itemId={a.id} naam={a.titel}/><span className="text-sm">{t("routes.agenda.geschiedenis")}</span></div></SheetContent></Sheet>;
    return (<Sheet open onOpenChange={(o) => !o && onSluit()}>
      <SheetContent side="bottom" className="left-1/2 max-h-[90dvh] w-full max-w-md -translate-x-1/2 overflow-y-auto rounded-t-2xl bg-background px-5 pb-8">
        <SheetHeader className="pr-20 text-left">
          <SheetTitle className="font-display text-xl font-medium">{a.titel}</SheetTitle>
          <SheetDescription>{lang(v.datum)}{a.tijd ? ` · ${uur(a.tijd)}` : ""}</SheetDescription>
        </SheetHeader>
        {!wacht ? (<button onClick={() => setMenu((m) => !m)} aria-label={t("routes.agenda.meerOpties")} aria-expanded={menu} className="absolute right-12 top-4 grid size-8 place-items-center rounded-full text-ink-soft hover:bg-secondary">
            <MoreHorizontal className="size-5" strokeWidth={1.6}/>
          </button>) : null}
        {!wacht ? <BewerkPotlood onClick={() => onActie("aanpassen")} label={gedeeld ? t("routes.agenda.wijzigingVoorstellen") : t("routes.agenda.afspraakBewerken")} className="right-20! top-2!"/> : null}
        {menu ? (<div className="mt-3 divide-y divide-border rounded-md border border-border bg-card">
            {opties.map((o) => <button key={o.label} onClick={() => onActie(o.id)} className="block w-full px-4 py-3 text-left text-sm font-semibold">{o.label}</button>)}
            <Link to="/kosten" search={{ uitgave: a.titel }} onClick={onSluit} className="block w-full px-4 py-3 text-left text-sm font-semibold">{t("routes.agenda.detail.kosten")}</Link>
          </div>) : null}
        <dl className="mt-4 divide-y divide-border border-y border-border text-sm">
          {rij(t("routes.agenda.rij.kind"), kindWeergave(a.kind))}
          {rij(t("routes.agenda.rij.soort"), categorieMeta[a.categorie]?.label)}
          {rij(t("routes.agenda.rij.locatie"), a.locatie)}
          {rij(t("routes.agenda.rij.herhaling"), freqTekst(a.herhaling))}
          {rij(t("routes.agenda.rij.herinnering"), a.herinnering && a.herinnering !== "geen" ? herinneringLabel[a.herinnering] : undefined)}
          {rij(t("routes.agenda.rij.zichtbaar"), a.gedeeld !== false ? t("routes.agenda.rij.beideOuders") : t("routes.agenda.rij.alleenJij"))}
        </dl>
        {a.toelichting ? <p className="mt-3 text-sm text-ink-soft">{a.toelichting}</p> : null}
        {a.gedeeld !== false && !wacht ? <AanwezigheidBlok afspraakId={a.id} titel={a.titel} kind={a.kind} datum={v.datum}/> : null}
        {a.gedeeld !== false ? <div className="mt-3 flex items-center gap-2 text-xs text-ink-soft"><GeschiedenisKnop soort="afspraak" itemId={a.id} naam={a.titel}/><span>{t("routes.agenda.geschiedenis")}</span></div> : null}
        {!wacht ? (<div className="mt-4 grid grid-cols-2 gap-2 text-sm font-semibold">
            <button onClick={() => onActie("aanpassen")} className="min-h-[44px] rounded-md border border-brand/40 text-brand">{gedeeld ? t("routes.agenda.wijzigingVoorstellen") : t("common.bewerken")}</button>
            <button onClick={() => onActie("verwijderen")} className="min-h-[44px] rounded-md border border-border text-ink-soft">{t("routes.agenda.detail.verwijderen")}</button>
          </div>) : null}
        {gedeeld && !wacht ? <p className="mt-3 text-[11px] text-ink-soft">{t("routes.agenda.detail.gedeeld")}</p> : null}
        {wacht ? (<div className="mt-4 rounded-md border border-border bg-card p-3 text-sm">
            <p className="font-semibold">{wacht.mine === false ? (wacht.soort === "nieuw" ? t("routes.agenda.detail.vanAnder.nieuw") : wacht.soort === "verwijder" ? t("routes.agenda.detail.vanAnder.verwijder") : t("routes.agenda.detail.vanAnder.wijzig")) : wacht.soort === "nieuw" ? t("routes.agenda.detail.wacht.nieuw") : wacht.soort === "verwijder" ? t("routes.agenda.detail.wacht.verwijder") : t("routes.agenda.detail.wacht.wijzig")}</p>
            {wacht.velden ? <p className="mt-1 text-xs text-ink-soft">{t("routes.agenda.detail.nieuw")} {lang(wacht.velden.datum)}{wacht.velden.tijd ? ` · ${uur(wacht.velden.tijd)}` : ""}{wacht.velden.titel !== a.titel ? ` · ${wacht.velden.titel}` : ""}</p> : null}
            <p className="mt-1 text-xs text-ink-soft">{t("routes.agenda.detail.reactieOpen")}</p>
            {wacht.meerTijd ? <p className="mt-1 text-xs text-ink-soft">{wacht.meerTijd.mine ? t("routes.agenda.detail.jijMeerTijd") : t("routes.agenda.detail.anderMeerTijd")}</p> : null}
            {wacht.mine === false && onReageer ? (<div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                <Button size="sm" onClick={() => onReageer("akkoord")}>{t("common.akkoord")}</Button>
                <Button size="sm" variant="outline" onClick={() => onReageer("ander-voorstel")}>{t("common.anderVoorstel")}</Button>
                <Button size="sm" variant="ghost" onClick={() => onReageer("niet-akkoord")}>{t("common.nietAkkoord")}</Button>
                {!wacht.meerTijd ? <Button size="sm" variant="ghost" onClick={() => onReageer("meer-tijd")}>{t("common.meerTijdNodig")}</Button> : null}
              </div>) : (<div className="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold">
              <VoorstelIntrekken onBevestig={onIntrekken}/>
            </div>)}
          </div>) : null}
      </SheetContent>
    </Sheet>);
}
/** Detail van een vaste (voorbeeld)afspraak: wijzigen loopt via een voorstel. */
function VasteAfspraakSheet({ open, onSluit, a, onActie }) {
    const { t } = useTranslation();
    const [menu, setMenu] = useState(false);
    return (<Sheet open={open} onOpenChange={(o) => !o && onSluit()}>
      <SheetContent side="bottom" className="left-1/2 w-full max-w-md -translate-x-1/2 rounded-t-2xl bg-background px-5 pb-8">
        <SheetHeader className="pr-20 text-left">
          <SheetTitle className="font-display text-xl font-medium">{a.titel}</SheetTitle>
          <SheetDescription>{a.datumLabel} · {uur(a.tijd)} · {kindWeergave(a.kind)}</SheetDescription>
        </SheetHeader>
        <button onClick={() => setMenu((m) => !m)} aria-label={t("routes.agenda.meerOpties")} className="absolute right-12 top-4 grid size-8 place-items-center rounded-full text-ink-soft hover:bg-secondary"><MoreHorizontal className="size-5" strokeWidth={1.6}/></button>
        {menu ? (<div className="mt-3 divide-y divide-border rounded-md border border-border bg-card">
            <Button variant="ghost" className="w-full justify-start" onClick={() => onActie("tijd")}><AppIcon functie="tijd" maat="sm" vorm="kaal"/>{t("routes.agenda.tijdWijzigen")}</Button>
            <Button variant="ghost" className="w-full justify-start" onClick={() => onActie("locatie")}><AppIcon functie="locatie" maat="sm" vorm="kaal"/>{t("routes.agenda.locatieWijzigen")}</Button>
            <Button variant="ghost" className="w-full justify-start" onClick={() => onActie("verwijderen")}><AppIcon functie="niet" maat="sm" vorm="kaal"/>{t("routes.agenda.annuleren.knop")}</Button>
          </div>) : null}
        <p className="mt-4 text-sm">{a.locatie}</p>
        <Button variant="outline" onClick={() => onActie("aanpassen")} className="mt-4 w-full">{t("routes.agenda.afspraakBewerken")}</Button>
        <p className="mt-3 text-xs text-ink-soft">{t("routes.agenda.vast.uitleg")}</p>
      </SheetContent>
    </Sheet>);
}
function AfspraakRij({ id, onActie }) {
    const { t } = useTranslation();
    const a = afspraken.find((x) => x.id === id);
    const bijSanne = a?.ouder === "sanne";
    const [open, setOpen] = useState(false);
    // Vanuit zoeken: dit item direct in beeld en open, zonder opnieuw te zoeken.
    const doel = useRouterState({ select: (s) => s.location.hash }) === `item-${id}`;
    useEffect(() => { if (doel)
        setOpen(true); }, [doel]);
    if (!a)
        return null;
    const isWisselMoment = a.categorie === "wissel";
    const inhoud = (<>
      <div className={`grid size-11 shrink-0 place-items-center rounded-xl text-lg ${bijSanne ? "bg-brand-soft" : "bg-accent-soft"}`}><Pictogram waarde={categorieMeta[a.categorie].icoon} maat="md" vorm="kaal"/></div>
      <div className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm font-semibold">{a.titel}</p>
        <p className="text-xs text-ink-soft">{a.datumLabel} · {uur(a.tijd)} · {kindWeergave(a.kind)}</p>
        <p className="text-[11px] text-ink-soft/80">{a.locatie}</p>
      </div>
    </>);
    return (<div id={`item-${a.id}`} className="zoekdoel flex items-center gap-3 rounded-md border border-border bg-card p-3">
      <button onClick={() => setOpen(true)} className="flex min-w-0 flex-1 items-center gap-3" aria-label={t("routes.agenda.rijOpenen", { titel: isWisselMoment ? t("routes.agenda.wisselmoment") : a.titel, datum: a.datumLabel, tijd: a.tijd })}>{inhoud}</button>
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${bijSanne ? "bg-brand-soft text-brand" : "bg-accent-soft text-accent-warm"}`}>{bijSanne ? t("routes.agenda.bijJou") : t("routes.agenda.bijAnder")}</span>
      <GeschiedenisKnop soort="afspraak" itemId={a.id} naam={a.titel}/>
      {isWisselMoment ? <WisselmomentSheet open={open} onSluit={() => setOpen(false)} a={a}/> : <VasteAfspraakSheet open={open} onSluit={() => setOpen(false)} a={a} onActie={(actie) => { setOpen(false); onActie(actie); }}/>}
    </div>);
}
/** Detail van een wisselmoment: direct vanuit de Agenda, met alleen relevante acties. */
function WisselmomentSheet({ open, onSluit, a }) {
    const { t } = useTranslation();
    const router = useRouter();
    const vk = useVoorkeuren();
    const wisselDatum = `2025-03-${String(a.dag).padStart(2, "0")}`;
    const { spullen } = useTaken();
    const aantalMee = spullen.filter((s) => s.type === "mee").length;
    const knop = "w-full rounded-md border border-border px-4 py-3 text-left text-sm font-semibold";
    return (<Sheet open={open} onOpenChange={(o) => !o && onSluit()}>
      <SheetContent side="bottom" className="left-1/2 w-full max-w-md -translate-x-1/2 rounded-t-2xl bg-background px-5 pb-8">
        <SheetHeader className="pr-8 text-left">
          <SheetTitle className="font-display text-xl font-medium">{t("routes.agenda.wisselmoment")}</SheetTitle>
          <SheetDescription className="text-sm text-ink">{a.datumLabel} · {uur(a.tijd)}</SheetDescription>
        </SheetHeader>
        <dl className="mt-3 divide-y divide-border border-y border-border text-sm">
          <div className="flex justify-between py-2.5"><dt className="text-ink-soft">{t("routes.agenda.rij.locatie")}</dt><dd className="font-semibold">{a.locatie}</dd></div>
          <div className="flex justify-between py-2.5"><dt className="text-ink-soft">{t("routes.agenda.rij.kind")}</dt><dd className="font-semibold">{kindWeergave(a.kind)}</dd></div>
          <div className="flex justify-between py-2.5"><dt className="text-ink-soft">{t("routes.agenda.wissel.mee")}</dt><dd className="font-semibold">{t("routes.agenda.wissel.dingen", { count: aantalMee })}</dd></div>
        </dl>
        <div className="mt-4 space-y-2">
          <Button variant="outline" className={knop} onClick={() => router.navigate({ to: "/overdracht", search: { moment: wisselDatum } })}>{t("routes.agenda.wissel.bekijken")}</Button>
          {magOverdrachtVoorbereiden(wisselDatum, a.tijd, new Date(), vk.overdrachtHulp) ? <Button variant="outline" className={knop} onClick={() => router.navigate({ to: "/overdracht", search: { moment: wisselDatum } })}>{t("routes.agenda.wissel.voorbereiden")}</Button> : null}
          <button className={knop} onClick={() => router.navigate({ to: "/agenda", search: { zorgActie: "wijziging", dag: wisselDatum } })}>{t("routes.agenda.wijzigingVoorstellen")}</button>
          {a.locatie ? <a className={`${knop} block`} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.locatie)}`} target="_blank" rel="noreferrer">{t("routes.agenda.wissel.route")}</a> : null}
        </div>
      </SheetContent>
    </Sheet>);
}
/** "Wie is waar" alleen als de agenda het zelf niet laat zien: kinderen op verschillende plekken of een uitzondering (logeren, oppas). Een wisseldag heeft al de groene Wisseldag-regel met tijd. */
function wieIsWaarNodig(kinderen) {
    if (!kinderen.length)
        return false;
    if (kinderen.some((k) => k.uitzondering))
        return true;
    return new Set(kinderen.map((k) => k.ouder)).size > 1;
}
