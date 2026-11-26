import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n, { taalLocale } from "@/i18n";
import { GeldInvoer } from "@/components/GeldInvoer";
import { leesGeld } from "@/lib/geld-invoer";
import { geldigUitstelMoment, toonUitstelMoment, uitstelMoment } from "@/lib/budget-uitstel";
import { bevestigdBudget } from "@/lib/budget-weergave";
import { AppIcon } from "@/components/AppIcon";
import { Chevron, MetChevron } from "@/components/Tekens";
import { koppelNogNodigBudget } from "@/lib/nog-nodig-store";
import { useStart } from "@/lib/start-store";
import { kindLabel } from "@/components/KostenTabs";
import { bevestig } from "@/lib/feedback";
import { Link } from "@tanstack/react-router";
import { VoorstelIntrekken } from "@/components/VoorstelIntrekken";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { nieuwBudget, reageer, wijzigBudgetVoorstel, stuurBudgetHerinnering, trekBudgetIn, useBudgettenPaar, vraagMeerTijdBudget } from "@/lib/budget-store";
import { useDeelOpties } from "@/lib/kosten-delen";
import { magHerinnering } from "@/lib/herinneringen";
import { useVoorkeuren } from "@/lib/voorkeuren-store";
import { chip as chipStijl, VELD } from "@/lib/ui-stijl";
const euro = (n) => n.toLocaleString(taalLocale(), { style: "currency", currency: "EUR" });
const statusLabel = (s) => i18n.t(`components.BudgetVoorstel.status.${s}`);
/** Stappen bewaren de Nederlandse bronwaarde (logica en historie); alleen de weergave wordt vertaald. */
const STAP_SLEUTELS = { "Voorstel": "voorstel", "Akkoord": "akkoord", "Niet akkoord": "nietAkkoord", "Ander voorstel": "anderVoorstel", "Wijzigingsvoorstel": "wijzigingsvoorstel", "Ingetrokken": "ingetrokken", "Meer tijd gevraagd": "meerTijdGevraagd", "Herinnering verstuurd": "herinneringVerstuurd", "Werkelijke uitgave": "werkelijkeUitgave" };
const stapLabel = (wat) => (STAP_SLEUTELS[wat] ? i18n.t(`components.BudgetVoorstel.stap.${STAP_SLEUTELS[wat]}`) : wat);
/** "Meer tijd gevraagd" leest de laatste stap; het voorstel blijft gewoon open. */
const meerTijd = (v) => v.stappen.at(-1)?.wat.startsWith("Meer tijd gevraagd") === true;
const veld = `w-full ${VELD}`;
const chip = chipStijl;
/** filter "actie": alleen voorstellen die op jou wachten (voor "Nog te regelen"); "rest": de overige, met kop. Zelfde brondata. */
export function BudgetVoorstel({ startOpen = false, voorinvul, voorKind, doelId, bronItem, onUitgave, filter = "alles", zonderKop = false, onKlaar }) {
    const { t } = useTranslation();
    const opJou = (v) => v.aanZet === "ik" && (v.status === "wacht" || v.status === "tegenvoorstel");
    const st = useStart();
    const kindKeuzes = [...st.kinderen.map((k) => ({ waarde: k.naam, ids: [k.id] })), ...(st.kinderen.length > 1 ? [{ waarde: "Alle kinderen", ids: st.kinderen.map((k) => k.id) }] : [])];
    const wieNaam = (w) => (w === "ik" ? t("common.jij") : t("components.BudgetVoorstel.andereOuder"));
    const [bezig, setBezig] = useState(false);
    const doe = async (f, melding) => { setBezig(true); const ok = await f(); setBezig(false); if (ok) { bevestig(melding); onKlaar?.(); } return ok; };
    const ikOpen = opJou;
    const lijst = useBudgettenPaar().filter((v) => doelId ? v.id === doelId : filter === "lopend" ? v.status === "wacht" || v.status === "tegenvoorstel" : filter === "eerder" ? v.status === "geweigerd" || v.status === "ingetrokken" : filter === "afgesproken" ? !!bevestigdBudget(v) : filter === "alles" || (filter === "actie") === opJou(v));
    const [open, setOpen] = useState(false);
    useEffect(() => { if (startOpen)
        setOpen(true); }, [startOpen]);
    useEffect(() => { if (doelId)
        requestAnimationFrame(() => document.getElementById(`budget-${doelId}`)?.scrollIntoView({ block: "center" })); }, [doelId]);
    const [details, setDetails] = useState([]);
    const [tegenId, setTegenId] = useState(null);
    const [tegen, setTegen] = useState("");
    const [wijzigId, setWijzigId] = useState(null);
    const [uitstelId, setUitstelId] = useState(null);
    const [uitstelKeuze, setUitstelKeuze] = useState(null);
    const [uitstelDatum, setUitstelDatum] = useState("");
    const [uitstelTijd, setUitstelTijd] = useState("20:00");
    const [uitstelFout, setUitstelFout] = useState("");
    const gekozenMoment = uitstelKeuze === "zelf" ? (uitstelDatum && uitstelTijd ? new Date(`${uitstelDatum}T${uitstelTijd}`) : undefined) : undefined;
    const uitstelTot = uitstelKeuze === "zelf" ? (gekozenMoment && Number.isFinite(gekozenMoment.getTime()) ? gekozenMoment.toISOString() : undefined) : uitstelKeuze ? uitstelMoment(uitstelKeuze) : undefined;
    const eersteKind = kindKeuzes.find((k) => k.waarde === voorKind) ?? (voorKind === "Allebei" ? kindKeuzes.find((k) => k.waarde === "Alle kinderen") : null) ?? kindKeuzes[0];
    const leeg = { wat: "", kind: eersteKind?.waarde ?? "", kindIds: eersteKind?.ids ?? [], max: "", aangepast: false, pct: 50, toelichting: "", reactieDatum: "" };
    const vk = useVoorkeuren();
    const [form, setForm] = useState({ ...leeg, wat: voorinvul ?? "" });
    const max = leesGeld(form.max) ?? 0;
    // Een budget is altijd een voorstel aan de andere ouder van deze kinderen.
    const delen = useDeelOpties(form.kindIds);
    const kanVoorstellen = wijzigId ? true : delen.kan;
    return (<section>
      {zonderKop || filter === "actie" || doelId ? null : <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold">{filter === "afgesproken" ? t("components.BudgetVoorstel.kopAfgesproken") : t("components.BudgetVoorstel.kopVoorstellen")}</h2>
          <p className="mt-0.5 text-xs text-ink-soft">{t("components.BudgetVoorstel.intro")}</p>
        </div>
      </div>}

      <div className={filter === "actie" || !lijst.length ? "divide-y divide-border" : "mt-2 divide-y divide-border border-y border-border"}>
        {lijst.map((v) => {
            const laatste = [...v.stappen].reverse().find((s) => s.bedrag)?.bedrag ?? v.max;
            const bevestigd = bevestigdBudget(v);
            const uitgeklapt = (ikOpen(v) && !meerTijd(v)) || details.includes(v.id) || doelId === v.id;
            const ikAanZet = v.aanZet === "ik" && (v.status === "wacht" || v.status === "tegenvoorstel");
            return (<div key={v.id} id={`budget-${v.id}`} className="py-3">
              <Button variant="ghost" aria-expanded={uitgeklapt} aria-label={t("components.BudgetVoorstel.detailsLabel", { wat: v.wat })} onClick={() => setDetails((l) => l.includes(v.id) ? l.filter((id) => id !== v.id) : [...l, v.id])} className="h-auto min-h-14 w-full justify-between gap-3 whitespace-normal px-0 text-left">
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{v.wat}{v.bijlage ? <AppIcon functie="documenten" maat="sm" vorm="kaal"/> : null}</span><span className="block text-xs font-normal text-ink-soft">{bevestigd ? t("components.BudgetVoorstel.afgesprokenBedrag", { bedrag: euro(v.max) }) : t("components.BudgetVoorstel.voorstelBedrag", { bedrag: euro(laatste) })}</span></span>
                <span className={`max-w-28 text-xs ${ikAanZet ? "text-accent-warm" : bevestigd ? "text-brand" : "text-ink-soft"}`}>{ikAanZet ? t("components.BudgetVoorstel.jouwReactie") : meerTijd(v) && (v.status === "wacht" || v.status === "tegenvoorstel") ? t("components.BudgetVoorstel.stap.meerTijdGevraagd") : v.status === "wacht" || v.status === "tegenvoorstel" ? t("components.BudgetVoorstel.wachtOpAnder") : bevestigd ? t("components.BudgetVoorstel.status.akkoord") : statusLabel(v.status)}</span><Chevron richting="omlaag" open={uitgeklapt} className="size-4 text-brand"/>
              </Button>
              {meerTijd(v) && ikAanZet ? <p className="mb-2 text-xs text-ink-soft">{t("components.BudgetVoorstel.stap.meerTijdGevraagd")}{v.stappen.at(-1)?.terugkijkMoment ? ` · ${t("components.BudgetVoorstel.uitstel.opnieuwBekijken", { moment: toonUitstelMoment(v.stappen.at(-1)?.terugkijkMoment ?? "") })}` : ""}</p> : null}
              {uitgeklapt ? <div>
              <p className="text-xs text-ink-soft">{t("components.BudgetVoorstel.kindVerdeling", { kind: kindLabel(v.kind), sanne: v.pctIk, ander: 100 - v.pctIk })}{v.status === "tegenvoorstel" && bevestigd ? ` · ${t("components.BudgetVoorstel.wijzigingVoorgesteld", { bedrag: euro(laatste) })}` : ""}</p>
              {v.voorwaarden ? <p className="mt-1 text-xs text-ink-soft">{t("components.BudgetVoorstel.voorwaarden", { voorwaarden: v.voorwaarden })}</p> : null}
              {v.geldigVan || v.geldigTot ? <p className="mt-1 text-xs text-ink-soft">{v.geldigVan && v.geldigTot ? t("components.BudgetVoorstel.geldig.vanTot", { van: v.geldigVan, tot: v.geldigTot }) : v.geldigVan ? t("components.BudgetVoorstel.geldig.van", { van: v.geldigVan }) : t("components.BudgetVoorstel.geldig.tot", { tot: v.geldigTot })}</p> : null}
              {v.periode ? <p className="mt-1 text-xs text-ink-soft">{v.periode === "maand" ? t("components.BudgetVoorstel.periode.maand") : v.periode === "jaar" ? t("components.BudgetVoorstel.periode.jaar") : t("components.BudgetVoorstel.periode.eenmalig")}</p> : null}
              {v.toelichting ? <p className="mt-1 text-xs text-ink-soft">“{v.toelichting}”</p> : null}
              {v.stappen.length > 1 ? <p className="mt-1 text-[11px] text-ink-soft">{v.stappen.map((s) => `${wieNaam(s.wie)}: ${stapLabel(s.wat)}${s.bedrag ? ` ${euro(s.bedrag)}` : ""}`).join(" → ")}</p> : null}
              {v.reactieDatum && !bevestigd ? <p className="mt-1 text-xs text-ink-soft">{t("components.BudgetVoorstel.reactieVoor", { datum: v.reactieDatum })}</p> : null}

              {ikAanZet ? (tegenId === v.id ? (<div className="mt-2 flex gap-2">
                  <GeldInvoer value={tegen} onChange={setTegen} label={t("components.BudgetVoorstel.anderBedrag")}/>
                  <Button disabled={bezig || !(leesGeld(tegen) ?? 0)} onClick={async () => { const n = leesGeld(tegen) ?? 0; if (n > 0 && await doe(() => reageer(v.id, "ik", { tegen: n }), t("components.BudgetVoorstel.melding.voorstelVerstuurd"))) {
                        setTegenId(null);
                        setTegen("");
                    } }} className="min-h-11 px-4 text-sm font-semibold">{t("components.BudgetVoorstel.stuur")}</Button>
                </div>) : (<div className="mt-2 grid grid-cols-2 gap-2">
                  <Button disabled={bezig} onClick={() => doe(() => reageer(v.id, "ik", "akkoord"), t("components.BudgetVoorstel.melding.akkoord"))} className="h-auto min-h-11 w-full whitespace-normal px-2 py-2 text-xs font-semibold">{t("common.akkoord")}</Button>
                  <Button variant="outline" onClick={() => { setTegenId(v.id); setTegen(String(laatste)); }} className="h-auto min-h-11 w-full whitespace-normal px-2 py-2 text-xs font-semibold">{t("common.anderVoorstel")}</Button>
                  <Button disabled={bezig} variant="outline" onClick={() => doe(() => reageer(v.id, "ik", "geweigerd"), t("components.BudgetVoorstel.melding.afgewezen"))} className="h-auto min-h-11 w-full whitespace-normal px-2 py-2 text-xs font-semibold text-ink-soft">{t("common.nietAkkoord")}</Button>
                  <Button variant="outline" onClick={() => { setUitstelId(v.id); setUitstelKeuze(null); setUitstelDatum(""); setUitstelTijd("20:00"); setUitstelFout(""); }} className="h-auto min-h-11 w-full whitespace-normal px-2 py-2 text-xs font-semibold">{t("common.meerTijdNodig")}</Button>
                </div>)) : null}
              {v.aanZet === "ander" && (v.status === "wacht" || v.status === "tegenvoorstel") ? (<span className="mt-2 flex flex-wrap items-center gap-2">
                  {magHerinnering({ verstuurd: v.stappen.filter((s) => s.wat === "Herinnering verstuurd").map((s) => s.moment), reactieDatum: v.reactieDatum, gepauzeerd: vk.herinneringenGepauzeerd }).mag ? (<Button variant="ghost" size="sm" className="text-xs" onClick={async () => { if (await stuurBudgetHerinnering(v.id))
                            bevestig(t("components.BudgetVoorstel.melding.herinnering")); }}>{t("components.BudgetVoorstel.herinneringSturen")}</Button>) : null}
                  <VoorstelIntrekken onBevestig={() => doe(() => trekBudgetIn(v.id), t("components.BudgetVoorstel.melding.ingetrokken"))}/>
                </span>) : null}
              {v.status === "uitgegeven" && (v.stappen.at(-1)?.bedrag ?? 0) > v.max + 0.009 ? (<div className="mt-2 rounded-md border border-accent-warm/40 bg-muted p-2.5 text-xs">
                  <p className="font-semibold">{t("components.BudgetVoorstel.overschreden", { bedrag: euro((v.stappen.at(-1)?.bedrag ?? 0) - v.max) })}</p>
                  <p className="mt-0.5 text-ink-soft">{t("components.BudgetVoorstel.extraPasNaInstemming")}</p>
                  <Link to="/berichten" className="mt-1.5 inline-flex min-h-10 items-center font-semibold text-brand"><MetChevron>{t("components.BudgetVoorstel.extraAfstemmen")}</MetChevron></Link>
                </div>) : null}
              {v.status === "akkoord" ? (<Button variant="link" onClick={() => onUitgave(v)} className="mt-2 min-h-11 px-0 text-xs font-semibold"><MetChevron>{t("components.BudgetVoorstel.uitgaveVastleggen")}</MetChevron></Button>) : null}
              {v.status === "akkoord" || v.status === "uitgegeven" ? <Button variant="link" className="min-h-11 px-0 text-xs" onClick={() => { setWijzigId(v.id); setForm({ ...leeg, wat: v.wat, kind: v.kind, kindIds: v.kindIds, max: String(v.max), pct: v.pctIk, aangepast: v.pctIk !== 50 }); setOpen(true); }}>{t("components.BudgetVoorstel.wijzigingVoorstellen")}</Button> : null}
              </div> : null}
            </div>);
        })}
      </div>

      <Sheet open={uitstelId !== null} onOpenChange={(o) => { if (!o)
        setUitstelId(null); }}>
        <SheetContent side="bottom" className="left-1/2 max-h-[90dvh] w-full max-w-md -translate-x-1/2 overflow-y-auto rounded-t-2xl bg-background px-5 pb-8 pt-4">
          <SheetHeader className="pr-8 text-left">
            <SheetTitle>{t("components.BudgetVoorstel.uitstel.titel")}</SheetTitle>
            <SheetDescription>{t("components.BudgetVoorstel.uitstel.beschrijving")}</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-2" role="group" aria-label={t("components.BudgetVoorstel.uitstel.groepLabel")}>
              {[{ id: "vanavond", label: t("components.BudgetVoorstel.uitstel.vanavond") }, { id: "morgen", label: t("common.morgen") }, { id: "drie-dagen", label: t("components.BudgetVoorstel.uitstel.drieDagen") }, { id: "zelf", label: t("components.BudgetVoorstel.uitstel.zelf") }].map((keuze) => <Button key={keuze.id} variant={uitstelKeuze === keuze.id ? "default" : "outline"} aria-pressed={uitstelKeuze === keuze.id} disabled={keuze.id === "vanavond" && !uitstelMoment("vanavond")} className="min-h-11 h-auto whitespace-normal text-xs" onClick={() => { setUitstelKeuze(keuze.id); setUitstelFout(""); }}>{keuze.label}</Button>)}
            </div>
            {uitstelKeuze === "zelf" ? <div className="grid grid-cols-2 gap-3"><label className="text-xs font-semibold">{t("components.BudgetVoorstel.uitstel.datum")}<input type="date" value={uitstelDatum} onChange={(e) => setUitstelDatum(e.target.value)} className={`${veld} mt-1`}/></label><label className="text-xs font-semibold">{t("components.BudgetVoorstel.uitstel.tijd")}<input type="time" value={uitstelTijd} onChange={(e) => setUitstelTijd(e.target.value)} className={`${veld} mt-1`}/></label></div> : null}
            {uitstelTot ? <p className="text-sm">{t("components.BudgetVoorstel.uitstel.opnieuwBekijken", { moment: toonUitstelMoment(uitstelTot) })}</p> : null}
            <p className="text-xs text-ink-soft">{t("components.BudgetVoorstel.uitstel.geenDeadline")}</p>
            <p className="text-xs text-ink-soft">{t("components.BudgetVoorstel.uitstel.voorbeeld")}</p>
            {uitstelFout ? <p role="alert" className="text-sm text-accent-warm">{uitstelFout}</p> : null}
            <Button className="min-h-11 w-full" disabled={!uitstelTot || !geldigUitstelMoment(uitstelTot)} onClick={async () => {
            if (!uitstelId || !uitstelTot)
                return;
            if (!(await vraagMeerTijdBudget(uitstelId, "ik", uitstelTot))) {
                setUitstelFout(t("components.BudgetVoorstel.uitstel.fout"));
                return;
            }
            setDetails((l) => l.filter((id) => id !== uitstelId));
            setUitstelId(null);
            bevestig(t("components.BudgetVoorstel.uitstel.vastgelegd"));
            onKlaar?.();
        }}>{t("components.BudgetVoorstel.uitstel.bevestigen")}</Button>
            <Button variant="outline" className="min-h-11 w-full" onClick={() => setUitstelId(null)}>{t("common.terug")}</Button>
          </div>
        </SheetContent>
      </Sheet>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="left-1/2 max-h-[90dvh] w-full max-w-md -translate-x-1/2 overflow-y-auto rounded-t-2xl bg-background px-5 pb-8 pt-4">
          <SheetHeader className="pr-8 text-left">
            <SheetTitle className="font-display text-xl font-medium">{t("components.BudgetVoorstel.form.titel")}</SheetTitle>
            <SheetDescription className="text-xs">{t("components.BudgetVoorstel.form.beschrijving")}</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <label className="block text-xs font-semibold">{t("components.BudgetVoorstel.form.wat")}<input value={form.wat} onChange={(e) => setForm({ ...form, wat: e.target.value })} placeholder={t("components.BudgetVoorstel.form.watPlaceholder")} className={`${veld} mt-1`}/></label>
            <div className="text-xs font-semibold">{t("components.BudgetVoorstel.form.geschat")}<GeldInvoer value={form.max} onChange={(max) => setForm({ ...form, max })} label={t("components.BudgetVoorstel.form.geschat")} className="mt-1"/></div>
            <div><p className="text-xs font-semibold">{t("components.BudgetVoorstel.form.verdeling")}</p>
              <div className="mt-1 flex gap-2"><button onClick={() => setForm({ ...form, aangepast: false, pct: 50 })} className={chip(!form.aangepast)}>50 / 50</button><button onClick={() => setForm({ ...form, aangepast: true, pct: 60 })} className={chip(form.aangepast)}>{t("components.BudgetVoorstel.form.aangepast")}</button></div>
              {form.aangepast ? <label className="mt-2 flex items-center gap-3 text-xs">{t("components.BudgetVoorstel.form.jij", { pct: form.pct })}<input type="range" min={0} max={100} step={5} value={form.pct} onChange={(e) => setForm({ ...form, pct: Number(e.target.value) })} className="flex-1 accent-[var(--brand)]"/>{t("components.BudgetVoorstel.form.andereOuder", { pct: 100 - form.pct })}</label> : null}
            </div>
            <div><p className="text-xs font-semibold">{t("components.BudgetVoorstel.form.welkKind")}</p>
              <div className="mt-1 flex flex-wrap gap-2">{kindKeuzes.map((k) => <button key={k.waarde} onClick={() => setForm({ ...form, kind: k.waarde, kindIds: k.ids })} className={chip(form.kind === k.waarde)}>{kindLabel(k.waarde)}</button>)}</div>
            </div>
            <label className="block text-xs font-semibold">{t("components.BudgetVoorstel.form.toelichting")}<input value={form.toelichting} onChange={(e) => setForm({ ...form, toelichting: e.target.value })} className={`${veld} mt-1`}/></label>
            <label className="block text-xs font-semibold">{t("components.BudgetVoorstel.form.reactieDatum")}<input type="date" value={form.reactieDatum} onChange={(e) => setForm({ ...form, reactieDatum: e.target.value })} className={`${veld} mt-1`}/></label>
            <p className="-mt-2 text-xs text-ink-soft">{t("components.BudgetVoorstel.form.verzoek")}</p>
            {!wijzigId && delen.gemengd ? <p role="alert" className="text-xs font-semibold text-accent-warm">{t("lib.api.fout.MIXED_CHILDREN")}</p> : !kanVoorstellen ? <p role="alert" className="text-xs font-semibold text-accent-warm">{t("components.BudgetVoorstel.form.geenAndereOuder")}</p> : null}
            <div className="voet-vast-sheet">
            <Button disabled={bezig || !form.wat.trim() || !(max > 0) || !kanVoorstellen} onClick={async () => {
            if (wijzigId) {
                setBezig(true);
                const gelukt = await wijzigBudgetVoorstel(wijzigId, "ik", max, form.pct);
                setBezig(false);
                if (gelukt) {
                    setWijzigId(null);
                    setForm(leeg);
                    setOpen(false);
                    bevestig(t("components.BudgetVoorstel.melding.wijziging"));
                }
                return;
            }
            setBezig(true);
            const id = await nieuwBudget({ wat: form.wat.trim(), kindIds: form.kindIds, max, pctIk: form.pct, anderId: delen.anderId ?? undefined, toelichting: form.toelichting || undefined, ...(form.reactieDatum ? { reactieDatum: form.reactieDatum } : {}) });
            setBezig(false);
            if (!id)
                return;
            if (bronItem)
                koppelNogNodigBudget(bronItem, id);
            setForm(leeg);
            setOpen(false);
            bevestig(t("components.BudgetVoorstel.melding.toegevoegd"), { uitleg: form.wat.trim() });
        }} className="min-h-12 w-full rounded-full bg-brand text-sm font-semibold text-primary-foreground">{t("components.BudgetVoorstel.form.versturen")}</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </section>);
}
