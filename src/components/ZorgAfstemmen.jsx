import { GeschiedenisKnop } from "@/components/Geschiedenis";
import { useBevestigPopup } from "@/lib/feedback";
import { Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { FilterBalk } from "@/components/ui-kit";
import { accepteer, dienVoorstelIn, kindNamen, statusLabel, structureelOp, stuurHerinnering, trekIn, useZorg, vraagMeerTijd, wijsAf } from "@/lib/zorg-store";
import { useStart } from "@/lib/start-store";
import { useGezin } from "@/lib/gezin";
import { iso } from "@/lib/agenda-datum";
import { magHerinnering } from "@/lib/herinneringen";
import { useGevolgen } from "@/lib/gevolgen";
import { AppIcon } from "@/components/AppIcon";
import { Chevron, Kruis, MetChevron, MetVinkje } from "@/components/Tekens";
import { CornerDownRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VoorstelIntrekken } from "@/components/VoorstelIntrekken";
import { useVoorkeuren } from "@/lib/voorkeuren-store";
import { eerderZonderAkkoord, kiesReminder, nietAkkoordTekst, onderwerpen, reminders } from "@/lib/afstemming";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { dt, plusDagen } from "@/lib/agenda-datum";
import { zorgOp } from "@/lib/zorg-store";
import { ouderLabel } from "@/lib/agenda-zorg";
import { VELD } from "@/lib/ui-stijl";
/**
 * Wijzigingen in de verdeling van de week.
 * - weergave "alles" (standaard): verzoeken, eigen vragen en eerdere voorstellen (in het voorstellen-overzicht)
 * - weergave "verzoeken": alleen de open verzoeken van de andere ouder, boven de kalender
 * - weergave "formulier": alleen het formulier "Wijziging voorstellen" als pop-up (vanaf + of een dag)
 */
export function ZorgAfstemmen({ startActie, kind, sluit, doel, voorstelType, bronOmschrijving, datum, weergave = "alles" }) {
    const { t, i18n } = useTranslation();
    const router = useRouter();
    const zorg = useZorg();
    const st = useStart();
    const { gekoppeld } = useGezin();
    const alleKids = st.kinderen.map((k) => k.id);
    const vandaagIso = datum && /^\d{4}-\d{2}-\d{2}$/.test(datum) ? datum : iso(new Date());
    const lijst = zorg.voorstellen.filter((v) => (kind === "alle" || v.kinderen.includes(kind)) && (!doel || v.id === doel));
    const [bevestigd, setBevestigd] = useState("");
    useBevestigPopup(bevestigd);
    const [eerderOpen, setEerderOpen] = useState(!!doel);
    const reageren = lijst.filter((v) => v.status === "open" && !v.vanMij);
    const eigen = lijst.filter((v) => v.status === "open" && v.vanMij);
    const eerder = lijst.filter((v) => v.status !== "open");
    const vk = useVoorkeuren();
    const ga = vk.gestructureerdAfstemmen;
    const vastgelopen = onderwerpen(lijst).filter((o) => o.geenOvereenstemming);
    const [gesloten, setGesloten] = useState([]);
    const reminder = kiesReminder(vastgelopen.length ? "vastgelopen" : reageren.length || startActie ? "voorstel" : null, { aan: ga, veiligheid: false, gesloten });
    const [altId, setAltId] = useState(null);
    const [nieuw, setNieuw] = useState(startActie === "regeling" ? t("components.ZorgAfstemmen.prefill") : "");
    const [soort, setSoort] = useState(startActie === "regeling" ? "structureel" : "eenmalig");
    const [voor, setVoor] = useState(kind === "alle" ? alleKids : [kind]);
    const [dagVan, setDagVan] = useState(16);
    const [dagTot, setDagTot] = useState(16);
    const [naar, setNaar] = useState("sanne");
    const [vanDatum, setVanDatum] = useState(vandaagIso);
    const [totDatum, setTotDatum] = useState(vandaagIso);
    const [wisseltijd, setWisseltijd] = useState("14:30");
    const [plek, setPlek] = useState("");
    const [alleDagen, setAlleDagen] = useState(false);
    useEffect(() => setVoor((v) => kind === "alle" ? alleKids : v.includes(kind) ? v : [kind]), [kind, alleKids.join()]);
    useEffect(() => {
        if (!startActie || altId)
            return;
        setNieuw(bronOmschrijving ?? (startActie === "regeling" ? t("components.ZorgAfstemmen.prefill") : ""));
        setSoort(startActie === "regeling" ? "structureel" : "eenmalig");
    }, [startActie, altId, bronOmschrijving]);
    const reageer = (id, f) => f();
    const [reactieDatum, setReactieDatum] = useState("");
    const verstuur = () => {
        const eind = soort === "eenmalig" ? totDatum : vanDatum;
        if (eind < vanDatum)
            return;
        const datums = [];
        for (let d = vanDatum; d <= eind && datums.length < 366; d = plusDagen(d, 1))
            datums.push(d);
        const tot = Math.max(dagVan, dagTot);
        const id = dienVoorstelIn({
            soort, kinderen: voor, tekst: nieuw.trim(), naarOuder: naar, datums, wisseltijd, plek,
            dagen: soort === "eenmalig" ? Array.from({ length: tot - dagVan + 1 }, (_, i) => dagVan + i) : [dagVan],
            datumLabel: soort === "eenmalig" ? t("components.ZorgAfstemmen.datumLabel.periode", { van: vanDatum, tot: totDatum }) : t("components.ZorgAfstemmen.datumLabel.vanaf", { van: vanDatum }),
            aanleiding: soort === "structureel" ? "regeling" : voorstelType ?? "wijziging",
            ...(reactieDatum ? { reactieDatum } : {}),
        }, altId ?? undefined);
        if (!id)
            return;
        setNieuw("");
        setAltId(null);
        setReactieDatum("");
        setBevestigd(gekoppeld ? t("components.ZorgAfstemmen.bevestigd.verstuurd") : t("components.ZorgAfstemmen.bevestigd.direct"));
        sluit();
    };
    const dagOpties = Array.from({ length: 31 }, (_, i) => i + 1);
    const voorstelOuder = (k, d) => soort === "eenmalig" ? naar : structureelOp(zorg, k, vanDatum, naar, d);
    const vergelijking = voor.flatMap((k) => Array.from({ length: soort === "structureel" ? 14 : Math.max(0, Math.round((dt(totDatum).getTime() - dt(vanDatum).getTime()) / 86400000) + 1) }, (_, i) => plusDagen(vanDatum, i)).slice(0, 366).map((d) => ({ k, d, nu: zorgOp(zorg, k, d).ouder, voorstel: voorstelOuder(k, d) })));
    const sel = `mt-1 w-full ${VELD}`;
    const rij = (l, w) => (<div className="flex items-start justify-between gap-3 py-2">
      <dt className="text-ink-soft">{l}</dt>
      <dd className="text-right font-semibold">{w}</dd>
    </div>);
    const verzoekKaarten = (<>
        {reageren.map((v) => (<div key={v.id} id={`item-${v.id}`} className="zoekdoel rounded-2xl border border-border bg-accent-soft p-4">
            <div className="flex items-start justify-between gap-2">
              <span className="flex items-start gap-2.5">
                <AppIcon functie="voorstel" maat="md"/>
                <span className="block">
                  <span className="block font-display text-base font-semibold text-ink">{t("components.ZorgAfstemmen.vanAnder")}</span>
                  <span className="block text-xs text-ink-soft">{v.soort === "eenmalig" ? t("components.ZorgAfstemmen.soort.eenmalig") : t("components.ZorgAfstemmen.soort.vast")}{t("components.ZorgAfstemmen.wachtOpJou")}</span>
                </span>
              </span>
              <GeschiedenisKnop soort="schema" itemId={v.id} naam={v.tekst}/>
            </div>
            <p className="mt-3 rounded-xl border-l-2 border-accent-warm bg-surface px-3 py-2.5 text-sm text-ink">
              <span className="sr-only">{t("components.ZorgAfstemmen.hetVerzoek")}</span>
              ‘{v.tekst}’
            </p>
            <dl className="mt-3 divide-y divide-border border-t border-border text-sm">
              {rij(t("components.ZorgAfstemmen.rij.kinderen"), v.kinderen.map((k) => kindNamen[k]).join(" & "))}
              {rij(t("components.ZorgAfstemmen.rij.wanneer"), v.datumLabel)}
              {rij(t("components.ZorgAfstemmen.rij.geldtVoor"), v.soort === "eenmalig" ? t("components.ZorgAfstemmen.alleenDezeKeer") : t("components.ZorgAfstemmen.vanafNu"))}
              {v.naarOuder ? rij(t("components.ZorgAfstemmen.rij.danBij"), v.naarOuder === "sanne" ? t("components.ZorgAfstemmen.rij.jou") : t("common.deAndereOuder")) : null}
              {v.reactieDatum ? rij(t("components.ZorgAfstemmen.rij.reactieVoor"), t("components.ZorgAfstemmen.rij.reactieVoorWaarde", { datum: v.reactieDatum })) : null}
              {rij(t("components.ZorgAfstemmen.rij.status"), t("components.ZorgAfstemmen.rij.nietsVeranderd"))}
            </dl>
            {v.alternatief ? <p className="mt-2 flex items-start gap-1 text-xs text-ink-soft"><CornerDownRight aria-hidden="true" className="mt-px size-3.5 shrink-0"/><span>{v.alternatief}</span></p> : null}
            <Gevolgen v={v}/>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                <Button size="sm" onClick={() => { if (reageer(v.id, () => accepteer(v.id)))
            setBevestigd(ga ? t("components.ZorgAfstemmen.bevestigd.aangepastReminder", { reminder: reminders.bevestigd }) : t("components.ZorgAfstemmen.bevestigd.jaGezegd")); }}>{t("components.ZorgAfstemmen.knop.ja")}</Button>
                <Button variant="outline" size="sm" onClick={() => {
                setAltId(v.id);
                setNieuw(v.tekst);
                setSoort(v.soort);
                setVoor([...v.kinderen]);
                setDagVan(v.dagen[0] ?? 16);
                setDagTot(v.dagen.at(-1) ?? 16);
                setVanDatum(v.datums?.[0] ?? vandaagIso);
                setTotDatum(v.datums?.at(-1) ?? vandaagIso);
                setNaar(v.naarOuder ?? "sanne");
                router.navigate({ to: "/agenda", search: { zorgActie: v.soort === "structureel" ? "regeling" : "wijziging", zorgVoorstel: v.id, kind } });
            }}>{t("components.ZorgAfstemmen.knop.anderVoorstel")}</Button>
                <Button variant="outline" size="sm" onClick={() => { if (reageer(v.id, () => wijsAf(v.id)))
            setBevestigd(ga ? nietAkkoordTekst(true) : t("components.ZorgAfstemmen.bevestigd.afgewezen")); }}>{t("components.ZorgAfstemmen.knop.afwijzen")}</Button>
                <Button variant="outline" size="sm" onClick={() => { if (vraagMeerTijd(v.id))
            setBevestigd(t("components.ZorgAfstemmen.bevestigd.meerTijd")); }}>{t("common.meerTijdNodig")}</Button>
              </div>
          </div>))}
    </>);
    const formulier = startActie ? (<Sheet open onOpenChange={(o) => !o && sluit()}><SheetContent side="bottom" className="left-1/2 flex max-h-[90dvh] w-full max-w-md -translate-x-1/2 flex-col gap-0 overflow-hidden rounded-t-2xl bg-background p-0">
        <SheetHeader className="shrink-0 border-b border-border px-5 pb-3 pt-5 pr-14 text-left"><SheetTitle>{t("components.ZorgAfstemmen.sheet.titel")}</SheetTitle><SheetDescription>{t("components.ZorgAfstemmen.sheet.beschrijving")}</SheetDescription></SheetHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 py-4" id="nieuw-voorstel">
        {bronOmschrijving ? <div className="border-b border-border pb-3 text-sm"><p className="text-ink-soft">{t("components.ZorgAfstemmen.sheet.bron")}</p><Button asChild variant="link" className="h-auto min-h-11 whitespace-normal px-0 text-xs"><Link to="/agenda" search={{ zorgActie: "wijziging" }}>{t("components.ZorgAfstemmen.sheet.zelfKiezen")}</Link></Button></div> : null}
        {altId ? <p className="text-xs text-ink-soft">{t("components.ZorgAfstemmen.sheet.alternatief")}</p> : null}
        <div className="flex items-center justify-between"><p className="text-sm font-semibold text-ink">{startActie === "regeling" ? t("components.ZorgAfstemmen.sheet.type.regeling") : voorstelType === "nachtje" ? t("components.ZorgAfstemmen.sheet.type.nachtje") : voorstelType === "ruil" ? t("components.ZorgAfstemmen.sheet.type.ruil") : t("components.ZorgAfstemmen.sheet.type.eenmalig")}</p></div>
        <FilterBalk opties={[{ id: "eenmalig", label: t("components.ZorgAfstemmen.alleenDezeKeer") }, { id: "structureel", label: t("components.ZorgAfstemmen.vanafNu") }]} waarde={soort} onChange={setSoort}/>
        <p className="text-xs text-ink-soft">{soort === "eenmalig" ? t("components.ZorgAfstemmen.sheet.uitlegEenmalig") : t("components.ZorgAfstemmen.sheet.uitlegVast")}</p>
        <div className="flex gap-2">
          {alleKids.map((k) => (<button key={k} onClick={() => setVoor((v) => (v.includes(k) ? (v.length > 1 ? v.filter((x) => x !== k) : v) : [...v, k]))} aria-pressed={voor.includes(k)} className={`rounded-full px-3 py-1 text-xs font-semibold ${voor.includes(k) ? "bg-brand text-primary-foreground" : "bg-surface text-ink-soft"}`}>
              {kindNamen[k]}
            </button>))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-ink-soft">{soort === "eenmalig" ? t("components.ZorgAfstemmen.sheet.van") : t("components.ZorgAfstemmen.sheet.vanaf")}
            <input type="date" value={vanDatum} onChange={(e) => { setVanDatum(e.target.value); setDagVan(dt(e.target.value).getDate()); if (e.target.value > totDatum)
            setTotDatum(e.target.value); }} className={sel}/>
          </label>
          {soort === "eenmalig" ? (<label className="text-xs text-ink-soft">{t("components.ZorgAfstemmen.sheet.totEnMet")}
              <input type="date" min={vanDatum} value={totDatum} onChange={(e) => { setTotDatum(e.target.value); setDagTot(dt(e.target.value).getDate()); }} className={sel}/>
            </label>) : null}
          <label className="col-span-2 text-xs text-ink-soft">{soort === "eenmalig" ? t("components.ZorgAfstemmen.sheet.bijWie") : t("components.ZorgAfstemmen.sheet.eersteWeek")}
            <select value={naar} onChange={(e) => setNaar(e.target.value)} className={sel}>
              <option value="sanne">{t("components.ZorgAfstemmen.sheet.bijJou")}</option><option value="joris">{t("components.ZorgAfstemmen.sheet.bijAnder")}</option>
            </select>
          </label>
        </div>
        <label className="block text-xs text-ink-soft">{t("components.ZorgAfstemmen.sheet.reactieDatum")}
          <input type="date" value={reactieDatum} onChange={(e) => setReactieDatum(e.target.value)} className={sel}/>
        </label>
        <p className="-mt-1 text-xs text-ink-soft">{t("components.ZorgAfstemmen.sheet.reactieDatumUitleg")}</p>
        <div className="grid grid-cols-2 gap-2"><label className="text-xs text-ink-soft">{t("components.ZorgAfstemmen.sheet.wisseltijd")}<input type="time" value={wisseltijd} onChange={(e) => setWisseltijd(e.target.value)} className={sel}/></label><label className="text-xs text-ink-soft">{t("components.ZorgAfstemmen.sheet.locatie")}<input value={plek} onChange={(e) => setPlek(e.target.value)} className={sel}/></label></div>
        <div className="flex items-start gap-2.5 rounded-2xl bg-[#E9EFE3] p-3"><span className="grid size-7 shrink-0 place-items-center rounded-full border border-[#C9D6C3] bg-[#E9EFE3] text-[10px] font-black text-[#3F5747]" aria-hidden>Co</span><div className="text-[13.5px] leading-snug text-[#2F4A3A]"><Trans i18nKey="components.ZorgAfstemmen.sheet.tip" components={{ b: <b/> }}/>{plek.trim() ? null : <button type="button" onClick={() => setPlek(t("components.ZorgAfstemmen.sheet.school"))} className="mt-1.5 block font-black text-brand">{t("components.ZorgAfstemmen.sheet.schoolKiezen")}</button>}</div></div>
        <section className="rounded-[20px] border border-white/85 bg-white/60 p-3.5">
          <p className="text-[13px] font-semibold text-ink">{t("components.ZorgAfstemmen.sheet.tabel.caption")}</p>
          {(() => { const rijen = vergelijking.filter((r) => alleDagen || r.nu !== r.voorstel); const taal = i18n.language?.startsWith("en") ? "en-GB" : "nl-NL"; return rijen.length ? <ul className="mt-2.5 space-y-2">{rijen.map((r) => { const anders = r.nu !== r.voorstel; return <li key={r.k + r.d} className="rounded-2xl bg-card px-3 py-2.5">
            <p className="text-[13px] font-semibold first-letter:uppercase">{dt(r.d).toLocaleDateString(taal, { weekday: "short", day: "numeric", month: "short" })} <span className="font-normal text-ink-soft">· {kindNamen[r.k]}</span></p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs"><span className={`rounded-full px-2.5 py-1 ${anders ? "bg-[color-mix(in_oklab,var(--foreground)_6%,transparent)] text-ink-soft line-through decoration-ink-soft/50" : "bg-[color-mix(in_oklab,var(--foreground)_6%,transparent)] text-ink-soft"}`}>{ouderLabel(r.nu)}</span>{anders ? <><span aria-hidden className="text-ink-soft">→</span><span className="rounded-full bg-brand-soft px-2.5 py-1 font-semibold text-brand">{ouderLabel(r.voorstel)}</span></> : null}</div>
            <span className="sr-only">{t("components.ZorgAfstemmen.sheet.tabel.nu")}: {ouderLabel(r.nu)}. {t("components.ZorgAfstemmen.sheet.tabel.voorstel")}: {ouderLabel(r.voorstel)}.</span>
          </li>; })}</ul> : null; })()}
          {!vergelijking.some((r) => r.nu !== r.voorstel) ? <p className="mt-2 text-xs text-ink-soft">{t("components.ZorgAfstemmen.sheet.tabel.gelijk")}</p> : null}
          <button type="button" onClick={() => setAlleDagen(!alleDagen)} className="mt-2.5 inline-flex min-h-9 items-center gap-1 text-[13px] font-semibold text-brand"><Chevron className={`size-4 transition-transform ${alleDagen ? "-rotate-90" : "rotate-90"}`}/>{alleDagen ? t("components.ZorgAfstemmen.sheet.tabel.gewijzigd") : t("components.ZorgAfstemmen.sheet.tabel.alle")}</button>
        </section>
        <textarea value={nieuw} onChange={(e) => setNieuw(e.target.value)} rows={2} placeholder={t("components.ZorgAfstemmen.sheet.placeholder")} className="w-full resize-none rounded-2xl border border-border bg-card p-3 text-sm outline-none"/>
        {ga && eerderZonderAkkoord(zorg.voorstellen, { soort, kinderen: voor, dagen: soort === "eenmalig" ? Array.from({ length: Math.max(dagVan, dagTot) - dagVan + 1 }, (_, i) => dagVan + i) : [dagVan], datumLabel: "", naarOuder: naar }) ? <p className="text-xs text-ink-soft">{t("components.ZorgAfstemmen.sheet.eerderZonderAkkoord")}</p> : null}
      </div>
        <div className="shrink-0 border-t border-border bg-background px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <button disabled={!nieuw.trim() || !vanDatum || (soort === "eenmalig" && totDatum < vanDatum) || !!bronOmschrijving} onClick={verstuur} className="min-h-12 w-full rounded-full bg-brand px-5 text-sm font-semibold text-primary-foreground disabled:opacity-40">
            {t("components.ZorgAfstemmen.sheet.versturen")}
          </button>
        </div>
      </SheetContent></Sheet>) : null;
    if (weergave === "verzoeken") {
        if (!reageren.length && !bevestigd)
            return null;
        return (<section className="mt-3" aria-labelledby="verzoeken-wijzigen">
          <h2 id="verzoeken-wijzigen" className="font-display text-lg font-bold">{t("components.ZorgAfstemmen.verzoeken")}</h2>
          {bevestigd ? <p role="status" className="mt-2 text-sm font-semibold text-brand"><MetVinkje>{bevestigd}</MetVinkje></p> : null}
          <div className="mt-3 space-y-3">{verzoekKaarten}</div>
        </section>);
    }
    if (weergave === "formulier")
        return formulier;
    return (<section className="mt-3">
      <details open={!!doel || !!startActie} className="group border-y border-border py-1"><summary className="flex list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden min-h-11 cursor-pointer py-2 text-sm font-semibold text-brand"><Chevron className="size-4 shrink-0 group-open:rotate-90"/>{t("components.ZorgAfstemmen.kop")}{reageren.length ? t("components.ZorgAfstemmen.omTeReageren", { count: reageren.length }) : ""}</summary>
      {bevestigd ? <p role="status" className="mb-3 text-sm font-semibold text-brand"><MetVinkje>{bevestigd}</MetVinkje></p> : null}
      {!bevestigd && reminder ? <div className="mb-3 flex items-center gap-2 text-xs text-ink-soft"><AppIcon functie="slim" maat="sm" vorm="kaal"/><span className="flex-1">{reminder.tekst}</span><Button variant="ghost" size="icon" aria-label={t("components.ZorgAfstemmen.tipSluiten")} className="size-11" onClick={() => setGesloten([...gesloten, reminder.moment])}><AppIcon functie="niet" maat="sm" vorm="kaal"/></Button></div> : null}
      {doel ? <Link to="/agenda" className="mb-2 inline-flex min-h-10 items-center text-xs font-semibold text-brand"><MetChevron>{t("components.ZorgAfstemmen.alleVoorstellen")}</MetChevron></Link> : null}
      {reageren.length ? <h2 className="font-display font-bold">{t("components.ZorgAfstemmen.verzoeken")}</h2> : null}
      <div className="mt-3 space-y-3">
        {verzoekKaarten}
      </div>
      {eigen.length ? (<div className="mt-3 divide-y divide-border rounded-xl border border-border bg-surface px-3">
          {eigen.map((v) => {
                const oordeel = magHerinnering({ verstuurd: v.herinneringen ?? [], reactieDatum: v.reactieDatum, gepauzeerd: vk.herinneringenGepauzeerd });
                return (<div key={v.id} id={`item-${v.id}`} className="zoekdoel flex items-center justify-between gap-2 py-2.5">
              <span><span className="block text-sm">{t("components.ZorgAfstemmen.jouwVraag", { datum: v.datumLabel })}</span><span className="block text-xs text-ink-soft">{v.tekst}</span><span className="block text-xs text-ink-soft">{t("components.ZorgAfstemmen.wachtOpAntwoord")}{v.reactieDatum ? t("components.ZorgAfstemmen.graagReactieVoor", { datum: v.reactieDatum }) : ""}{v.meerTijd ? t("components.ZorgAfstemmen.anderMeerTijd") : ""}</span></span>
              <span className="flex shrink-0 items-center gap-1">
                {oordeel.mag ? <Button variant="ghost" size="sm" className="text-xs" onClick={() => { if (stuurHerinnering(v.id))
                    setBevestigd(t("components.ZorgAfstemmen.bevestigd.herinnering")); }}>{t("components.ZorgAfstemmen.herinneringSturen")}</Button> : null}
                <VoorstelIntrekken onBevestig={() => { if (trekIn(v.id))
                    setBevestigd(t("components.ZorgAfstemmen.bevestigd.ingetrokken")); }}/>
              </span>
            </div>);
            })}
        </div>) : null}
      {ga ? vastgelopen.map((o) => (<div key={o.sleutel} className="mt-3 rounded-xl border border-border bg-surface p-3 text-sm">
          <p className="font-semibold">{t("components.ZorgAfstemmen.nietGeregeld", { datum: o.laatste.datumLabel })}</p>
          <ul className="mt-1 space-y-0.5 text-xs text-ink-soft">{o.voorstellen.map((v) => <li key={v.id}>{v.vanMij ? t("components.ZorgAfstemmen.jouwVoorstel") : t("components.ZorgAfstemmen.voorstelVan", { naam: t("common.deAndereOuder") })}: {v.tekst}{v.alternatief ? t("components.ZorgAfstemmen.alternatief", { tekst: v.alternatief }) : ""} · {statusLabel[v.status]}</li>)}</ul>
          <p className="mt-2 text-xs">{t("components.ZorgAfstemmen.geenBevestiging")}</p>
          <p className="mt-1 text-xs text-ink-soft">{t("components.ZorgAfstemmen.professional")}</p>
        </div>)) : null}
      {eerder.length ? (<div className="mt-3">
          <button onClick={() => setEerderOpen(!eerderOpen)} aria-expanded={eerderOpen} className="inline-flex min-h-10 items-center gap-1 py-2 text-sm font-semibold text-ink-soft">{t("components.ZorgAfstemmen.eerder")}<Chevron richting="omlaag" open={eerderOpen} className="size-4"/></button>
          {eerderOpen ? (<ul className="divide-y divide-border border-t border-border">
              {eerder.map((v) => (<li key={v.id} id={`item-${v.id}`} className="zoekdoel flex items-center justify-between gap-2 py-2.5">
                  <span><span className="block text-sm">{v.tekst}</span><span className="block text-xs text-ink-soft">{v.vanMij ? t("common.jij") : t("common.deAndereOuder")} · {v.datumLabel} · {v.soort === "eenmalig" ? t("components.ZorgAfstemmen.alleenDezeKeer") : t("components.ZorgAfstemmen.vanafNu")} · {statusLabel[v.status]}</span></span>
                  <GeschiedenisKnop soort="schema" itemId={v.id} naam={v.tekst}/>
                </li>))}
            </ul>) : null}
        </div>) : null}
      </details>
      {formulier}
    </section>);
}
function Gevolgen({ v }) {
    const { t } = useTranslation();
    const lijst = useGevolgen(v);
    if (!lijst.length)
        return null;
    return (<div className="mt-2 rounded-xl bg-surface p-2.5 text-xs">
      <p className="font-semibold">{v.soort === "structureel" ? t("components.ZorgAfstemmen.gevolgen.watVerandert") : t("components.ZorgAfstemmen.gevolgen.raaktOok")}</p>
      <ul className="mt-1 space-y-0.5 text-ink-soft">
        {lijst.map((g) => <li key={g.id}>{g.soort === "afspraak" ? "· " : t("components.ZorgAfstemmen.gevolgen.spullen")}{g.tekst}</li>)}
      </ul>
    </div>);
}
