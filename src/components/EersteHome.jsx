import { taalLocale, tLijst } from "@/i18n";
import { Trans, useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { Chevron, Vinkje } from "@/components/Tekens";
import { BeeldKiezer, ProfielBeeld } from "@/components/ProfielBeeld";
import { BewerkPotlood } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { basisStappen, geldigeRegeling, gezagKeuzes, maandagVan, patronen, tweeWekenVanaf, start, useStart, vandaagVolgens } from "@/lib/start-store";
import { uur } from "@/lib/tijd-tekst";
import { geenRechten, rolNaam, rolOpties, voegPersoonToe } from "@/lib/kring-store";
import { agendaZorgOp } from "@/lib/agenda-zorg";
import { iso, plusDagen } from "@/lib/agenda-datum";
import { useZorg } from "@/lib/zorg-store";
import { useVakanties } from "@/lib/vakantie-store";
import { useWisselMomenten, volgendeVan } from "@/lib/overdracht-store";

const knop = "w-full rounded-xl bg-brand py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40";
const veld = "mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand";
/** Kleur én letter, zodat kleur nooit de enige informatiedrager is. */
function Dag({ p, label, onClick }) {
    const { t } = useTranslation();
    const ik = p === "ik";
    const inhoud = (<>
      {label ? <span className="block text-[9px] text-ink-soft">{label}</span> : null}
      <span className="grid h-6 place-items-center rounded-md text-[11px] font-bold" style={{ background: ik ? "color-mix(in oklab, var(--brand) 22%, var(--card))" : "color-mix(in oklab, var(--accent-warm) 22%, var(--card))", color: ik ? "var(--brand)" : "var(--accent-warm)" }}>{ik ? t("components.EersteHome.letterJij") : t("components.EersteHome.letterAnder")}</span>
    </>);
    return onClick ? <button type="button" onClick={onClick} className="text-center" aria-label={t("components.EersteHome.dagAria", { dag: label ?? "", plek: ik ? t("components.EersteHome.bijJou") : t("components.EersteHome.bijAnder") })}>{inhoud}</button> : <span className="text-center">{inhoud}</span>;
}
function Weken({ dagen, labels, rijLabels, onToggle }) {
    const { t } = useTranslation();
    const weekKort = tLijst("common.dagenKort");
    return (<div className="space-y-1">
      {[0, 1].map((w) => (<div key={w}>
        {rijLabels ? <p className="mb-0.5 mt-1 text-[11px] font-semibold text-ink-soft">{w === 0 ? t("components.EersteHome.dezeWeek") : t("components.EersteHome.volgendeWeek")}</p> : null}
        <div className="grid grid-cols-7 gap-1">
          {dagen.slice(w * 7, w * 7 + 7).map((p, i) => (<Dag key={i} p={p} label={labels && w === 0 ? weekKort[i] : undefined} onClick={onToggle ? () => onToggle(w * 7 + i) : undefined}/>))}
        </div>
        </div>))}
    </div>);
}
const Legenda = () => {
    const { t } = useTranslation();
    return (<p className="mt-2 text-[11px] text-ink-soft"><b className="text-brand">{t("components.EersteHome.letterJij")}</b> {t("components.EersteHome.bijJou")} · <b className="text-accent-warm">{t("components.EersteHome.letterAnder")}</b> {t("components.EersteHome.bijAnder")}</p>);
};
export function GezagSheet({ open, onClose }) {
    const { t } = useTranslation();
    return (<Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl bg-background">
        <SheetHeader><SheetTitle className="font-display">{t("components.EersteHome.gezag.titel")}</SheetTitle></SheetHeader>
        <div className="space-y-2 px-4 pb-6">
          {gezagKeuzes.map((g) => (<button key={g.id} onClick={() => { start.zetGezag(g.id); onClose(); }} className="flex min-h-[48px] w-full items-center rounded-xl border border-border bg-card px-4 text-left text-sm font-semibold">{g.naam}</button>))}
          <p className="pt-1 text-xs text-ink-soft">{t("components.EersteHome.gezag.uitleg")}</p>
        </div>
      </SheetContent>
    </Sheet>);
}
export function KindSheet({ open, onClose, start: begin = "kind" }) {
    const { t } = useTranslation();
    const [fase, setFase] = useState(begin);
    const [naam, setNaam] = useState("");
    const [geb, setGeb] = useState("");
    const [beeld, setBeeld] = useState(undefined);
    const [rol, setRol] = useState(rolOpties[0]);
    const [contact, setContact] = useState("");
    const [opslagFout, setOpslagFout] = useState(false);
    const st = useStart();
    useEffect(() => { if (open) {
        setFase(begin);
        setOpslagFout(false);
    } }, [open, begin]);
    const wis = () => { setNaam(""); setGeb(""); setBeeld(undefined); setContact(""); setRol(rolOpties[0]); };
    const opslaanKind = () => { if (!naam.trim() || fase !== "kind")
        return; start.kindToevoegen(naam, geb, beeld); wis(); setFase("vervolg"); };
    const opslaanFamilie = () => {
        if (!naam.trim() || fase !== "familie")
            return;
        // Alleen een contact: geen uitnodiging, geen gezag, geen rechten (per kind 'geen').
        try {
            voegPersoonToe({ naam: naam.trim(), rol, contact: contact.trim(), uitgenodigd: false, periode: { type: "doorlopend" }, rechten: Object.fromEntries(st.kinderen.map((k) => [k.id, geenRechten()])) });
        }
        catch {
            setOpslagFout(true);
            return;
        }
        setOpslagFout(false);
        wis();
        setFase("vervolg");
    };
    const titel = t(`components.EersteHome.kind.titel.${fase}`);
    const keuze = "flex min-h-[48px] w-full items-center rounded-xl border border-border bg-card px-4 text-left text-sm font-semibold";
    return (<Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-3xl bg-background">
        <SheetHeader><SheetTitle className="font-display">{titel}</SheetTitle></SheetHeader>
        <div className="space-y-3 px-4 pb-6">
          {fase === "kind" ? (<>
            <label className="block text-xs text-ink-soft">{t("components.EersteHome.kind.voornaam")}<input autoFocus value={naam} onChange={(e) => setNaam(e.target.value)} className={veld}/></label>
            <label className="block text-xs text-ink-soft">{t("components.EersteHome.kind.geboortedatum")}<input type="date" value={geb} onChange={(e) => setGeb(e.target.value)} className={veld}/></label>
            <div className="pt-1"><p className="mb-2 text-xs text-ink-soft">{t("components.EersteHome.kind.foto")}</p><BeeldKiezer beeld={beeld} naam={naam} onKies={setBeeld} overslaanTekst={t("components.EersteHome.kind.geenAfbeelding")}/></div>
            <button disabled={!naam.trim()} className={knop} onClick={opslaanKind}>{t("common.opslaan")}</button>
          </>) : fase === "vervolg" ? (<>
            <p className="text-sm text-ink-soft">{t("components.EersteHome.kind.nogIemand")}</p>
            <div className="rounded-xl bg-surface px-4 py-3 text-sm leading-relaxed text-ink-soft">{t("components.EersteHome.kind.later")}</div>
            <Button variant="ghost" className={`${keuze} h-auto justify-start whitespace-normal`} onClick={() => setFase("klaar")}>{t("components.EersteHome.kind.afronden")}</Button>
            <Button variant="ghost" className={`${keuze} h-auto justify-start whitespace-normal`} onClick={() => setFase("kind")}>{t("components.EersteHome.kind.nogEenKind")}</Button>
            <Button variant="ghost" className={`${keuze} h-auto justify-start whitespace-normal`} onClick={() => setFase("familie")}>{t("components.EersteHome.kind.familielid")}</Button>
          </>) : fase === "familie" ? (<>
            <label className="block text-xs text-ink-soft">{t("components.EersteHome.kind.naam")}<input autoFocus value={naam} onChange={(e) => setNaam(e.target.value)} className={veld}/></label>
            <label className="block text-xs text-ink-soft">{t("components.EersteHome.kind.rol")}<select value={rol} onChange={(e) => setRol(e.target.value)} className={veld}>{rolOpties.map((r) => <option key={r} value={r}>{rolNaam(r)}</option>)}</select></label>
            <label className="block text-xs text-ink-soft">{t("components.EersteHome.kind.contact")}<input value={contact} onChange={(e) => setContact(e.target.value)} className={veld}/></label>
            <p className="text-xs text-ink-soft">{t("components.EersteHome.kind.contactUitleg")}</p>
            {opslagFout ? <p role="alert" className="text-sm text-ink-soft">{t("components.EersteHome.kind.opslagFout")}</p> : null}
            <Button disabled={!naam.trim()} variant="ghost" className={`${knop} h-auto shadow-none`} onClick={opslaanFamilie}>{opslagFout ? t("components.EersteHome.opnieuw") : t("common.opslaan")}</Button>
            <button className="block w-full text-center text-xs font-semibold text-ink-soft" onClick={() => setFase("vervolg")}>{t("common.terug")}</button>
          </>) : (<>
            <p className="text-sm text-ink-soft">{t("components.EersteHome.kind.later")}</p>
            <button className={knop} onClick={onClose}>{t("components.EersteHome.verder")}</button>
          </>)}
        </div>
      </SheetContent>
    </Sheet>);
}
function RegelingSheet({ open, onClose, kindNaam }) {
    const { t } = useTranslation();
    const st = useStart();
    const [stap, setStap] = useState("patroon");
    const [patroon, setPatroon] = useState("om-de-week");
    const [dagen, setDagen] = useState([]);
    const [tijd, setTijd] = useState("14:30");
    const [plek, setPlek] = useState("");
    useEffect(() => {
        if (!open)
            return;
        if (geldigeRegeling(st.regeling)) {
            setPatroon(st.regeling.patroon);
            setDagen(tweeWekenVanaf(st.regeling, new Date()));
            setTijd(st.regeling.wisseltijd);
            setPlek(st.regeling.plek ?? "");
            setStap("aanpassen");
        }
        else
            setStap("patroon");
    }, [open]);
    const kies = (id) => {
        const p = patronen.find((x) => x.id === id);
        if (!p)
            return;
        if (!p.dagen) {
            start.regeling("later");
            onClose();
            return;
        }
        setPatroon(id);
        setDagen([...p.dagen]);
        setStap("aanpassen");
    };
    const omdraaien = () => setDagen((d) => d.map((x) => (x === "ik" ? "ander" : "ik")));
    const bevestig = () => {
        if (st.uitgenodigd && geldigeRegeling(st.regeling))
            return;
        const r = { patroon, dagen, wisseltijd: tijd, plek: plek.trim() || undefined, startMaandag: maandagVan(new Date()) };
        start.regeling(r);
        onClose();
    };
    return (<Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-3xl bg-background">
        {stap === "patroon" ? (<>
            <SheetHeader><SheetTitle className="font-display">{t("components.EersteHome.regeling.titel")}</SheetTitle></SheetHeader>
            <div className="px-4 pb-6">
              <p className="text-sm text-ink-soft">{t("components.EersteHome.regeling.uitleg")}</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {patronen.map((p) => (<button key={p.id} onClick={() => kies(p.id)} className="rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-brand/50">
                    <p className="text-sm font-semibold">{p.naam}</p>
                    <p className="mt-0.5 text-xs text-ink-soft">{p.uitleg}</p>
                    {p.dagen && p.id !== "zelf" ? <div className="mt-2"><Weken dagen={p.dagen}/></div> : null}
                  </button>))}
              </div>
              <button onClick={() => { start.regeling("later"); onClose(); }} className="mt-3 w-full text-center text-xs font-semibold text-ink-soft">{t("components.EersteHome.regeling.later")}</button>
            </div>
          </>) : (<>
            <SheetHeader><SheetTitle className="font-display">{geldigeRegeling(st.regeling) ? t("components.EersteHome.regeling.aanpassen") : t("components.EersteHome.regeling.instellen")}</SheetTitle></SheetHeader>
            <div className="space-y-4 px-4 pb-6">
              <div>
                <p className="text-xs text-ink-soft">{t("components.EersteHome.regeling.tik")}</p>
                <div className="mt-2"><Weken dagen={dagen} labels rijLabels onToggle={(i) => setDagen((d) => d.map((x, n) => (n === i ? (x === "ik" ? "ander" : "ik") : x)))}/></div>
                <Legenda />
                <button onClick={omdraaien} className="mt-2 text-xs font-semibold text-brand">{t("components.EersteHome.regeling.andersom")}</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-ink-soft">{t("components.EersteHome.regeling.tijd")}<input type="time" value={tijd} onChange={(e) => setTijd(e.target.value)} className={veld}/></label>
                <label className="text-xs text-ink-soft">{t("components.EersteHome.regeling.waar")}<input value={plek} onChange={(e) => setPlek(e.target.value)} placeholder={t("components.EersteHome.regeling.waarPlaceholder")} className={veld}/></label>
              </div>
              <div className="rounded-xl bg-surface p-3 text-sm">
                {(() => {
                const v = vandaagVolgens({ patroon, dagen, wisseltijd: tijd, startMaandag: maandagVan(new Date()) }, new Date());
                return <p><Trans i18nKey="components.EersteHome.regeling.vandaag" values={{ naam: kindNaam, plek: v.plek === "ik" ? t("components.EersteHome.bijJou") : t("components.EersteHome.bijAnder"), datum: v.volgende.toLocaleDateString(taalLocale(), { weekday: "long", day: "numeric", month: "long" }), tijd: uur(tijd) }} components={{ b: <b /> }}/></p>;
            })()}
                <p className="mt-1 text-xs text-ink-soft">{t("components.EersteHome.regeling.uitzonderingen")}</p>
              </div>
              {st.uitgenodigd && geldigeRegeling(st.regeling) ? <p role="status" className="text-sm text-ink-soft">{t("components.EersteHome.regeling.blijftStaan")}</p> : <Button className="w-full" onClick={bevestig}>{t("components.EersteHome.regeling.opslaan")}</Button>}
              <button onClick={() => setStap("patroon")} className="w-full text-center text-xs font-semibold text-ink-soft">{t("components.EersteHome.regeling.anderPatroon")}</button>
            </div>
          </>)}
      </SheetContent>
    </Sheet>);
}
function StapInhoud({ x }) {
    return (<>
      <AppIcon functie={x.icoon} maat="sm"/>
      <span className="flex-1"><span className="block text-sm font-semibold">{x.titel}</span><span className="block text-xs text-ink-soft">{x.tekst}</span></span>
      <Chevron className="size-5 text-ink-soft"/>
    </>);
}
/** De echte Home voor een eigen gezin: dezelfde plekken veranderen van uitleg naar functionaliteit. */
/** Eigen gezin: de gegevens uit de eerste start (één bron: start-store). */
function useEigen() {
    const s = useStart();
    const [nu, setNu] = useState(null);
    useEffect(() => { setNu(new Date()); }, []);
    const namen = s.kinderen.map((k) => k.naam);
    const namenTekst = namen.length <= 1 ? namen[0] ?? "" : `${namen.slice(0, -1).join(", ")} & ${namen.at(-1)}`;
    // Werkwoordsvorm voor de zinnen hieronder (enkelvoud/meervoud), via count.
    const zijn = namen.length > 1 ? 2 : 1;
    const regeling = s.regeling && s.regeling !== "later" && geldigeRegeling(s.regeling) ? s.regeling : null;
    const zorg = useZorg();
    const vak = useVakanties();
    const momenten = useWisselMomenten(21);
    // Vandaag volgens dezelfde afleiding als de Agenda: basisregeling, geaccepteerde uitzonderingen en vakanties.
    let v = null;
    if (regeling && nu) {
        const vandaag = iso(nu);
        const g = agendaZorgOp(zorg, vak, s, vandaag);
        const volgende = volgendeVan(momenten.filter((m) => m.datum > vandaag), nu).moment;
        const plek = g.kleur === "ander" ? "ander" : g.kleur === "ik" ? "ik" : g.kleur === "gemengd" ? "gemengd" : vandaagVolgens(regeling, nu).plek;
        const week = Array.from({ length: 7 }, (_, i) => { const d = plusDagen(iso(new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() - ((nu.getDay() + 6) % 7))), i); const k = agendaZorgOp(zorg, vak, s, d).kleur; return k === "ander" ? "ander" : "ik"; });
        v = { plek, kinderen: g.kinderen, week, volgende: volgende ? new Date(`${volgende.datum}T12:00:00`) : vandaagVolgens(regeling, nu).volgende, tijd: volgende?.tijd || regeling.wisseltijd, waar: volgende?.plek || regeling.plek };
    }
    return { s, nu, namen, namenTekst, zijn, regeling, v };
}
/** Kinderen van het eigen gezin, op dezelfde plek als op Home. */
export function EigenKinderen() {
    const { t } = useTranslation();
    const { s } = useEigen();
    return (<div className="mt-3 flex flex-wrap gap-2">
      {s.kinderen.map((k) => (<Link key={k.id} to="/kinderen/$kindId" params={{ kindId: k.id }} aria-label={t("components.EersteHome.profielOpenen", { naam: k.naam })} className="flex min-h-9 items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-3 text-sm">
          <ProfielBeeld beeld={k.beeld} naam={k.naam} kleur={k.kleur} maat={28}/>
          <span className="font-semibold">{k.naam}</span>
        </Link>))}
    </div>);
}
/** Dezelfde compacte weeklijn als bij het voorbeeldgezin, maar per dag gekleurd volgens de eigen regeling. */
function WeekLijn({ dagen, vandaag }) {
    const { t } = useTranslation();
    const weekKort = tLijst("common.dagenKort");
    const kleur = (p) => (p === "ik" ? "color-mix(in oklab, var(--brand) 88%, var(--card))" : "color-mix(in oklab, var(--accent-warm) 68%, var(--card))");
    const stops = dagen.map((p, i) => `${kleur(p)} ${(i / 7) * 100}% ${((i + 1) / 7) * 100}%`).join(", ");
    const wissels = dagen.map((p, i) => (i > 0 && p !== dagen[i - 1] ? i : -1)).filter((i) => i > 0);
    return (<>
      <div className="relative mt-3 h-4" aria-label={t("components.EersteHome.weeklijn")}>
        <span className="absolute left-0 right-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full" style={{ background: `linear-gradient(to right, ${stops})` }}/>
        <span className="absolute top-1/2 size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink" style={{ left: `${((vandaag + 0.5) / 7) * 100}%`, boxShadow: "0 0 0 2.5px var(--card)" }}/>
        {wissels.map((i) => (<span key={i} className="absolute top-1/2 grid size-4 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-card text-brand ring-1 ring-brand/25" style={{ left: `${(i / 7) * 100}%` }}>
            <svg aria-hidden="true" viewBox="0 0 16 16" className="size-[13px]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 5.75h9"/><path d="M10.25 3.25 12.75 5.75 10.25 8.25"/><path d="M12.5 10.25h-9"/><path d="M5.75 7.75 3.25 10.25 5.75 12.75"/></svg>
          </span>))}
      </div>
      <div className="mt-1 grid grid-cols-7">
        {weekKort.map((d, i) => <span key={d} className={`text-center text-[9px] uppercase tracking-[0.12em] ${i === vandaag ? "font-bold text-ink" : "text-ink-soft"}`}>{d}</span>)}
      </div>
    </>);
}
/** Het Vandaag-blok voor het eigen gezin: groeit mee van "kind toevoegen" naar de echte stand volgens de verdeling. */
export function EigenVandaag() {
    const { t } = useTranslation();
    const { s, nu, namenTekst, zijn, regeling, v } = useEigen();
    const [schema, setSchema] = useState(false);
    const [regOpen, setRegOpen] = useState(false);
    return (<>
      {/* Vandaag: dezelfde plek, eerst uitleg, daarna de echte stand van zaken */}
      <section className="relative mt-5 rounded-lg border border-border px-5 py-4" style={{ background: "linear-gradient(160deg, color-mix(in oklab, var(--brand) 10%, var(--card)), var(--card) 55%)" }}>
        <p className="text-[11px] font-semibold tracking-[0.14em] text-brand uppercase">{t("common.vandaag")}</p>
        {s.kinderen.length && s.regeling && typeof s.regeling === "object" ? <BewerkPotlood onClick={() => setRegOpen(true)} label={t("components.EersteHome.vandaag.aanpassen")}/> : null}
        {!s.kinderen.length ? (<>
            <p className="mt-1 font-display text-xl font-bold leading-snug">{t("components.EersteHome.vandaag.voorWie")}</p>
            <p className="mt-1 text-sm text-ink-soft">{t("components.EersteHome.vandaag.voegToe")}</p>
            <Link to="/kinderen" className="mt-3 inline-block rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground">{t("components.EersteHome.vandaag.kindToevoegen")}</Link>
          </>) : v && regeling ? (<>
            {v.plek === "gemengd" ? <p className="mt-1 font-display text-xl font-bold leading-snug">{v.kinderen.map((k) => <Link key={k.id} to="/kinderen/$kindId" params={{ kindId: k.id }} className="mr-2 inline-block">{t(k.ouder === "sanne" ? "components.EersteHome.vandaag.bijJou" : "components.EersteHome.vandaag.bijAnder", { namen: k.naam, count: 1 })}</Link>)}</p> : <p className="mt-1 font-display text-xl font-bold leading-snug">{t(v.plek === "ik" ? "components.EersteHome.vandaag.bijJou" : "components.EersteHome.vandaag.bijAnder", { namen: namenTekst, count: zijn })}</p>}
            <p className="mt-0.5 text-sm text-ink-soft">{t("components.EersteHome.vandaag.volgende", { datum: v.volgende.toLocaleDateString(taalLocale(), { weekday: "long", day: "numeric", month: "short" }), tijd: uur(v.tijd) })}{v.waar ? ` · ${v.waar}` : ""}</p>
            {nu ? <WeekLijn dagen={v.week} vandaag={(nu.getDay() + 6) % 7}/> : null}
            <div className="mt-2 flex gap-4">
              <button onClick={() => setSchema((x) => !x)} aria-expanded={schema} className="text-xs font-semibold text-brand">{schema ? t("components.EersteHome.vandaag.verbergen") : t("components.EersteHome.vandaag.bekijken")}</button>
            </div>
            {schema && nu ? <div className="mt-2"><Weken dagen={tweeWekenVanaf(regeling, nu)} labels rijLabels/><Legenda /></div> : null}
          </>) : s.regeling === "later" ? (<>
            <p className="mt-1 font-display text-xl font-bold leading-snug">{t("components.EersteHome.vandaag.geenSchema")}</p>
            <p className="mt-1 text-sm text-ink-soft">{t("components.EersteHome.vandaag.prima")}</p>
            <div className="mt-3 flex gap-3">
              <Link to="/agenda" search={{ nieuw: true, titel: t("components.EersteHome.vandaag.wisselmoment") }} className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground">{t("components.EersteHome.vandaag.wisselToevoegen")}</Link>
              <button onClick={() => setRegOpen(true)} className="text-xs font-semibold text-ink-soft">{t("components.EersteHome.vandaag.tochPatroon")}</button>
            </div>
          </>) : (<>
            <p className="mt-1 font-display text-xl font-bold leading-snug">{t("components.EersteHome.vandaag.wanneer")}</p>
            <p className="mt-1 text-sm text-ink-soft">{t("components.EersteHome.vandaag.voegVerdelingToe", { namen: namenTekst, count: zijn })}</p>
            <button onClick={() => setRegOpen(true)} className="mt-3 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground">{t("components.EersteHome.vandaag.verdelingToevoegen")}</button>
          </>)}
      </section>
      <RegelingSheet open={regOpen} onClose={() => setRegOpen(false)} kindNaam={namenTekst || t("components.EersteHome.jeKind")}/>
    </>);
}
/** Volgende stappen en voortgang voor het eigen gezin — hooguit drie, alleen wat nu logisch is. */
export function EigenVolgende() {
    const { t } = useTranslation();
    const { s, namen, regeling } = useEigen();
    const [ingeklapt, setIngeklapt] = useState(false);
    const stappen = basisStappen(s);
    const [gezagOpen, setGezagOpen] = useState(false);
    const aantalKlaar = stappen.filter((x) => x.klaar).length;
    const basisKlaar = aantalKlaar === stappen.length;
    // Volgende stappen: hooguit drie, en alleen wat nu logisch is.
    const volgende = [];
    if (s.kinderen.length && s.regeling && !s.gezag)
        volgende.push({ icoon: "juridisch", titel: t("components.EersteHome.volgende.gezag.titel"), tekst: t("components.EersteHome.volgende.gezag.tekst"), naar: "gezag" });
    if (s.kinderen.length && !s.afspraakToegevoegd)
        volgende.push({ icoon: "agenda", titel: t("components.EersteHome.volgende.afspraak.titel"), tekst: t("components.EersteHome.volgende.afspraak.tekst", { naam: namen[0] }), naar: "/agenda", actie: () => start.markeer({ afspraakToegevoegd: true }) });
    if (regeling)
        volgende.push({ icoon: "overdracht", titel: t("components.EersteHome.volgende.mee.titel"), tekst: t("components.EersteHome.volgende.mee.tekst"), naar: "/overdracht" });
    return (<>
      <GezagSheet open={gezagOpen} onClose={() => setGezagOpen(false)}/>
      {false && s.kinderen.length > 0 ? (<p role="status" className={`mt-6 flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${volgende.length ? "border border-border bg-card" : "bg-brand-soft text-brand"}`}>
          {volgende.length ? (<><span aria-hidden className="font-bold">{volgende.length}</span> {t("components.EersteHome.volgende.afstemmen", { count: volgende.length })}</>) : (<><Vinkje className="size-4"/> {t("components.EersteHome.volgende.allesAfgestemd")}</>)}
        </p>) : null}
      {volgende.length ? (<section className="mt-4">
          <h2 className="font-display text-lg font-bold">{t("components.EersteHome.volgende.kop")}</h2>
          <div className="mt-2 divide-y divide-border border-y border-border">
            {volgende.slice(0, 3).map((x) => (x.naar === "gezag" ? (<button key={x.titel} onClick={() => setGezagOpen(true)} className="flex w-full items-start gap-3 py-3 text-left"><StapInhoud x={x}/></button>) : x.naar === "/agenda" ? (<Link key={x.titel} to="/agenda" search={{ nieuw: true }} onClick={() => x.actie?.()} className="flex items-start gap-3 py-3"><StapInhoud x={x}/></Link>) : (<Link key={x.titel} to={x.naar} hash={x.hash} onClick={() => x.actie?.()} className="flex items-start gap-3 py-3"><StapInhoud x={x}/></Link>)))}
          </div>
        </section>) : null}

      {!basisKlaar && !s.voortgangVerborgen ? (<section className="mt-6 rounded-lg border border-border bg-card px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <button onClick={() => setIngeklapt((x) => !x)} aria-expanded={!ingeklapt} className="flex-1 text-left">
              <span className="block text-sm font-semibold">{t("components.EersteHome.start.voortgang", { n: aantalKlaar, totaal: stappen.length })}</span>
              <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface"><span className="block h-full rounded-full bg-brand" style={{ width: `${(aantalKlaar / stappen.length) * 100}%` }}/></span>
            </button>
            <button onClick={() => setIngeklapt((x) => !x)} className="min-h-[44px] text-xs font-semibold text-ink-soft">{ingeklapt ? t("components.EersteHome.start.toon") : t("components.EersteHome.start.inklappen")}</button>
          </div>
          {!ingeklapt ? (<>
              <ul className="mt-2 space-y-1.5">
                {stappen.map((x) => (<li key={x.label} className={`flex items-center gap-2 text-sm ${x.klaar ? "text-ink-soft" : ""}`}>
                    <span aria-hidden className={`grid size-5 place-items-center rounded-full text-[11px] font-bold ${x.klaar ? "bg-brand-soft text-brand" : "border border-border"}`}>{x.klaar ? <Vinkje className="size-3.5"/> : null}</span>
                    <span>{x.label}</span><span className="sr-only">{x.klaar ? t("components.EersteHome.start.klaar") : t("components.EersteHome.start.nogTeDoen")}</span>
                  </li>))}
              </ul>
              <button onClick={() => start.markeer({ voortgangVerborgen: true })} className="mt-2 text-xs font-semibold text-ink-soft">{t("components.EersteHome.start.nietMeer")}</button>
            </>) : null}
        </section>) : null}
    </>);
}
