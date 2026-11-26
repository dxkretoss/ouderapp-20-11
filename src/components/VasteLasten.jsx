import { useState } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { taalLocale } from "@/i18n";
import { GeldInvoer } from "@/components/GeldInvoer";
import { bewerkGeld, leesGeld } from "@/lib/geld-invoer";
import { maakPotje, stortInPotje, useVasteLasten, verwijderLast, verwijderPotje, verwijderStorting, voegLastToe, wijzigLast, wijzigPotje } from "@/lib/vaste-lasten-store";
import { Chevron } from "@/components/Tekens";
import { kindLabel } from "@/components/KostenTabs";
import { useStart } from "@/lib/start-store";
import { DeelKeuze, DeelLabel } from "@/components/DeelKeuze";
import { useDeelOpties } from "@/lib/kosten-delen";
import { bevestig } from "@/lib/feedback";
import { Button } from "@/components/ui/button";
import { VELD } from "@/lib/ui-stijl";
const euro = (n) => n.toLocaleString(taalLocale(), { style: "currency", currency: "EUR" });
const veld = `${VELD}`;
/** Kindkeuzes: ieder kind, alle kinderen (bij meer dan één) en "Gezin/algemeen". */
function useKindOpties() {
    const st = useStart();
    return [...st.kinderen.map((k) => ({ waarde: k.id, label: k.naam, ids: [k.id] })), ...(st.kinderen.length > 1 ? [{ waarde: "alle", label: kindLabel("Alle kinderen"), ids: st.kinderen.map((k) => k.id) }] : []), { waarde: "gezin", label: kindLabel("Gezin/algemeen"), ids: [] }];
}
const optieVoor = (opties, ids) => opties.find((o) => o.ids.length === (ids ?? []).length && o.ids.every((id) => ids.includes(id)))?.waarde ?? "gezin";
/** Rustig verwijderen: eerst vragen. */
function VerwijderKnop({ onBevestig, bezig }) {
    const { t } = useTranslation();
    const [vraag, setVraag] = useState(false);
    return vraag ? (<span className="flex items-center gap-2 text-xs">
      <span className="text-ink-soft">{t("components.VasteLasten.zekerVerwijderen")}</span>
      <button type="button" disabled={bezig} onClick={async () => { if (await onBevestig()) setVraag(false); }} className="min-h-10 font-semibold text-accent-warm disabled:opacity-40">{t("common.verwijderen")}</button>
      <button type="button" onClick={() => setVraag(false)} className="min-h-10 font-semibold text-ink-soft">{t("common.annuleren")}</button>
    </span>) : <button type="button" onClick={() => setVraag(true)} className="min-h-10 text-xs font-semibold text-ink-soft">{t("common.verwijderen")}</button>;
}
/** Formulier voor een nieuwe of bestaande vaste last: wat, bedrag per maand, kind, verdeling en Alleen jij / Gedeeld. */
function LastFormulier({ start, onKlaar }) {
    const { t } = useTranslation();
    const opties = useKindOpties();
    const [wat, setWat] = useState(start?.wat ?? "");
    const [bedrag, setBedrag] = useState(start ? bewerkGeld(start.perMaand) : "");
    const [kind, setKind] = useState(start ? optieVoor(opties, start.kindIds) : opties[0]?.waarde ?? "gezin");
    const [pct, setPct] = useState(start?.pctIk ?? 50);
    const [gedeeld, setGedeeld] = useState(start?.gedeeld ?? false);
    const [bezig, setBezig] = useState(false);
    const kindIds = opties.find((k) => k.waarde === kind)?.ids ?? [];
    const delen = useDeelOpties(kindIds);
    const b = leesGeld(bedrag) ?? 0;
    const geldig = !!wat.trim() && b > 0 && pct >= 0 && pct <= 100 && !(gedeeld && delen.gemengd);
    return (<form className="mt-2 grid gap-2" onSubmit={async (e) => {
            e.preventDefault();
            if (!geldig || bezig)
                return;
            setBezig(true);
            const velden = { wat: wat.trim(), kindIds, perMaand: b, pctIk: pct, gedeeld: gedeeld && delen.kan, anderId: delen.anderId };
            const gelukt = start ? await wijzigLast(start.id, velden) : await voegLastToe(velden);
            setBezig(false);
            if (gelukt) {
                bevestig(t("components.VasteLasten.opgeslagen"));
                onKlaar();
            }
        }}>
      <input className={veld} aria-label={t("components.VasteLasten.watPlaceholder")} placeholder={t("components.VasteLasten.watPlaceholder")} value={wat} maxLength={200} onChange={(e) => setWat(e.target.value)}/>
      <div className="grid grid-cols-2 gap-2">
        <GeldInvoer label={t("components.VasteLasten.perMaand")} value={bedrag} onChange={setBedrag}/>
        <select className={veld} aria-label={t("components.VasteLasten.voor")} value={kind} onChange={(e) => setKind(e.target.value)}>{opties.map((k) => <option key={k.waarde} value={k.waarde}>{k.label}</option>)}</select>
      </div>
      <DeelKeuze gedeeld={gedeeld && delen.kan} onChange={setGedeeld} kan={delen.kan || delen.gemengd}/>
      {gedeeld && delen.gemengd ? <p role="alert" className="text-xs font-semibold text-accent-warm">{t("lib.api.fout.MIXED_CHILDREN")}</p> : null}
      {gedeeld && delen.kan ? <label className="flex items-center gap-2 text-sm">
        <span className="text-ink-soft">{t("components.VasteLasten.jouwDeel")}</span>
        <input type="number" min={0} max={100} value={pct} aria-label={t("components.VasteLasten.jouwPct")} onChange={(e) => setPct(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} className="w-16 min-h-11 rounded-2xl border border-border bg-card px-2 py-1 text-sm"/>
        <span className="text-ink-soft">{t("components.VasteLasten.andereOuderPct", { pct: 100 - pct })}</span>
      </label> : null}
      <div className="grid grid-cols-2 gap-2">
        <button disabled={!geldig || bezig} className="min-h-11 w-full rounded-full bg-brand px-3 text-sm font-semibold text-primary-foreground disabled:opacity-40">{t("components.VasteLasten.opslaan")}</button>
        <button type="button" onClick={onKlaar} className="min-h-11 w-full rounded-full border border-border bg-card px-3 text-sm font-semibold text-ink-soft">{t("common.annuleren")}</button>
      </div>
    </form>);
}
function PotjeFormulier({ start, onKlaar }) {
    const { t } = useTranslation();
    const opties = useKindOpties();
    const [wat, setWat] = useState(start?.wat ?? "");
    const [doel, setDoel] = useState(start?.doel ? bewerkGeld(start.doel) : "");
    const [begin, setBegin] = useState("");
    const [kind, setKind] = useState(start ? optieVoor(opties, start.kindIds) : opties[0]?.waarde ?? "gezin");
    const [gedeeld, setGedeeld] = useState(start?.gedeeld ?? false);
    const [bezig, setBezig] = useState(false);
    const kindIds = opties.find((k) => k.waarde === kind)?.ids ?? [];
    const delen = useDeelOpties(kindIds);
    const doelBedrag = doel.trim() ? leesGeld(doel) : 0;
    const beginBedrag = begin.trim() ? leesGeld(begin) : 0;
    const geldig = !!wat.trim() && doelBedrag !== null && beginBedrag !== null && !(gedeeld && delen.gemengd);
    return (<form className="mt-2 grid gap-2" onSubmit={async (e) => {
            e.preventDefault();
            if (!geldig || bezig)
                return;
            setBezig(true);
            const velden = { wat: wat.trim(), doel: doelBedrag ?? 0, kindIds, gedeeld: gedeeld && delen.kan, anderId: delen.anderId };
            const gelukt = start ? await wijzigPotje(start.id, velden) : await maakPotje({ ...velden, start: beginBedrag ?? 0 });
            setBezig(false);
            if (gelukt) {
                bevestig(t("components.VasteLasten.potje.opgeslagen"));
                onKlaar();
            }
        }}>
      <input className={veld} aria-label={t("components.VasteLasten.potje.watPlaceholder")} placeholder={t("components.VasteLasten.potje.watPlaceholder")} value={wat} maxLength={120} onChange={(e) => setWat(e.target.value)}/>
      <div className="grid grid-cols-2 gap-2">
        <GeldInvoer label={t("components.VasteLasten.potje.doel")} placeholder={t("components.VasteLasten.potje.doel")} value={doel} onChange={setDoel}/>
        <select className={veld} aria-label={t("components.VasteLasten.voor")} value={kind} onChange={(e) => setKind(e.target.value)}>{opties.map((k) => <option key={k.waarde} value={k.waarde}>{k.label}</option>)}</select>
      </div>
      {!start ? <GeldInvoer label={t("components.VasteLasten.potje.begin")} placeholder={t("components.VasteLasten.potje.begin")} value={begin} onChange={setBegin}/> : null}
      <DeelKeuze gedeeld={gedeeld && delen.kan} onChange={setGedeeld} kan={delen.kan || delen.gemengd}/>
      {gedeeld && delen.gemengd ? <p role="alert" className="text-xs font-semibold text-accent-warm">{t("lib.api.fout.MIXED_CHILDREN")}</p> : null}
      <div className="grid grid-cols-2 gap-2">
        <button disabled={!geldig || bezig} className="min-h-11 w-full rounded-full bg-brand px-3 text-sm font-semibold text-primary-foreground disabled:opacity-40">{t("components.VasteLasten.potje.opslaan")}</button>
        <button type="button" onClick={onKlaar} className="min-h-11 w-full rounded-full border border-border bg-card px-3 text-sm font-semibold text-ink-soft">{t("common.annuleren")}</button>
      </div>
    </form>);
}
function Potje({ p }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [bewerk, setBewerk] = useState(false);
    const [storting, setStorting] = useState("");
    const [bezig, setBezig] = useState(false);
    const bedrag = leesGeld(storting) ?? 0;
    const pct = p.doel > 0 ? Math.min(100, Math.round((p.gespaard / p.doel) * 100)) : null;
    return (<li className="py-2.5">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-start gap-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{p.wat}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">{kindLabel(p.kind)}<DeelLabel gedeeld={p.gedeeld}/></span>
        </span>
        <span className="shrink-0 text-right text-sm font-semibold tabular-nums">{euro(p.gespaard)}{p.doel > 0 ? <span className="block text-xs font-normal text-ink-soft">{t("components.VasteLasten.potje.vanDoel", { doel: euro(p.doel) })}</span> : null}</span>
      </button>
      {pct !== null ? <div className="mt-2 h-2 overflow-hidden rounded-full bg-[rgba(226,216,203,.7)]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t("components.VasteLasten.potje.voortgang", { pct })}><div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }}/></div> : null}
      {open ? <div className="mt-2 space-y-2">
        {bewerk ? <PotjeFormulier start={p} onKlaar={() => setBewerk(false)}/> : <>
        <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (!(bedrag > 0) || bezig)
                return; setBezig(true); const ok = await stortInPotje(p.id, bedrag); setBezig(false); if (ok) {
                setStorting("");
                bevestig(t("components.VasteLasten.potje.gestort"));
            } }}>
          <GeldInvoer label={t("components.VasteLasten.potje.storten")} placeholder={t("components.VasteLasten.potje.storten")} value={storting} onChange={setStorting} className="flex-1"/>
          <Button type="submit" disabled={!(bedrag > 0) || bezig} className="min-h-11 shrink-0 shadow-none">{t("components.VasteLasten.potje.stortKnop")}</Button>
        </form>
        {p.stortingen.length ? <ul className="divide-y divide-border text-xs">
          {p.stortingen.map((s) => <li key={s.id} className="flex items-center justify-between gap-2 py-1.5">
            <span className="text-ink-soft">{new Date(`${s.datum}T12:00:00`).toLocaleDateString(taalLocale())} · {s.door === "ik" ? t("common.jij") : t("common.deAndereOuder")}{s.notitie ? ` · ${s.notitie}` : ""}</span>
            <span className="flex items-center gap-2"><span className="font-semibold tabular-nums">{euro(s.bedrag)}</span>{s.door === "ik" || p.doorIk ? <VerwijderKnop onBevestig={async () => { const ok = await verwijderStorting(s.id); if (ok)
                bevestig(t("components.VasteLasten.verwijderd")); return ok; }}/> : null}</span>
          </li>)}
        </ul> : <p className="text-xs text-ink-soft">{t("components.VasteLasten.potje.nogNiets")}</p>}
        {p.doorIk ? <div className="flex items-center gap-3">
          <button type="button" onClick={() => setBewerk(true)} className="min-h-10 text-xs font-semibold text-brand">{t("common.wijzigen")}</button>
          <VerwijderKnop onBevestig={async () => { const ok = await verwijderPotje(p.id); if (ok)
                bevestig(t("components.VasteLasten.verwijderd")); return ok; }}/>
        </div> : null}
        </>}
      </div> : null}
    </li>);
}
export function VasteLasten() {
    const { t } = useTranslation();
    const { lasten, potjes } = useVasteLasten();
    const [open, setOpen] = useState(false);
    const [potOpen, setPotOpen] = useState(false);
    const [bewerkId, setBewerkId] = useState(null);
    const totaal = lasten.reduce((s, l) => s + l.perMaand, 0);
    const jouwDeel = lasten.reduce((s, l) => s + (l.gedeeld ? (l.perMaand * l.pctIk) / 100 : l.perMaand), 0);
    const gespaard = potjes.reduce((s, p) => s + p.gespaard, 0);
    const [toon, setToon] = useState(null);
    // Zelfde kaartstijl als de andere blokken op Kosten (Budgetten, Uitgaven …).
    const Kaart = ({ id, titel, sub, children }) => (<section aria-labelledby={`vl-${id}`} className="mt-3 rounded-[22px] border border-white/85 bg-white/60 px-4 py-3.5">
      <button type="button" id={`vl-${id}`} onClick={() => setToon(toon === id ? null : id)} aria-expanded={toon === id} className="flex w-full items-center gap-3 text-left">
        <span className="min-w-0 flex-1"><span className="block font-display text-[18px] font-black">{titel}</span>{toon !== id ? <span className="mt-0.5 block truncate text-sm text-ink-soft">{sub}</span> : null}</span>
        <Chevron richting="omlaag" open={toon === id} className="size-5 text-ink-soft duration-200"/>
      </button>
      {toon === id ? <div className="mt-3">{children}</div> : null}
    </section>);
    // Toevoegen: altijd een duidelijke knop over de volle breedte (geen klein tekstlinkje).
    const ToevoegKnop = ({ open: isOpen, onClick, label }) => isOpen ? null : (<button type="button" onClick={onClick} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-brand/40 bg-brand-soft px-4 text-sm font-semibold text-brand">
      <Plus aria-hidden="true" strokeWidth={2} className="size-4"/>{label}
    </button>);
    const Leeg = ({ tekst }) => <p className="rounded-xl bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)] px-3 py-3 text-center text-sm text-ink-soft">{tekst}</p>;
    return (<>
      <Kaart id="lasten" titel={t("components.VasteLasten.titel")} sub={t("components.VasteLasten.sub", { aantal: lasten.length, totaal: euro(totaal) })}>
        {!lasten.length && !open ? <Leeg tekst={t("components.VasteLasten.leeg")}/> : null}
        {lasten.length ? <ul className="divide-y divide-border">
          {lasten.map((l) => (<li key={l.id} className="py-2.5 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><p className="font-semibold">{l.wat}</p><p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">{kindLabel(l.kind)}{l.gedeeld ? ` · ${l.pctIk}/${100 - l.pctIk}` : ""}<DeelLabel gedeeld={l.gedeeld}/></p></div>
                <span className="shrink-0 font-semibold">{euro(l.perMaand)}<span className="text-xs font-normal text-ink-soft"> {t("components.VasteLasten.mnd")}</span></span>
              </div>
              {l.doorIk ? (bewerkId === l.id ? <LastFormulier start={l} onKlaar={() => setBewerkId(null)}/> : <div className="mt-1 flex items-center gap-3">
                <button type="button" onClick={() => { setBewerkId(l.id); setOpen(false); }} className="min-h-10 text-xs font-semibold text-brand">{t("common.wijzigen")}</button>
                <VerwijderKnop onBevestig={async () => { const ok = await verwijderLast(l.id); if (ok)
                      bevestig(t("components.VasteLasten.verwijderd")); return ok; }}/>
              </div>) : null}
            </li>))}
        </ul> : null}
        {open ? <div className="mt-2 rounded-xl border border-border bg-card p-3"><LastFormulier onKlaar={() => setOpen(false)}/></div> : null}
        <ToevoegKnop open={open} onClick={() => { setOpen(true); setBewerkId(null); }} label={t("components.VasteLasten.toevoegKnop")}/>
        {lasten.length ? <p className="mt-3 text-xs text-ink-soft">{t("components.VasteLasten.samen", { totaal: euro(totaal), deel: euro(jouwDeel) })}</p> : null}
        <p className="mt-2 text-xs text-ink-soft">{t("components.VasteLasten.nietInSaldo")}</p>
      </Kaart>
      <Kaart id="potjes" titel={t("components.VasteLasten.potje.titel")} sub={t("components.VasteLasten.potje.sub", { aantal: potjes.length, totaal: euro(gespaard) })}>
        {!potjes.length && !potOpen ? <Leeg tekst={t("components.VasteLasten.potje.leeg")}/> : null}
        {potjes.length ? <ul className="divide-y divide-border">{potjes.map((p) => <Potje key={p.id} p={p}/>)}</ul> : null}
        {potOpen ? <div className="mt-2 rounded-xl border border-border bg-card p-3"><PotjeFormulier onKlaar={() => setPotOpen(false)}/></div> : null}
        <ToevoegKnop open={potOpen} onClick={() => setPotOpen(true)} label={t("components.VasteLasten.potje.toevoegKnop")}/>
        <p className="mt-3 text-xs text-ink-soft">{t("components.VasteLasten.potje.uitleg")}</p>
      </Kaart>
    </>);
}
