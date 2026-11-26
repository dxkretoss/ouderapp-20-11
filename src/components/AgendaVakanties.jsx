import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { ExternalLink, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AppIcon } from "@/components/AppIcon";
import { MetChevron } from "@/components/Tekens";
import { useStart, start } from "@/lib/start-store";
import { useGezin } from "@/lib/gezin";
import { useVakanties, voegVakantieVoorstelToe, wijzigVakantieVoorstel } from "@/lib/vakantie-store";
import { dagenVoorJaar } from "@/lib/bijzondere-dagen";
import { useRegio, zetRegio, vakantiesVoor, regioLabel } from "@/lib/schoolvakanties";
import { bevestig } from "@/lib/feedback";
import { VerdeelHulp } from "@/components/VerdeelHulp";
import { plusDagen } from "@/lib/agenda-datum";
import { Chevron } from "@/components/Tekens";
import { chip as chipStijl, VELD } from "@/lib/ui-stijl";
export const REIS_BRON = "https://www.rijksoverheid.nl/documenten/2014/02/06/formulier-toestemming-reizen-met-minderjarige-naar-het-buitenland";
export function Reistoestemming({ vakantie }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    return <section className="border-y border-border py-3"><Button variant="ghost" className="h-auto min-h-11 w-full justify-start whitespace-normal px-0" onClick={() => setOpen(!open)}><AppIcon functie="reis" vorm="kaal"/>{t("components.AgendaVakanties.reis.knop")}</Button>{open ? <div className="space-y-3 text-sm"><p>{t("components.AgendaVakanties.reis.uitleg")}</p><dl className="divide-y divide-border"><div className="py-2"><dt className="text-ink-soft">{t("components.AgendaVakanties.reis.controleer")}</dt><dd>{vakantie.vanDatum ?? vakantie.periode}{vakantie.totDatum ? t("components.AgendaVakanties.reis.tm", { datum: vakantie.totDatum }) : ""} · {vakantie.bestemming || t("components.AgendaVakanties.reis.bestemmingControleren")}</dd></div></dl><ul className="list-disc space-y-1 pl-5 text-ink-soft"><li>{t("components.AgendaVakanties.reis.lijst.paspoort")}</li><li>{t("components.AgendaVakanties.reis.lijst.gezag")}</li><li>{t("components.AgendaVakanties.reis.lijst.formulier")}</li><li>{t("components.AgendaVakanties.reis.lijst.bestemmingsland")}</li></ul><Button asChild variant="outline" className="h-auto min-h-11 whitespace-normal"><a href={REIS_BRON} target="_blank" rel="noreferrer"><AppIcon functie="documenten" vorm="kaal"/>{t("components.AgendaVakanties.reis.formulierLink")}</a></Button><p className="text-xs text-ink-soft">{t("components.AgendaVakanties.reis.pdfUitleg")}</p></div> : null}</section>;
}
const label = (t, o) => o === "Sanne" ? t("components.AgendaVakanties.ouder.bijJou") : o === "Joris" ? t("components.AgendaVakanties.ouder.bijAnder") : o === "Samen" ? t("components.AgendaVakanties.ouder.samen") : t("components.AgendaVakanties.ouder.nietGeregeld");
const invoer = `mt-1 w-full min-w-0 ${VELD}`;
export function AgendaVakanties({ toevoegen, onVerwerkt }) {
    const { t, i18n } = useTranslation();
    const st = useStart(), regio = useRegio(), vak = useVakanties();
    const [tab, setTab] = useState("vakantie");
    const [jaar, setJaar] = useState(2026);
    const [formulier, setFormulier] = useState(null);
    useEffect(() => { if (toevoegen) {
        setTab(toevoegen);
        setFormulier({ soort: toevoegen });
        onVerwerkt?.();
    } }, [toevoegen]);
    const profielen = st.kinderen;
    const [kind, setKind] = useState("alle");
    const geselecteerd = profielen.filter((k) => kind === "alle" || kind === k.id);
    const schooljaar = `${jaar}-${jaar + 1}`;
    const school = geselecteerd.flatMap((k) => vakantiesVoor("schoolRegio" in k && k.schoolRegio ? k.schoolRegio : regio).filter((v) => v.schooljaar === schooljaar).map((v) => ({ ...v, kind: k.naam })));
    const schoolGroepen = [...new Set(school.map((v) => `${v.naam}|${v.van}|${v.tot}`))].flatMap((key) => { const groep = school.filter((v) => `${v.naam}|${v.van}|${v.tot}` === key); const eerste = groep[0]; return eerste ? [{ ...eerste, namen: groep.map((v) => v.kind).join(" & ") }] : []; });
    const maanden = { januari: "01", februari: "02", maart: "03", april: "04", mei: "05", juni: "06", juli: "07", augustus: "08", september: "09", oktober: "10", november: "11", december: "12" };
    const verjaardag = (datum) => { if (!datum)
        return undefined; if (/^\d{4}-\d{2}-\d{2}$/.test(datum))
        return `${jaar}${datum.slice(4)}`; const [d, m] = datum.split(" "); return d && m && maanden[m] ? `${jaar}-${maanden[m]}-${d.padStart(2, "0")}` : undefined; };
    const dagen = [...dagenVoorJaar(jaar), ...geselecteerd.flatMap((k) => { const datum = verjaardag(k.geboortedatum); return datum ? [{ datum, naam: t("components.AgendaVakanties.verjaardag", { naam: k.naam }), soort: "bijzonder" }] : []; })].sort((a, b) => a.datum.localeCompare(b.datum));
    const lijst = vak.filter((v) => (v.soort ?? (/pasen|kerst$/i.test(v.naam) ? "bijzonder" : "vakantie")) === tab && (kind === "alle" || !v.kinderen || v.kinderen.includes(kind)));
    const taal = i18n.language?.startsWith("en") ? "en-GB" : "nl-NL";
    const fmt = (iso, metJaar) => iso ? new Date(`${iso}T00:00`).toLocaleDateString(taal, { day: "numeric", month: "short", ...(metJaar ? { year: "numeric" } : {}) }) : "";
    const bereik = (van, tot) => van === tot ? fmt(van, true) : `${fmt(van, van.slice(0, 4) !== tot.slice(0, 4))} – ${fmt(tot, true)}`;
    const kaart = "rounded-[22px] border border-white/85 bg-white/60 shadow-[0_1px_2px_rgba(0,0,0,0.03)]";
    const keuze = "min-h-10 rounded-full border border-border bg-card pl-3 pr-8 text-sm font-semibold";
    return <div className="mt-4 space-y-5">
    <div className="grid grid-cols-2 gap-1 rounded-full bg-[color-mix(in_oklab,var(--foreground)_6%,transparent)] p-1" role="tablist" aria-label={t("components.AgendaVakanties.tabs.label")}>{[['vakantie', t("components.AgendaVakanties.tabs.vakantie")], ['bijzonder', t("components.AgendaVakanties.tabs.bijzonder")]].map(([id, tekst]) => <button type="button" key={id} role="tab" aria-selected={tab === id} className={`min-h-10 rounded-full px-3 text-sm font-semibold transition ${tab === id ? "bg-card text-brand shadow-sm" : "text-ink-soft"}`} onClick={() => setTab(id)}>{tekst}</button>)}</div>

    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3"><h2 className="font-display text-lg">{tab === "vakantie" ? t("components.AgendaVakanties.titel.vakanties") : t("components.AgendaVakanties.titel.bijzonder")}</h2></div>
      {profielen.length > 1 ? <div className="flex flex-wrap gap-2" role="group" aria-label={t("components.AgendaVakanties.kinderenKiezen")}>{[{ id: "alle", naam: t("common.alleKinderen") }, ...profielen].map((k) => <button type="button" key={k.id} aria-pressed={kind === k.id} className={chipStijl(kind === k.id)} onClick={() => setKind(k.id)}>{k.naam}</button>)}</div> : null}
      {lijst.length ? <div className={`divide-y divide-border px-4 ${kaart}`}>{lijst.map((v) => <Link key={v.id} to="/vakantie/$id" params={{ id: v.id }} className="flex min-h-11 items-center justify-between gap-2 py-3"><span className="min-w-0"><span className="block font-semibold">{v.naam}</span><span className="block text-xs text-ink-soft">{v.vanDatum && v.totDatum ? bereik(v.vanDatum, v.totDatum) : v.periode} · {v.status === "afgesproken" ? t("components.AgendaVakanties.status.afgesproken") : v.status === "ingetrokken" ? t("components.AgendaVakanties.status.ingetrokken") : v.reactie === "niet-akkoord" ? t("common.nietAkkoord") : v.status === "voorstel" ? v.van === "Sanne" ? t("components.AgendaVakanties.status.wachtOpAnder") : t("components.AgendaVakanties.status.jouwReactie") : t("components.AgendaVakanties.ouder.nietGeregeld")}</span></span><MetChevron className="max-w-[40%] shrink-0 text-right text-xs font-semibold text-brand">{label(t, v.ouder)}</MetChevron></Link>)}</div> : <div className={`flex items-center gap-3 px-4 py-4 ${kaart}`}><span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand"><AppIcon functie={tab === "vakantie" ? "vakantie" : "agenda"} vorm="kaal"/></span><p className="text-sm text-ink-soft">{t("components.AgendaVakanties.leeg")}</p></div>}
      <button type="button" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-brand px-4 text-sm font-semibold text-primary-foreground shadow-sm" onClick={() => setFormulier({ soort: tab })}><Plus aria-hidden="true" strokeWidth={2.2} className="size-4 shrink-0"/>{tab === "vakantie" ? t("components.AgendaVakanties.actie.vakantieVoorstellen") : t("components.AgendaVakanties.actie.bijzonderVerdelen")}</button>
      {!st.eigen && tab === "vakantie" ? <details className="group"><summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 py-2 text-sm font-semibold text-brand [&::-webkit-details-marker]:hidden"><Chevron className="size-4 shrink-0 group-open:rotate-90"/>{t("components.AgendaVakanties.verdelingBekijken")}</summary><VerdeelHulp /></details> : null}
    </section>

    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3"><h3 className="font-display text-lg">{tab === "vakantie" ? t("components.AgendaVakanties.schoolvakanties") : t("components.AgendaVakanties.opDeKalender")}</h3><select aria-label={tab === "vakantie" ? t("components.AgendaVakanties.schooljaar") : t("components.AgendaVakanties.jaar")} value={jaar} onChange={(e) => setJaar(Number(e.target.value))} className={keuze}>{[2025, 2026, 2027, 2028].map((j) => <option key={j} value={j}>{tab === "vakantie" ? `${j}–${j + 1}` : j}</option>)}</select></div>
      {tab === "vakantie" ? <>
        <div className={`divide-y divide-border px-4 ${kaart}`}>{geselecteerd.map((k) => <label key={k.id} className="flex min-h-12 items-center justify-between gap-3 py-2 text-sm"><span className="min-w-0 font-medium">{t("components.AgendaVakanties.schoolregioVan", { naam: k.naam })}</span><select aria-label={t("components.AgendaVakanties.schoolregioLabel", { naam: k.naam })} value={"schoolRegio" in k && k.schoolRegio ? k.schoolRegio : regio} className={`${keuze} max-w-[55%] shrink-0`} onChange={(e) => st.eigen ? start.zetKindRegio(k.id, e.target.value) : zetRegio(e.target.value)}>{Object.entries(regioLabel).map(([r, l]) => <option key={r} value={r}>{l}</option>)}</select></label>)}</div>
        <p className="px-1 text-xs leading-relaxed text-ink-soft">{t("components.AgendaVakanties.kalenderdata")}</p>
        {!schoolGroepen.length ? <p className="text-sm text-ink-soft"><Trans i18nKey="components.AgendaVakanties.geenData" components={{ link: <a className="text-brand underline" href="https://www.rijksoverheid.nl/onderwerpen/schoolvakanties" target="_blank" rel="noreferrer"/> }}/></p> : <ul className="space-y-2">{schoolGroepen.map((v) => <li key={v.naam + v.van} className={`p-4 ${kaart}`}>
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold leading-snug">{v.naam}</p><p className="mt-0.5 text-sm text-ink-soft">{bereik(v.van, v.tot)}{profielen.length > 1 ? ` · ${v.namen}` : ""}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${v.advies ? "bg-amber-100 text-amber-800" : "bg-brand-soft text-brand"}`}>{v.advies ? t("components.AgendaVakanties.adviesdata") : t("components.AgendaVakanties.vastgesteld")}</span></div>
          <div className="mt-3 flex items-center justify-between gap-3"><button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-brand/40 bg-brand-soft px-3.5 text-xs font-semibold text-brand" onClick={() => setFormulier({ soort: "vakantie", naam: v.naam, van: v.van, tot: v.tot })}><Plus aria-hidden="true" strokeWidth={2.2} className="size-3.5"/>{t("components.AgendaVakanties.verdelingVoorstellen")}</button><a className="inline-flex min-h-9 min-w-0 items-center gap-1 truncate text-xs text-ink-soft underline-offset-2 hover:underline" href={v.bron} target="_blank" rel="noreferrer"><span className="truncate">{t("components.AgendaVakanties.rijksoverheid")}</span><ExternalLink aria-hidden="true" className="size-3.5 shrink-0"/></a></div>
        </li>)}</ul>}
        <Link to="/agenda" search={{ nieuw: true, categorie: "school", titel: t("components.AgendaVakanties.afwijkendeSchooldag") }} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[22px] border border-dashed border-border px-4 py-3 text-center text-sm font-semibold text-ink-soft"><Plus aria-hidden="true" strokeWidth={2} className="size-4 shrink-0"/>{t("components.AgendaVakanties.studiedagToevoegen")}</Link>
      </> : <>
        <p className="px-1 text-xs leading-relaxed text-ink-soft">{t("components.AgendaVakanties.geenAparteAfspraak")}</p>
        <div className={`divide-y divide-border px-4 ${kaart}`}>{dagen.map((d) => <div key={d.datum + d.naam} className="flex items-center justify-between gap-3 py-3"><span className="min-w-0 text-sm font-medium">{d.naam}<span className="block text-xs font-normal text-ink-soft">{fmt(d.datum, true)}</span></span><button type="button" className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border border-brand/40 bg-brand-soft px-3 text-xs font-semibold text-brand" onClick={() => setFormulier({ soort: "bijzonder", naam: d.naam, van: d.datum, tot: d.datum })}>{t("components.AgendaVakanties.verdelingVoorstellen")}</button></div>)}</div>
      </>}
    </section>
    {formulier ? <VakantieFormulier init={formulier} onSluit={() => setFormulier(null)}/> : null}
  </div>;
}
export function VakantieFormulier({ init, bestaand, onSluit }) {
    const { t } = useTranslation();
    const st = useStart();
    const { gekoppeld } = useGezin();
    const profielen = st.kinderen;
    const [naam, setNaam] = useState(bestaand?.naam ?? init?.naam ?? "");
    const [van, setVan] = useState(bestaand?.vanDatum ?? init?.van ?? "");
    const [tot, setTot] = useState(bestaand?.totDatum ?? init?.tot ?? "");
    const [voor, setVoor] = useState(bestaand?.kinderen ?? profielen.map((k) => k.id));
    const [ouder, setOuder] = useState(bestaand?.ouder === "Joris" ? "Joris" : "Sanne");
    const [modus, setModus] = useState((bestaand?.verdeling?.length ?? 0) > 1 ? "zelf" : "hele");
    const [wisselDatum, setWisselDatum] = useState("");
    const [tijd, setTijd] = useState(bestaand?.verdeling?.[0]?.wisseltijd ?? "14:30");
    const [tijdVan, setTijdVan] = useState(bestaand?.verdeling?.[0]?.tijdVan ?? "00:00");
    const [tijdTot, setTijdTot] = useState(bestaand?.verdeling?.[0]?.tijdTot ?? "23:59");
    const [plek, setPlek] = useState(bestaand?.verdeling?.[0]?.plek ?? "");
    const [details, setDetails] = useState(bestaand?.details ?? "");
    const [herhaal, setHerhaal] = useState(bestaand?.herhaal ?? "eenmalig");
    const [buitenland, setBuitenland] = useState(bestaand?.buitenland ?? false);
    const [bestemming, setBestemming] = useState(bestaand?.bestemming ?? "");
    const [reactieDatum, setReactieDatum] = useState("");
    const [annuleren, setAnnuleren] = useState(false);
    const [delen, setDelen] = useState(bestaand?.verdeling ?? []);
    const [fout, setFout] = useState("");
    const soort = bestaand?.soort ?? init?.soort ?? "vakantie";
    const opslaan = () => {
        if (!van || !tot || tot < van || !voor.length || !naam.trim())
            return;
        const ander = ouder === "Sanne" ? "Joris" : "Sanne";
        let verdeling = [{ van, tot, ouder, plek, wisseltijd: tijd, tijdVan, tijdTot }];
        if (modus === "dag")
            verdeling = [{ van, tot: van, ouder, tijdVan, tijdTot: tijd, plek }, { van, tot: van, ouder: ander, tijdVan: tijd, tijdTot, plek }];
        if (modus === "feest")
            verdeling = [{ van, tot: van, ouder, plek }, { van: plusDagen(van, 1), tot: plusDagen(van, 1), ouder: ander, plek }];
        if (modus === "periode") {
            if (!wisselDatum || wisselDatum <= van || wisselDatum > tot) {
                setFout(t("components.AgendaVakanties.form.fout.wisseldatum"));
                return;
            }
            verdeling = [{ van, tot: plusDagen(wisselDatum, -1), ouder, plek }, { van: wisselDatum, tot, ouder: ander, plek, wisseltijd: tijd }];
        }
        if (modus === "zelf") {
            if (!delen.length || delen.some((d) => d.van < van || d.tot > tot || d.tot < d.van)) {
                setFout(t("components.AgendaVakanties.form.fout.delen"));
                return;
            }
            verdeling = delen;
        }
        const velden = { naam: naam.trim(), periode: t("components.AgendaVakanties.periode", { van, tot: modus === "feest" ? plusDagen(van, 1) : tot }), vanDatum: van, totDatum: modus === "feest" ? plusDagen(van, 1) : tot, kinderen: voor, ouder, details, soort, herhaal, verdeling, buitenland, bestemming, reactieDatum: reactieDatum || undefined, annuleren };
        if (bestaand ? !wijzigVakantieVoorstel(bestaand.id, velden) : !voegVakantieVoorstelToe(velden)) {
            setFout(t("components.AgendaVakanties.form.fout.verwerkt"));
            return;
        }
        bevestig(gekoppeld ? t("components.AgendaVakanties.form.verstuurd") : t("components.AgendaVakanties.form.vastgelegd"));
        onSluit();
    };
    return <Sheet open onOpenChange={(o) => !o && onSluit()}><SheetContent side="bottom" className="left-1/2 max-h-[90dvh] w-full max-w-md -translate-x-1/2 overflow-y-auto rounded-t-2xl bg-background px-5 pb-8"><SheetHeader><SheetTitle>{bestaand ? t("components.AgendaVakanties.form.titelWijzigen") : soort === "vakantie" ? t("components.AgendaVakanties.actie.vakantieVoorstellen") : t("components.AgendaVakanties.actie.bijzonderVerdelen")}</SheetTitle><SheetDescription>{t("components.AgendaVakanties.form.beschrijving")}</SheetDescription></SheetHeader><div className="mt-4 space-y-3">
    <label className="block text-sm">{t("components.AgendaVakanties.form.naam")}<input value={naam} onChange={(e) => setNaam(e.target.value)} className={invoer}/></label>
    <fieldset><legend className="text-sm">{t("components.AgendaVakanties.form.kinderen")}</legend><div className="flex flex-wrap gap-1">{profielen.map((k) => <label key={k.id} className="flex min-h-11 items-center gap-2 pr-3 text-sm"><input type="checkbox" checked={voor.includes(k.id)} onChange={(e) => setVoor((l) => e.target.checked ? [...l, k.id] : l.filter((id) => id !== k.id))}/>{k.naam}</label>)}</div></fieldset>
    <div className="grid grid-cols-2 gap-2"><label className="min-w-0 text-sm">{t("components.AgendaVakanties.form.begindatum")}<input type="date" value={van} onChange={(e) => { setVan(e.target.value); if (!tot || tot < e.target.value)
        setTot(e.target.value); }} className={invoer}/></label><label className="min-w-0 text-sm">{t("components.AgendaVakanties.form.einddatum")}<input type="date" min={van} value={tot} onChange={(e) => setTot(e.target.value)} className={invoer}/></label></div>
    <label className="block text-sm">{t("components.AgendaVakanties.form.hoeVerdelen")}<select value={modus} onChange={(e) => setModus(e.target.value)} className={invoer}><option value="hele">{t("components.AgendaVakanties.form.modus.hele")}</option><option value="periode">{t("components.AgendaVakanties.form.modus.periode")}</option>{soort === "bijzonder" ? <><option value="dag">{t("components.AgendaVakanties.form.modus.dag")}</option><option value="feest">{t("components.AgendaVakanties.form.modus.feest")}</option></> : null}<option value="zelf">{t("components.AgendaVakanties.form.modus.zelf")}</option></select></label>
    <label className="block text-sm">{modus === "hele" ? t("components.AgendaVakanties.form.welkeOuder") : t("components.AgendaVakanties.form.eersteDeel")}<select value={ouder} onChange={(e) => setOuder(e.target.value)} className={invoer}><option value="Sanne">{t("components.AgendaVakanties.ouder.bijJou")}</option><option value="Joris">{t("components.AgendaVakanties.ouder.bijAnder")}</option></select></label>
    {modus === "periode" ? <label className="block text-sm">{t("components.AgendaVakanties.form.wisseldatum")}<input type="date" value={wisselDatum} min={van} max={tot} onChange={(e) => setWisselDatum(e.target.value)} className={invoer}/></label> : null}
    <div className="grid grid-cols-2 gap-2"><label className="min-w-0 text-sm">{t("components.AgendaVakanties.form.begintijd")}<input type="time" value={tijdVan} onChange={(e) => setTijdVan(e.target.value)} className={invoer}/></label><label className="min-w-0 text-sm">{t("components.AgendaVakanties.form.eindtijd")}<input type="time" value={tijdTot} onChange={(e) => setTijdTot(e.target.value)} className={invoer}/></label></div>
    <label className="block text-sm">{t("components.AgendaVakanties.form.wisseltijd")}<input type="time" value={tijd} onChange={(e) => setTijd(e.target.value)} className={invoer}/></label><label className="block text-sm">{t("components.AgendaVakanties.form.locatie")}<input value={plek} onChange={(e) => setPlek(e.target.value)} className={invoer}/></label>
    {modus === "zelf" ? <fieldset className="space-y-2"><legend className="text-sm">{t("components.AgendaVakanties.form.jouwVerdeling")}</legend>{delen.map((d, i) => <div key={i} className="grid grid-cols-2 gap-2 border-b border-border py-2"><input aria-label={t("components.AgendaVakanties.form.deelBegin", { n: i + 1 })} type="date" value={d.van} onChange={(e) => setDelen((l) => l.map((x, n) => n === i ? { ...x, van: e.target.value } : x))} className={invoer}/><input aria-label={t("components.AgendaVakanties.form.deelEinde", { n: i + 1 })} type="date" value={d.tot} onChange={(e) => setDelen((l) => l.map((x, n) => n === i ? { ...x, tot: e.target.value } : x))} className={invoer}/><select aria-label={t("components.AgendaVakanties.form.deelOuder", { n: i + 1 })} value={d.ouder} onChange={(e) => setDelen((l) => l.map((x, n) => n === i ? { ...x, ouder: e.target.value } : x))} className={invoer}><option value="Sanne">{t("components.AgendaVakanties.ouder.bijJou")}</option><option value="Joris">{t("components.AgendaVakanties.ouder.bijAnder")}</option></select><Button variant="ghost" aria-label={t("components.AgendaVakanties.form.deelVerwijderen", { n: i + 1 })} onClick={() => setDelen((l) => l.filter((_, n) => n !== i))}><AppIcon functie="niet" vorm="kaal"/></Button></div>)}<Button variant="outline" onClick={() => setDelen((l) => [...l, { van, tot, ouder, plek }])}><AppIcon functie="toevoegen" vorm="kaal"/>{t("components.AgendaVakanties.form.deelToevoegen")}</Button></fieldset> : null}
    {soort === "bijzonder" ? <label className="block text-sm">{t("components.AgendaVakanties.form.herhalen")}<select value={herhaal} onChange={(e) => setHerhaal(e.target.value)} className={invoer}><option value="eenmalig">{t("components.AgendaVakanties.form.herhaal.eenmalig")}</option><option value="jaarlijks">{t("components.AgendaVakanties.form.herhaal.jaarlijks")}</option><option value="afwisselend">{t("components.AgendaVakanties.form.herhaal.afwisselend")}</option></select></label> : null}
    <label className="block text-sm">{t("components.AgendaVakanties.form.reactieDatum")}<input type="date" value={reactieDatum} onChange={(e) => setReactieDatum(e.target.value)} className={invoer}/></label><p className="text-xs text-ink-soft">{t("components.AgendaVakanties.form.reactieDatumUitleg")}</p>
    <label className="block text-sm">{t("components.AgendaVakanties.form.toelichting")}<textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={2} className={invoer}/></label>
    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={buitenland} onChange={(e) => setBuitenland(e.target.checked)}/>{t("components.AgendaVakanties.form.buitenland")}</label>{buitenland ? <><label className="block text-sm">{t("components.AgendaVakanties.form.bestemming")}<input value={bestemming} onChange={(e) => setBestemming(e.target.value)} className={invoer}/></label><p className="text-xs text-ink-soft">{t("components.AgendaVakanties.form.geenReistoestemming")}</p></> : null}
    {bestaand ? <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={annuleren} onChange={(e) => setAnnuleren(e.target.checked)}/>{t("components.AgendaVakanties.form.annulering")}</label> : null}
    {st.eigen && !gekoppeld ? <p className="text-sm text-ink-soft">{t("components.AgendaVakanties.form.eigenGezin")}</p> : null}{fout ? <p role="alert" className="text-sm text-destructive">{fout}</p> : null}
    <div className="voet-vast-sheet"><Button onClick={opslaan} className="min-h-12 w-full rounded-full" disabled={!naam.trim() || !van || !tot || tot < van || !voor.length}>{t("components.AgendaVakanties.form.versturen")}</Button></div>
  </div></SheetContent></Sheet>;
}
