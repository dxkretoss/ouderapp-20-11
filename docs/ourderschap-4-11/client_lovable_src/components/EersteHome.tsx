import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppIcon } from "@/components/AppIcon";
import { BeeldKiezer, ProfielBeeld } from "@/components/ProfielBeeld";
import { BewerkPotlood } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

import { basisStappen, geldigeRegeling, gezagKeuzes, maandagVan, patronen, tweeWekenVanaf, start, useStart, vandaagVolgens, type Patroon, type Plek, type Regeling } from "@/lib/start-store";
import { uur } from "@/lib/tijd-tekst";
import { geenRechten, rolOpties, voegPersoonToe } from "@/lib/kring-store";

const weekKort = ["ma", "di", "wo", "do", "vr", "za", "zo"];
const knop = "w-full rounded-xl bg-brand py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40";
const veld = "mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";

/** Kleur én letter, zodat kleur nooit de enige informatiedrager is. */
function Dag({ p, label, onClick }: { p: Plek; label?: string | undefined; onClick?: (() => void) | undefined }) {
  const ik = p === "ik";
  const inhoud = (
    <>
      {label ? <span className="block text-[9px] text-ink-soft">{label}</span> : null}
      <span
        className="grid h-6 place-items-center rounded-md text-[11px] font-bold"
        style={{ background: ik ? "color-mix(in oklab, var(--brand) 22%, var(--card))" : "color-mix(in oklab, var(--accent-warm) 22%, var(--card))", color: ik ? "var(--brand)" : "var(--accent-warm)" }}
      >{ik ? "J" : "A"}</span>
    </>
  );
  return onClick ? <button type="button" onClick={onClick} className="text-center" aria-label={`${label ?? ""}: ${ik ? "bij jou" : "bij de andere ouder"}, tik om te wisselen`}>{inhoud}</button> : <span className="text-center">{inhoud}</span>;
}

function Weken({ dagen, labels, rijLabels, onToggle }: { dagen: Plek[]; labels?: boolean; rijLabels?: boolean; onToggle?: (i: number) => void }) {
  return (
    <div className="space-y-1">
      {[0, 1].map((w) => (
        <div key={w}>
        {rijLabels ? <p className="mb-0.5 mt-1 text-[11px] font-semibold text-ink-soft">{w === 0 ? "Deze week" : "Volgende week"}</p> : null}
        <div className="grid grid-cols-7 gap-1">
          {dagen.slice(w * 7, w * 7 + 7).map((p, i) => (
            <Dag key={i} p={p} label={labels && w === 0 ? weekKort[i] : undefined} onClick={onToggle ? () => onToggle(w * 7 + i) : undefined} />
          ))}
        </div>
        </div>
      ))}
    </div>
  );
}

const Legenda = () => (
  <p className="mt-2 text-[11px] text-ink-soft"><b className="text-brand">J</b> bij jou · <b className="text-accent-warm">A</b> bij de andere ouder</p>
);

