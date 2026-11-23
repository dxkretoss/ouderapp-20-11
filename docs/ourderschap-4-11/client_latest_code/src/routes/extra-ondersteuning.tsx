import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AppShell, Card, PageHeader } from "@/components/AppShell";
import { markeerGebruikt } from "@/lib/gezag-store";
import { AppIcon } from "@/components/AppIcon";

export const Route = createFileRoute("/extra-ondersteuning")({
  head: () => ({
    meta: [
      { title: "Extra hulp — Ouderschap & Co" },
      { name: "description", content: "Handig als samen regelen lastig is." },
      { property: "og:title", content: "Extra hulp — Ouderschap & Co" },
      { property: "og:description", content: "Handig als samen regelen lastig is." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Extra,
});

type Keuze = { to: "/afspraken" | "/beslissingen" | "/contact" | "/halen-brengen" | "/tijdlijn" | "/exporteren"; i: string; t: string; u: string };
const keuzes: Keuze[] = [
  { to: "/afspraken", i: "veiligheid", t: "Afspraken duidelijk maken", u: "Leg samen vast wat jullie hebben afgesproken." },
  { to: "/beslissingen", i: "voorstel", t: "Samen iets beslissen", u: "Doe een voorstel en leg de uitkomst vast." },
  { to: "/contact", i: "berichten", t: "Contact makkelijker maken", u: "Maak afspraken over hoe jullie contact hebben." },
  { to: "/halen-brengen", i: "overdracht", t: "Halen en brengen regelen", u: "Maak duidelijke afspraken over de overdracht." },
  { to: "/tijdlijn", i: "geschiedenis", t: "Terugkijken", u: "Bekijk wat er eerder is veranderd of afgesproken." },
  { to: "/exporteren", i: "exporteren", t: "Een overzicht maken", u: "Kies informatie die je wilt bewaren of delen." },
];


function Groep({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">{titel}</h2>
      <div className="mt-2 divide-y divide-border rounded-md border border-border bg-card">{children}</div>
    </section>
  );
}

function Extra() {
  return (
    <AppShell>
      <PageHeader titel="Extra hulp" subtitel="Handig als samen regelen lastig is." terug="/ondersteuning" />
      <h2 className="mt-6 font-display text-xl">Waar kunnen we bij helpen?</h2>
      <div className="mt-2 divide-y divide-border rounded-md border border-border bg-card">
        {keuzes.map((k) => {
          const inhoud = (<><AppIcon functie={k.i} maat="md" /><span className="flex-1"><span className="block text-sm font-semibold">{k.t}</span><span className="block text-xs text-ink-soft">{k.u}</span></span><span className="text-ink-soft" aria-hidden>›</span></>);
          return <Link key={k.t} to={k.to} onClick={() => markeerGebruikt(k.to)} className="flex min-h-14 items-center gap-3 px-3 py-3">{inhoud}</Link>;
        })}
      </div>

      <Groep titel="Ook handig">
        <Link to="/gezag" className="flex items-center gap-3 px-3 py-3"><AppIcon functie="juridisch" maat="md" /><span className="flex-1"><span className="block text-sm font-semibold">Gezag & belangrijke afspraken</span><span className="block text-xs text-ink-soft">Wie mag waarover beslissen?</span></span><span className="text-ink-soft" aria-hidden>›</span></Link>
      </Groep>

      <p className="mt-4 text-xs text-ink-soft">Deze hulpmiddelen nemen niemand rechten af. Iemand volgen via locatie bestaat niet in deze app, en privé-informatie wordt nooit automatisch gedeeld.</p>
    </AppShell>
  );
}
