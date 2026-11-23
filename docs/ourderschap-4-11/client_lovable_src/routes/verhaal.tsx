import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
import { AppIcon } from "@/components/AppIcon";
import { HulpKaart } from "@/components/Onveilig";
import { Button } from "@/components/ui/button";
import { useStart } from "@/lib/start-store";
import { useVakanties } from "@/lib/vakantie-store";
import { useTaken, taakWieTekst } from "@/lib/taken-store";
import { useActiesVerwerkt } from "@/lib/acties-store";
import { onderlingeAfspraken } from "@/lib/demo-data";
import { praatVerhaal } from "@/lib/verhaal.functions";
import {
  actieInfo, bewaarGesprek, bouwVerhaalContext, categorieLabel, contextCategorieen, kiesActies, leesBewaard, leesToestemming,
  verwijderBewaard, zetToestemming, zorgSignaal, type Toestemming, type VerhaalBericht, type VerhaalModus,
} from "@/lib/verhaal";

export const Route = createFileRoute("/verhaal")({
  head: () => ({
    meta: [
      { title: "Even je verhaal kwijt bij Co? — Ouderschap & Co" },
      { name: "description", content: "Soms is het fijn om eerst je gedachten te ordenen. Een privé gesprek, niets gaat naar de andere ouder." },
      { property: "og:title", content: "Even je verhaal kwijt bij Co? — Ouderschap & Co" },
      { property: "og:description", content: "Soms is het fijn om eerst je gedachten te ordenen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Verhaal,
});

const modi: { id: VerhaalModus; titel: string; tekst: string }[] = [
  { id: "praten", titel: "Even praten", tekst: "Vertel wat je bezighoudt." },
  { id: "overzicht", titel: "Overzicht krijgen", tekst: "Bekijk wat er speelt en wat is afgesproken." },
  { id: "doen", titel: "Wat kan ik doen?", tekst: "Kijk rustig naar een volgende stap." },
];

function Verhaal() {
  const eigen = !!useStart().eigen;
  const vakanties = useVakanties();
  const { taken } = useTaken();
  const verwerkt = useActiesVerwerkt();
  const [modus, setModus] = useState<VerhaalModus>("praten");
  const [toestemming, setToestemmingState] = useState<Toestemming>(null);
  const [vraagToestemming, setVraagToestemming] = useState(false);
  const [berichten, setBerichten] = useState<VerhaalBericht[]>([]);
  const [heeftBewaard, setHeeftBewaard] = useState(false);
  const [bewaren, setBewaren] = useState(false);
  const [tekst, setTekst] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [zorg, setZorg] = useState(false);
  const einde = useRef<HTMLDivElement>(null);

  useEffect(() => { setToestemmingState(leesToestemming()); setHeeftBewaard(leesBewaard().length > 0); }, []);
  useEffect(() => { if (bewaren) bewaarGesprek(berichten); }, [bewaren, berichten]);
  useEffect(() => { einde.current?.scrollIntoView({ block: "nearest" }); }, [berichten.length, bezig]);

  const kiesToestemming = (v: Toestemming) => { zetToestemming(v); setToestemmingState(v); setVraagToestemming(false); };
  const kiesModus = (m: VerhaalModus) => { setModus(m); if (m !== "praten" && toestemming === null) setVraagToestemming(true); };

  // Alleen in het voorbeeldgezin zijn er gegevens die deze ouder mag zien; eigen gezin heeft nog geen beveiligde gedeelde bron.
  const contextMag = toestemming === "ja" && !eigen && modus !== "praten";
  const context = contextMag
    ? bouwVerhaalContext({
        vakanties,
        voorstellen: [
          { titel: "Wijzigingsverzoek verdeling van de week", status: verwerkt.has("wijzigingsverzoek") ? "afgehandeld" : "wacht op jouw reactie" },
          { titel: "Voorstel onderlinge afspraak", status: verwerkt.has("afspraak-voorstel") ? "afgehandeld" : "wacht op jouw reactie" },
        ],
        taken: taken.map((t) => ({ tekst: t.tekst, wie: t.wie ? taakWieTekst(t.wie) : "", klaar: t.klaar, overdragenAan: t.overdragenAan })),
        afspraken: onderlingeAfspraken.map((a) => ({ titel: a.titel, tekst: a.tekst })),
      }, contextCategorieen)
    : "";

  const stuur = async (invoer = tekst) => {
    const t = invoer.trim();
    if (!t || bezig) return;
    if (zorgSignaal(t)) setZorg(true);
    const nieuw = [...berichten, { rol: "ouder" as const, tekst: t }];
    setBerichten(nieuw); setTekst(""); setFout(null); setBezig(true);
    try {
      const r = await praatVerhaal({ data: { modus, context, berichten: nieuw.map(({ rol, tekst }) => ({ rol, tekst })) } });
      setBerichten((b) => [...b, { rol: "ai", tekst: r.antwoord, acties: kiesActies(r.acties, modus), concept: r.concept }]);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Het gesprek is even niet bereikbaar.");
    } finally { setBezig(false); }
  };

  const nieuwGesprek = () => { setBerichten([]); setFout(null); setZorg(false); if (bewaren) verwijderBewaard(); setBewaren(false); };

  return (
    <AppShell>
      <PageHeader titel="Even je verhaal kwijt bij Co?" subtitel="Soms is het fijn om eerst je gedachten te ordenen." terug="/meer" />
      <p className="mt-3 text-sm text-ink-soft">Je kunt hier rustig vertellen wat je bezighoudt. Niets gaat naar de andere ouder. Co is een digitale meedenker met AI — geen hulpverlener, en Co kiest geen partij.</p>

      <div role="tablist" aria-label="Wat wil je?" className="mt-4 grid grid-cols-3 gap-2">
        {modi.map((m) => (
          <button key={m.id} role="tab" aria-selected={modus === m.id} onClick={() => kiesModus(m.id)}
            className={`rounded-md border px-2.5 py-2 text-left transition-colors ${modus === m.id ? "border-brand bg-brand-soft" : "border-border bg-card"}`}>
            <span className="block text-sm font-semibold text-ink">{m.titel}</span>
            <span className="mt-0.5 block text-[11px] leading-snug text-ink-soft">{m.tekst}</span>
          </button>
        ))}
      </div>

      {vraagToestemming ? (
        <div className="mt-3 rounded-md border border-border bg-card p-3 text-sm">
          <p className="font-semibold">Mag ik relevante informatie uit de app meenemen?</p>
          <p className="mt-1 text-ink-soft">Dan kan ik je helpen met een overzicht van afspraken, voorstellen en taken die jij mag bekijken.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => kiesToestemming("ja")}>Ja, gebruik relevante informatie</Button>
            <Button size="sm" variant="outline" onClick={() => kiesToestemming("nee")}>Nee, ik wil alleen praten</Button>
          </div>
        </div>
      ) : modus !== "praten" ? (
        <div className="mt-3 flex items-start justify-between gap-3 rounded-md bg-muted/50 px-3 py-2 text-xs text-ink-soft">
          <span>
            {toestemming === "ja"
              ? eigen ? "Toestemming gegeven, maar voor je eigen gezin zijn nog geen gedeelde gegevens veilig beschikbaar." : `Neemt mee (voorbeeldgezin): ${contextCategorieen.map((c) => categorieLabel[c]).join(", ")}. Geen berichten.`
              : "Er worden geen appgegevens meegenomen."}
          </span>
          <button className="shrink-0 font-semibold text-brand underline-offset-2 hover:underline" onClick={() => kiesToestemming(toestemming === "ja" ? "nee" : "ja")}>
            {toestemming === "ja" ? "Intrekken" : "Toestaan"}
          </button>
        </div>
      ) : null}

      <div className="mt-4 space-y-3" aria-live="polite">
        {berichten.length === 0 && heeftBewaard ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-ink-soft">Je hebt een bewaard gesprek.</span>
            <Button size="sm" variant="outline" onClick={() => { setBerichten(leesBewaard()); setBewaren(true); }}>Verder praten</Button>
            <Button size="sm" variant="ghost" onClick={() => { verwijderBewaard(); setHeeftBewaard(false); }}>Verwijderen</Button>
          </div>
        ) : null}
        {berichten.map((b, i) => (
          <div key={i} className={b.rol === "ouder" ? "flex justify-end" : ""}>
            {b.rol === "ouder" ? (
              <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-brand px-3.5 py-2 text-sm text-primary-foreground">{b.tekst}</p>
            ) : (
              <div className="max-w-[90%] text-sm text-ink">
                <p className="whitespace-pre-wrap">{b.tekst}</p>
                {b.acties?.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {b.acties.map((a) => {
                      const info = actieInfo[a];
                      if (a === "bericht") return <Link key={a} to="/berichten" search={b.concept ? { concept: b.concept } : {}} className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold">{info.label}</Link>;
                      if (info.to) return <Link key={a} to={info.to} className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold">{info.label}</Link>;
                      return <button key={a} onClick={() => a === "praten" ? setModus("praten") : stuur("Ik wil er voor nu niets mee doen.")} className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold">{info.label}</button>;
                    })}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ))}
        {bezig ? <p className="text-sm text-ink-soft">Even nadenken…</p> : null}
        {fout ? <div className="text-sm"><p>{fout}</p><Button size="sm" variant="outline" className="mt-2" onClick={() => { const laatst = berichten.at(-1); if (laatst?.rol === "ouder") { setBerichten(berichten.slice(0, -1)); void stuur(laatst.tekst); } }}>Opnieuw proberen</Button></div> : null}
        {zorg ? <div><p className="mb-2 text-sm text-ink">Ik hoor iets wat zorgen geeft. Deze app is geen crisisdienst. Ben je of is je kind in gevaar, zoek dan direct hulp. Bij gedachten aan zelfdoding: 113, bel 0800-0113.</p><HulpKaart /></div> : null}
        <div ref={einde} />
      </div>

      <form className="mt-4" onSubmit={(e) => { e.preventDefault(); void stuur(); }}>
        <label className="sr-only" htmlFor="verhaal-invoer">Wat houdt je bezig?</label>
        <textarea id="verhaal-invoer" value={tekst} onChange={(e) => setTekst(e.target.value)} rows={3} maxLength={3000}
          placeholder={modus === "praten" ? "Vertel wat je bezighoudt…" : modus === "overzicht" ? "Waarover wil je overzicht?" : "Waar wil je een volgende stap in zetten?"}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void stuur(); } }}
          className="w-full resize-none rounded-md border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-brand" />
        <div className="mt-2 flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-ink-soft">
            <input type="checkbox" checked={bewaren} onChange={(e) => { setBewaren(e.target.checked); if (!e.target.checked) { verwijderBewaard(); setHeeftBewaard(false); } }} />
            Bewaren voor later (alleen op dit apparaat)
          </label>
          <Button type="submit" size="sm" disabled={!tekst.trim() || bezig}><AppIcon functie="berichten" maat="sm" vorm="kaal" /> Versturen</Button>
        </div>
      </form>
      {berichten.length ? <button onClick={nieuwGesprek} className="mt-3 text-xs font-semibold text-ink-soft underline-offset-2 hover:underline">Nieuw gesprek beginnen</button> : null}
      <p className="mt-4 text-[11px] text-ink-soft">Niet bewaren betekent: niets op dit apparaat. Je tekst wordt wel voor dit antwoord naar de AI-dienst van Co gestuurd. Gebruik dit nog niet voor echte gevoelige gezinsgegevens; de privacycontrole is nog niet afgerond.</p>
    </AppShell>
  );
}