export function GezagSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl bg-background">
        <SheetHeader><SheetTitle className="font-display">Hoe is het ouderlijk gezag geregeld?</SheetTitle></SheetHeader>
        <div className="space-y-2 px-4 pb-6">
          {gezagKeuzes.map((g) => (
            <button key={g.id} onClick={() => { start.zetGezag(g.id); onClose(); }} className="flex min-h-[48px] w-full items-center rounded-xl border border-border bg-card px-4 text-left text-sm font-semibold">{g.naam}</button>
          ))}
          <p className="pt-1 text-xs text-ink-soft">Dit is wat jij invult. De andere ouder kan het later bevestigen. Het geeft niemand extra toegang of rechten.</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function KindSheet({ open, onClose, start: begin = "kind" }: { open: boolean; onClose: () => void; start?: "kind" | "familie" }) {
  const [fase, setFase] = useState<"kind" | "vervolg" | "familie" | "klaar">(begin);
  const [naam, setNaam] = useState("");
  const [geb, setGeb] = useState("");
  const [beeld, setBeeld] = useState<string | undefined>(undefined);
  const [rol, setRol] = useState<string>(rolOpties[0]);
  const [contact, setContact] = useState("");
  const [opslagFout, setOpslagFout] = useState(false);
  const st = useStart();
  useEffect(() => { if (open) { setFase(begin); setOpslagFout(false); } }, [open, begin]);
  const wis = () => { setNaam(""); setGeb(""); setBeeld(undefined); setContact(""); setRol(rolOpties[0]); };
  const opslaanKind = () => { if (!naam.trim() || fase !== "kind") return; start.kindToevoegen(naam, geb, beeld); wis(); setFase("vervolg"); };
  const opslaanFamilie = () => {
    if (!naam.trim() || fase !== "familie") return;
    // Alleen een contact: geen uitnodiging, geen gezag, geen rechten (per kind 'geen').
    try {
      voegPersoonToe({ naam: naam.trim(), rol, contact: contact.trim(), uitgenodigd: false, periode: { type: "doorlopend" }, rechten: Object.fromEntries(st.kinderen.map((k) => [k.id, geenRechten()])) });
    } catch { setOpslagFout(true); return; }
    setOpslagFout(false);
    wis(); setFase("vervolg");
  };
  const titel = { kind: "Kind toevoegen", vervolg: "Alles ingevuld?", familie: "Familielid of betrokkene", klaar: "Helemaal goed!" }[fase];
  const keuze = "flex min-h-[48px] w-full items-center rounded-xl border border-border bg-card px-4 text-left text-sm font-semibold";
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-3xl bg-background">
        <SheetHeader><SheetTitle className="font-display">{titel}</SheetTitle></SheetHeader>
        <div className="space-y-3 px-4 pb-6">
          {fase === "kind" ? (<>
            <label className="block text-xs text-ink-soft">Voornaam<input autoFocus value={naam} onChange={(e) => setNaam(e.target.value)} className={veld} /></label>
            <label className="block text-xs text-ink-soft">Geboortedatum (handig voor verjaardagen, mag later)<input type="date" value={geb} onChange={(e) => setGeb(e.target.value)} className={veld} /></label>
            <div className="pt-1"><p className="mb-2 text-xs text-ink-soft">Foto of avatar (optioneel, kan ook later)</p><BeeldKiezer beeld={beeld} naam={naam} onKies={setBeeld} overslaanTekst="Geen afbeelding, toon de eerste letter" /></div>
            <button disabled={!naam.trim()} className={knop} onClick={opslaanKind}>Opslaan</button>
          </>) : fase === "vervolg" ? (<>
            <p className="text-sm text-ink-soft">Wil je nog een kind of familielid toevoegen, of ben je voor nu klaar?</p>
            <div className="rounded-xl bg-surface px-4 py-3 text-sm leading-relaxed text-ink-soft">Je kunt later altijd nog iemand toevoegen of gegevens aanpassen via Menu → Kinderen of Instellingen → Gezin beheren.</div>
            <Button variant="ghost" className={`${keuze} h-auto justify-start whitespace-normal`} onClick={() => setFase("klaar")}>Voor nu afronden</Button>
            <Button variant="ghost" className={`${keuze} h-auto justify-start whitespace-normal`} onClick={() => setFase("kind")}>Nog een kind toevoegen</Button>
            <Button variant="ghost" className={`${keuze} h-auto justify-start whitespace-normal`} onClick={() => setFase("familie")}>Familielid toevoegen</Button>
          </>) : fase === "familie" ? (<>
            <label className="block text-xs text-ink-soft">Naam<input autoFocus value={naam} onChange={(e) => setNaam(e.target.value)} className={veld} /></label>
            <label className="block text-xs text-ink-soft">Rol<select value={rol} onChange={(e) => setRol(e.target.value)} className={veld}>{rolOpties.map((r) => <option key={r}>{r}</option>)}</select></label>
            <label className="block text-xs text-ink-soft">Telefoon of e-mail (optioneel)<input value={contact} onChange={(e) => setContact(e.target.value)} className={veld} /></label>
            <p className="text-xs text-ink-soft">Wordt bewaard als contact, zonder toegang tot de app en zonder gezag. Toegang stel je later apart in bij Belangrijke personen.</p>
            {opslagFout ? <p role="alert" className="text-sm text-ink-soft">Bewaren op dit apparaat is niet gelukt. Je gegevens staan nog ingevuld; probeer het opnieuw.</p> : null}
            <Button disabled={!naam.trim()} variant="ghost" className={`${knop} h-auto shadow-none`} onClick={opslaanFamilie}>{opslagFout ? "Opnieuw proberen" : "Opslaan"}</Button>
            <button className="block w-full text-center text-xs font-semibold text-ink-soft" onClick={() => setFase("vervolg")}>Terug</button>
          </>) : (<>
            <p className="text-sm text-ink-soft">Je kunt later altijd nog iemand toevoegen of gegevens aanpassen via Menu → Kinderen of Instellingen → Gezin beheren.</p>
            <button className={knop} onClick={onClose}>Verder</button>
          </>)}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function RegelingSheet({ open, onClose, kindNaam }: { open: boolean; onClose: () => void; kindNaam: string }) {
  const st = useStart();
  const [stap, setStap] = useState<"patroon" | "aanpassen">("patroon");
  const [patroon, setPatroon] = useState<Patroon>("om-de-week");
  const [dagen, setDagen] = useState<Plek[]>([]);
  const [tijd, setTijd] = useState("14:30");
  const [plek, setPlek] = useState("");
  useEffect(() => {
    if (!open) return;
    if (geldigeRegeling(st.regeling)) {
      setPatroon(st.regeling.patroon); setDagen(tweeWekenVanaf(st.regeling, new Date()));
      setTijd(st.regeling.wisseltijd); setPlek(st.regeling.plek ?? ""); setStap("aanpassen");
    } else setStap("patroon");
  }, [open]);
  const kies = (id: Patroon) => {
    const p = patronen.find((x) => x.id === id);
    if (!p) return;
    if (!p.dagen) { start.regeling("later"); onClose(); return; }
    setPatroon(id); setDagen([...p.dagen]); setStap("aanpassen");
  };
  const omdraaien = () => setDagen((d) => d.map((x) => (x === "ik" ? "ander" : "ik")));
  const bevestig = () => {
    if (st.uitgenodigd && geldigeRegeling(st.regeling)) return;
    const r: Regeling = { patroon, dagen, wisseltijd: tijd, plek: plek.trim() || undefined, startMaandag: maandagVan(new Date()) };
    start.regeling(r); onClose();
  };
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-h-[85vh] max-w-lg overflow-y-auto rounded-t-3xl bg-background">
        {stap === "patroon" ? (
          <>
            <SheetHeader><SheetTitle className="font-display">Hoe verdelen jullie de week meestal?</SheetTitle></SheetHeader>
            <div className="px-4 pb-6">
              <p className="text-sm text-ink-soft">Kies wat het meest lijkt op jullie situatie. De dagen en het wisselmoment pas je hierna precies aan.</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {patronen.map((p) => (
                  <button key={p.id} onClick={() => kies(p.id)} className="rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-brand/50">
                    <p className="text-sm font-semibold">{p.naam}</p>
                    <p className="mt-0.5 text-xs text-ink-soft">{p.uitleg}</p>
                    {p.dagen && p.id !== "zelf" ? <div className="mt-2"><Weken dagen={p.dagen} /></div> : null}
                  </button>
                ))}
              </div>
              <button onClick={() => { start.regeling("later"); onClose(); }} className="mt-3 w-full text-center text-xs font-semibold text-ink-soft">Nog niet afgesproken — later instellen</button>
            </div>
          </>
        ) : (
          <>
            <SheetHeader><SheetTitle className="font-display">{geldigeRegeling(st.regeling) ? "Verdeling van de week aanpassen" : "Verdeling van de week instellen"}</SheetTitle></SheetHeader>
            <div className="space-y-4 px-4 pb-6">
              <div>
                <p className="text-xs text-ink-soft">Tik op een dag om die te wisselen.</p>
                <div className="mt-2"><Weken dagen={dagen} labels rijLabels onToggle={(i) => setDagen((d) => d.map((x, n) => (n === i ? (x === "ik" ? "ander" : "ik") : x)))} /></div>
                <Legenda />
                <button onClick={omdraaien} className="mt-2 text-xs font-semibold text-brand">Andersom: begin bij de andere ouder</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-ink-soft">Tijd wisselmoment<input type="time" value={tijd} onChange={(e) => setTijd(e.target.value)} className={veld} /></label>
                <label className="text-xs text-ink-soft">Waar (optioneel)<input value={plek} onChange={(e) => setPlek(e.target.value)} placeholder="Bijv. school" className={veld} /></label>
              </div>
              <div className="rounded-xl bg-surface p-3 text-sm">
                {(() => {
                  const v = vandaagVolgens({ patroon, dagen, wisseltijd: tijd, startMaandag: maandagVan(new Date()) }, new Date());
                  return <p>Vandaag is {kindNaam} <b>{v.plek === "ik" ? "bij jou" : "bij de andere ouder"}</b>. Volgende wissel: {v.volgende.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })} · {uur(tijd)}.</p>;
                })()}
                <p className="mt-1 text-xs text-ink-soft">Uitzonderingen zoals vakanties en feestdagen voeg je later toe.</p>
              </div>
              {st.uitgenodigd && geldigeRegeling(st.regeling) ? <p role="status" className="text-sm text-ink-soft">Jullie bestaande verdeling blijft staan. Samen een wijziging bevestigen kan zodra de andere ouder echt gekoppeld is.</p> : <Button className="w-full" onClick={bevestig}>Verdeling opslaan</Button>}
              <button onClick={() => setStap("patroon")} className="w-full text-center text-xs font-semibold text-ink-soft">Ander patroon kiezen</button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function StapInhoud({ x }: { x: { icoon: string; titel: string; tekst: string } }) {
  return (
    <>
      <AppIcon functie={x.icoon} maat="sm" />
      <span className="flex-1"><span className="block text-sm font-semibold">{x.titel}</span><span className="block text-xs text-ink-soft">{x.tekst}</span></span>
      <span aria-hidden className="text-lg text-ink-soft">›</span>
    </>
  );
}

/** De echte Home voor een eigen gezin: dezelfde plekken veranderen van uitleg naar functionaliteit. */
/** Eigen gezin: de gegevens uit de eerste start (één bron: start-store). */
function useEigen() {
  const s = useStart();
  const [nu, setNu] = useState<Date | null>(null);
  useEffect(() => { setNu(new Date()); }, []);
  const namen = s.kinderen.map((k) => k.naam);
  const namenTekst = namen.length <= 1 ? namen[0] ?? "" : `${namen.slice(0, -1).join(", ")} & ${namen.at(-1)}`;
  const zijn = namen.length > 1 ? "zijn" : "is";
  const regeling = s.regeling && s.regeling !== "later" && geldigeRegeling(s.regeling) ? s.regeling : null;
  const v = regeling && nu ? vandaagVolgens(regeling, nu) : null;
  return { s, nu, namen, namenTekst, zijn, regeling, v };
}

/** Kinderen van het eigen gezin, op dezelfde plek als op Home. */
export function EigenKinderen() {
  const { s } = useEigen();
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {s.kinderen.map((k) => (
        <Link key={k.id} to="/kinderen/$kindId" params={{ kindId: k.id }} aria-label={`Profiel van ${k.naam} openen`} className="flex min-h-9 items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-3 text-sm">
          <ProfielBeeld beeld={k.beeld} naam={k.naam} kleur={k.kleur} maat={28} />
          <span className="font-semibold">{k.naam}</span>
        </Link>
      ))}
    </div>
  );
}

/** Dezelfde compacte weeklijn als bij het voorbeeldgezin, maar per dag gekleurd volgens de eigen regeling. */
function WeekLijn({ dagen, vandaag }: { dagen: Plek[]; vandaag: number }) {
  const kleur = (p: Plek) => (p === "ik" ? "color-mix(in oklab, var(--brand) 88%, var(--card))" : "color-mix(in oklab, var(--accent-warm) 68%, var(--card))");
  const stops = dagen.map((p, i) => `${kleur(p)} ${(i / 7) * 100}% ${((i + 1) / 7) * 100}%`).join(", ");
  const wissels = dagen.map((p, i) => (i > 0 && p !== dagen[i - 1] ? i : -1)).filter((i) => i > 0);
  return (
    <>
      <div className="relative mt-3 h-4" aria-label="Weeklijn van deze week volgens jullie verdeling">
        <span className="absolute left-0 right-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full" style={{ background: `linear-gradient(to right, ${stops})` }} />
        <span className="absolute top-1/2 size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink" style={{ left: `${((vandaag + 0.5) / 7) * 100}%`, boxShadow: "0 0 0 2.5px var(--card)" }} />
        {wissels.map((i) => (
          <span key={i} className="absolute top-1/2 grid size-4 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-card text-brand ring-1 ring-brand/25" style={{ left: `${(i / 7) * 100}%` }}>
            <svg aria-hidden="true" viewBox="0 0 16 16" className="size-[13px]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 5.75h9" /><path d="M10.25 3.25 12.75 5.75 10.25 8.25" /><path d="M12.5 10.25h-9" /><path d="M5.75 7.75 3.25 10.25 5.75 12.75" /></svg>
          </span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7">
        {weekKort.map((d, i) => <span key={d} className={`text-center text-[9px] uppercase tracking-[0.12em] ${i === vandaag ? "font-bold text-ink" : "text-ink-soft"}`}>{d}</span>)}
      </div>
    </>
  );
}

/** Het Vandaag-blok voor het eigen gezin: groeit mee van "kind toevoegen" naar de echte stand volgens de verdeling. */
export function EigenVandaag() {
  const { s, nu, namenTekst, zijn, regeling, v } = useEigen();
  const [schema, setSchema] = useState(false);
  const [kindOpen, setKindOpen] = useState(false);
  const [regOpen, setRegOpen] = useState(false);
  return (
    <>
      {/* Vandaag: dezelfde plek, eerst uitleg, daarna de echte stand van zaken */}
      <section className="relative mt-5 rounded-lg border border-border px-5 py-4" style={{ background: "linear-gradient(160deg, color-mix(in oklab, var(--brand) 10%, var(--card)), var(--card) 55%)" }}>
        <p className="text-[11px] font-semibold tracking-[0.14em] text-brand uppercase">Vandaag</p>
        {s.kinderen.length && s.regeling && typeof s.regeling === "object" ? <BewerkPotlood onClick={() => setRegOpen(true)} label="Verdeling aanpassen" /> : null}
        {!s.kinderen.length ? (
          <>
            <p className="mt-1 font-display text-xl font-bold leading-snug">Voor wie wil je de app gebruiken?</p>
            <p className="mt-1 text-sm text-ink-soft">Voeg je kind toe. Dan komen planning, afspraken en praktische informatie meteen op de juiste plek.</p>
            <button onClick={() => setKindOpen(true)} className="mt-3 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground">Kind toevoegen</button>
          </>
        ) : v && regeling ? (
          <>
            <p className="mt-1 font-display text-xl font-bold leading-snug">{namenTekst} {zijn} {v.plek === "ik" ? "vandaag bij jou" : "vandaag bij de andere ouder"}</p>
            <p className="mt-0.5 text-sm text-ink-soft">Volgende wissel · {v.volgende.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "short" })} · {uur(regeling.wisseltijd)}{regeling.plek ? ` · ${regeling.plek}` : ""}</p>
            {nu ? <WeekLijn dagen={tweeWekenVanaf(regeling, nu).slice(0, 7)} vandaag={(nu.getDay() + 6) % 7} /> : null}
            <div className="mt-2 flex gap-4">
              <button onClick={() => setSchema((x) => !x)} aria-expanded={schema} className="text-xs font-semibold text-brand">{schema ? "Verdeling van de week verbergen" : "Verdeling van de week bekijken"}</button>
            </div>
            {schema && nu ? <div className="mt-2"><Weken dagen={tweeWekenVanaf(regeling, nu)} labels rijLabels /><Legenda /></div> : null}
          </>
        ) : s.regeling === "later" ? (
          <>
            <p className="mt-1 font-display text-xl font-bold leading-snug">Jullie planning volgt geen vast schema</p>
            <p className="mt-1 text-sm text-ink-soft">Prima. Zet wisselmomenten gewoon in de agenda; dan zie je ze hier vanzelf terug.</p>
            <div className="mt-3 flex gap-3">
              <Link to="/agenda" search={{ nieuw: true, titel: "Wisselmoment" }} className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground">Wisselmoment toevoegen</Link>
              <button onClick={() => setRegOpen(true)} className="text-xs font-semibold text-ink-soft">Toch een vast patroon</button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 font-display text-xl font-bold leading-snug">Wanneer is het volgende wisselmoment?</p>
            <p className="mt-1 text-sm text-ink-soft">Voeg jullie verdeling van de week toe. Daarna zie je hier vanzelf waar {namenTekst} volgens de planning {zijn} en wanneer de volgende wissel is.</p>
            <button onClick={() => setRegOpen(true)} className="mt-3 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground">Verdeling van de week toevoegen</button>
          </>
        )}
      </section>
      <KindSheet open={kindOpen} onClose={() => setKindOpen(false)} />
      <RegelingSheet open={regOpen} onClose={() => setRegOpen(false)} kindNaam={namenTekst || "je kind"} />
    </>
  );
}

/** Volgende stappen en voortgang voor het eigen gezin — hooguit drie, alleen wat nu logisch is. */
export function EigenVolgende() {
  const { s, namen, regeling } = useEigen();
  const [ingeklapt, setIngeklapt] = useState(false);
  const stappen = basisStappen(s);
  const [gezagOpen, setGezagOpen] = useState(false);
  const aantalKlaar = stappen.filter((x) => x.klaar).length;
  const basisKlaar = aantalKlaar === stappen.length;

  // Volgende stappen: hooguit drie, en alleen wat nu logisch is.
  const volgende: { icoon: string; titel: string; tekst: string; naar: "/agenda" | "/solo" | "/overdracht" | "gezag"; actie?: () => void }[] = [];
  if (s.kinderen.length && s.regeling && !s.gezag) volgende.push({ icoon: "juridisch", titel: "Hoe is het gezag geregeld?", tekst: "Eén vraag, voor jullie overzicht. Het verandert niets aan wie wat mag zien.", naar: "gezag" });
  if (s.kinderen.length && !s.afspraakToegevoegd) volgende.push({ icoon: "agenda", titel: "Zet de eerste afspraak in de agenda", tekst: `Zwemles, sport of de tandarts: daarna zie je hier wat er de komende dagen voor ${namen[0]} aankomt.`, naar: "/agenda", actie: () => start.markeer({ afspraakToegevoegd: true }) });
  if (s.kinderen.length && s.gebruik === "samen" && !s.uitgenodigd) volgende.push({ icoon: "samen", titel: "Nodig de andere ouder uit", tekst: "Wanneer jij dat wilt. Dan zien jullie allebei dezelfde planning en regel je praktische zaken samen.", naar: "/solo", actie: () => start.markeer({ uitgenodigd: true }) });
  if (regeling) volgende.push({ icoon: "overdracht", titel: "Wat moet er mee bij de wissel?", tekst: "Zet vaste spullen klaar, zoals de gymtas. Dan helpt de app je rond het wisselmoment.", naar: "/overdracht" });

  return (
    <>
      <GezagSheet open={gezagOpen} onClose={() => setGezagOpen(false)} />
      {false && s.kinderen.length > 0 ? (
        <p role="status" className={`mt-6 flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${volgende.length ? "border border-border bg-card" : "bg-brand-soft text-brand"}`}>
          {volgende.length ? (
            <><span aria-hidden className="font-bold">{volgende.length}</span> {volgende.length === 1 ? "ding" : "dingen"} om samen af te stemmen — in je eigen tempo.</>
          ) : (
            <><span aria-hidden className="font-bold">✓</span> Alles is afgestemd. Fijne dag verder.</>
          )}
        </p>
      ) : null}
      {volgende.length ? (
        <section className="mt-4">
          <h2 className="font-display text-lg font-bold">Handig als volgende stap</h2>
          <div className="mt-2 divide-y divide-border border-y border-border">
            {volgende.slice(0, 3).map((x) => (
              x.naar === "gezag" ? (
                <button key={x.titel} onClick={() => setGezagOpen(true)} className="flex w-full items-start gap-3 py-3 text-left"><StapInhoud x={x} /></button>
              ) : x.naar === "/agenda" ? (
                <Link key={x.titel} to="/agenda" search={{ nieuw: true }} onClick={() => x.actie?.()} className="flex items-start gap-3 py-3"><StapInhoud x={x} /></Link>
              ) : (
                <Link key={x.titel} to={x.naar} onClick={() => x.actie?.()} className="flex items-start gap-3 py-3"><StapInhoud x={x} /></Link>
              )
            ))}
          </div>
        </section>
      ) : null}

      {!basisKlaar && !s.voortgangVerborgen ? (
        <section className="mt-6 rounded-lg border border-border bg-card px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <button onClick={() => setIngeklapt((x) => !x)} aria-expanded={!ingeklapt} className="flex-1 text-left">
              <span className="block text-sm font-semibold">Je start · {aantalKlaar} van {stappen.length} klaar</span>
              <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface"><span className="block h-full rounded-full bg-brand" style={{ width: `${(aantalKlaar / stappen.length) * 100}%` }} /></span>
            </button>
            <button onClick={() => setIngeklapt((x) => !x)} className="min-h-[44px] text-xs font-semibold text-ink-soft">{ingeklapt ? "Toon" : "Inklappen"}</button>
          </div>
          {!ingeklapt ? (
            <>
              <ul className="mt-2 space-y-1.5">
                {stappen.map((x) => (
                  <li key={x.label} className={`flex items-center gap-2 text-sm ${x.klaar ? "text-ink-soft" : ""}`}>
                    <span aria-hidden className={`grid size-5 place-items-center rounded-full text-[11px] font-bold ${x.klaar ? "bg-brand-soft text-brand" : "border border-border"}`}>{x.klaar ? "✓" : ""}</span>
                    <span>{x.label}</span><span className="sr-only">{x.klaar ? " — klaar" : " — nog te doen"}</span>
                  </li>
                ))}
              </ul>
              <button onClick={() => start.markeer({ voortgangVerborgen: true })} className="mt-2 text-xs font-semibold text-ink-soft">Niet meer tonen</button>
            </>
          ) : null}
        </section>
      ) : null}

      <p className="mt-8 text-center text-xs text-ink-soft">
        Alles aanvullen kan altijd via het Menu. <button onClick={() => start.naarVoorbeeld()} className="font-semibold underline-offset-2 hover:underline">Bekijk het voorbeeldgezin</button>
      </p>

    </>
  );
}
