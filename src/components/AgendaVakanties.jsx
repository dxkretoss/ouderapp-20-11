import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AppIcon } from "@/components/AppIcon";
import { MetChevron } from "@/components/Tekens";
import { useStart, start } from "@/lib/start-store";
import { kinderen as demoKinderen } from "@/lib/demo-data";
import { useVakanties, voegVakantieVoorstelToe, wijzigVakantieVoorstel } from "@/lib/vakantie-store";
import { dagenVoorJaar } from "@/lib/bijzondere-dagen";
import { useRegio, zetRegio, vakantiesVoor, regioLabel } from "@/lib/schoolvakanties";
import { bevestig } from "@/lib/feedback";
import { VerdeelHulp } from "@/components/VerdeelHulp";
import { plusDagen } from "@/lib/agenda-datum";
import { Chevron } from "@/components/Tekens";
export const REIS_BRON = "https://www.rijksoverheid.nl/documenten/2014/02/06/formulier-toestemming-reizen-met-minderjarige-naar-het-buitenland";
export function Reistoestemming({ vakantie }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    return <section className="border-y border-border py-3"><Button variant="ghost" className="h-auto min-h-11 w-full justify-start whitespace-normal px-0" onClick={() => setOpen(!open)}><AppIcon functie="reis" vorm="kaal"/>{t("components.AgendaVakanties.reis.knop")}</Button>{open ? <div className="space-y-3 text-sm"><p>{t("components.AgendaVakanties.reis.uitleg")}</p><dl className="divide-y divide-border"><div className="py-2"><dt className="text-ink-soft">{t("components.AgendaVakanties.reis.controleer")}</dt><dd>{vakantie.vanDatum ?? vakantie.periode}{vakantie.totDatum ? t("components.AgendaVakanties.reis.tm", { datum: vakantie.totDatum }) : ""} · {vakantie.bestemming || t("components.AgendaVakanties.reis.bestemmingControleren")}</dd></div></dl><ul className="list-disc space-y-1 pl-5 text-ink-soft"><li>{t("components.AgendaVakanties.reis.lijst.paspoort")}</li><li>{t("components.AgendaVakanties.reis.lijst.gezag")}</li><li>{t("components.AgendaVakanties.reis.lijst.formulier")}</li><li>{t("components.AgendaVakanties.reis.lijst.bestemmingsland")}</li></ul><Button asChild variant="outline" className="h-auto min-h-11 whitespace-normal"><a href={REIS_BRON} target="_blank" rel="noreferrer"><AppIcon functie="documenten" vorm="kaal"/>{t("components.AgendaVakanties.reis.formulierLink")}</a></Button><p className="text-xs text-ink-soft">{t("components.AgendaVakanties.reis.pdfUitleg")}</p></div> : null}</section>;
}
const label = (t, o) => o === "Sanne" ? t("components.AgendaVakanties.ouder.bijJou") : o === "Joris" ? t("components.AgendaVakanties.ouder.bijAnder") : o === "Samen" ? t("components.AgendaVakanties.ouder.samen") : t("components.AgendaVakanties.ouder.nietGeregeld");
const invoer = "mt-1 min-h-11 w-full min-w-0 rounded-md border border-border bg-card px-3 py-2 text-sm";
export function AgendaVakanties({ toevoegen, onVerwerkt }) {
    const { t } = useTranslation();
    const st = useStart(), regio = useRegio(), vak = useVakanties();
    const [tab, setTab] = useState("vakantie");
    const [jaar, setJaar] = useState(2026);
    const [formulier, setFormulier] = useState(null);
    useEffect(() => { if (toevoegen) {
        setTab(toevoegen);
        setFormulier({ soort: toevoegen });
        onVerwerkt?.();
    } }, [toevoegen]);
    const profielen = st.eigen ? st.kinderen : demoKinderen;
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
    const lijst = st.eigen ? [] : vak.filter((v) => (v.soort ?? (/pasen|kerst$/i.test(v.naam) ? "bijzonder" : "vakantie")) === tab && (kind === "alle" || !v.kinderen || v.kinderen.includes(kind)));
    return <div className="mt-4">
    <div className="flex border-b border-border" role="tablist" aria-label={t("components.AgendaVakanties.tabs.label")}>{[['vakantie', t("components.AgendaVakanties.tabs.vakantie")], ['bijzonder', t("components.AgendaVakanties.tabs.bijzonder")]].map(([id, tekst]) => <Button key={id} role="tab" aria-selected={tab === id} variant="ghost" className={`min-h-11 flex-1 rounded-none ${tab === id ? "border-b-2 border-brand text-brand" : "text-ink-soft"}`} onClick={() => setTab(id)}>{tekst}</Button>)}</div>
    <div className="my-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-display text-lg">{tab === "vakantie" ? t("components.AgendaVakanties.titel.vakanties") : t("components.AgendaVakanties.titel.bijzonder")}</h2><Button variant="outline" className="h-auto min-h-11 whitespace-normal" onClick={() => setFormulier({ soort: tab })}><AppIcon functie="toevoegen" vorm="kaal"/>{tab === "vakantie" ? t("components.AgendaVakanties.actie.vakantieVoorstellen") : t("components.AgendaVakanties.actie.bijzonderVerdelen")}</Button></div>
    <div className="flex flex-wrap gap-1" aria-label={t("components.AgendaVakanties.kinderenKiezen")}>{[{ id: "alle", naam: t("common.alleKinderen") }, ...profielen].map((k) => <Button key={k.id} size="sm" variant={kind === k.id ? "default" : "ghost"} className="min-h-11" onClick={() => setKind(k.id)}>{k.naam}</Button>)}</div>
    {lijst.length ? <div className="my-3 divide-y divide-border border-y border-border">{lijst.map((v) => <Link key={v.id} to="/vakantie/$id" params={{ id: v.id }} className="flex min-h-11 items-center justify-between gap-2 py-3"><span className="min-w-0"><span className="block font-semibold">{v.naam}</span><span className="block text-xs text-ink-soft">{v.periode} · {v.status === "afgesproken" ? t("components.AgendaVakanties.status.afgesproken") : v.status === "ingetrokken" ? t("components.AgendaVakanties.status.ingetrokken") : v.reactie === "niet-akkoord" ? t("common.nietAkkoord") : v.status === "voorstel" ? v.van === "Sanne" ? t("components.AgendaVakanties.status.wachtOpAnder") : t("components.AgendaVakanties.status.jouwReactie") : t("components.AgendaVakanties.ouder.nietGeregeld")}</span></span><MetChevron className="shrink-0 text-xs text-brand">{label(t, v.ouder)}</MetChevron></Link>)}</div> : <p className="my-3 text-sm text-ink-soft">{t("components.AgendaVakanties.leeg")}</p>}
    {!st.eigen && tab === "vakantie" ? <details className="group my-3"><summary className="flex list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden min-h-11 cursor-pointer py-2 text-sm font-semibold text-brand"><Chevron className="size-4 shrink-0 group-open:rotate-90"/>{t("components.AgendaVakanties.verdelingBekijken")}</summary><VerdeelHulp /></details> : null}
    <div className="mt-5 flex items-center justify-between gap-2"><h3 className="font-display">{tab === "vakantie" ? t("components.AgendaVakanties.schoolvakanties") : t("components.AgendaVakanties.opDeKalender")}</h3><select aria-label={tab === "vakantie" ? t("components.AgendaVakanties.schooljaar") : t("components.AgendaVakanties.jaar")} value={jaar} onChange={(e) => setJaar(Number(e.target.value))} className="min-h-11 rounded-md border border-border bg-card px-2 text-sm">{[2025, 2026, 2027, 2028].map((j) => <option key={j} value={j}>{tab === "vakantie" ? `${j}–${j + 1}` : j}</option>)}</select></div>
    {tab === "vakantie" ? <><div className="my-3 space-y-2">{geselecteerd.map((k) => <label key={k.id} className="flex items-center justify-between gap-3 text-sm"><span>{t("components.AgendaVakanties.schoolregioVan", { naam: k.naam })}</span><select aria-label={t("components.AgendaVakanties.schoolregioLabel", { naam: k.naam })} value={"schoolRegio" in k && k.schoolRegio ? k.schoolRegio : regio} className="min-h-11 rounded-md border border-border bg-card px-2" onChange={(e) => st.eigen ? start.zetKindRegio(k.id, e.target.value) : zetRegio(e.target.value)}>{Object.entries(regioLabel).map(([r, l]) => <option key={r} value={r}>{l}</option>)}</select></label>)}</div><p className="text-xs text-ink-soft">{t("components.AgendaVakanties.kalenderdata")}</p>{!schoolGroepen.length ? <p className="mt-3 text-sm text-ink-soft"><Trans i18nKey="components.AgendaVakanties.geenData" components={{ link: <a className="text-brand underline" href="https://www.rijksoverheid.nl/onderwerpen/schoolvakanties" target="_blank" rel="noreferrer"/> }}/></p> : null}<div className="mt-2 divide-y divide-border">{schoolGroepen.map((v) => <div key={v.naam + v.van} className="py-3"><p className="text-sm font-semibold">{v.naam} · {v.namen}</p><p className="text-xs text-ink-soft">{t("components.AgendaVakanties.periode", { van: v.van, tot: v.tot })} · {v.advies ? t("components.AgendaVakanties.adviesdata") : t("components.AgendaVakanties.vastgesteld")}</p><div className="flex flex-wrap gap-3"><Button variant="link" className="min-h-11 px-0 text-xs" onClick={() => setFormulier({ soort: "vakantie", naam: v.naam, van: v.van, tot: v.tot })}>{t("components.AgendaVakanties.verdelingVoorstellen")}</Button><a className="inline-flex min-h-11 items-center text-xs text-brand underline" href={v.bron} target="_blank" rel="noreferrer">{t("components.AgendaVakanties.rijksoverheid")}</a></div></div>)}</div><Button asChild variant="ghost" className="mt-2 h-auto min-h-11 whitespace-normal"><Link to="/agenda" search={{ nieuw: true, categorie: "school", titel: t("components.AgendaVakanties.afwijkendeSchooldag") }}>{t("components.AgendaVakanties.studiedagToevoegen")}</Link></Button></> : <><p className="mt-2 text-xs text-ink-soft">{t("components.AgendaVakanties.geenAparteAfspraak")}</p><div className="mt-2 divide-y divide-border">{dagen.map((d) => <div key={d.datum + d.naam} className="flex items-center justify-between gap-2 py-2"><span className="min-w-0 text-sm">{d.naam}<span className="block text-xs text-ink-soft">{d.datum}</span></span><Button variant="link" className="h-auto min-h-11 max-w-32 whitespace-normal text-xs" onClick={() => setFormulier({ soort: "bijzonder", naam: d.naam, van: d.datum, tot: d.datum })}>{t("components.AgendaVakanties.verdelingVoorstellen")}</Button></div>)}</div></>}
    <Button asChild variant="link" className="mt-4 min-h-11 px-0 text-xs"><Link to="/planning" search={{ eerder: true }}>{t("components.AgendaVakanties.eerder")}</Link></Button>
    {formulier ? <VakantieFormulier init={formulier} onSluit={() => setFormulier(null)}/> : null}
  </div>;
}
export function VakantieFormulier({ init, bestaand, onSluit }) {
    const { t } = useTranslation();
    const st = useStart();
    const profielen = st.eigen ? st.kinderen : demoKinderen;
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
        bevestig(t("components.AgendaVakanties.form.verstuurd"));
        onSluit();
    };
    return <Sheet open onOpenChange={(o) => !o && onSluit()}><SheetContent side="bottom" className="left-1/2 max-h-[90vh] w-full max-w-md -translate-x-1/2 overflow-y-auto rounded-t-2xl bg-background px-5 pb-8"><SheetHeader><SheetTitle>{bestaand ? t("components.AgendaVakanties.form.titelWijzigen") : soort === "vakantie" ? t("components.AgendaVakanties.actie.vakantieVoorstellen") : t("components.AgendaVakanties.actie.bijzonderVerdelen")}</SheetTitle><SheetDescription>{t("components.AgendaVakanties.form.beschrijving")}</SheetDescription></SheetHeader><div className="mt-4 space-y-3">
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
    {st.eigen ? <p className="text-sm text-ink-soft">{t("components.AgendaVakanties.form.eigenGezin")}</p> : null}{fout ? <p role="alert" className="text-sm text-destructive">{fout}</p> : null}
    <Button onClick={opslaan} className="min-h-11 w-full" disabled={st.eigen || !naam.trim() || !van || !tot || tot < van || !voor.length}>{t("components.AgendaVakanties.form.versturen")}</Button>
  </div></SheetContent></Sheet>;
}
