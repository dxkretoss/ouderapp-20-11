import { useState } from "react";
import { kindIdsVan } from "@/lib/agenda-store";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@/lib/server-fn";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { AppIcon } from "@/components/AppIcon";
import { afsprakenState } from "@/lib/afspraken-store";
import { aanwezigVoor, deelNabespreking, keuzeLabel, markeerContactOpgenomen, reageer, reactiesVoor, startAfstemming, statusRegel, useAanwezigheid, zetUitkomst } from "@/lib/aanwezigheid-store";
import { contactStatusLabel, useTaken, voegTaakToe } from "@/lib/taken-store";
import { schoolBericht } from "@/lib/schoolbericht.functions";
import { chip as chipStijl } from "@/lib/ui-stijl";
/** Zijn er betrouwbaar vastgelegde veiligheidsafspraken? Dan presenteren we samen gaan niet als vanzelfsprekend. */
export const heeftVeiligheidsafspraken = () => afsprakenState().some((a) => a.veiligheid && a.status === "Actief");
const chip = chipStijl;
/** Compacte keuze: hoe willen jullie deze afspraak regelen? Alle keuzes zijn gelijkwaardig. */
export function AanwezigheidKiezer({ open, onSluit, onKies }) {
    const { t } = useTranslation();
    const [keuze, setKeuze] = useState(null);
    const [wieGaat, setWieGaat] = useState(null);
    const [contactWie, setContactWie] = useState(null);
    const veilig = heeftVeiligheidsafspraken();
    const klaar = keuze === "samen" || keuze === "later" || ((keuze === "een" || keuze === "halen" || keuze === "brengen") && wieGaat) || (keuze === "afzonderlijk" && contactWie);
    const bevestig = () => {
        if (!keuze || !klaar)
            return;
        onKies(keuze, { ...(wieGaat ? { wieGaat } : {}), ...(contactWie ? { contactWie } : {}) });
        setKeuze(null);
        setWieGaat(null);
        setContactWie(null);
    };
    return (<Sheet open={open} onOpenChange={(o) => { if (!o) {
        setKeuze(null);
        setWieGaat(null);
        setContactWie(null);
        onSluit();
    } }}>
      <SheetContent side="bottom" className="left-1/2 max-h-[85dvh] w-full max-w-md -translate-x-1/2 overflow-y-auto rounded-t-2xl bg-background px-5 pb-8">
        <SheetHeader className="text-left">
          <SheetTitle className="font-display text-xl font-medium">{t("components.AanwezigheidAfstemmen.kiezer.titel")}</SheetTitle>
          <SheetDescription className="text-xs text-ink-soft">{t("components.AanwezigheidAfstemmen.kiezer.beschrijving")}</SheetDescription>
        </SheetHeader>
        {veilig ? <p className="mt-3 rounded-md bg-muted p-2.5 text-xs text-ink-soft">{t("components.AanwezigheidAfstemmen.kiezer.veilig")}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {Object.keys(keuzeLabel).map((k) => (<button key={k} onClick={() => setKeuze(k)} className={chip(keuze === k)}>{keuzeLabel[k]}</button>))}
        </div>
        {keuze === "samen" ? <p className="mt-3 text-sm text-ink-soft">{t("components.AanwezigheidAfstemmen.kiezer.samenUitleg")}</p> : null}
        {keuze === "een" || keuze === "halen" || keuze === "brengen" ? (<div className="mt-4">
            <p className="text-sm font-semibold">{t("components.AanwezigheidAfstemmen.kiezer.wieGaat")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button onClick={() => setWieGaat("sanne")} className={chip(wieGaat === "sanne")}>{t("components.AanwezigheidAfstemmen.ikKanGaan")}</button>
              <button onClick={() => setWieGaat("joris")} className={chip(wieGaat === "joris")}>{t("components.AanwezigheidAfstemmen.kiezer.anderGaat")}</button>
              <button onClick={() => setWieGaat("onbekend")} className={chip(wieGaat === "onbekend")}>{t("components.AanwezigheidAfstemmen.nogNietBekend")}</button>
            </div>
            <p className="mt-2 text-xs text-ink-soft">{t("components.AanwezigheidAfstemmen.kiezer.praktisch")}</p>
          </div>) : null}
        {keuze === "afzonderlijk" ? (<div className="mt-4">
            <p className="text-sm font-semibold">{t("components.AanwezigheidAfstemmen.kiezer.afzonderlijkVraag")}</p>
            <p className="mt-1 text-xs text-ink-soft">{t("components.AanwezigheidAfstemmen.kiezer.afzonderlijkUitleg")}</p>
            <p className="mt-3 text-sm font-semibold">{t("components.AanwezigheidAfstemmen.kiezer.wieContact")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button onClick={() => setContactWie("sanne")} className={chip(contactWie === "sanne")}>{t("components.AanwezigheidAfstemmen.ikNeemContact")}</button>
              <button onClick={() => setContactWie("joris")} className={chip(contactWie === "joris")}>{t("components.AanwezigheidAfstemmen.kiezer.anderContact")}</button>
              <button onClick={() => setContactWie("nog")} className={chip(contactWie === "nog")}>{t("components.AanwezigheidAfstemmen.nogAfstemmen")}</button>
            </div>
          </div>) : null}
        {keuze === "later" ? <p className="mt-3 text-sm text-ink-soft">{t("components.AanwezigheidAfstemmen.kiezer.laterUitleg")}</p> : null}
        <Button disabled={!klaar} onClick={bevestig} className="mt-5 min-h-11 w-full bg-brand text-primary-foreground shadow-none">
          {keuze === "later" ? t("components.AanwezigheidAfstemmen.kiezer.bewaren") : t("components.AanwezigheidAfstemmen.voorstelVersturen")}
        </Button>
      </SheetContent>
    </Sheet>);
}
const verzoekOpties = (t) => [
    ["afzonderlijk", t("components.AanwezigheidAfstemmen.verzoek.afzonderlijk")],
    ["verzetten", t("components.AanwezigheidAfstemmen.verzoek.verzetten")],
    ["telefonisch", t("components.AanwezigheidAfstemmen.verzoek.telefonisch")],
    ["zelfde-informatie", t("components.AanwezigheidAfstemmen.verzoek.zelfdeInformatie")],
    ["tweede-tijdstip", t("components.AanwezigheidAfstemmen.verzoek.tweedeTijdstip")],
    ["bevestigen", t("components.AanwezigheidAfstemmen.verzoek.bevestigen")],
    ["anders", t("components.AanwezigheidAfstemmen.verzoek.anders")],
];
/** Blok in het afspraakdetail: één statusregel, reacties, contacttaak, berichthulp en nabespreking. */
export function AanwezigheidBlok({ afspraakId, titel, kind, datum }) {
    const { t } = useTranslation();
    useAanwezigheid();
    const { taken } = useTaken();
    const vraagBericht = useServerFn(schoolBericht);
    const a = aanwezigVoor(afspraakId);
    const taak = a?.contactTaakId ? taken.find((t) => t.id === a.contactTaakId) : undefined;
    const [kiezerOpen, setKiezerOpen] = useState(false);
    const [uitkomstVraag, setUitkomstVraag] = useState(false);
    const [uitkomstToelichting, setUitkomstToelichting] = useState("");
    const [regelenVraag, setRegelenVraag] = useState(null);
    const [taakTekst, setTaakTekst] = useState("");
    const [taakWie, setTaakWie] = useState("sanne");
    const [berichtOpen, setBerichtOpen] = useState(false);
    const [verzoek, setVerzoek] = useState("afzonderlijk");
    const [concept, setConcept] = useState(null);
    const [berichtBezig, setBerichtBezig] = useState(false);
    const [berichtFout, setBerichtFout] = useState(null);
    const [gekopieerd, setGekopieerd] = useState(false);
    const [nabesprekingOpen, setNabesprekingOpen] = useState(false);
    const [besproken, setBesproken] = useState("");
    const [gemaakteAfspraken, setGemaakteAfspraken] = useState("");
    const voorbij = datum < new Date().toISOString().slice(0, 10);
    const taakKind = /allebei|&|kinderen|both|children/i.test(kind) ? "beide" : kindIdsVan(kind)[0] ?? "beide";
    const kies = (keuze, opties) => {
        startAfstemming(afspraakId, keuze, "sanne", { ...opties, kind: taakKind, afspraakTitel: titel });
        setKiezerOpen(false);
    };
    const maakBericht = async () => {
        setBerichtBezig(true);
        setBerichtFout(null);
        setConcept(null);
        try {
            setConcept((await vraagBericht({ data: { afspraak: titel, kind, verzoek } })).concept);
        }
        catch (e) {
            setBerichtFout(e instanceof Error ? e.message : t("components.AanwezigheidAfstemmen.blok.fout"));
        }
        finally {
            setBerichtBezig(false);
        }
    };
    const kopieer = async () => {
        if (!concept)
            return;
        try {
            await navigator.clipboard.writeText(concept);
            setGekopieerd(true);
            setTimeout(() => setGekopieerd(false), 2000);
        }
        catch { /* selecteren kan handmatig */ }
    };
    return (<div className="mt-4 rounded-md border border-border bg-card p-3.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-soft"><AppIcon functie="agenda" maat="sm" vorm="kaal"/>{t("components.AanwezigheidAfstemmen.blok.kop")}</p>
      <p className="mt-1.5 text-sm font-semibold">{statusRegel(a, taak?.contactStatus) ?? t("components.AanwezigheidAfstemmen.blok.nogAfstemmen")}</p>

      {/* Huidig voorstel van de andere ouder: rustig reageren, zonder verplichte uitleg. */}
      {a?.fase === "voorstel" && a.door !== "sanne" ? (<div className="mt-3">
          <p className="text-sm text-ink-soft">{t("components.AanwezigheidAfstemmen.blok.anderStelt", { keuze: keuzeLabel[a.keuze].toLowerCase(), extra: a.keuze === "een" && a.wieGaat && a.wieGaat !== "onbekend" ? (a.wieGaat === "joris" ? t("components.AanwezigheidAfstemmen.blok.anderGaat") : t("components.AanwezigheidAfstemmen.blok.jijGaat")) : "" })}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {reactiesVoor(a).map((r) => (<button key={r.id} onClick={() => r.id === "ander" ? setKiezerOpen(true) : reageer(afspraakId, r.id, "sanne")} className={r.id === "akkoord" || r.id === "dat-lukt" ? "rounded-full bg-brand px-3.5 py-2 text-xs font-semibold text-primary-foreground" : "rounded-full border border-border px-3.5 py-2 text-xs font-semibold"}>{r.label}</button>))}
          </div>
          <p className="mt-2 text-[11px] text-ink-soft">{t("components.AanwezigheidAfstemmen.blok.geenUitleg")}</p>
        </div>) : null}
      {a?.fase === "voorstel" && a.door === "sanne" ? (<div className="mt-2">
          <p className="text-xs text-ink-soft">{t("components.AanwezigheidAfstemmen.blok.wacht")}</p>
          {import.meta.env.DEV ? (<div className="mt-2 flex flex-wrap gap-2">
              {reactiesVoor(a).map((r) => (<button key={r.id} onClick={() => r.id === "ander" ? startAfstemming(afspraakId, a.keuze === "samen" ? "een" : "samen", "joris", { kind: taakKind, afspraakTitel: titel, wieGaat: "joris" }) : reageer(afspraakId, r.id, "joris")} className="rounded-full border border-dashed border-border px-3 py-1 text-[11px] text-ink-soft">{t("components.AanwezigheidAfstemmen.blok.demo", { label: r.label })}</button>))}
            </div>) : null}
        </div>) : null}
      {(!a || a.fase === "open") ? (<button onClick={() => setKiezerOpen(true)} className="mt-3 rounded-full border border-brand/40 px-3.5 py-2 text-xs font-semibold text-brand">{a ? t("components.AanwezigheidAfstemmen.blok.kies") : t("components.AanwezigheidAfstemmen.blok.afstemmen")}</button>) : null}
      {a?.fase === "afgestemd" ? <button onClick={() => setKiezerOpen(true)} className="mt-2 text-[11px] font-semibold text-ink-soft underline-offset-2 hover:underline">{t("components.AanwezigheidAfstemmen.blok.opnieuw")}</button> : null}

      {/* Contacttaak met school/organisatie: dezelfde taak als in het takenoverzicht. */}
      {taak ? (<div className="mt-3 border-t border-border pt-3">
          <p className="text-xs text-ink-soft">{t("components.AanwezigheidAfstemmen.blok.taak", { tekst: taak.tekst })}</p>
          <p className="mt-0.5 text-xs font-semibold">{taak.overdragenAan ? t("components.AanwezigheidAfstemmen.blok.wachtBevestiging") : contactStatusLabel[taak.contactStatus ?? "nog-te-regelen"]}{taak.wie === "sanne" ? t("components.AanwezigheidAfstemmen.blok.jijRegelt") : taak.wie ? t("components.AanwezigheidAfstemmen.blok.anderRegelt") : ""}</p>
          {taak.wie === "sanne" && !taak.overdragenAan && (taak.contactStatus === "nog-te-regelen" || taak.contactStatus === "contact-opgenomen" || taak.contactStatus === "wacht-op-reactie" || taak.contactStatus === "afgerond") && !uitkomstVraag && a?.uitkomst !== "mogelijk" && a?.uitkomst !== "niet-mogelijk" ? (<Button variant="outline" onClick={() => { if (taak.contactStatus === "nog-te-regelen")
                markeerContactOpgenomen(afspraakId); setUitkomstVraag(true); }} className="mt-2 h-auto min-h-11 whitespace-normal text-xs">{taak.contactStatus === "nog-te-regelen" ? t("components.AanwezigheidAfstemmen.blok.contactOpgenomen") : t("components.AanwezigheidAfstemmen.blok.uitkomstVastleggen")}</Button>) : null}
          {uitkomstVraag ? (<div className="mt-2 space-y-2">
              <p className="text-sm font-semibold">{t("components.AanwezigheidAfstemmen.blok.uitkomstVraag")}</p>
              <div className="flex flex-wrap gap-2">
                {[["mogelijk", t("components.AanwezigheidAfstemmen.blok.uitkomst.mogelijk")], ["wacht-op-school", t("components.AanwezigheidAfstemmen.blok.uitkomst.wachtOpSchool")], ["niet-mogelijk", t("components.AanwezigheidAfstemmen.blok.uitkomst.nietMogelijk")], ["anders", t("components.AanwezigheidAfstemmen.blok.uitkomst.anders")]].map(([id, label]) => (<button key={id} onClick={() => { zetUitkomst(afspraakId, id, uitkomstToelichting); setUitkomstVraag(false); setUitkomstToelichting(""); }} className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold">{label}</button>))}
              </div>
              <input value={uitkomstToelichting} onChange={(e) => setUitkomstToelichting(e.target.value)} placeholder={t("components.AanwezigheidAfstemmen.blok.toelichtingPlaceholder")} className="w-full min-h-11 rounded-2xl border border-border bg-card px-3 py-2 text-sm outline-none"/>
            </div>) : null}
          {a?.uitkomst === "mogelijk" ? <p className="mt-2 text-xs text-ink-soft">{t("components.AanwezigheidAfstemmen.blok.dataBekend")}</p> : null}
          {a?.uitkomst === "niet-mogelijk" ? (<div className="mt-2 rounded-md bg-muted p-2.5 text-xs">
              <p className="font-semibold">{t("components.AanwezigheidAfstemmen.blok.nietMogelijkKop")}</p>
              <p className="mt-1 text-ink-soft">{t("components.AanwezigheidAfstemmen.blok.nietMogelijkUitleg")}</p>
              <button onClick={() => setKiezerOpen(true)} className="mt-2 rounded-full border border-border bg-card px-3 py-1.5 font-semibold">{t("components.AanwezigheidAfstemmen.blok.andereKiezen")}</button>
            </div>) : null}
          {a?.uitkomstToelichting ? <p className="mt-1 text-[11px] text-ink-soft">{a.uitkomstToelichting}</p> : null}
        </div>) : null}

      {/* Moet er nog iets geregeld worden? Alleen een taak als er echt iets te regelen is. */}
      {regelenVraag === null && !uitkomstVraag ? (<div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <p className="w-full text-xs text-ink-soft">{t("components.AanwezigheidAfstemmen.blok.regelenVraag")}</p>
          <button onClick={() => setRegelenVraag("ja")} className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold">{t("common.ja")}</button>
          <button onClick={() => setBerichtOpen((o) => !o)} className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-brand">{t("components.AanwezigheidAfstemmen.blok.helpBericht")}</button>
        </div>) : null}
      {regelenVraag === "ja" ? (<div className="mt-3 space-y-2 border-t border-border pt-3">
          <input value={taakTekst} onChange={(e) => setTaakTekst(e.target.value)} placeholder={t("components.AanwezigheidAfstemmen.blok.taakPlaceholder")} className="w-full min-h-11 rounded-2xl border border-border bg-card px-3 py-2 text-sm outline-none"/>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setTaakWie("sanne")} className={chip(taakWie === "sanne")}>{t("components.AanwezigheidAfstemmen.blok.ikRegel")}</button>
            <button onClick={() => setTaakWie("joris")} className={chip(taakWie === "joris")}>{t("components.AanwezigheidAfstemmen.anderVragen")}</button>
          </div>
          {taakWie === "joris" ? <p className="text-[11px] text-ink-soft">{t("components.AanwezigheidAfstemmen.blok.taakPasBevestigd")}</p> : null}
          <div className="flex gap-2">
            <Button size="sm" disabled={!taakTekst.trim()} onClick={() => { voegTaakToe({ tekst: taakTekst.trim(), kind: taakKind, wie: taakWie === "sanne" ? "sanne" : "", herhaling: "eenmalig", afspraakId, ...(taakWie === "joris" ? { overdragenAan: "joris" } : {}) }); setTaakTekst(""); setRegelenVraag(null); }}>{t("components.AanwezigheidAfstemmen.blok.taakToevoegen")}</Button>
            <Button size="sm" variant="outline" onClick={() => setRegelenVraag(null)}>{t("components.AanwezigheidAfstemmen.blok.niets")}</Button>
          </div>
        </div>) : null}

      {/* Hulp bij een neutraal bericht aan school of de organisatie; de ouder controleert en verstuurt zelf. */}
      {berichtOpen ? (<div className="mt-3 space-y-2 border-t border-border pt-3">
          <p className="text-sm font-semibold">{t("components.AanwezigheidAfstemmen.blok.helpBericht")}</p>
          <select aria-label={t("components.AanwezigheidAfstemmen.blok.soortVerzoek")} value={verzoek} onChange={(e) => setVerzoek(e.target.value)} className="w-full min-h-11 rounded-2xl border border-border bg-card px-3 py-2 text-sm">
            {verzoekOpties(t).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <Button size="sm" disabled={berichtBezig} onClick={maakBericht}>{berichtBezig ? t("components.AanwezigheidAfstemmen.blok.schrijven") : t("components.AanwezigheidAfstemmen.blok.maakConcept")}</Button>
          {berichtFout ? <p className="text-xs text-ink-soft">{berichtFout} <button onClick={maakBericht} className="font-semibold text-brand">{t("components.AanwezigheidAfstemmen.blok.opnieuwProberen")}</button></p> : null}
          {concept ? (<>
              <textarea aria-label={t("components.AanwezigheidAfstemmen.blok.concept")} value={concept} onChange={(e) => setConcept(e.target.value)} rows={5} className="w-full resize-none rounded-2xl border border-border bg-card p-2.5 text-sm outline-none"/>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={kopieer}>{gekopieerd ? t("components.AanwezigheidAfstemmen.blok.gekopieerd") : t("components.AanwezigheidAfstemmen.blok.kopieer")}</Button>
                <p className="text-[11px] text-ink-soft">{t("components.AanwezigheidAfstemmen.blok.controleer")}</p>
              </div>
            </>) : null}
        </div>) : null}

      {/* Na afloop: belangrijkste punten delen, zichtbaar wie het toevoegde. */}
      {voorbij ? (<div className="mt-3 border-t border-border pt-3">
          {a?.nabespreking ? (<div className="text-xs">
              <p className="font-semibold">{t("components.AanwezigheidAfstemmen.blok.punten")}</p>
              {a.nabespreking.besproken ? <p className="mt-1 text-ink-soft">{t("components.AanwezigheidAfstemmen.blok.besproken", { tekst: a.nabespreking.besproken })}</p> : null}
              {a.nabespreking.afspraken ? <p className="mt-1 text-ink-soft">{t("components.AanwezigheidAfstemmen.blok.afspraken", { tekst: a.nabespreking.afspraken })}</p> : null}
              <p className="mt-1 text-[11px] text-ink-soft">{a.nabespreking.door === "sanne" ? t("components.AanwezigheidAfstemmen.blok.toegevoegdJou", { datum: a.nabespreking.datum }) : t("components.AanwezigheidAfstemmen.blok.toegevoegdAnder", { datum: a.nabespreking.datum })}</p>
            </div>) : nabesprekingOpen ? (<div className="space-y-2">
              <label className="block text-xs font-semibold">{t("components.AanwezigheidAfstemmen.blok.watBesproken")}<textarea value={besproken} onChange={(e) => setBesproken(e.target.value)} rows={2} className="mt-1 w-full resize-none rounded-2xl border border-border bg-card p-2 text-sm outline-none"/></label>
              <label className="block text-xs font-semibold">{t("components.AanwezigheidAfstemmen.blok.afsprakenGemaakt")}<textarea value={gemaakteAfspraken} onChange={(e) => setGemaakteAfspraken(e.target.value)} rows={2} className="mt-1 w-full resize-none rounded-2xl border border-border bg-card p-2 text-sm outline-none"/></label>
              <div className="flex gap-2">
                <Button size="sm" disabled={!besproken.trim() && !gemaakteAfspraken.trim()} onClick={() => { deelNabespreking(afspraakId, besproken, gemaakteAfspraken, "sanne"); setNabesprekingOpen(false); }}>{t("components.AanwezigheidAfstemmen.blok.delen")}</Button>
                <Button size="sm" variant="outline" onClick={() => setNabesprekingOpen(false)}>{t("common.annuleren")}</Button>
              </div>
            </div>) : (<button onClick={() => setNabesprekingOpen(true)} className="rounded-full border border-border px-3.5 py-2 text-xs font-semibold">{t("components.AanwezigheidAfstemmen.blok.puntenDelen")}</button>)}
        </div>) : null}

      <AanwezigheidKiezer open={kiezerOpen} onSluit={() => setKiezerOpen(false)} onKies={kies}/>
    </div>);
}
/** Compacte uitklapper in het formulier 'Nieuwe afspraak'; alleen bij een gedeelde afspraak voor een kind. */
export function AanwezigheidFormulier({ keuze, wieGaat, contactWie, onKeuze, onWieGaat, onContactWie }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    return (<div className="rounded-md border border-border bg-card/60 p-3">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between text-left">
        <span>
          <span className="block text-xs font-semibold text-ink-soft">{t("components.AanwezigheidAfstemmen.formulier.titel")}</span>
          <span className="block text-[11px] text-ink-soft">{keuze ? keuzeLabel[keuze] : t("components.AanwezigheidAfstemmen.formulier.uitleg")}</span>
        </span>
        <span className="text-ink-soft">{open ? "−" : "+"}</span>
      </button>
      {open ? (<div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            {Object.keys(keuzeLabel).map((k) => (<button key={k} type="button" onClick={() => onKeuze(keuze === k ? null : k)} className={chip(keuze === k)}>{keuzeLabel[k]}</button>))}
          </div>
          {keuze === "een" || keuze === "halen" || keuze === "brengen" ? (<div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => onWieGaat("sanne")} className={chip(wieGaat === "sanne")}>{t("components.AanwezigheidAfstemmen.ikKanGaan")}</button>
              <button type="button" onClick={() => onWieGaat("joris")} className={chip(wieGaat === "joris")}>{t("components.AanwezigheidAfstemmen.formulier.anderOuder")}</button>
              <button type="button" onClick={() => onWieGaat("onbekend")} className={chip(wieGaat === "onbekend")}>{t("components.AanwezigheidAfstemmen.nogNietBekend")}</button>
            </div>) : null}
          {keuze === "afzonderlijk" ? (<div>
              <p className="text-[11px] text-ink-soft">{t("components.AanwezigheidAfstemmen.formulier.schoolBepaalt")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => onContactWie("sanne")} className={chip(contactWie === "sanne")}>{t("components.AanwezigheidAfstemmen.ikNeemContact")}</button>
                <button type="button" onClick={() => onContactWie("joris")} className={chip(contactWie === "joris")}>{t("components.AanwezigheidAfstemmen.anderVragen")}</button>
                <button type="button" onClick={() => onContactWie("nog")} className={chip(contactWie === "nog")}>{t("components.AanwezigheidAfstemmen.nogAfstemmen")}</button>
              </div>
            </div>) : null}
          <p className="text-[11px] text-ink-soft">{t("components.AanwezigheidAfstemmen.formulier.zonder")}</p>
        </div>) : null}
    </div>);
}
