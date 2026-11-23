import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useStart } from "@/lib/start-store";
import { useActiesVerwerkt } from "@/lib/acties-store";
import { useVakanties } from "@/lib/vakantie-store";
import { useTaken } from "@/lib/taken-store";
import { useGezagState } from "@/lib/gezag-store";
import { AppShell, BackButton } from "@/components/AppShell";
import { MeerSectie, type MeerLijstItem } from "@/components/MeerLijst";
import { AppIcon } from "@/components/AppIcon";
import { ProfielBeeld } from "@/components/ProfielBeeld";

export const Route = createFileRoute("/meer")({
  head: () => ({
    meta: [
      { title: "Menu — Ouderschap & Co" },
      { name: "description", content: "Documenten, kinderen, afspraken, verdeling van de week, professionals en instellingen." },
      { property: "og:title", content: "Menu — Ouderschap & Co" },
      { property: "og:description", content: "Alle onderdelen van Ouderschap & Co op één plek." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Meer,
});

const gezin: MeerLijstItem[] = [
  { to: "/kinderen", icoon: "kinderen", titel: "Kinderen", tekst: "Profielen, school, zorg en contacten" },
  { to: "/taken", icoon: "taken", titel: "Taken", tekst: "Wie regelt wat en wat moet nog gebeuren." },
  { to: "/boodschappen", icoon: "boodschappen", titel: "Nog nodig", tekst: "Wat hebben de kinderen nog nodig?" },
  { to: "/spullen", icoon: "doos", titel: "Spullen", tekst: "Wat moet mee en waar liggen de spullen." },
  { to: "/momentjes", icoon: "momentjes", titel: "Momentjes", tekst: "Leuke momenten met elkaar delen" },
  { to: "/documenten", icoon: "documenten", titel: "Documenten", tekst: "Belangrijke documenten op één plek" },
];

const planning: MeerLijstItem[] = [
  { to: "/zorgregeling", icoon: "zorgregeling", titel: "Verdeling van de week", tekst: "Wanneer de kinderen bij wie zijn" },
  { to: "/samen-regelen", icoon: "samen", titel: "Samen regelen", tekst: "Ruilen, voorstellen en afspraken maken" },
  { to: "/planning", icoon: "vakantie", titel: "Vakanties & bijzondere dagen", tekst: "Vakanties verdelen en samen vooruit plannen" },
];

const ondersteuning: MeerLijstItem[] = [
  { to: "/verhaal", icoon: "berichten", titel: "Even je verhaal kwijt bij Co?", tekst: "Soms is het fijn om eerst je gedachten te ordenen." },
  { to: "/ondersteuning", icoon: "ondersteuning", titel: "Begeleiding", tekst: "Wie helpt jullie en wat kan diegene zien?" },
  { to: "/extra-ondersteuning", icoon: "hulp", titel: "Extra hulp", tekst: "Handig als samen regelen lastig is." },
  { to: "/juridische-hulp", icoon: "juridisch", titel: "Juridisch", tekst: "Hulp bij juridische vragen, voorwaarden en privacy" },
];

const account: MeerLijstItem[] = [
  { to: "/instellingen", icoon: "instellingen", titel: "Instellingen", tekst: "Profiel, meldingen, privacy en toegang" },
  { to: "/rondleiding", icoon: "slim", titel: "Rondleiding", tekst: "Stap voor stap door de app, met je eigen gezin" },
  { to: "/welkom", icoon: "hulp", titel: "Hulp & opnieuw beginnen", tekst: "Uitleg en introductie" },
];

/** Extra zoekwoorden per onderdeel, zodat synoniemen ook raken. */
const zoekwoorden: Record<string, string> = {
  "/kinderen": "kind profiel school gezondheid noodkaart",
  "/taken": "taak regelen wie",
  "/boodschappen": "nodig lijstje kopen boodschap",
  "/spullen": "mee overdracht spul",
  "/momentjes": "foto moment leuk",
  "/documenten": "document paspoort papieren",
  "/zorgregeling": "regeling verdeling week schema",
  "/samen-regelen": "ruilen voorstel afspreken",
  "/planning": "vakantie feestdagen bijzondere dagen",
  "/ondersteuning": "begeleiding professional hulpverlener",
  "/extra-ondersteuning": "extra hulp mediation",
  "/juridische-hulp": "juridisch privacy voorwaarden gezag",
  "/instellingen": "instellingen profiel meldingen privacy toegang account",
  "/rondleiding": "rondleiding uitleg start",
  "/welkom": "hulp contact opnieuw beginnen introductie",
};

// Recent gebruikt: alleen op dit apparaat, per gebruiker (localStorage).
const RECENT_SLEUTEL = "onzeapp-meer-recent";
type RecentItem = { to: string; at: number };

function leesRecent(): RecentItem[] {
  try {
    const r = JSON.parse(localStorage.getItem(RECENT_SLEUTEL) ?? "[]") as RecentItem[];
    return Array.isArray(r) ? r.filter((x) => typeof x?.to === "string") : [];
  } catch {
    return [];
  }
}

export function registreerMeerBezoek(to: string) {
  try {
    const rest = leesRecent().filter((x) => x.to !== to);
    localStorage.setItem(RECENT_SLEUTEL, JSON.stringify([{ to, at: Date.now() }, ...rest].slice(0, 6)));
  } catch {
    /* opslag niet beschikbaar: geen recent-lijst */
  }
}

const SCROLL_SLEUTEL = "onzeapp-meer-scroll";

function Meer() {
  // Zelfde bronnen en statussen als Home ("Wacht op jou") en Samen regelen: geen eigen telling.
  const verwerkt = useActiesVerwerkt();
  const vakantie = useVakanties().filter((v) => v.status === "voorstel" && v.van !== "Sanne").length;
  const samen = ["wijzigingsverzoek", "afspraak-voorstel"].filter((id) => !verwerkt.has(id)).length;
  // Eigen gezin: voorbeeldvoorstellen tellen niet mee.
  const startState = useStart();
  const eigen = startState.eigen;
  const taken = useTaken().taken.filter((t) => !t.klaar && (t.overdragenAan === "sanne" || (t.wie === "sanne" && !t.overdragenAan))).length;
  const aantallen: Record<string, number> = eigen ? {} : { "/samen-regelen": samen, "/planning": vakantie, "/taken": taken };
  // Alleen hulpmiddelen die echt zijn gebruikt, komen later als extra ingang terug.
  const { gebruikt } = useGezagState();
  const namen: Record<string, MeerLijstItem> = {
    "/afspraken": { to: "/afspraken", icoon: "veiligheid", titel: "Afspraken", tekst: "Wat jullie samen hebben vastgelegd" },
    "/beslissingen": { to: "/beslissingen", icoon: "voorstel", titel: "Beslissingen", tekst: "Voorstellen en uitkomsten" },
    "/contact": { to: "/contact", icoon: "berichten", titel: "Contact makkelijker maken", tekst: "Bellen en afspraken over contact" },
    "/halen-brengen": { to: "/halen-brengen", icoon: "overdracht", titel: "Halen en brengen", tekst: "Afspraken en de volgende overdracht" },
    "/tijdlijn": { to: "/tijdlijn", icoon: "geschiedenis", titel: "Tijdlijn", tekst: "Wat er eerder is veranderd" },
    "/exporteren": { to: "/exporteren", icoon: "exporteren", titel: "Overzicht maken", tekst: "Informatie bewaren of delen" },
  };
  const hulpmiddelen = gebruikt.map((p) => namen[p]).filter((x): x is MeerLijstItem => !!x);

  const alle = useMemo(
    () => [...gezin, ...planning, ...ondersteuning, ...account, ...hulpmiddelen],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gebruikt.join(",")],
  );

  const [zoek, setZoek] = useState("");
  const [recent, setRecent] = useState<RecentItem[]>([]);
  useEffect(() => setRecent(leesRecent()), []);

  // Scrollpositie bewaren bij terugkeer naar Meer.
  const hersteld = useRef(false);
  useEffect(() => {
    if (hersteld.current) return;
    hersteld.current = true;
    const y = Number(sessionStorage.getItem(SCROLL_SLEUTEL) ?? 0);
    if (y > 0) window.scrollTo(0, y);
    const bewaar = () => sessionStorage.setItem(SCROLL_SLEUTEL, String(window.scrollY));
    window.addEventListener("scroll", bewaar, { passive: true });
    return () => window.removeEventListener("scroll", bewaar);
  }, []);

  const q = zoek.trim().toLowerCase();
  const resultaten = q
    ? alle.filter((i) => `${i.titel} ${i.tekst} ${zoekwoorden[i.to] ?? ""}`.toLowerCase().includes(q))
    : [];

  // Snel naar: 1) open acties, 2) recent gebruikt (nieuwste eerst), 3) standaardonderdelen. Elk onderdeel één keer.
  const metAantal = (i: MeerLijstItem) => ({ ...i, aantal: aantallen[i.to] ?? 0 });
  const acties = alle.filter((i) => (aantallen[i.to] ?? 0) > 0).sort((x, y) => (aantallen[y.to] ?? 0) - (aantallen[x.to] ?? 0));
  const recentAlle = recent.map((r) => alle.find((i) => i.to === r.to)).filter((x): x is MeerLijstItem => !!x);
  const uniek = [...acties, ...recentAlle, ...gezin].filter((i, n, a) => a.findIndex((x) => x.to === i.to) === n);
  const snel = uniek.slice(0, 6).map(metAantal);
  const overigeActies = acties.slice(6);

  const gebruikersnaam = (typeof eigen === "object" && eigen ? (eigen as { ouderNaam?: string }).ouderNaam : "")?.trim() || "Sanne";
  const initiaal = gebruikersnaam.charAt(0).toUpperCase();

  return (
    <AppShell>
      <div className="flex items-start gap-3">
        <BackButton terug="/" />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-extrabold">Menu</h1>
          <p className="mt-1 text-sm text-ink-soft">Alles rondom jullie gezin, overzichtelijk bij elkaar.</p>
        </div>
        <Link
          to="/instellingen"
          aria-label={`Profiel en instellingen van ${gebruikersnaam}`}
          onClick={() => registreerMeerBezoek("/instellingen")}
          className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-soft font-display text-base font-bold text-brand transition-transform active:scale-95"
        >
          {startState.eigen && startState.beeld ? <ProfielBeeld beeld={startState.beeld} naam={gebruikersnaam} maat={44} /> : initiaal}
        </Link>
      </div>

      {/* Zoeken binnen Meer */}
      <div className="mt-4">
        <label className="flex items-center gap-2.5 rounded-full border border-border bg-card px-4 py-3 focus-within:border-brand">
          <AppIcon functie="slim" maat="sm" vorm="kaal" className="text-ink-soft" />
          <input
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            placeholder="Zoek in het menu..."
            aria-label="Zoek in het menu"
            className="w-full bg-transparent text-sm outline-none placeholder:text-ink-soft/70"
          />
        </label>
        {q ? (
          <div className="mt-2 rounded-2xl border border-border bg-card p-1.5">
            {resultaten.length === 0 ? (
              <p className="px-3 py-2.5 text-sm text-ink-soft">Niets gevonden voor “{zoek.trim()}”. Probeer een ander woord.</p>
            ) : (
              resultaten.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => registreerMeerBezoek(item.to)}
                  className="flex min-h-[48px] items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-muted/60"
                >
                  <AppIcon functie={item.icoon} maat="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">{item.titel}</span>
                    <span className="block truncate text-xs text-ink-soft">{item.tekst}</span>
                  </span>
                  <span aria-hidden="true" className="text-lg text-ink-soft/70">›</span>
                </Link>
              ))
            )}
          </div>
        ) : null}
      </div>

      {/* Snel naar: zes ronde pictogrammen */}
      <section className="mt-7">
        <h2 className="font-display text-base font-semibold text-ink-soft">Snel naar</h2>
        <div className="mt-3 grid grid-cols-3 gap-x-3 gap-y-5">
          {snel.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => registreerMeerBezoek(item.to)}
              className="group flex flex-col items-center gap-2 rounded-2xl py-1 transition-transform active:scale-95"
            >
              <span className="relative transition-transform group-hover:scale-105">
                <AppIcon functie={item.icoon} maat="lg" />
                {item.aantal ? <span aria-hidden="true" className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-[color-mix(in_oklch,var(--ic-koraal)_22%,var(--background))] text-[11px] font-bold text-ink">{item.aantal}</span> : null}
              </span>
              <span className="text-center text-xs font-semibold leading-tight text-ink">{item.titel}</span>
              {item.aantal ? <span className="sr-only">{item.aantal} wacht op jou</span> : null}
            </Link>
          ))}
        </div>
        {overigeActies.length > 0 ? (
          <p className="mt-4 text-center text-xs text-ink-soft">
            Nog {overigeActies.length} {overigeActies.length === 1 ? "onderdeel wacht" : "onderdelen wachten"} op jou: {overigeActies.map((i, n) => (
              <span key={i.to}>{n > 0 ? ", " : ""}<Link to={i.to} onClick={() => registreerMeerBezoek(i.to)} className="font-semibold text-brand underline-offset-2 hover:underline">{i.titel}</Link></span>
            ))}
          </p>
        ) : null}
      </section>

      {/* Alle overige onderdelen */}
      <section className="mt-10">
        <h2 className="font-display text-base font-semibold text-ink-soft">Alle onderdelen</h2>
        {[
          { titel: "Gezin & dagelijks", items: gezin },
          { titel: "Plannen & afstemmen", items: [...planning, ...hulpmiddelen] },
          { titel: "Ondersteuning & informatie", items: ondersteuning },
          { titel: "Account & instellingen", items: account },
        ].map((c) => (
          <MeerSectie key={c.titel} titel={c.titel} klein items={c.items.map((i) => ({ ...i, aantal: aantallen[i.to] ?? 0 }))} />
        ))}
      </section>
    </AppShell>
  );
}
