import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useBevestigPopup } from "@/lib/feedback";
import { AppShell, Card, PageHeader } from "@/components/AppShell";
import { VoorstelIntrekken } from "@/components/VoorstelIntrekken";
import { RustigTip, useKeuzeTeksten } from "@/components/RustigTip";
import { useState } from "react";
import { useVakanties, vakantieLijst, stelVerdelingVoor, accepteerVakantie, trekVakantieIn, wijsVakantieAf, type Ouder } from "@/lib/vakantie-store";

export const Route = createFileRoute("/vakantie/$id")({
  loader: ({ params }) => {
    const v = vakantieLijst().find((x) => x.id === params.id);
    if (!v) throw notFound();
    return { naam: v.naam, periode: v.periode };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.naam ?? "Vakantie"} — Ouderschap & Co` },
      { name: "description", content: `Alles over ${loaderData?.naam ?? "deze vakantie"} op één plek: verdeling, reis en voorbereiding.` },
      { property: "og:title", content: `${loaderData?.naam ?? "Vakantie"} — Ouderschap & Co` },
      { property: "og:description", content: "Verdeling, reis en voorbereiding van één vakantie bij elkaar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  notFoundComponent: () => (
    <AppShell><PageHeader titel="Vakantie niet gevonden" terug="/planning" /><p className="px-5 text-sm text-ink-soft">Deze vakantie staat er niet meer. <Link to="/planning" className="text-brand underline">Terug naar vakanties</Link></p></AppShell>
  ),
  component: VakantiePagina,
});

function VakantiePagina() {
  const { id } = Route.useParams();
  const v = useVakanties().find((x) => x.id === id);
  const k = useKeuzeTeksten();
  const [melding, setMelding] = useState("");
  useBevestigPopup(melding);
  if (!v) return null;
  const status = v.status === "ingetrokken" ? "Ingetrokken" : v.status === "afgesproken" ? "Afgesproken" : v.status === "voorstel" ? (v.van === "Sanne" ? "Voorstel verstuurd · wacht op antwoord" : `Voorstel van ${v.van} · wacht op jouw antwoord`) : "Nog niet geregeld";
  return (
    <AppShell>
      <PageHeader titel={v.naam} subtitel={v.periode} terug="/planning" />
      <div className="space-y-3 px-5 pb-8">
        <Card>
          <p className="text-xs text-ink-soft">Bij wie</p>
          <p className="font-display text-lg font-bold">{v.ouder}</p>
          <p className="mt-1 text-sm">{status}</p>
          {v.status !== "afgesproken" && <p className="mt-1 text-xs text-ink-soft">Tot er akkoord is, blijft de huidige verdeling van de week gelden.</p>}
          {v.status === "open" && (
            <div className="mt-3 flex gap-2">
              {(["Sanne", "Joris", "Samen"] as Ouder[]).map((o) => (
                <button key={o} onClick={() => stelVerdelingVoor(v.id, o)} className="flex-1 rounded-md bg-surface py-2 text-xs font-medium">{o}</button>
              ))}
            </div>
          )}
          {melding ? <p role="status" className="mt-2 text-sm font-semibold text-brand">{melding}</p> : null}
          {v.status === "voorstel" && v.van && v.van !== "Sanne" && (
            <div className="mt-3 grid gap-2 text-xs font-semibold">
              <button onClick={() => { if (accepteerVakantie(v.id, "Sanne")) setMelding("Afgesproken. Fijn dat er duidelijkheid is."); }} className="min-h-11 rounded-md bg-brand text-primary-foreground">{k.akkoord}</button>
              <button onClick={() => { if (wijsVakantieAf(v.id)) setMelding("Kies hieronder bij wie je de vakantie voorstelt."); }} className="min-h-11 rounded-md border border-border">{k.ander}</button>
              <button onClick={() => { if (wijsVakantieAf(v.id)) setMelding("Je gaat niet akkoord. De vakantie is nog niet geregeld; de verdeling van de week blijft gelden."); }} className="min-h-11 rounded-md border border-border text-ink-soft">{k.niet}</button>
            </div>
          )}
          {v.status !== "afgesproken" ? <div className="mt-2"><RustigTip moment="vakantie" /></div> : null}
          {v.status === "voorstel" && v.van === "Sanne" && (
            <div className="mt-3 flex gap-2 text-xs">
              <VoorstelIntrekken onBevestig={() => trekVakantieIn(v.id)} />
              {import.meta.env.DEV ? <button onClick={() => accepteerVakantie(v.id)} className="flex-1 rounded-md bg-surface py-2 text-ink-soft">Test: andere ouder akkoord</button> : null}
            </div>
          )}
        </Card>
        {v.details && (
          <Card>
            <p className="text-xs text-ink-soft">Reis & afspraken</p>
            <p className="text-sm">{v.details}</p>
          </Card>
        )}
        <Card>
          <p className="mb-2 font-display font-bold">Voorbereiden</p>
          <div className="grid gap-2 text-sm">
            <Link to="/agenda" className="rounded-md bg-surface px-3 py-2">In de agenda bekijken</Link>
            <Link to="/taken" className="rounded-md bg-surface px-3 py-2">Paklijst & taken</Link>
            <Link to="/kosten" className="rounded-md bg-surface px-3 py-2">Kosten van deze vakantie</Link>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
