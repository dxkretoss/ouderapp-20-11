import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { startState, useStart } from "@/lib/start-store";
import { useGezin } from "@/lib/gezin";
import { categorieLabel, reactieLabel, reageerNuAfstemmen, startNuAfstemmen, } from "@/lib/nu-afstemmen-store";
const kindNamen = (ids) => ids.map((id) => startState().kinderen.find((k) => k.id === id)?.naam).filter(Boolean).join(" & ");
/** Oplossingskaart: warm amber/klei, nooit fel rood. Gedeeld door Home en Berichten. */
export function NuAfstemmenKaart({ n }) {
    const { t } = useTranslation();
    const isAnder = (o) => o === "Ander voorstel" || o === t("common.anderVoorstel");
    const [anders, setAnders] = useState(false);
    const [tekst, setTekst] = useState("");
    return (<section role="status" className="relative mt-4 rounded-lg border border-accent-warm/40 px-4 py-3" style={{ background: "color-mix(in oklab, var(--accent-warm) 9%, var(--card))" }}>
      <p className="text-[11px] font-semibold tracking-[0.14em] text-accent-warm uppercase">{t("components.NuAfstemmen.kop", { kinderen: kindNamen(n.kindIds) })}</p>
      <p className="mt-1 font-display text-lg font-bold leading-snug">{n.titel}</p>
      {n.toelichting ? <p className="mt-0.5 text-sm text-ink-soft">{n.toelichting}</p> : null}
      <p className="mt-1 text-[11px] text-ink-soft">{t("components.NuAfstemmen.meta", { van: n.van === "ander" ? t("components.NuAfstemmen.vanAnder") : t("components.NuAfstemmen.doorJou"), reactie: reactieLabel[n.reactieGewenst].toLowerCase() })}</p>
      {n.van === "ander" ? (anders ? (<form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (tekst.trim())
            reageerNuAfstemmen(n.id, tekst.trim().slice(0, 500)); }}>
            <input autoFocus value={tekst} onChange={(e) => setTekst(e.target.value)} maxLength={500} placeholder={t("components.NuAfstemmen.jouwVoorstel")} className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"/>
            <button className="rounded-md bg-brand px-3 text-sm font-semibold text-primary-foreground">{t("components.NuAfstemmen.sturen")}</button>
          </form>) : (<div className="mt-3 flex flex-wrap gap-2">
            {n.opties.map((o) => (<button key={o} onClick={() => (isAnder(o) ? setAnders(true) : reageerNuAfstemmen(n.id, o))} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${isAnder(o) ? "border border-border text-ink-soft" : "bg-brand text-primary-foreground"}`}>{o}</button>))}
          </div>)) : null}
      <p className="mt-2 text-[11px] text-ink-soft">{t("components.NuAfstemmen.reactieUitleg")}</p>
    </section>);
}
/** Korte flow: categorie, kind, tijdsdruk, één zin. */
export function NuAfstemmenStart({ open, onSluit }) {
    const { t } = useTranslation();
    const { kinderen } = useStart();
    const gezin = useGezin();
    const [cat, setCat] = useState(null);
    const [kids, setKids] = useState([]);
    const [reactie, setReactie] = useState("zsm");
    const [titel, setTitel] = useState("");
    const reset = () => { setCat(null); setKids([]); setReactie("zsm"); setTitel(""); };
    const gekozen = kids.length ? kids : kinderen.map((k) => k.id);
    // Kinderen met verschillende andere ouders: één vraag kan maar naar één ouder (de server weigert anders).
    const gemengd = gezin.gemengd(gekozen);
    const verstuur = () => {
        if (!cat || !titel.trim() || gemengd)
            return;
        // Fouten (geen verbinding, geen rechten) meldt de store en hij zet de lijst terug via opnieuw laden.
        startNuAfstemmen({ categorie: cat, kindIds: gekozen, titel: titel.trim().slice(0, 300), toelichting: "", reactieGewenst: reactie });
        reset();
        onSluit();
    };
    const chip = (aan) => `rounded-full border px-3 py-1.5 text-xs font-semibold ${aan ? "border-accent-warm bg-accent-warm/15 text-ink" : "border-border text-ink-soft"}`;
    return (<Sheet open={open} onOpenChange={(o) => { if (!o) {
        reset();
        onSluit();
    } }}>
      <SheetContent side="bottom" className="left-1/2 max-h-[90dvh] w-full max-w-md -translate-x-1/2 overflow-y-auto rounded-t-2xl bg-background px-5 pb-8">
        <SheetHeader className="pr-8 text-left">
          <SheetTitle className="font-display text-xl font-medium">{t("components.NuAfstemmen.start.titel")}</SheetTitle>
          <SheetDescription className="text-xs">{t("components.NuAfstemmen.start.uitleg")}</SheetDescription>
        </SheetHeader>
        <p className="mt-4 text-xs font-semibold">{t("components.NuAfstemmen.start.waarover")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.keys(categorieLabel).map((c) => <button key={c} onClick={() => setCat(c)} className={chip(cat === c)}>{categorieLabel[c]}</button>)}
        </div>
        <p className="mt-4 text-xs font-semibold">{t("components.NuAfstemmen.start.welkKind")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {kinderen.map((k) => <button key={k.id} onClick={() => setKids((s) => (s.includes(k.id) ? s.filter((x) => x !== k.id) : [...s, k.id]))} className={chip(kids.includes(k.id))}>{k.naam}</button>)}
          <span className="self-center text-[11px] text-ink-soft">{t("components.NuAfstemmen.start.nietsGekozen")}</span>
        </div>
        <label className="mt-4 block text-xs font-semibold" htmlFor="na-titel">{t("components.NuAfstemmen.start.watIsEr")}</label>
        <input id="na-titel" value={titel} onChange={(e) => setTitel(e.target.value)} maxLength={300} placeholder={t("components.NuAfstemmen.start.placeholder")} className="mt-2 w-full rounded-md border border-border bg-card px-3 py-2.5 text-sm"/>
        <p className="mt-4 text-xs font-semibold">{t("components.NuAfstemmen.start.reactieGewenst")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.keys(reactieLabel).map((r) => <button key={r} onClick={() => setReactie(r)} className={chip(reactie === r)}>{reactieLabel[r]}</button>)}
        </div>
        {gemengd ? <p className="mt-3 text-xs font-semibold text-ink">{t("components.NuAfstemmen.start.kiesKind")}</p> : null}
        <button disabled={!cat || !titel.trim() || gemengd} onClick={verstuur} className="mt-5 w-full rounded-md bg-brand py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40">{t("common.versturen")}</button>
      </SheetContent>
    </Sheet>);
}
