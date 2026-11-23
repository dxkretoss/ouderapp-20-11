import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Check, ChevronDown, Minus, Plus, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toggleMee, useKring } from "@/lib/kring-store";
import { haalMeeWeg, meeLijst, useTaken, voegMeeToe } from "@/lib/taken-store";
import { mogelijkMee, useSlimmeHulp } from "@/lib/slimme-hulp";
import { useVoorkeuren } from "@/lib/voorkeuren-store";
import { uur } from "@/lib/tijd-tekst";
import { kinderen } from "@/lib/demo-data";
import { bevestig } from "@/lib/feedback";
import { KindPil } from "@/components/KostenTabs";
import { MetVinkje } from "@/components/Tekens";
/**
 * Mee met de wissel (stijl A6). De lijst stelt zichzelf samen uit het moment, spullen die standaard
 * meewisselen en wat een ouder zelf toevoegt; "Wellicht nodig" komt er pas op na een tik.
 */
export function SlimmeMeeLijst({ momentId }) {
    const { t } = useTranslation();
    const kring = useKring();
    const { spullen } = useTaken();
    useSlimmeHulp();
    const vk = useVoorkeuren();
    const [nieuw, setNieuw] = useState("");
    const [toevoegen, setToevoegen] = useState(false);
    const [ingepaktOpen, setIngepaktOpen] = useState(false);
    const [controle, setControle] = useState(false);
    const m = kring.momenten.find((x) => x.id === momentId);
    if (!m)
        return null;
    const lijst = meeLijst(m);
    const klaar = kring.meeKlaar[m.id] ?? [];
    const nog = lijst.filter((x) => !klaar.includes(x));
    const ingepakt = lijst.filter((x) => klaar.includes(x));
    const pct = lijst.length ? Math.round((ingepakt.length / lijst.length) * 100) : 0;
    const namen = m.kindIds.map((id) => kinderen.find((k) => k.id === id)?.naam ?? id);
    const kindVan = (item) => {
        const ids = [...new Set(spullen.filter((s) => s.naam === item && s.type === "mee").map((s) => s.kind))];
        return ids.map((id) => kinderen.find((k) => k.id === id)?.naam ?? id);
    };
    const vink = (item) => toggleMee(m.id, item);
    if (controle)
        return <AllesMeegekomen momentId={m.id} items={lijst} onKlaar={() => setControle(false)}/>;
    return (<section className="mt-4" aria-label={t("components.SlimmeMeeLijst.meeMetWissel")}>
      <div className="rounded-[26px] px-5 py-4" style={{ background: "rgba(220,230,210,.75)" }}>
        <p className="font-display text-[24px] font-black leading-tight">{uur(m.tijd)} · {m.plek}</p>
        <p className="mt-0.5 text-[15px] text-[#3F5747]">{m.dag} · {m.titel} · {namen.join(` ${t("common.en")} `)}</p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#EADFD1]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t("components.SlimmeMeeLijst.ingepakt")}>
          <div className="h-full rounded-full bg-[#4F6B58] transition-all" style={{ width: `${pct}%` }}/>
        </div>
        <p className="mt-2 text-sm font-black text-[#3F5747]">{lijst.length ? (nog.length ? t("components.SlimmeMeeLijst.vanIngepakt", { n: ingepakt.length, totaal: lijst.length }) : <MetVinkje achter>{t("components.SlimmeMeeLijst.allesIngepakt")}</MetVinkje>) : t("components.SlimmeMeeLijst.nogNiets")}</p>
      </div>

      {nog.length ? <>
        <h2 className="mt-5 font-display text-[21px] font-black">{t("components.SlimmeMeeLijst.nogInpakken")} <span className="text-ink-soft">· {nog.length}</span></h2>
        <ul className="mt-2 space-y-2.5">
          {nog.map((item) => (<li key={item} className="flex items-center gap-3 rounded-[22px] border border-white/85 bg-white/70 px-4 py-3">
              <button onClick={() => vink(item)} aria-label={t("components.SlimmeMeeLijst.itemIngepakt", { item })} className="grid size-8 shrink-0 place-items-center rounded-[9px] border-2 border-[#B9AC9C] bg-white"/>
              <span className="min-w-0 flex-1">
                <span className="block text-[17px] font-black">{item}</span>
                {kindVan(item).length ? <span className="mt-1 flex flex-wrap gap-1.5">{kindVan(item).map((n) => <KindPil key={n} naam={n}/>)}</span> : null}
              </span>
              <button onClick={() => haalMeeWeg(m.id, item)} aria-label={t("components.SlimmeMeeLijst.vanLijst", { item })} className="grid size-9 place-items-center rounded-full text-ink-soft"><X className="size-4"/></button>
            </li>))}
        </ul>
      </> : null}

      {ingepakt.length ? (<div className="mt-2.5 rounded-[22px] border border-white/85 bg-white/70">
          <button onClick={() => setIngepaktOpen((o) => !o)} aria-expanded={ingepaktOpen} className="flex w-full items-center gap-2 px-4 py-3 text-left">
            <span className="min-w-0 flex-1 truncate text-[16px]"><b className="font-black">{t("components.SlimmeMeeLijst.alIngepakt", { n: ingepakt.length })}</b> <span className="text-ink-soft">{ingepakt.join(", ")}</span></span>
            <ChevronDown className={`size-5 shrink-0 text-ink-soft transition-transform ${ingepaktOpen ? "rotate-180" : ""}`} aria-hidden/>
          </button>
          {ingepaktOpen ? <ul className="border-t border-[#E9E1D5] px-4 py-1">{ingepakt.map((item) => (<li key={item} className="flex items-center gap-3 py-2">
              <button onClick={() => vink(item)} aria-label={t("components.SlimmeMeeLijst.tochNiet", { item })} className="grid size-7 shrink-0 place-items-center rounded-[8px] bg-[#4F6B58] text-white"><Check className="size-4"/></button>
              <span className="text-[15px] text-ink-soft line-through">{item}</span>
            </li>))}</ul> : null}
        </div>) : null}

      {vk.overdrachtHulp && mogelijkMee(m).length ? (<div className="mt-3 rounded-[22px] border border-white/85 bg-white/50 px-4 py-3">
          <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-ink-soft">{t("components.SlimmeMeeLijst.wellichtNodig")}</p>
          <ul className="mt-1 space-y-1.5">
            {mogelijkMee(m).map((x) => (<li key={x.item} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 font-bold">{x.item}<span className="block text-xs font-normal text-ink-soft">{x.reden}</span></span>
                <button onClick={() => voegMeeToe(m.id, x.item)} className="rounded-full bg-[#DCE3D3] px-3 py-1 text-xs font-extrabold text-[#3F5747]">{t("components.SlimmeMeeLijst.opDeLijst")}</button>
              </li>))}
          </ul>
          <p className="mt-1.5 text-[11.5px] text-ink-soft">{t("components.SlimmeMeeLijst.opBasisVan")}</p>
        </div>) : null}

      {toevoegen ? (<form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (nieuw.trim()) {
            voegMeeToe(m.id, nieuw.trim());
            setNieuw("");
            setToevoegen(false);
        } }}>
          <input autoFocus value={nieuw} onChange={(e) => setNieuw(e.target.value)} placeholder={t("components.SlimmeMeeLijst.watMee")} aria-label={t("components.SlimmeMeeLijst.watMee")} className="h-12 min-w-0 flex-1 rounded-2xl border border-white/85 bg-white px-4 text-[15px] outline-none"/>
          <button disabled={!nieuw.trim()} className="h-12 rounded-full bg-brand px-5 text-sm font-black text-primary-foreground disabled:opacity-45">{t("components.SlimmeMeeLijst.opDeLijst")}</button>
        </form>) : (<button onClick={() => setToevoegen(true)} className="mt-5 flex h-[54px] w-full items-center justify-center gap-2 rounded-full bg-brand text-base font-black text-primary-foreground"><Plus className="size-5" aria-hidden/>{t("components.SlimmeMeeLijst.ietsToevoegen")}</button>)}
      <div className="mt-3 flex items-center justify-between px-1 text-[15px] font-black text-brand">
        <Link to="/zorgregeling" search={{ actie: "wijziging", bron: "overdracht" }}>{t("components.SlimmeMeeLijst.verschuiven")}</Link>
        <button onClick={() => setControle(true)}>{t("components.SlimmeMeeLijst.allesMeegekomen")}</button>
      </div>
      {/school|opvang|nursery|childcare/i.test(m.plek ?? "") ? <p className="mt-3 rounded-2xl bg-[#E9EFE3] px-3.5 py-2.5 text-[13.5px] text-[#2F4A3A]"><Trans i18nKey="components.SlimmeMeeLijst.viaSchool" components={{ b: <b/> }}/></p> : null}
      <p className="mt-2 px-1 text-[12px] text-ink-soft">{t("components.SlimmeMeeLijst.standaard")}</p>
    </section>);
}
/** Na de wissel: de ouder bij wie de kinderen nu zijn, loopt de lijst na. Niet meegekomen = terug op de lijst. */
function AllesMeegekomen({ momentId, items, onKlaar }) {
    const { t } = useTranslation();
    const [niet, setNiet] = useState([]);
    const wissel = (item) => setNiet((l) => (l.includes(item) ? l.filter((x) => x !== item) : [...l, item]));
    const bevestigen = () => {
        for (const item of niet)
            toggleMee(momentId, item);
        bevestig(niet.length ? t("components.SlimmeMeeLijst.weerOpLijst", { count: niet.length, items: niet.join(", ") }) : t("components.SlimmeMeeLijst.fijnAlles"));
        onKlaar();
    };
    return (<section className="mt-4" aria-label={t("components.SlimmeMeeLijst.allesMeegekomen")}>
      <h2 className="font-display text-[24px] font-black">{t("components.SlimmeMeeLijst.allesMeegekomen")}</h2>
      <p className="text-sm text-ink-soft">{t("components.SlimmeMeeLijst.tik")}</p>
      <ul className="mt-3 rounded-[22px] border border-white/85 bg-white/70 px-4 py-1">
        {items.map((item) => {
            const mis = niet.includes(item);
            return (<li key={item} className="flex items-center gap-3 border-b border-[#E9E1D5] py-2.5 last:border-0">
            <span className="min-w-0 flex-1 text-[16px] font-black">{item}</span>
            <button onClick={() => wissel(item)} aria-pressed={!mis} className={`inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-black ${mis ? "bg-[#EBD9CC] text-[#5A4636]" : "bg-[#DCE6D2] text-[#2F4A3A]"}`}>
              {mis ? <Minus className="size-4" aria-hidden/> : <Check className="size-4" aria-hidden/>}{mis ? t("components.SlimmeMeeLijst.nietMeegekomen") : t("components.SlimmeMeeLijst.ontvangen")}
            </button>
          </li>);
        })}
      </ul>
      {niet.length ? <p className="mt-3 rounded-2xl bg-[rgba(220,230,210,.85)] px-4 py-3 text-[15px] text-[#2F4A3A]">{t("components.SlimmeMeeLijst.komtWeer", { count: niet.length, items: niet.join(", ") })}</p> : null}
      <button onClick={bevestigen} className="mt-5 h-[54px] w-full rounded-full bg-brand text-base font-black text-primary-foreground">{t("components.SlimmeMeeLijst.bevestigen")}</button>
      <button onClick={onKlaar} className="mt-2 w-full py-2 text-sm font-bold text-ink-soft">{t("components.SlimmeMeeLijst.terugLijst")}</button>
    </section>);
}
