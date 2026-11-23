import { GeschiedenisKnop } from "@/components/Geschiedenis";
import { useBevestigPopup } from "@/lib/feedback";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BewerkPotlood, FilterBalk } from "@/components/ui-kit";
import { accepteer, dienVoorstelIn, huidigeBasis, kindNamen, statusLabel, stelAlternatiefVoor, stuurHerinnering, trekIn, uitzonderingenVan, useZorg, vraagMeerTijd, wijsAf, zorgDag, type KindId, type VoorstelSoort } from "@/lib/zorg-store";
import { magHerinnering } from "@/lib/herinneringen";
import { useGevolgen } from "@/lib/gevolgen";
import { z } from "zod";
import { CalendarRange, Repeat2 } from "lucide-react";
import { AppShell, Card, PageHeader } from "@/components/AppShell";
import { ContextToevoegen } from "@/components/ContextToevoegen";
import { AppIcon } from "@/components/AppIcon";
import { verwerkActie } from "@/lib/acties-store";
import { parents, type ParentId } from "@/lib/demo-data";
import { useStart } from "@/lib/start-store";
import { EigenVandaag } from "@/components/EersteHome";
import { Button } from "@/components/ui/button";
import { VoorstelIntrekken } from "@/components/VoorstelIntrekken";
import { useVoorkeuren } from "@/lib/voorkeuren-store";
import { eerderZonderAkkoord, kiesReminder, nietAkkoordTekst, onderwerpen, reminders } from "@/lib/afstemming";

