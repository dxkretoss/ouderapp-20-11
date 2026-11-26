import { useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { Lock, MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AanwezigheidFormulier } from "@/components/AanwezigheidAfstemmen";
import { HulpKnop } from "@/components/HulpVragen";
import { useStart } from "@/lib/start-store";
import { useGezin } from "@/lib/gezin";
import { useVoorkeuren } from "@/lib/voorkeuren-store";
import { controleerAfspraak, controleerPrive } from "@/lib/slimme-hulp";
import { maakAfspraak, useAgenda } from "@/lib/agenda-store";
import { startAfstemming } from "@/lib/aanwezigheid-store";
import { voorkomens } from "@/lib/agenda-datum";
import { useOverdracht } from "@/lib/overdracht-store";
import { optieLabel } from "@/components/SlimmeMeeLijst";
import { foutTekst } from "@/lib/api";
import { bevestig } from "@/lib/feedback";
import { chip as chipStijl, VELD } from "@/lib/ui-stijl";
const F = "routes.agenda.form.";
const FREQ = ["geen", "wekelijks", "tweewekelijks", "maandelijks", "aangepast"];
const HERINNERING = ["geen", "uur", "dag", "twee"];
const ALLE = "__alle";
const vandaagIso = () => new Date().toLocaleDateString("sv-SE");
function Chip({ actief, onClick, children }) {
    return (<button type="button" onClick={onClick} aria-pressed={actief} className={chipStijl(actief)}>{children}</button>);
}
function Schakelaar({ aan, onWissel, label }) {
    return (<label className="inline-flex min-h-10 cursor-pointer items-center gap-2.5 text-sm font-semibold">
      <button type="button" role="switch" aria-checked={aan} onClick={() => onWissel(!aan)} className={`relative h-6 w-11 shrink-0 rounded-full transition ${aan ? "bg-brand" : "bg-[color-mix(in_oklab,var(--foreground)_18%,transparent)]"}`}>
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${aan ? "left-[22px]" : "left-0.5"}`}/>
      </button>
      {label}
    </label>);
}
/**
 * "Nieuwe afspraak" — één formulier voor Agenda én Home (zelfde velden, zelfde opslag via manage-agenda).
 * - Meerdere dagen (start- en einddatum), Hele dag (geen tijden), start- en eindtijd naast elkaar
 * - Voor wie: een kind, alle kinderen, of "Alleen voor mezelf" (privé, nooit zichtbaar voor de andere ouder)
 * - Per kind kan een andere ouder horen: kinderen van verschillende andere ouders delen niet één afspraak
 * - Aanwezigheid afstemmen (wie gaat, wie haalt/brengt) alleen bij een gedeelde afspraak
 * Props: open, onSluit, start = { datum, titel, tijd, kindId, persoonlijk, locatie, omschrijving }
 */
export function AfspraakFormulier({ open, onSluit, start = {} }) {
    const { t } = useTranslation();
    if (!open)
        return null;
    return <Formulier key={JSON.stringify(start)} onSluit={onSluit} start={start} t={t}/>;
}
function Formulier({ onSluit, start, t }) {
    const st = useStart();
    const g = useGezin();
    const agenda = useAgenda();
    const vk = useVoorkeuren();
    const kinderen = st.kinderen;
    const [titel, setTitel] = useState(start.titel ?? "");
    const [datum, setDatum] = useState(start.datum ?? vandaagIso());
    const [meerdereDagen, setMeerdereDagen] = useState(false);
    const [einddatum, setEinddatum] = useState("");
    const [heleDag, setHeleDag] = useState(false);
    const [tijd, setTijd] = useState(start.tijd ?? "");
    const [eindtijd, setEindtijd] = useState("");
    const [herhaling, setHerhaling] = useState({ freq: "geen", interval: 2, eenheid: "weken" });
    // Voor wie: kind-id, ALLE, of null = "Alleen voor mezelf"
    const eersteKind = start.kindId && kinderen.some((k) => k.id === start.kindId) ? start.kindId : kinderen[0]?.id ?? null;
    const [voor, setVoor] = useState(start.persoonlijk || !kinderen.length ? null : eersteKind);
    const [locatie, setLocatie] = useState(start.locatie ?? "");
    const [toelichting, setToelichting] = useState(start.omschrijving ?? "");
    const [herinnering, setHerinnering] = useState("geen");
    // "Neem mee": spullen voor deze afspraak; ze komen op de lijst van de wissel ervoor.
    const [neemMee, setNeemMee] = useState([]);
    const [meeTekst, setMeeTekst] = useState("");
    const meeOpties = (useOverdracht().opties ?? []).filter((o) => !neemMee.includes(o)).slice(0, 8);
    const voegMeeToe = (x) => { const v = String(x ?? "").trim().slice(0, 100); if (v && !neemMee.includes(v) && neemMee.length < 30) setNeemMee([...neemMee, v]); setMeeTekst(""); };
    const [aanwezig, setAanwezig] = useState({ keuze: null, wieGaat: null, contactWie: null });
    const [controle, setControle] = useState(null);
    const [bezig, setBezig] = useState(false);
    const [fout, setFout] = useState(null);
    const [verlaten, setVerlaten] = useState(false);
    const gedeeld = voor !== null;
    const kindIds = voor === ALLE ? kinderen.map((k) => k.id) : voor ? [voor] : [];
    // Met wie wordt dit gedeeld? Per kind kan dat een andere ouder zijn.
    const ander = gedeeld ? g.anderVoor(kindIds) : null;
    const gemengd = gedeeld && g.gemengd(kindIds);
    // "Alle kinderen" alleen als ze bij dezelfde andere ouder horen (of allemaal Solo zijn).
    const alleMogelijk = kinderen.length > 1 && !g.gemengd(kinderen.map((k) => k.id));
    const einddatumFout = meerdereDagen && einddatum && einddatum < datum;
    const tijdFout = !heleDag && tijd && eindtijd && !meerdereDagen && eindtijd <= tijd;
    const kan = titel.trim() && datum && (!meerdereDagen || (einddatum && !einddatumFout)) && !tijdFout && !gemengd && !bezig;
    const kindLabel = voor === ALLE ? "Alle kinderen" : kinderen.find((k) => k.id === voor)?.naam ?? "";
    const sluit = () => (titel.trim() && !verlaten ? setVerlaten(true) : onSluit());
    const opslaan = async (toch = false) => {
        if (!kan)
            return;
        setFout(null);
        const velden = {
            titel: titel.trim(), datum, einddatum: meerdereDagen ? einddatum : undefined, heleDag, tijd: heleDag ? "" : tijd, eindtijd: heleDag || !eindtijd ? undefined : eindtijd,
            categorie: "overig", kind: kindLabel, kindIds, herhaling: herhaling.freq === "geen" ? undefined : herhaling,
            locatie: locatie.trim() || undefined, toelichting: toelichting.trim() || undefined, herinnering, gedeeld,
            neemMee: kindIds.length ? neemMee : [],
        };
        if (!toch && !heleDag) {
            const andere = agenda.events.filter((x) => x.gedeeld !== false);
            const c = gedeeld
                ? (vk.conflictControle ? controleerAfspraak({ datum, tijd, eindtijd, kind: kindLabel, titel: velden.titel, categorie: "overig" }, andere.flatMap((x) => voorkomens(x, datum, datum).map((d) => ({ id: x.id, titel: x.titel, datum: d, tijd: x.tijd, eindtijd: x.eindtijd, kind: x.kind }))), undefined, false) : [])
                : controleerPrive({ datum, tijd, eindtijd }, andere.map((x) => ({ id: x.id, titel: x.titel, datum: x.datum, tijd: x.tijd, kind: x.kind })));
            if (c.length) {
                setControle(c);
                return;
            }
        }
        setBezig(true);
        try {
            const r = await maakAfspraak(velden);
            const id = r?.event?.id;
            if (!id) {
                setBezig(false);
                return; // foutmelding is al getoond door de agenda-store
            }
            if (gedeeld && aanwezig.keuze)
                await startAfstemming(id, aanwezig.keuze, "sanne", { ...(aanwezig.wieGaat ? { wieGaat: aanwezig.wieGaat } : {}), ...(aanwezig.contactWie ? { contactWie: aanwezig.contactWie } : {}), kind: kindIds[0] ?? "beide", afspraakTitel: velden.titel });
            bevestig(!gedeeld ? t("routes.agenda.melding.toegevoegdPrive") : ander ? t("routes.agenda.melding.toegevoegdGedeeld") : t("routes.agenda.melding.toegevoegd"));
            onSluit();
        }
        catch (e) {
            setFout(foutTekst(e));
            setBezig(false);
        }
    };
    const veld = `w-full ${VELD}`;
    const label = "mb-1 block text-xs font-semibold text-ink-soft";
    return (<div className="app-modal-achter z-40" onClick={sluit}>
      <div className="app-modal" role="dialog" aria-modal="true" aria-labelledby="afspraak-form-titel" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={sluit} aria-label={t("common.sluiten")} className="knop-kruis absolute right-4 top-4 size-9"><X className="size-5"/></button>
        <p id="afspraak-form-titel" className="font-display text-lg font-bold">{t(F + "titel.nieuw")}</p>
        {verlaten ? (<div className="mt-4 rounded-md border border-border bg-card p-4">
            <p className="font-display text-lg">{t(F + "verlaten.titel")}</p>
            <p className="mt-1 text-sm text-ink-soft">{t(F + "verlaten.tekst")}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm font-semibold">
              <button type="button" onClick={() => setVerlaten(false)} className="min-h-11 rounded-full bg-brand px-3 text-primary-foreground">{t(F + "verlaten.verder")}</button>
              <button type="button" onClick={onSluit} className="min-h-11 rounded-full border border-border bg-card px-3 text-ink-soft">{t(F + "verlaten.verlaten")}</button>
            </div>
          </div>) : null}
        <div className="mt-4 space-y-3">
          <input value={titel} onChange={(e) => setTitel(e.target.value)} placeholder={t(F + "titelPlaceholder")} aria-label={t(F + "titelPlaceholder")} className={`${veld} px-4 py-3`}/>

          <div className="grid grid-cols-[1fr_auto] items-end gap-3">
            <label className="block"><span className={label}>{meerdereDagen ? t(F + "startdatum") : t(F + "datum")}</span>
              <span className="relative block"><input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} className={veld}/></span></label>
            <Schakelaar aan={meerdereDagen} onWissel={(v) => { setMeerdereDagen(v); if (v && !einddatum) setEinddatum(datum); }} label={t(F + "meerdereDagen")}/>
          </div>
          {meerdereDagen ? (<label className="block"><span className={label}>{t(F + "einddatum")}</span>
              <input type="date" value={einddatum} min={datum} onChange={(e) => setEinddatum(e.target.value)} aria-invalid={!!einddatumFout} className={veld}/>
              {einddatumFout ? <span role="alert" className="mt-1 block text-xs text-destructive">{t(F + "einddatumFout")}</span> : null}</label>) : null}

          {!heleDag ? (<div className="grid grid-cols-2 gap-2">
              <label className="block"><span className={label}>{t(F + "starttijd")}</span>
                <span className="relative block"><input type="time" value={tijd} onChange={(e) => setTijd(e.target.value)} className={veld}/></span></label>
              <label className="block"><span className={label}>{t(F + "eindtijdKort")}</span>
                <span className="relative block"><input type="time" value={eindtijd} onChange={(e) => setEindtijd(e.target.value)} aria-invalid={!!tijdFout} className={veld}/></span></label>
              {tijdFout ? <span role="alert" className="col-span-2 text-xs text-destructive">{t(F + "tijdFout")}</span> : null}
            </div>) : null}
          <Schakelaar aan={heleDag} onWissel={setHeleDag} label={t(F + "heleDag")}/>

          <div>
            <span className={label}>{t(F + "herhalen")}</span>
            <div className="flex flex-wrap gap-2">
              {FREQ.map((f) => <Chip key={f} actief={herhaling.freq === f} onClick={() => setHerhaling({ ...herhaling, freq: f })}>{i18n.t(`routes.agenda.freq.${f}`)}</Chip>)}
            </div>
            {herhaling.freq === "aangepast" ? (<div className="mt-2 flex items-center gap-2 text-sm">
                <span className="text-ink-soft">{t(F + "elke")}</span>
                <input type="number" min={1} max={12} value={herhaling.interval} onChange={(e) => setHerhaling({ ...herhaling, interval: Math.max(1, Number(e.target.value) || 1) })} className="w-16 min-h-11 rounded-2xl border border-border bg-card px-2 py-1.5"/>
                <select value={herhaling.eenheid} onChange={(e) => setHerhaling({ ...herhaling, eenheid: e.target.value })} className="min-h-11 rounded-2xl border border-border bg-card px-2 py-1.5">
                  <option value="weken">{t(F + "weken")}</option><option value="maanden">{t(F + "maanden")}</option>
                </select>
              </div>) : null}
            {herhaling.freq !== "geen" ? (<label className="mt-2 block"><span className="mb-1 block text-xs text-ink-soft">{t(F + "totEnMet")}</span>
                <input type="date" value={herhaling.eind ?? ""} min={datum} onChange={(e) => setHerhaling({ ...herhaling, eind: e.target.value || undefined })} className={veld}/></label>) : null}
          </div>

          <fieldset>
            <legend className={label}>{t(F + "voorWie")}</legend>
            <div className="flex flex-wrap gap-2">
              {kinderen.map((k) => <Chip key={k.id} actief={voor === k.id} onClick={() => setVoor(k.id)}>{k.naam}</Chip>)}
              {alleMogelijk ? <Chip actief={voor === ALLE} onClick={() => setVoor(ALLE)}>{kinderen.length === 2 ? t(F + "beideKinderen") : t("common.alleKinderen")}</Chip> : null}
              <Chip actief={!gedeeld} onClick={() => setVoor(null)}><span className="inline-flex items-center gap-1"><Lock aria-hidden className="size-3.5" strokeWidth={1.8}/>{t(F + "voorMezelf")}</span></Chip>
            </div>
            {!gedeeld ? <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-ink-soft"><Lock aria-hidden className="size-3" strokeWidth={1.8}/>{t(F + "priveUitleg")}</p> : null}
            {gemengd ? <p role="alert" className="mt-1.5 text-xs text-destructive">{i18n.t("lib.api.fout.MIXED_CHILDREN")}</p> : null}
          </fieldset>

          <label className="block"><span className={label}>{t(F + "locatieLabel")}</span>
            <span className="relative block"><MapPin aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft"/>
              <input value={locatie} onChange={(e) => setLocatie(e.target.value)} placeholder={t(F + "locatieHint")} className={`${veld} pl-9`}/></span></label>
          <label className="block"><span className={label}>{t(F + "toelichtingLabel")}</span>
            <textarea value={toelichting} onChange={(e) => setToelichting(e.target.value)} rows={2} placeholder={t(F + "toelichtingHint")} className={veld}/></label>
          {kindIds.length ? (<div>
              <span className={label}>{t(F + "neemMee")}</span>
              {neemMee.length ? <div className="mb-2 flex flex-wrap gap-2">{neemMee.map((x) => <button key={x} type="button" onClick={() => setNeemMee(neemMee.filter((y) => y !== x))} aria-label={t(F + "neemMeeWeg", { item: optieLabel(t, x) })} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-brand bg-brand-soft px-3 py-1.5 text-xs font-semibold">{optieLabel(t, x)}<X aria-hidden className="size-3.5"/></button>)}</div> : null}
              <div className="flex gap-2">
                <input value={meeTekst} onChange={(e) => setMeeTekst(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); voegMeeToe(meeTekst); } }} placeholder={t(F + "neemMeeHint")} className={veld}/>
                <Button type="button" variant="outline" onClick={() => voegMeeToe(meeTekst)} disabled={!meeTekst.trim()}>{t("common.toevoegen")}</Button>
              </div>
              {meeOpties.length ? <div className="mt-2 flex flex-wrap gap-2">{meeOpties.map((o) => <Chip key={o} actief={false} onClick={() => voegMeeToe(o)}>+ {optieLabel(t, o)}</Chip>)}</div> : null}
            </div>) : null}
          <label className="block"><span className={label}>{t(F + "herinnering")}</span>
            <select value={herinnering} onChange={(e) => setHerinnering(e.target.value)} className={veld}>
              {HERINNERING.map((h) => <option key={h} value={h}>{i18n.t(`routes.agenda.herinnering.${h}`)}</option>)}
            </select></label>

          {gedeeld && ander ? (<AanwezigheidFormulier keuze={aanwezig.keuze} wieGaat={aanwezig.wieGaat} contactWie={aanwezig.contactWie} onKeuze={(k) => setAanwezig((a) => ({ ...a, keuze: k }))} onWieGaat={(w) => setAanwezig((a) => ({ ...a, wieGaat: w }))} onContactWie={(w) => setAanwezig((a) => ({ ...a, contactWie: w }))}/>) : null}
          <p className="text-xs text-ink-soft">{!gedeeld ? t(F + "uitleg.prive") : ander ? t(F + "uitleg.gedeeld") : t(F + "uitleg.eigen")}</p>
        </div>

        {controle ? (<div role="status" className="mt-4 rounded-md border border-border bg-muted p-3 text-sm">
            <p className="font-semibold">{gedeeld ? t("routes.agenda.controle.titel") : t("routes.agenda.priveOverlap.titel")}</p>
            {controle.map((c, i) => <p key={i} className="mt-1 text-xs text-ink-soft">{c.tekst}</p>)}
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => { setControle(null); opslaan(true); }}>{t("routes.agenda.controle.tochOpslaan")}</Button>
              <button type="button" onClick={() => setControle(null)} className="rounded-full border border-border px-3 py-1 text-xs font-semibold">{t("routes.agenda.controle.andereTijd")}</button>
            </div>
          </div>) : null}
        {gedeeld ? <div className="mt-4"><HulpKnop voorstel={{ kind: voor === ALLE ? "alle" : voor ?? "alle", ...(titel ? { wat: titel } : {}), ...(datum ? { datum } : {}), ...(tijd ? { tijd } : {}) }}/></div> : null}
        {fout ? <p role="alert" className="mt-3 text-sm text-destructive">{fout}</p> : null}
        <div className="voet-vast">
          <Button type="button" onClick={() => opslaan()} disabled={!kan} className="min-h-11 w-full bg-brand text-primary-foreground shadow-none">{bezig ? t("common.laden") : t(F + "knop.opslaan")}</Button>
        </div>
      </div>
    </div>);
}
