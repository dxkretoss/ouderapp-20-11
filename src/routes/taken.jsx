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
import { laadWeergave } from "@/components/Laden";
import { takenBron } from "@/lib/taken-store";
import { accepteerOverdracht, annuleerOverdracht, herstelTaak, maakTaak, magTaakWijzigen, neemTaakOp, contactStatusLabel, kindNaam, ouderNaam, taakWieTekst, toggleTaak, useTaken, verwijderTaak, vraagAanMij, vraagOverdracht, weigerOverdracht, wijzigTaak } from "@/lib/taken-store";
import { useStart } from "@/lib/start-store";
import { useGezin } from "@/lib/gezin";
import { bevestig } from "@/lib/feedback";
import { HulpKnop, HulpVragen } from "@/components/HulpVragen";
import { DeelLabel, DelenKeuze, deelCheck, VerwijderDialoog } from "@/components/DelenKeuze";
import { useNavigate } from "@tanstack/react-router";
import { VELD, LABEL, chip as chipStijl, KNOP, KNOP_2, KAART } from "@/lib/ui-stijl";
// Eigen gezin (altijd, na inloggen): taken van de server (manage-tasks), met de volledige weergave.
function TakenWrap() {
    return <Taken />;
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
const veld = VELD;
const datumTekst = (d) => new Date(d).toLocaleDateString(taalLocale(), { day: "numeric", month: "long" });
const kindTekst = (k) => kindNaam(k).join(" & ");
const DAG = 86_400_000;
/** Later = deadline meer dan drie weken weg. */
const isLater = (t) => !!t.deadline && new Date(t.deadline).getTime() - Date.now() > 21 * DAG;
function Taken() {
    const { t: vt } = useTranslation();
    const { taken } = useTaken();
    const laadStatus = takenBron.useStatus();
    const g = useGezin();
    const ik = g.ik?.id ?? "";
    const nav = useNavigate();
    const zoek = Route.useSearch();
    const [nieuw, setNieuw] = useState(!!zoek.taak || !!zoek.deadline);
    const [open, setOpen] = useState(null);
    const [afgerond, setAfgerond] = useState(false);
    const [hulpOpen, setHulpOpen] = useState(!!zoek.hulp);
    const actief = taken.filter((t) => !t.klaar);
    const later = actief.filter(isLater);
    const rest = actief.filter((t) => !isLater(t));
    const voorJou = rest.filter((t) => t.wie === ik && !t.overdragenAan);
    // Nog afstemmen = nog geen verantwoordelijke of een overdracht die op antwoord wacht.
    const nogAfstemmen = rest.filter((t) => !t.wie || t.overdragenAan);
    const andereOuder = rest.filter((t) => t.wie && t.wie !== ik && !t.overdragenAan);
    const klaar = taken.filter((t) => t.klaar);
    const rij = (t) => <TaakRij key={t.id} t={t} open={open === t.id} onOpen={() => setOpen(open === t.id ? null : t.id)} onDicht={() => setOpen(null)}/>;
    return (<AppShell>
      <KopMetPlus titel={vt("routes.taken.titel")} onPlus={() => setNieuw(true)} label={vt("routes.taken.nieuweTaak")}/>

      {nieuw ? <TaakFormulier onKlaar={() => setNieuw(false)}/> : null}

      {!taken.length && !nieuw ? (laadWeergave(laadStatus, takenBron.ververs) ?? <div className="mt-10 flex flex-col items-center text-center">
          <p className="font-display text-lg font-bold">{vt("routes.taken.leeg.titel")}</p>
          <p className="mt-1 max-w-xs text-sm text-ink-soft">{vt("routes.taken.leeg.tekst")}</p>
          <div className="mt-6 flex w-full max-w-xs flex-col gap-2.5">
            <button onClick={() => setNieuw(true)} className="min-h-12 w-full rounded-full bg-brand px-5 text-sm font-semibold text-primary-foreground">{vt("routes.taken.leeg.eerste")}</button>
            <button onClick={() => nav({ to: "/meer" })} className="min-h-11 w-full rounded-full border border-border bg-card px-5 text-sm font-semibold text-ink-soft">{vt("routes.taken.leeg.terugMenu")}</button>
          </div>
        </div>) : null}

      {voorJou.length ? <Groep titel={vt("routes.taken.groep.voorJou")} aantal={voorJou.length}>{voorJou.map(rij)}</Groep> : null}
      {nogAfstemmen.length ? <Groep titel={vt("routes.taken.groep.nogAfstemmen")} aantal={nogAfstemmen.length}>{nogAfstemmen.map(rij)}</Groep> : null}
      {andereOuder.length ? <Klap titel={vt("routes.taken.groep.bij", { naam: g.ander?.naam || vt("common.deAndereOuder") })} aantal={andereOuder.length}>{andereOuder.map(rij)}</Klap> : null}
      {later.length ? <Klap titel={vt("routes.taken.groep.later")} aantal={later.length}>{later.map(rij)}</Klap> : null}
      {!actief.length && taken.length ? <p className="mt-5 rounded-xl bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)] px-3 py-3 text-center text-sm text-ink-soft">{vt("routes.taken.allesGeregeld")}</p> : null}

      {klaar.length ? (<div className="mt-4">
          <button onClick={() => setAfgerond(!afgerond)} aria-expanded={afgerond} className={`${GLAS} flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left`}><span className="min-w-0 flex-1 text-[15.5px] font-black">{afgerond ? vt("routes.taken.verbergAfgerond") : vt("routes.taken.bekijkAfgerond")}<span className="ml-1.5 text-xs font-black text-ink-soft">· {klaar.length}</span></span><Chevron richting="omlaag" open={afgerond} className="size-4 shrink-0 text-ink-soft"/></button>
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
        <span className="min-w-0 flex-1 text-[15.5px] font-black">{titel}<span className="ml-1.5 text-xs font-black text-ink-soft">· {aantal}</span></span>
        <Chevron richting="omlaag" open={open} className="size-4 shrink-0 text-ink-soft"/>
      </button>
      {open ? <ul className="divide-y divide-[#E9E1D5] border-t border-[#E9E1D5] px-1">{children}</ul> : null}
    </section>);
}
function TaakRij({ t, open, onOpen, onDicht }) {
    const { t: vt } = useTranslation();
    const g = useGezin();
    const ik = g.ik?.id ?? "";
    const [overdragen, setOverdragen] = useState(false);
    const [bewerk, setBewerk] = useState(false);
    const [weg, setWeg] = useState(false);
    const aanMij = vraagAanMij(t);
    const eigen = magTaakWijzigen(t);
    // De andere ouder van deze taak (het paar); alleen bij een gedeelde taak kun je die iets vragen.
    const ander = t.gedeeld && t.anderId ? t.anderId : t.door && t.door !== ik ? t.door : null;
    const anderNaam = ander ? ouderNaam(ander) || vt("common.deAndereOuder") : vt("common.deAndereOuder");
    const sub = [kindTekst(t.kind), t.contactStatus ? contactStatusLabel[t.contactStatus] : null, t.deadline ? vt("routes.taken.rij.voor", { datum: datumTekst(t.deadline) }) : t.wie && t.wie !== ik ? vt("routes.taken.rij.regelt", { naam: ouderNaam(t.wie) }) : !t.wie && !t.overdragenAan ? vt("routes.taken.rij.wiePakt") : null].filter(Boolean).join(" · ");
    const vink = async () => {
        const wasKlaar = t.klaar;
        if (await toggleTaak(t.id) && !wasKlaar)
            bevestig(vt("routes.taken.geregeld"), { uitleg: t.tekst, tril: true, ongedaan: () => toggleTaak(t.id) });
    };
    const ikDoeHet = async (actie) => {
        if (await actie(t.id))
            bevestig(vt("lib.takenStore.wie.jij"), { uitleg: t.tekst });
    };
    const verwijder = async () => {
        setWeg(false);
        onDicht?.();
        if (await verwijderTaak(t.id))
            bevestig(vt("routes.taken.melding.verwijderd"), { uitleg: t.tekst, ongedaan: () => herstelTaak(t.id) });
    };
    if (bewerk)
        return <li className="px-1 py-1"><TaakFormulier bestaand={t} onKlaar={() => setBewerk(false)}/></li>;
    return (<li id={`item-${t.id}`} className="zoekdoel px-3 py-3.5">
      <div className="flex items-start gap-3">
        <button disabled={!!t.overdragenAan} onClick={vink} aria-pressed={t.klaar} aria-label={t.klaar ? vt("routes.taken.markeerOpen") : vt("routes.taken.markeerGeregeld")} className={`relative mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 after:absolute after:-inset-2 after:content-[''] ${t.klaar ? "border-brand bg-brand text-primary-foreground" : "border-[#A9A097]"}`}>{t.klaar ? <Vinkje className="size-3.5"/> : null}</button>
        <button onClick={onOpen} aria-expanded={open} className="min-w-0 flex-1 text-left">
          <span className={`block text-[15.5px] ${t.klaar ? "text-ink-soft line-through" : "font-black"}`}>{t.tekst}</span>
          <span className="block text-xs text-ink-soft">{sub}</span>
          {t.overdragenAan ? <span className="block text-xs text-ink-soft">{aanMij ? vt("routes.taken.rij.gevraagdDoor", { naam: ouderNaam(t.gevraagdDoor) || vt("common.deAndereOuder") }) : vt("routes.taken.rij.gevraagdAan", { naam: ouderNaam(t.overdragenAan) })}</span> : null}
          {g.gekoppeld ? <DeelLabel gedeeld={!!t.gedeeld} className="mt-1"/> : null}
        </button>
        <Chevron richting="omlaag" open={open} className="mt-1 size-4 shrink-0 text-ink-soft"/>
      </div>
      {aanMij && !t.klaar ? (<div className="ml-9 mt-2 flex flex-wrap gap-2">
          <button onClick={() => ikDoeHet(accepteerOverdracht)} className="inline-flex min-h-10 items-center rounded-full bg-brand px-4 text-sm font-black text-primary-foreground">{vt("routes.taken.rij.ikDoeHet")}</button>
          <button onClick={() => weigerOverdracht(t.id)} className="inline-flex min-h-10 items-center rounded-full border border-[#E6DED2] bg-white px-4 text-sm font-black">{vt("routes.taken.rij.lieverNiet")}</button>
        </div>) : !t.wie && !t.overdragenAan && !t.klaar ? (<div className="ml-9 mt-2 flex flex-wrap gap-2">
          <button onClick={() => ikDoeHet(neemTaakOp)} className="inline-flex min-h-10 items-center rounded-full bg-brand px-4 text-sm font-black text-primary-foreground">{vt("routes.taken.rij.ikDoeHet")}</button>
          {ander ? <button onClick={() => vraagOverdracht(t.id, ander)} className="inline-flex min-h-10 items-center rounded-full border border-[#E6DED2] bg-white px-4 text-sm font-black">{vt("routes.taken.rij.vraag", { naam: anderNaam })}</button> : null}
        </div>) : null}
      {open ? (<div className="ml-9 mt-2 space-y-1 text-xs">
          <p className="text-ink-soft">{taakWieTekst(t.wie)}{t.herhaling !== "eenmalig" ? ` · ${t.herhaling === "aangepast" ? t.herhalingTekst ?? vt("routes.taken.terugkerend") : herhalingLabel(t.herhaling)}` : ""}{t.herinnerDagen ? ` · ${vt("routes.taken.rij.herinnering", { count: t.herinnerDagen })}` : ""}</p>
          {t.overdragenAan ? (t.gevraagdDoor === ik ? <p><button onClick={() => annuleerOverdracht(t.id)} className="min-h-11 font-semibold text-brand">{vt("routes.taken.rij.vraagIntrekken")}</button></p> : null) : overdragen ? (<div className="flex flex-wrap gap-2">
              {[ik, ander].filter((k) => k && k !== t.wie).map((k) => (<button key={k} onClick={() => { vraagOverdracht(t.id, k); setOverdragen(false); }} className="min-h-11 rounded-full border border-border px-3 font-semibold">{k === ik ? vt("common.jij") : anderNaam}</button>))}
              <button onClick={() => setOverdragen(false)} className="min-h-11 px-2 text-ink-soft">{vt("common.annuleren")}</button>
            </div>) : !t.klaar && [ik, ander].some((k) => k && k !== t.wie) ? <button onClick={() => setOverdragen(true)} className="min-h-11 font-semibold text-brand">{vt("routes.taken.rij.overdragen")}</button> : null}
          {!t.gedeeld && eigen && !t.klaar && g.gekoppeld ? <p className="text-ink-soft">{vt("routes.taken.rij.eerstDelen")}</p> : null}
          {t.berichtId && t.gesprekId ? <Button asChild variant="link" className="h-auto min-h-11 px-0 text-xs"><Link to="/berichten" search={{ gesprek: t.gesprekId }}>{vt("routes.taken.rij.gesprek")}</Link></Button> : null}
          <GeschiedenisKnop soort="taak" itemId={t.id} naam={t.tekst}/>
          {eigen ? (<div className="flex flex-wrap gap-4">
              <button onClick={() => setBewerk(true)} className="min-h-11 font-semibold text-brand">{vt("common.bewerken")}</button>
              <button onClick={() => setWeg(true)} className="min-h-11 font-semibold text-ink-soft">{vt("common.verwijderen")}</button>
            </div>) : null}
        </div>) : null}
      <VerwijderDialoog open={weg} onOpenChange={setWeg} titel={vt("routes.taken.verwijderen.titel")} tekst={t.gedeeld ? vt("routes.taken.verwijderen.tekstGedeeld") : vt("routes.taken.verwijderen.tekst")} onBevestig={verwijder}/>
    </li>);
}
/** Nieuwe taak, of (met `bestaand`) een taak wijzigen: titel, kind, datum, herhaling en "Alleen jij" / "Gedeeld". */
function TaakFormulier({ bestaand, onKlaar }) {
    const { t } = useTranslation();
    const zoek = Route.useSearch();
    const { taak: voorinvul, deadline: voorDeadline, kind: voorKind, dag, berichtId, gesprekId } = bestaand ? {} : zoek;
    const st = useStart();
    const g = useGezin();
    const ik = g.ik?.id ?? "";
    const [tekst, setTekst] = useState(bestaand?.tekst ?? voorinvul ?? "");
    const [kind, setKind] = useState(bestaand ? bestaand.kind : voorKind && (voorKind === "alle" || st.kinderen.some((k) => k.id === voorKind)) ? voorKind : berichtId ? "" : st.kinderen.length === 1 ? st.kinderen[0].id : "alle");
    const [wie, setWie] = useState(berichtId ? "" : ik);
    const [metDatum, setMetDatum] = useState(bestaand ? !!bestaand.deadline : !!voorDeadline || !!dag);
    const [deadline, setDeadline] = useState(bestaand?.deadline ?? voorDeadline ?? "");
    const [herhaling, setHerhaling] = useState(bestaand?.herhaling ?? "eenmalig");
    const [herhalingTekst, setHerhalingTekst] = useState(bestaand?.herhalingTekst ?? "");
    const [herinner, setHerinner] = useState(bestaand ? bestaand.herinnerDagen ?? 0 : voorDeadline ? 2 : 0);
    // Nieuw = standaard "Alleen jij"; een bestaande taak houdt wat hij was.
    const [gedeeld, setGedeeld] = useState(bestaand ? !!bestaand.gedeeld : false);
    const [anderKeuze, setAnderKeuze] = useState(bestaand?.anderId ?? "");
    const [bezig, setBezig] = useState(false);
    const ids = !kind ? [] : kind === "alle" ? st.kinderen.map((k) => k.id) : [kind];
    // Wie is "de andere ouder" bij deze kinderen? Zonder kind: de gekozen (of enige) andere ouder.
    const anderPersoon = ids.length ? g.anderVoor(ids) : g.coOuders.find((c) => c.id === anderKeuze) ?? g.anderVoor([]);
    const ander = anderPersoon ? { id: anderPersoon.id, naam: anderPersoon.naam || t("common.deAndereOuder") } : null;
    // Een taak die je aan de andere ouder vraagt (of die bij de andere ouder ligt) is altijd gedeeld.
    const vast = bestaand ? !!bestaand.overdragenAan || (!!bestaand.wie && bestaand.wie !== ik) : !!ander && wie === ander.id;
    const delen = deelCheck(g, ids, gedeeld || vast, anderKeuze);
    const geldig = !!tekst.trim() && !!kind && !(!!dag && metDatum && !deadline) && delen.ok && !bezig;
    const opslaan = async () => {
        if (!geldig)
            return;
        const d = metDatum && deadline ? deadline : "";
        setBezig(true);
        if (bestaand) {
            const gelukt = await wijzigTaak(bestaand.id, { tekst: tekst.trim(), kind, deadline: d, herhaling, herhalingTekst: herhaling === "aangepast" ? herhalingTekst : undefined, herinnerDagen: d ? herinner : 0, gedeeld: delen.gedeeld, anderId: delen.anderId });
            setBezig(false);
            if (gelukt) {
                bevestig(t("routes.taken.melding.opgeslagen"), { uitleg: tekst.trim() });
                onKlaar();
            }
            return;
        }
        const nieuw = await maakTaak({ tekst: tekst.trim(), kind, wie: wie === ik ? ik : "", ...(wie && wie !== ik ? { overdragenAan: wie } : {}), berichtId, gesprekId, herhaling, ...(herhaling === "aangepast" && herhalingTekst ? { herhalingTekst } : {}), ...(d ? { deadline: d } : {}), ...(d && herinner ? { herinnerDagen: herinner } : {}), gedeeld: delen.gedeeld, ...(delen.anderId ? { anderId: delen.anderId } : {}) });
        setBezig(false);
        if (!nieuw)
            return;
        bevestig(t("routes.taken.melding.toegevoegd"), { uitleg: tekst.trim() });
        onKlaar();
    };
    const knop = chipStijl;
    return (<Card className="mt-4 space-y-3">
      <p className="font-display text-lg font-bold">{bestaand ? t("routes.taken.form.wijzigen") : t("routes.taken.nieuweTaak")}</p>
      {berichtId ? <p className="text-xs text-ink-soft">{t("routes.taken.form.verzoek")}{dag ? ` ${t("routes.taken.form.welkeDatum", { dag })}` : ""}</p> : null}
      {!bestaand && ander && wie === ander.id ? <p className="text-xs text-ink-soft">{t("routes.taken.form.andereGevraagd")}</p> : null}
      <label className="block text-sm font-semibold">{t("routes.taken.form.wat")}<input value={tekst} maxLength={300} onChange={(e) => setTekst(e.target.value)} placeholder={t("routes.taken.form.watPlaceholder")} className={`mt-1 w-full font-normal ${veld}`}/></label>
      <fieldset><legend className="text-sm font-semibold">{t("routes.taken.form.voorWie")}</legend><div className="mt-1 flex flex-wrap gap-2">
        {[...st.kinderen.map((k) => [k.id, k.naam]), ...(st.kinderen.length !== 1 ? [["alle", st.kinderen.length ? t("common.alleKinderen") : t("routes.taken.form.heleGezin")]] : [])].map(([k, l]) => <button key={k} type="button" onClick={() => { setKind(k); if (wie && wie !== ik)
            setWie(""); }} aria-pressed={kind === k} className={knop(kind === k)}>{l}</button>)}
      </div></fieldset>
      {!bestaand ? (<fieldset><legend className="text-sm font-semibold">{t("routes.taken.form.wieRegelt")}</legend><div className="mt-1 flex flex-wrap gap-2">
        <button type="button" onClick={() => setWie(ik)} aria-pressed={wie === ik} className={knop(wie === ik)}>{t("routes.taken.form.ik")}</button>
        {ander ? <button type="button" onClick={() => setWie(ander.id)} aria-pressed={wie === ander.id} className={knop(wie === ander.id)}>{ander.naam}</button> : null}
        <button type="button" onClick={() => setWie("")} aria-pressed={wie === ""} className={knop(wie === "")}>{t("routes.taken.groep.nogAfstemmen")}</button>
      </div></fieldset>) : null}
      <fieldset><legend className="text-sm font-semibold">{t("routes.taken.form.wanneer")}</legend><div className="mt-1 flex flex-wrap gap-2">
        <button type="button" onClick={() => setMetDatum(true)} aria-pressed={metDatum} className={knop(metDatum)}>{t("routes.taken.form.datum")}</button>
        <button type="button" onClick={() => setMetDatum(false)} aria-pressed={!metDatum} className={knop(!metDatum)}>{t("routes.taken.form.geenDatum")}</button>
      </div>
        {metDatum ? <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} aria-label={t("routes.taken.form.datum")} className={`mt-2 w-full ${veld}`}/> : null}
        {metDatum && deadline ? <select value={herinner} onChange={(e) => setHerinner(Number(e.target.value))} aria-label={t("routes.taken.form.herinnerMij")} className={`mt-2 w-full ${veld}`}><option value={0}>{t("routes.taken.form.geenHerinnering")}</option><option value={1}>{t("routes.taken.form.dagenVooraf", { count: 1 })}</option><option value={3}>{t("routes.taken.form.dagenVooraf", { count: 3 })}</option><option value={7}>{t("routes.taken.form.weekVooraf")}</option></select> : null}
      </fieldset>
      <fieldset><legend className="text-sm font-semibold">{t("routes.taken.form.herhaling")}</legend><div className="mt-1 flex flex-wrap gap-2">
        <button type="button" onClick={() => setHerhaling("eenmalig")} aria-pressed={herhaling === "eenmalig"} className={knop(herhaling === "eenmalig")}>{herhalingLabel("eenmalig")}</button>
        <button type="button" onClick={() => setHerhaling(herhaling === "eenmalig" ? "wekelijks" : herhaling)} aria-pressed={herhaling !== "eenmalig"} className={knop(herhaling !== "eenmalig")}>{t("routes.taken.terugkerend")}</button>
      </div>
        {herhaling !== "eenmalig" ? <select value={herhaling} onChange={(e) => setHerhaling(e.target.value)} aria-label={t("routes.taken.form.hoeVaak")} className={`mt-2 w-full ${veld}`}>{["wekelijks", "maandelijks", "jaarlijks", "aangepast"].map((h) => <option key={h} value={h}>{herhalingLabel(h)}</option>)}</select> : null}
        {herhaling === "aangepast" ? <input value={herhalingTekst} maxLength={120} onChange={(e) => setHerhalingTekst(e.target.value)} placeholder={t("routes.taken.form.herhalingPlaceholder")} className={`mt-2 w-full ${veld}`}/> : null}
      </fieldset>
      <DelenKeuze kindIds={ids} gedeeld={gedeeld} onGedeeld={setGedeeld} anderId={anderKeuze} onAnderId={setAnderKeuze} vast={vast}/>
      {!bestaand ? <HulpKnop voorstel={{ kind, wat: tekst, ...(metDatum && deadline ? { datum: deadline } : {}) }}/> : null}
      <button onClick={opslaan} disabled={!geldig} className={`w-full ${KNOP}`}>{bestaand ? t("common.opslaan") : t("routes.taken.form.toevoegen")}</button>
      <button type="button" onClick={onKlaar} className="min-h-11 w-full text-sm font-semibold text-ink-soft">{t("common.annuleren")}</button>
    </Card>);
}