export const Route = createFileRoute("/zorgregeling")({
  validateSearch: z.object({ actie: z.string().optional(), type: z.enum(["ruil", "nachtje", "regeling"]).optional(), bron: z.string().optional(), omschrijving: z.string().optional(), voorstel: z.string().optional(), kind: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Verdeling van de week — Ouderschap & Co" },
      { name: "description", content: "Bekijk per dag bij wie de kinderen zijn, inclusief wisselmomenten en uitzonderingen." },
      { property: "og:title", content: "Verdeling van de week — Ouderschap & Co" },
      { property: "og:description", content: "Week op, week af — helder in één kalender." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ZorgregelingWrap,
});

function ZorgregelingWrap() {
  const st = useStart();
  return st.eigen ? <AppShell><PageHeader titel="Verdeling van de week" subtitel="Jullie bestaande verdeling." /><EigenVandaag /></AppShell> : <Zorgregeling />;
}

const weekdag = ["zaterdag", "zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag"];
const VANDAAG = 12;

function Zorgregeling() {
  const router = useRouter();
  const zoek = Route.useSearch();
  const actie = zoek.actie === "regeling" || zoek.actie === "wijziging" ? zoek.actie : undefined;
  const zorg = useZorg();
  const [kind, setKind] = useState<KindId>(zoek.kind === "noah" ? "noah" : "emma");
  useEffect(() => {
    const v = zorg.voorstellen.find((v) => v.id === zoek.voorstel);
    const k = v?.kinderen[0];
    if (k) setKind(k);
    if (v) requestAnimationFrame(() => document.getElementById(`item-${v.id}`)?.scrollIntoView({ block: "center" }));
  }, [zoek.voorstel]);
  const [gekozen, setGekozen] = useState<number | null>(null);
  const [andersOpen, setAndersOpen] = useState(false);
  const leeg = 5;
  const dagen = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
  const maand = Array.from({ length: 31 }, (_, i) => ({ datum: i + 1, ...zorgDag(zorg, kind, i + 1) }));
  const normaal = (d: number) => zorgDag({ ...zorg, uitz: [] }, kind, d).ouder;
  const uitzRaw = uitzonderingenVan(zorg, kind);
  const groepen = [...new Set(uitzRaw.map((u) => `${u.reden}|${u.ouder}`))].map((k) => {
    const [reden, ouder] = k.split("|") as [string, ParentId];
    const d = uitzRaw.filter((u) => u.reden === reden && u.ouder === ouder).map((u) => u.dag).sort((a, b) => a - b);
    return { reden, ouder, label: d.length > 1 ? `${d[0]} t/m ${d[d.length - 1]} maart` : `${d[0]} maart` };
  });
  const nuBij = (["emma", "noah"] as KindId[]).map((k) => ({ k, o: zorgDag(zorg, k, VANDAAG).ouder }));
  const zelfde = nuBij.every((x) => x.o === nuBij[0]!.o);
  const nuOuder = maand[VANDAAG - 1]!.ouder;
  const wissel = maand.find((d) => d.datum > VANDAAG && d.ouder !== nuOuder);
  const naam = (o: ParentId) => (o === "sanne" ? "jou" : parents[o].naam);
  const open = (a: "wijziging" | "regeling") => router.navigate({ to: "/zorgregeling", search: { actie: a, bron: "zorgregeling" } });
  const dag = gekozen ? maand[gekozen - 1] : undefined;
  return (
    <AppShell>
      <PageHeader titel="Verdeling van de week" subtitel="Bekijk wanneer de kinderen bij jou of de andere ouder zijn." terug="/" actie={
        <div className="flex items-center gap-1">
          <BewerkPotlood onClick={() => open("regeling")} label="Vaste verdeling aanpassen" />
          <ContextToevoegen titel="Wat wil je aanpassen?" acties={[
            { titel: "Een dag anders verdelen", uitleg: "Bijvoorbeeld een extra dag of weekend.", icoon: Repeat2, onKies: () => open("wijziging") },
            { titel: "De vaste verdeling aanpassen", uitleg: "Bijvoorbeeld andere vaste dagen of een ander wisselmoment.", icoon: CalendarRange, onKies: () => open("regeling") },
          ]} />
        </div>
      } />
      <Verzoeken startActie={actie} kind={kind} sluit={() => router.navigate({ to: "/zorgregeling", search: {}, replace: true })} />
      <div className="mt-4 grid grid-cols-2 gap-4 border-y border-border py-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">Nu</p>
          <p className="mt-1 text-sm font-semibold">{zelfde ? `Emma en Noah zijn bij ${naam(nuBij[0]!.o)}` : nuBij.map((x) => `${kindNamen[x.k]} bij ${naam(x.o)}`).join(" · ")}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">Volgende wissel</p>
          {wissel ? <p className="mt-1 text-sm font-semibold">{weekdag[(wissel.datum - 1) % 7]![0]!.toUpperCase() + weekdag[(wissel.datum - 1) % 7]!.slice(1)} {wissel.datum} maart · 14:30 uur → naar {parents[wissel.ouder].naam}</p> : <p className="mt-1 text-sm text-ink-soft">Deze maand geen wissel meer</p>}
          <Link to="/overdracht" className="mt-1 inline-block text-xs font-semibold text-brand">Overdracht voorbereiden ›</Link>
        </div>
      </div>
      <FilterBalk className="mt-4" opties={[{ id: "emma", label: "Emma" }, { id: "noah", label: "Noah" }] as const} waarde={kind} onChange={(k) => { setKind(k); setGekozen(null); }} />
      <div className="mt-3">
        <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">Bestaande verdeling · maart · {kindNamen[kind]}</p><Button variant="outline" size="sm" onClick={() => open("wijziging")}>Wijziging voorstellen</Button></div>
        <div className="mt-2 grid grid-cols-7 gap-1 text-center">
          {dagen.map((d) => <span key={d} className="text-[11px] font-semibold text-ink-soft">{d}</span>)}
          {Array.from({ length: leeg }).map((_, i) => <span key={`l${i}`} />)}
          {maand.map((d) => {
            const kl = `relative grid h-8 place-items-center rounded-lg text-xs font-semibold ${d.ouder === "sanne" ? "bg-brand-soft text-brand" : "bg-accent-soft text-accent-foreground"} ${d.datum === VANDAAG ? "ring-2 ring-brand" : ""}`;
            return d.uitzondering ? (
              <button key={d.datum} onClick={() => setGekozen(gekozen === d.datum ? null : d.datum)} aria-label={`${d.datum} maart is anders`} className={kl}>
                {d.datum}<span className="absolute right-1 top-1 size-1.5 rounded-full bg-[var(--ic-koraal)]" />
              </button>
            ) : <div key={d.datum} className={kl}>{d.datum}</div>;
          })}
        </div>
        <div className="mt-2 flex gap-4 text-[11px] text-ink-soft">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded bg-brand-soft" /> {parents.sanne.naam}</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded bg-accent-soft" /> {parents.joris.naam}</span>
          <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-[var(--ic-koraal)]" /> Anders dan normaal</span>
        </div>
        {dag?.uitzondering ? (
          <div className="mt-3 border-l-2 border-brand pl-3 text-sm">
            <p className="font-semibold">{weekdag[(dag.datum - 1) % 7]} {dag.datum} maart</p>
            <p className="text-xs text-ink-soft">Normaal: bij {parents[normaal(dag.datum)].naam}</p>
            <p className="text-xs text-ink-soft">Deze keer: bij {parents[dag.ouder].naam}</p>
            <p className="text-xs text-ink-soft">Reden: {dag.uitzondering}</p>
          </div>
        ) : null}
      </div>
      {groepen.length ? (
        <div className="mt-5">
          <button onClick={() => setAndersOpen(!andersOpen)} aria-expanded={andersOpen} className="flex w-full items-center justify-between py-2 text-left">
            <span>
              <span className="block text-sm font-semibold">{uitzRaw.length === 1 ? "1 dag is" : `${uitzRaw.length} dagen zijn`} deze maand anders</span>
              <span className="block text-xs text-ink-soft">{groepen.map((g) => g.reden).join(" · ")}</span>
            </span>
            <span className="text-ink-soft">{andersOpen ? "⌃" : "›"}</span>
          </button>
          {andersOpen ? (
            <ul className="divide-y divide-border border-t border-border">
              {groepen.map((u) => (
                <li key={u.reden + u.ouder} className="flex items-center justify-between py-2.5">
                  <span><span className="block text-sm font-semibold">{u.reden}</span><span className="block text-xs text-ink-soft">{u.label} · alleen deze keer</span></span>
                  <span className="text-xs font-semibold text-brand">Bij {parents[u.ouder].naam}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </AppShell>
  );
}

function Verzoeken({ startActie, kind, sluit }: { startActie: "wijziging" | "regeling" | undefined; kind: KindId; sluit: () => void }) {
  const router = useRouter();
  const zorg = useZorg();
  const doel = Route.useSearch().voorstel;
  const lijst = zorg.voorstellen.filter((v) => v.kinderen.includes(kind) && (!doel || v.id === doel));
  const [bevestigd, setBevestigd] = useState("");
  useBevestigPopup(bevestigd);
  const [eerderOpen, setEerderOpen] = useState(!!doel);
  const reageren = lijst.filter((v) => v.status === "open" && v.van !== "Sanne");
  const eigen = lijst.filter((v) => v.status === "open" && v.van === "Sanne");
  const eerder = lijst.filter((v) => v.status !== "open");
  const vk = useVoorkeuren();
  const ga = vk.gestructureerdAfstemmen;
  const vastgelopen = onderwerpen(lijst).filter((o) => o.geenOvereenstemming);
  const [gesloten, setGesloten] = useState<string[]>([]);
  const reminder = kiesReminder(vastgelopen.length ? "vastgelopen" : reageren.length || startActie ? "voorstel" : null, { aan: ga, veiligheid: false, gesloten });
  const [altId, setAltId] = useState<string | null>(null);
  const [nieuw, setNieuw] = useState(startActie === "regeling" ? "Voorstel voor een andere vaste verdeling: " : "");
  const [soort, setSoort] = useState<VoorstelSoort>(startActie === "regeling" ? "structureel" : "eenmalig");
  const [voor, setVoor] = useState<KindId[]>([kind]);
  const [dagVan, setDagVan] = useState(16);
  const [dagTot, setDagTot] = useState(16);
  const [naar, setNaar] = useState<ParentId>("sanne");
  const voorstelType = Route.useSearch().type;
  const bronOmschrijving = Route.useSearch().omschrijving;
  useEffect(() => setVoor((v) => (v.includes(kind) ? v : [kind])), [kind]);
  useEffect(() => {
    if (!startActie || altId) return;
    setNieuw(bronOmschrijving ?? (startActie === "regeling" ? "Voorstel voor een andere vaste verdeling: " : ""));
    setSoort(startActie === "regeling" ? "structureel" : "eenmalig");
    window.requestAnimationFrame(() => document.querySelector("#nieuw-voorstel")?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, [startActie, altId, bronOmschrijving]);
  const reageer = (id: string, f: () => boolean) => { const ok = f(); if (ok && id === "v1") verwerkActie("wijzigingsverzoek"); return ok; };
  const [reactieDatum, setReactieDatum] = useState("");
  const verstuur = () => {
    const tot = Math.max(dagVan, dagTot);
    if (altId && !reageer(altId, () => stelAlternatiefVoor(altId, nieuw.trim()))) return;
    dienVoorstelIn({
      soort, kinderen: voor, tekst: nieuw.trim(), naarOuder: naar,
      dagen: soort === "eenmalig" ? Array.from({ length: tot - dagVan + 1 }, (_, i) => dagVan + i) : [dagVan],
      datumLabel: soort === "eenmalig" ? (tot > dagVan ? `${dagVan} t/m ${tot} maart` : `${dagVan} maart`) : `Vanaf ${dagVan} maart`,
      aanleiding: soort === "structureel" ? "regeling" : voorstelType ?? "wijziging",
      ...(reactieDatum ? { reactieDatum } : {}),
    });
    setNieuw("");
    setAltId(null);
    setReactieDatum("");
    setBevestigd("Vraag verstuurd. De verdeling verandert pas als de ander ja zegt.");
    sluit();
  };
  const dagOpties = Array.from({ length: 31 }, (_, i) => i + 1);
  const voorstelOuder = (k: KindId, d: number) => soort === "eenmalig" ? naar : zorgDag({ ...zorg, basis: [...zorg.basis, { id: "preview", kind: k, vanafDag: dagVan, eersteOuder: naar, omschrijving: nieuw }] }, k, d).ouder;
  const sel = "mt-1 w-full rounded-xl bg-surface px-3 py-2 text-sm text-ink outline-none";
  const rij = (l: string, w: string) => (
    <div className="flex items-start justify-between gap-3 py-2">
      <dt className="text-ink-soft">{l}</dt>
      <dd className="text-right font-semibold">{w}</dd>
    </div>
  );

  return (
    <section className="mt-5">
      {bevestigd ? <p role="status" className="mb-3 text-sm font-semibold text-brand">✓ {bevestigd}</p> : null}
      {!bevestigd && reminder ? <div className="mb-3 flex items-center gap-2 text-xs text-ink-soft"><AppIcon functie="slim" maat="sm" vorm="kaal" /><span className="flex-1">{reminder.tekst}</span><Button variant="ghost" size="icon" aria-label="Tip sluiten" className="size-11" onClick={() => setGesloten([...gesloten, reminder.moment])}><AppIcon functie="niet" maat="sm" vorm="kaal" /></Button></div> : null}
      {doel ? <Link to="/zorgregeling" className="mb-2 inline-block text-xs font-semibold text-brand">Alle voorstellen bekijken →</Link> : null}
      {reageren.length ? <h2 className="font-display font-bold">Verzoeken om te wijzigen</h2> : null}
      <div className="mt-3 space-y-3">
        {reageren.map((v) => (
          <div key={v.id} id={`item-${v.id}`} className="zoekdoel rounded-2xl border border-border bg-accent-soft p-4">
            <div className="flex items-start justify-between gap-2">
              <span className="flex items-start gap-2.5">
                <AppIcon functie="voorstel" maat="md" />
                <span className="block">
                  <span className="block font-display text-base font-semibold text-ink">Verzoek van {v.van}</span>
                  <span className="block text-xs text-ink-soft">{v.soort === "eenmalig" ? "Eenmalige wijziging" : "De vaste verdeling aanpassen"} · wacht op jouw reactie</span>
                </span>
              </span>
              <GeschiedenisKnop soort="schema" itemId={v.id} naam={v.tekst} />
            </div>
            <p className="mt-3 rounded-xl border-l-2 border-accent-warm bg-surface px-3 py-2.5 text-sm text-ink">
              <span className="sr-only">Het verzoek is: </span>
              ‘{v.tekst}’
            </p>
            <dl className="mt-3 divide-y divide-border border-t border-border text-sm">
              {rij("Kinderen", v.kinderen.map((k) => kindNamen[k]).join(" & "))}
              {rij("Wanneer", v.datumLabel)}
              {rij("Geldt voor", v.soort === "eenmalig" ? "Alleen deze keer" : "Vanaf nu")}
              {v.naarOuder ? rij("Dan bij", v.naarOuder === "sanne" ? "jou" : parents[v.naarOuder].naam) : null}
              {v.reactieDatum ? rij("Graag reactie voor", `${v.reactieDatum} · een verzoek, geen harde grens`) : null}
              {rij("Status", "Nog niets veranderd")}
            </dl>
            {v.alternatief ? <p className="mt-2 text-xs text-ink-soft">↪ {v.alternatief}</p> : null}
            <Gevolgen v={v} />
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                <Button size="sm" onClick={() => { if (reageer(v.id, () => accepteer(v.id))) setBevestigd(ga ? `De verdeling is aangepast. ${reminders.bevestigd}` : "Je hebt ja gezegd. De verdeling is aangepast."); }}>{ga ? "Akkoord" : "Ja, is goed"}</Button>
                <Button variant="outline" size="sm" onClick={() => {
                  setAltId(v.id); setNieuw(v.tekst); setSoort(v.soort); setVoor([...v.kinderen]); setDagVan(v.dagen[0] ?? 16); setDagTot(v.dagen.at(-1) ?? 16); setNaar(v.naarOuder ?? "sanne");
                  router.navigate({ to: "/zorgregeling", search: { actie: v.soort === "structureel" ? "regeling" : "wijziging", voorstel: v.id, kind } });
                }}>{ga ? "Ander voorstel" : "Ander voorstel doen"}</Button>
                <Button variant="ghost" size="sm" onClick={() => { if (reageer(v.id, () => wijsAf(v.id))) setBevestigd(ga ? nietAkkoordTekst(true) : "Voorstel afgewezen. Er verandert niets."); }}>{ga ? "Niet akkoord" : "Afwijzen"}</Button>
                <Button variant="ghost" size="sm" onClick={() => { if (vraagMeerTijd(v.id)) setBevestigd("Je hebt meer tijd gevraagd. Het voorstel blijft open; er verandert niets."); }}>Meer tijd nodig</Button>
              </div>
          </div>
        ))}
      </div>
      {eigen.length ? (
        <div className="mt-3 divide-y divide-border rounded-xl border border-border bg-surface px-3">
          {eigen.map((v) => {
            const oordeel = magHerinnering({ verstuurd: v.herinneringen ?? [], reactieDatum: v.reactieDatum, gepauzeerd: vk.herinneringenGepauzeerd });
            return (
            <div key={v.id} id={`item-${v.id}`} className="zoekdoel flex items-center justify-between gap-2 py-2.5">
              <span><span className="block text-sm">Jouw vraag: {v.datumLabel}</span><span className="block text-xs text-ink-soft">{v.tekst}</span><span className="block text-xs text-ink-soft">Wacht op antwoord · nog niets veranderd{v.reactieDatum ? ` · graag reactie voor ${v.reactieDatum}` : ""}{v.meerTijd ? " · de ander heeft meer tijd gevraagd" : ""}</span></span>
              <span className="flex shrink-0 items-center gap-1">
                {oordeel.mag ? <Button variant="ghost" size="sm" className="text-xs" onClick={() => { if (stuurHerinnering(v.id)) setBevestigd("Herinnering verstuurd. De ander kan reageren wanneer daar gelegenheid voor is."); }}>Herinnering sturen</Button> : null}
                <VoorstelIntrekken onBevestig={() => { if (trekIn(v.id)) setBevestigd("Voorstel ingetrokken. De verdeling blijft gelden."); }} />
              </span>
            </div>
            );
          })}
        </div>
      ) : null}
      {ga ? vastgelopen.map((o) => (
        <div key={o.sleutel} className="mt-3 rounded-xl border border-border bg-surface p-3 text-sm">
          <p className="font-semibold">Nog niet geregeld · {o.laatste.datumLabel}</p>
          <ul className="mt-1 space-y-0.5 text-xs text-ink-soft">{o.voorstellen.map((v) => <li key={v.id}>{v.van === "Sanne" ? "Jouw voorstel" : `Voorstel ${v.van}`}: {v.tekst}{v.alternatief ? ` · alternatief: ${v.alternatief}` : ""} · {statusLabel[v.status]}</li>)}</ul>
          <p className="mt-2 text-xs">Er is nog geen gezamenlijke bevestiging. De bestaande verdeling blijft gelden. Dit onderwerp blijft openstaan.</p>
          <p className="mt-1 text-xs text-ink-soft">Bespreken met een betrokken professional kan pas zodra veilige gedeelde toegang en toestemming beschikbaar zijn.</p>
        </div>
      )) : null}
      {eerder.length ? (
        <div className="mt-3">
          <button onClick={() => setEerderOpen(!eerderOpen)} aria-expanded={eerderOpen} className="py-2 text-sm font-semibold text-ink-soft">Eerdere wijzigingen {eerderOpen ? "⌃" : "›"}</button>
          {eerderOpen ? (
            <ul className="divide-y divide-border border-t border-border">
              {eerder.map((v) => (
                <li key={v.id} id={`item-${v.id}`} className="zoekdoel flex items-center justify-between gap-2 py-2.5">
                  <span><span className="block text-sm">{v.tekst}</span><span className="block text-xs text-ink-soft">{v.van} · {v.datumLabel} · {v.soort === "eenmalig" ? "Alleen deze keer" : "Vanaf nu"} · {statusLabel[v.status]}</span></span>
                  <GeschiedenisKnop soort="schema" itemId={v.id} naam={v.tekst} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {startActie ? (
      <Card className="mt-4 space-y-3" id="nieuw-voorstel">
        {bronOmschrijving ? <div className="border-b border-border pb-3 text-sm"><p className="text-ink-soft">Je bericht en gekozen tijdstip staan hieronder. Deze voorbeeldkalender kan de genoemde dag niet betrouwbaar overnemen. Er wordt vanuit deze suggestie niets verstuurd of gewijzigd.</p><Button asChild variant="link" className="h-auto min-h-11 whitespace-normal px-0 text-xs"><Link to="/zorgregeling" search={{ actie: "wijziging", bron: "handmatig" }}>Zelf de kinderen en dagen kiezen</Link></Button></div> : null}
        {altId ? <p className="text-xs text-ink-soft">Het oorspronkelijke voorstel is niet goedgekeurd. Controleer de kinderen, dagen en verdeling voor jouw alternatief.</p> : null}
        <div className="flex items-center justify-between"><p className="text-sm font-semibold text-ink">{startActie === "regeling" ? "Andere vaste verdeling voorstellen" : voorstelType === "nachtje" ? "Extra overnachting voorstellen" : voorstelType === "ruil" ? "Dag ruilen voorstellen" : "Eenmalige wijziging voorstellen"}</p><button onClick={sluit} aria-label="Sluiten" className="knop-kruis size-7 text-xs">✕</button></div>
        <FilterBalk opties={[{ id: "eenmalig", label: "Alleen deze keer" }, { id: "structureel", label: "Vanaf nu" }] as const} waarde={soort} onChange={setSoort} />
        <p className="text-xs text-ink-soft">{soort === "eenmalig" ? "Geldt alleen voor deze dag(en). De vaste verdeling blijft hetzelfde." : "Past de vaste verdeling aan vanaf de gekozen dag, als de ander ja zegt."}</p>
        <div className="flex gap-2">
          {(["emma", "noah"] as KindId[]).map((k) => (
            <button key={k} onClick={() => setVoor((v) => (v.includes(k) ? (v.length > 1 ? v.filter((x) => x !== k) : v) : [...v, k]))}
              aria-pressed={voor.includes(k)} className={`rounded-full px-3 py-1 text-xs font-semibold ${voor.includes(k) ? "bg-brand text-primary-foreground" : "bg-surface text-ink-soft"}`}>
              {kindNamen[k]}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-ink-soft">{soort === "eenmalig" ? "Van" : "Vanaf"}
            <select value={dagVan} onChange={(e) => setDagVan(Number(e.target.value))} className={sel}>{dagOpties.map((d) => <option key={d} value={d}>{d} maart</option>)}</select>
          </label>
          {soort === "eenmalig" ? (
            <label className="text-xs text-ink-soft">Tot en met
              <select value={dagTot} onChange={(e) => setDagTot(Number(e.target.value))} className={sel}>{dagOpties.map((d) => <option key={d} value={d}>{d} maart</option>)}</select>
            </label>
          ) : null}
          <label className="col-span-2 text-xs text-ink-soft">{soort === "eenmalig" ? "Bij wie zijn de kinderen?" : "Eerste week bij"}
            <select value={naar} onChange={(e) => setNaar(e.target.value as ParentId)} className={sel}>
              <option value="sanne">{parents.sanne.naam}</option><option value="joris">{parents.joris.naam}</option>
            </select>
          </label>
        </div>
        <label className="block text-xs text-ink-soft">Graag reactie voor (vrijwillig)
          <input type="date" value={reactieDatum} onChange={(e) => setReactieDatum(e.target.value)} className={sel} />
        </label>
        <p className="-mt-1 text-xs text-ink-soft">Dit is een verzoek, geen harde grens. Zonder reactie verandert er nooit automatisch iets.</p>
        <div className="overflow-x-auto"><table className="w-full text-left text-xs"><caption className="mb-2 text-left font-semibold">Deze dagen veranderen pas na akkoord</caption><thead><tr className="border-b border-border"><th className="py-2">Dag / kind</th><th>Nu</th><th>Voorstel</th></tr></thead><tbody>{voor.flatMap((k) => Array.from({ length: soort === "eenmalig" ? Math.max(dagVan, dagTot) - dagVan + 1 : 14 }, (_, i) => dagVan + i).filter((d) => d <= 31).map((d) => <tr key={k + d} className="border-b border-border"><td className="py-1.5">{d} maart · {kindNamen[k]}</td><td>{parents[zorgDag(zorg, k, d).ouder].naam}</td><td className="font-semibold text-brand">{parents[voorstelOuder(k, d)].naam}</td></tr>))}</tbody></table></div>
        <textarea value={nieuw} onChange={(e) => setNieuw(e.target.value)} rows={2} placeholder="Licht je vraag kort toe…" className="w-full resize-none rounded-xl bg-surface p-3 text-sm outline-none" />
        {ga && eerderZonderAkkoord(zorg.voorstellen, { soort, kinderen: voor, dagen: soort === "eenmalig" ? Array.from({ length: Math.max(dagVan, dagTot) - dagVan + 1 }, (_, i) => dagVan + i) : [dagVan], datumLabel: "", naarOuder: naar }) ? <p className="text-xs text-ink-soft">Een gelijk voorstel is eerder al zonder akkoord afgesloten. Je kunt het opnieuw sturen als er iets is veranderd; licht dat dan kort toe.</p> : null}
        <button disabled={!nieuw.trim() || !!bronOmschrijving} onClick={verstuur}
          className="w-full rounded-xl bg-brand py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">
          Vraag versturen
        </button>
      </Card>
      ) : null}
    </section>
  );
}


function Gevolgen({ v }: { v: Parameters<typeof useGevolgen>[0] }) {
  const lijst = useGevolgen(v);
  if (!lijst.length) return null;
  return (
    <div className="mt-2 rounded-xl bg-surface p-2.5 text-xs">
      <p className="font-semibold">{v.soort === "structureel" ? "Wat verandert hierdoor?" : "Dit raakt ook"}</p>
      <ul className="mt-1 space-y-0.5 text-ink-soft">
        {lijst.map((g) => <li key={g.id}>{g.soort === "afspraak" ? "· " : "· Spullen: "}{g.tekst}</li>)}
      </ul>
    </div>
  );
}
