import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { z } from "zod";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import i18n, { taalLocale } from "@/i18n";
import { AppShell, BackButton, Card } from "@/components/AppShell";
import { Chevron, MetChevron, Vinkje } from "@/components/Tekens";
import { GeschiedenisKnop } from "@/components/Geschiedenis";
import { wieNaam } from "@/lib/kring-store";
import { accepteerOverdracht, annuleerOverdracht, neemTaakOp, contactStatusLabel, eigenTaken, kindNaam, taakKandidaten, taakWieTekst, toggleTaak, useTaken, voegTaakToe, vraagOverdracht } from "@/lib/taken-store";
import { useStart } from "@/lib/start-store";
import { bevestig } from "@/lib/feedback";
import { HulpKnop, HulpVragen } from "@/components/HulpVragen";
import { useNavigate } from "@tanstack/react-router";
// Eigen gezin: eigen taken (geen voorbeelddata), met plusje en toevoegformulier.
function TakenWrap() {
    const st = useStart();
    if (st.eigen)
        return <EigenTaken />;
    return <Taken />;
}
function EigenTaken() {
    const { t: vt } = useTranslation();
    const st = useStart();
    useTaken(); // herbereken bij wijzigingen
    const nav = useNavigate();
    const [nieuw, setNieuw] = useState(false);
    const [hulpOpen, setHulpOpen] = useState(!!Route.useSearch().hulp);
    const [tekst, setTekst] = useState("");
    const [kind, setKind] = useState(st.kinderen[0]?.id ?? "alle");
    const lijst = eigenTaken();
    const actief = lijst.filter((t) => !t.klaar);
    const klaar = lijst.filter((t) => t.klaar);
    const knop = (aan) => `min-h-11 rounded-full border px-3 text-sm ${aan ? "border-brand bg-brand-soft font-semibold" : "border-border"}`;
    const opslaan = () => {
        if (!tekst.trim())
            return;
        voegTaakToe({ tekst: tekst.trim(), kind, wie: "sanne", herhaling: "eenmalig" });
        bevestig(vt("routes.taken.melding.toegevoegd"), { uitleg: tekst.trim() });
        setTekst("");
        setNieuw(false);
    };
    return (<AppShell>
      <KopMetPlus titel={vt("routes.taken.titel")} onPlus={() => setNieuw(true)} label={vt("routes.taken.nieuweTaak")}/>
      {nieuw ? (<Card className="mt-4 space-y-3">
          <p className="font-display text-lg font-bold">{vt("routes.taken.nieuweTaak")}</p>
          <label className="block text-sm font-semibold">{vt("routes.taken.form.wat")}<input value={tekst} onChange={(e) => setTekst(e.target.value)} placeholder={vt("routes.taken.form.watPlaceholder")} className={`mt-1 w-full font-normal ${veld}`}/></label>
          {st.kinderen.length ? (<fieldset><legend className="text-sm font-semibold">{vt("routes.taken.form.voorWie")}</legend><div className="mt-1 flex flex-wrap gap-2">
              {st.kinderen.map((k) => <button key={k.id} onClick={() => setKind(k.id)} aria-pressed={kind === k.id} className={knop(kind === k.id)}>{k.naam}</button>)}
              {st.kinderen.length > 1 ? <button onClick={() => setKind("alle")} aria-pressed={kind === "alle"} className={knop(kind === "alle")}>{vt("common.alleKinderen")}</button> : null}
            </div></fieldset>) : null}
          <HulpKnop voorstel={{ kind, wat: tekst }}/>
          <div className="flex gap-2">
            <button onClick={opslaan} className="min-h-11 flex-1 rounded-full bg-brand text-sm font-semibold text-primary-foreground">{vt("common.toevoegen")}</button>
            <button onClick={() => setNieuw(false)} className="min-h-11 px-3 text-sm text-ink-soft">{vt("common.annuleren")}</button>
          </div>
        </Card>) : null}
      {!lijst.length && !nieuw ? (<div className="mt-10 flex flex-col items-center text-center">
          <p className="font-display text-lg font-bold">{vt("routes.taken.leeg.titel")}</p>
          <p className="mt-1 max-w-xs text-sm text-ink-soft">{vt("routes.taken.leeg.tekst")}</p>
          <button onClick={() => setNieuw(true)} className="mt-5 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-primary-foreground">{vt("routes.taken.leeg.eerste")}</button>
          <button onClick={() => nav({ to: "/meer" })} className="mt-3 min-h-11 text-sm font-semibold text-ink-soft">{vt("routes.taken.leeg.terugMenu")}</button>
        </div>) : null}
      {actief.length ? (<ul className="mt-4 divide-y divide-border rounded-md border border-border bg-card">
          {actief.map((t) => (<li key={t.id} className="flex items-center gap-3 px-3 py-3">
              <button onClick={() => { toggleTaak(t.id); bevestig(vt("routes.taken.geregeld"), { uitleg: t.tekst, tril: true, ongedaan: () => toggleTaak(t.id) }); }} aria-label={vt("routes.taken.markeerGeregeld")} className="grid size-6 shrink-0 place-items-center rounded-full border border-ink-soft/40"/>
              <span className="flex-1 text-sm font-semibold">{t.tekst}</span>
              <span className="text-xs text-ink-soft">{kindNaam(t.kind).join(" & ")}</span>
            </li>))}
        </ul>) : null}
      {klaar.length ? (<ul className="mt-3 divide-y divide-border rounded-md border border-border bg-card">
          {klaar.map((t) => (<li key={t.id} className="flex items-center gap-3 px-3 py-3">
              <button onClick={() => toggleTaak(t.id)} aria-label={vt("routes.taken.markeerOpen")} className="relative grid size-6 shrink-0 place-items-center rounded-full border border-brand bg-brand text-primary-foreground after:absolute after:-inset-2 after:content-['']"><Vinkje className="size-3.5"/></button>
              <span className="flex-1 text-sm text-ink-soft line-through">{t.tekst}</span>
            </li>))}
        </ul>) : null}
      <HulpVragen open={hulpOpen} onOpenChange={setHulpOpen}/>
    </AppShell>);
}
export const Route = createFileRoute("/taken")({
    head: () => ({
        meta: [
            { title: i18n.t("routes.taken.meta.titel") },
            { name: "description", content: i18n.t("routes.taken.meta.beschrijving") },
            { property: "og:title", content: i18n.t("routes.taken.meta.titel") },
            { property: "og:description", content: i18n.t("routes.taken.meta.ogBeschrijving") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    validateSearch: z.object({ taak: z.string().optional(), deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), kind: z.string().optional(), hulp: z.boolean().optional(), dag: z.string().optional(), berichtId: z.string().optional(), gesprekId: z.string().optional() }),
    component: TakenWrap,
});
const herhalingLabel = (h) => i18n.t(`routes.taken.herhaling.${h}`);
const veld = "rounded-md border border-border bg-background px-3 py-2 text-sm";
const datumTekst = (d) => new Date(d).toLocaleDateString(taalLocale(), { day: "numeric", month: "long" });
const kindTekst = (k) => (k === "beide" ? "Emma & Noah" : k === "emma" ? "Emma" : "Noah");
const DAG = 86_400_000;
/** Later = deadline meer dan drie weken weg. */
const isLater = (t) => !!t.deadline && new Date(t.deadline).getTime() - Date.now() > 21 * DAG;
function Taken() {
    const { t: vt } = useTranslation();
    const { taken } = useTaken();
    const zoek = Route.useSearch();
    const [nieuw, setNieuw] = useState(!!zoek.taak || !!zoek.deadline);
    const [open, setOpen] = useState(null);
    const [afgerond, setAfgerond] = useState(false);
    const [hulpOpen, setHulpOpen] = useState(!!zoek.hulp);
    const actief = taken.filter((t) => !t.klaar);
    const later = actief.filter(isLater);
    const rest = actief.filter((t) => !isLater(t));
    const voorJou = rest.filter((t) => t.wie === "sanne" && !t.overdragenAan);
    // Nog afstemmen = nog geen verantwoordelijke of een overdracht die op antwoord wacht.
    const nogAfstemmen = rest.filter((t) => !t.wie || t.overdragenAan);
    const andereOuder = rest.filter((t) => t.wie && t.wie !== "sanne" && !t.overdragenAan);
    const klaar = taken.filter((t) => t.klaar);
    const rij = (t) => <TaakRij key={t.id} t={t} open={open === t.id} onOpen={() => setOpen(open === t.id ? null : t.id)}/>;
    return (<AppShell>
      <KopMetPlus titel={vt("routes.taken.titel")} onPlus={() => setNieuw(true)} label={vt("routes.taken.nieuweTaak")}/>

      {nieuw ? <NieuweTaak onKlaar={() => setNieuw(false)}/> : null}

      {voorJou.length ? <Groep titel={vt("routes.taken.groep.voorJou")} aantal={voorJou.length}>{voorJou.map(rij)}</Groep> : null}
      {nogAfstemmen.length ? <Groep titel={vt("routes.taken.groep.nogAfstemmen")} aantal={nogAfstemmen.length}>{nogAfstemmen.map(rij)}</Groep> : null}
      {andereOuder.length ? <Klap titel={vt("routes.taken.groep.bij", { naam: wieNaam("joris") })} aantal={andereOuder.length}>{andereOuder.map(rij)}</Klap> : null}
      {later.length ? <Klap titel={vt("routes.taken.groep.later")} aantal={later.length}>{later.map(rij)}</Klap> : null}
      {!actief.length ? <p className="mt-6 text-sm text-ink-soft">{vt("routes.taken.allesGeregeld")}</p> : null}

      {klaar.length ? (<div className="mt-4">
          <button onClick={() => setAfgerond(!afgerond)} className="min-h-11 text-sm font-semibold text-brand">{afgerond ? vt("routes.taken.verbergAfgerond") : <MetChevron>{vt("routes.taken.bekijkAfgerond")}</MetChevron>}</button>
          {afgerond ? <Groep titel={vt("routes.taken.groep.afgerond")}>{klaar.map(rij)}</Groep> : null}
        </div>) : null}

      <HulpVragen open={hulpOpen} onOpenChange={setHulpOpen}/>

    </AppShell>);
}
const GLAS = "rounded-[22px] border border-white/85 bg-white/60";
function KopMetPlus({ titel, onPlus, label }) {
    return (<div className="flex items-center gap-3">
      <BackButton terug="/meer"/>
      <h1 className="lora min-w-0 flex-1 text-[32px] leading-tight">{titel}</h1>
      <button aria-label={label} onClick={onPlus} className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-2xl leading-none text-primary-foreground"><Plus aria-hidden="true" strokeWidth={2.25} className="size-5"/></button>
    </div>);
}
function Groep({ titel, aantal, children }) {
    return (<section className="mt-5">
      <h2 className="px-1 text-[13px] font-black uppercase tracking-[0.08em] text-ink-soft">{titel}{aantal ? <span className="ml-1.5 text-xs">· {aantal}</span> : null}</h2>
      <ul className={`${GLAS} mt-2 divide-y divide-[#E9E1D5] px-1`}>{children}</ul>
    </section>);
}
function Klap({ titel, aantal, children }) {
    const [open, setOpen] = useState(false);
    return (<section className={`${GLAS} mt-4`}>
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-h-12 w-full items-center px-4 py-3 text-left">
        <span className="flex-1 text-[15.5px] font-black">{titel}<span className="ml-1.5 text-xs font-black text-ink-soft">· {aantal}</span></span>
        <Chevron richting="omlaag" open={open} className="size-4 text-ink-soft"/>
      </button>
      {open ? <ul className="divide-y divide-[#E9E1D5] border-t border-[#E9E1D5] px-1">{children}</ul> : null}
    </section>);
}
function TaakRij({ t, open, onOpen }) {
    const { t: vt } = useTranslation();
    const [overdragen, setOverdragen] = useState(false);
    const sub = [kindTekst(t.kind), t.contactStatus ? contactStatusLabel[t.contactStatus] : null, t.deadline ? vt("routes.taken.rij.voor", { datum: datumTekst(t.deadline) }) : t.wie && t.wie !== "sanne" ? vt("routes.taken.rij.regelt", { naam: wieNaam(t.wie) }) : !t.wie && !t.overdragenAan ? vt("routes.taken.rij.wiePakt") : null].filter(Boolean).join(" · ");
    return (<li id={`item-${t.id}`} className="zoekdoel px-3 py-3.5">
      <div className="flex items-start gap-3">
        <button disabled={!!t.overdragenAan} onClick={() => { toggleTaak(t.id); if (!t.klaar)
        bevestig(vt("routes.taken.geregeld"), { uitleg: t.tekst, tril: true, ongedaan: () => toggleTaak(t.id) }); }} aria-pressed={t.klaar} aria-label={t.klaar ? vt("routes.taken.markeerOpen") : vt("routes.taken.markeerGeregeld")} className={`relative mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 after:absolute after:-inset-2 after:content-[''] ${t.klaar ? "border-brand bg-brand text-primary-foreground" : "border-[#A9A097]"}`}>{t.klaar ? <Vinkje className="size-3.5"/> : null}</button>
        <button onClick={onOpen} aria-expanded={open} className="min-w-0 flex-1 text-left">
          <span className={`block text-[15.5px] ${t.klaar ? "text-ink-soft line-through" : "font-black"}`}>{t.tekst}</span>
          <span className="block text-xs text-ink-soft">{sub}</span>
          {t.overdragenAan ? <span className="block text-xs text-ink-soft">{vt("routes.taken.rij.gevraagdAan", { naam: wieNaam(t.overdragenAan) })}</span> : null}
        </button>
        <Chevron richting="omlaag" open={open} className="mt-1 size-4 text-ink-soft"/>
      </div>
      {!t.wie && !t.overdragenAan && !t.klaar ? (<div className="ml-9 mt-2 flex flex-wrap gap-2">
          <button onClick={() => { neemTaakOp(t.id); bevestig(vt("lib.takenStore.wie.jij"), { uitleg: t.tekst }); }} className="inline-flex h-9 items-center rounded-full bg-brand px-4 text-sm font-black text-primary-foreground">{vt("routes.taken.rij.ikDoeHet")}</button>
          {taakKandidaten(t).some((k) => k.id === "joris") ? <button onClick={() => vraagOverdracht(t.id, "joris")} className="inline-flex h-9 items-center rounded-full border border-[#E6DED2] bg-white px-4 text-sm font-black">{vt("routes.taken.rij.vraag", { naam: wieNaam("joris") })}</button> : null}
        </div>) : null}
      {open ? (<div className="ml-9 mt-2 space-y-1 text-xs">
          <p className="text-ink-soft">{taakWieTekst(t.wie)}{t.herhaling !== "eenmalig" ? ` · ${t.herhaling === "aangepast" ? t.herhalingTekst ?? vt("routes.taken.terugkerend") : herhalingLabel(t.herhaling)}` : ""}{t.herinnerDagen ? ` · ${vt("routes.taken.rij.herinnering", { count: t.herinnerDagen })}` : ""}</p>
          {t.overdragenAan ? (<p><button onClick={() => annuleerOverdracht(t.id)} className="min-h-11 font-semibold text-brand">{vt("routes.taken.rij.vraagIntrekken")}</button>{import.meta.env.DEV ? <> · <button onClick={() => accepteerOverdracht(t.id)} className="text-ink-soft underline">{vt("routes.taken.rij.voorbeeldAccepteren")}</button></> : null}</p>) : overdragen ? (<div className="flex flex-wrap gap-2">
              {taakKandidaten(t).filter((k) => k.id !== t.wie).map((k) => (<button key={k.id} onClick={() => { vraagOverdracht(t.id, k.id); setOverdragen(false); }} className="min-h-11 rounded-full border border-border px-3 font-semibold">{k.naam}</button>))}
              <button onClick={() => setOverdragen(false)} className="min-h-11 px-2 text-ink-soft">{vt("common.annuleren")}</button>
            </div>) : !t.klaar ? <button onClick={() => setOverdragen(true)} className="min-h-11 font-semibold text-brand">{vt("routes.taken.rij.overdragen")}</button> : null}
          {t.berichtId && t.gesprekId ? <Button asChild variant="link" className="h-auto min-h-11 px-0 text-xs"><Link to="/berichten" search={{ gesprek: t.gesprekId }}>{vt("routes.taken.rij.gesprek")}</Link></Button> : null}
          <GeschiedenisKnop soort="afspraak" itemId={t.id} naam={t.tekst}/>
        </div>) : null}
    </li>);
}
function NieuweTaak({ onKlaar }) {
    const { t } = useTranslation();
    const { taak: voorinvul, deadline: voorDeadline, kind: voorKind, dag, berichtId, gesprekId } = Route.useSearch();
    const [tekst, setTekst] = useState(voorinvul ?? "");
    const [kind, setKind] = useState(voorKind ?? (berichtId ? "" : "emma"));
    const [wie, setWie] = useState(berichtId ? "" : "sanne");
    const [metDatum, setMetDatum] = useState(!!voorDeadline || !!dag);
    const [deadline, setDeadline] = useState(voorDeadline ?? "");
    const [herhaling, setHerhaling] = useState("eenmalig");
    const [herhalingTekst, setHerhalingTekst] = useState("");
    const [herinner, setHerinner] = useState(voorDeadline ? 2 : 0);
    const kandidaten = taakKandidaten({ kind });
    const ander = kandidaten.find((k) => k.id === "joris");
    const opslaan = () => {
        if (!tekst.trim() || !kind || (dag && metDatum && !deadline))
            return;
        const d = metDatum && deadline ? deadline : "";
        voegTaakToe({ tekst: tekst.trim(), kind, wie: wie === "sanne" ? "sanne" : "", ...(wie && wie !== "sanne" ? { overdragenAan: wie } : {}), berichtId, gesprekId, herhaling, ...(herhaling === "aangepast" && herhalingTekst ? { herhalingTekst } : {}), ...(d ? { deadline: d } : {}), ...(d && herinner ? { herinnerDagen: herinner } : {}) });
        bevestig(t("routes.taken.melding.toegevoegd"), { uitleg: tekst.trim() });
        onKlaar();
    };
    const knop = (aan) => `min-h-11 rounded-full border px-3 text-sm ${aan ? "border-brand bg-brand-soft font-semibold" : "border-border"}`;
    return (<Card className="mt-4 space-y-3">
      <p className="font-display text-lg font-bold">{t("routes.taken.nieuweTaak")}</p>
      {berichtId ? <p className="text-xs text-ink-soft">{t("routes.taken.form.verzoek")}{dag ? ` ${t("routes.taken.form.welkeDatum", { dag })}` : ""}</p> : null}
      {wie === "joris" ? <p className="text-xs text-ink-soft">{t("routes.taken.form.andereGevraagd")}</p> : null}
      <label className="block text-sm font-semibold">{t("routes.taken.form.wat")}<input value={tekst} onChange={(e) => setTekst(e.target.value)} placeholder={t("routes.taken.form.watPlaceholder")} className={`mt-1 w-full font-normal ${veld}`}/></label>
      <fieldset><legend className="text-sm font-semibold">{t("routes.taken.form.voorWie")}</legend><div className="mt-1 flex flex-wrap gap-2">
        {[["emma", "Emma"], ["noah", "Noah"], ["beide", t("routes.taken.form.beideKinderen")]].map(([k, l]) => <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k} className={knop(kind === k)}>{l}</button>)}
      </div></fieldset>
      <fieldset><legend className="text-sm font-semibold">{t("routes.taken.form.wieRegelt")}</legend><div className="mt-1 flex flex-wrap gap-2">
        <button onClick={() => setWie("sanne")} aria-pressed={wie === "sanne"} className={knop(wie === "sanne")}>{t("routes.taken.form.ik")}</button>
        {ander ? <button onClick={() => setWie("joris")} aria-pressed={wie === "joris"} className={knop(wie === "joris")}>{ander.naam}</button> : null}
        <button onClick={() => setWie("")} aria-pressed={wie === ""} className={knop(wie === "")}>{t("routes.taken.groep.nogAfstemmen")}</button>
      </div></fieldset>
      <fieldset><legend className="text-sm font-semibold">{t("routes.taken.form.wanneer")}</legend><div className="mt-1 flex flex-wrap gap-2">
        <button onClick={() => setMetDatum(true)} aria-pressed={metDatum} className={knop(metDatum)}>{t("routes.taken.form.datum")}</button>
        <button onClick={() => setMetDatum(false)} aria-pressed={!metDatum} className={knop(!metDatum)}>{t("routes.taken.form.geenDatum")}</button>
      </div>
        {metDatum ? <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} aria-label={t("routes.taken.form.datum")} className={`mt-2 w-full ${veld}`}/> : null}
        {metDatum && deadline ? <select value={herinner} onChange={(e) => setHerinner(Number(e.target.value))} aria-label={t("routes.taken.form.herinnerMij")} className={`mt-2 w-full ${veld}`}><option value={0}>{t("routes.taken.form.geenHerinnering")}</option><option value={1}>{t("routes.taken.form.dagenVooraf", { count: 1 })}</option><option value={3}>{t("routes.taken.form.dagenVooraf", { count: 3 })}</option><option value={7}>{t("routes.taken.form.weekVooraf")}</option></select> : null}
      </fieldset>
      <fieldset><legend className="text-sm font-semibold">{t("routes.taken.form.herhaling")}</legend><div className="mt-1 flex flex-wrap gap-2">
        <button onClick={() => setHerhaling("eenmalig")} aria-pressed={herhaling === "eenmalig"} className={knop(herhaling === "eenmalig")}>{herhalingLabel("eenmalig")}</button>
        <button onClick={() => setHerhaling(herhaling === "eenmalig" ? "wekelijks" : herhaling)} aria-pressed={herhaling !== "eenmalig"} className={knop(herhaling !== "eenmalig")}>{t("routes.taken.terugkerend")}</button>
      </div>
        {herhaling !== "eenmalig" ? <select value={herhaling} onChange={(e) => setHerhaling(e.target.value)} aria-label={t("routes.taken.form.hoeVaak")} className={`mt-2 w-full ${veld}`}>{["wekelijks", "maandelijks", "jaarlijks", "aangepast"].map((h) => <option key={h} value={h}>{herhalingLabel(h)}</option>)}</select> : null}
        {herhaling === "aangepast" ? <input value={herhalingTekst} onChange={(e) => setHerhalingTekst(e.target.value)} placeholder={t("routes.taken.form.herhalingPlaceholder")} className={`mt-2 w-full ${veld}`}/> : null}
      </fieldset>
      <HulpKnop voorstel={{ kind, wat: tekst, ...(metDatum && deadline ? { datum: deadline } : {}) }}/>
      <button onClick={opslaan} disabled={!tekst.trim() || !kind || (!!dag && metDatum && !deadline)} className="min-h-11 w-full rounded-full bg-brand text-sm font-semibold text-primary-foreground disabled:opacity-40">{t("routes.taken.form.toevoegen")}</button>
      <button onClick={onKlaar} className="min-h-11 w-full text-sm font-semibold text-ink-soft">{t("common.annuleren")}</button>
    </Card>);
}
