import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Check, ChevronDown, Minus, Plus, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { uur } from "@/lib/tijd-tekst";
import { bevestig } from "@/lib/feedback";
import { KindPil } from "@/components/KostenTabs";
import { MetVinkje } from "@/components/Tekens";
import { useStart } from "@/lib/start-store";
import { bevestigOntvangen, haalItemWeg, itemsVoor, leesAfspraakRef, urenTot, useOverdracht, voegItemsToe, vulAfspraakSpullenAan, vulVasteSpullenAan, zetIngepakt } from "@/lib/overdracht-store";
import { useAgenda } from "@/lib/agenda-store";
import { tLijst } from "@/i18n";
import { dt } from "@/lib/agenda-datum";
/** Opties en getypte spullen blijven zoals ze zijn opgeslagen; bekende opties krijgen een vertaald label. */
const OPTIE_SLEUTEL = { Zwemspullen: "zwemspullen", Gymtas: "gymtas", Medicijnen: "medicijnen", Voetbalspullen: "voetbalspullen", Sportkleding: "sportkleding", Schooltas: "schooltas", Knuffel: "knuffel", Pyjama: "pyjama", Jas: "jas", Oplader: "oplader", Tablet: "tablet", Huiswerk: "huiswerk" };
const optieLabel = (t, n) => (OPTIE_SLEUTEL[n] ? t(`components.SlimmeMeeLijst.optie.${OPTIE_SLEUTEL[n]}`) : n);
/**
 * Mee met de wissel (stijl A6) voor één wisselmoment (id = datum). De lijst komt van de server: vaste spullen
 * per kind, wat een ouder toevoegt (een toevoeging van de ontvangende ouder is een verzoek) en wat de vorige
 * keer niet meekwam. Beide ouders zien en vinken dezelfde lijst.
 */
export function SlimmeMeeLijst({ moment: m, daarna }) {
    const { t } = useTranslation();
    const od = useOverdracht();
    const st = useStart();
    const [nieuw, setNieuw] = useState("");
    const [toevoegen, setToevoegen] = useState(false);
    const [ingepaktOpen, setIngepaktOpen] = useState(false);
    const [controle, setControle] = useState(false);
    const agenda = useAgenda();
    useEffect(() => { if (m)
        vulVasteSpullenAan(m, daarna); }, [m?.id, daarna?.id, od.geladen, od.routines.length]);
    // "Neem mee" van gedeelde afspraken tussen deze wissel en de volgende (zodra de agenda geladen is).
    useEffect(() => { if (m)
        vulAfspraakSpullenAan(m, daarna); }, [m?.id, daarna?.id, od.geladen, agenda.geladen, agenda.events.length]);
    if (!m)
        return null;
    const lijst = itemsVoor(od, m.id);
    const nog = lijst.filter((x) => !x.ingepakt);
    const ingepakt = lijst.filter((x) => x.ingepakt);
    const pct = lijst.length ? Math.round((ingepakt.length / lijst.length) * 100) : 0;
    const naam = (id) => st.kinderen.find((k) => k.id === id)?.naam ?? "";
    // Afspraak-items: "Zwemles za 10:00" uit de agenda (bron_ref = afspraak:<id>:<datum>); oudere items hebben het label zelf.
    const afspraakLabel = (ref) => {
        const r = leesAfspraakRef(ref);
        if (!r)
            return ref ?? "";
        const a = agenda.events.find((e) => e.id === r.id);
        if (!a)
            return t("components.SlimmeMeeLijst.bron.afspraak");
        const dag = tLijst("common.dagenKort")[(dt(r.datum).getDay() + 6) % 7] ?? "";
        return [a.titel, dag, a.tijd ? uur(a.tijd) : ""].filter(Boolean).join(" ");
    };
    const bron = (i) => i.bron === "vast" ? t("components.SlimmeMeeLijst.bron.vast") : i.bron === "verzoek" ? (i.door === "ik" ? t("components.SlimmeMeeLijst.bron.jouwVerzoek") : t("components.SlimmeMeeLijst.bron.verzoek")) : i.bron === "niet_meegekomen" ? t("components.SlimmeMeeLijst.bron.nietMeegekomen") : i.bron === "afspraak" ? afspraakLabel(i.bronRef) : "";
    // "Is alles meegekomen?" alleen voor de ouder naar wie de kinderen gaan, en pas na het wisselmoment.
    const naWissel = urenTot(m.datum, m.tijd) < 0;
    const magNalopen = !!m.naarMij && naWissel && lijst.length > 0;
    // De ouder naar wie de kinderen gaan, vraagt; de ouder die inpakt, voegt toe.
    const voegToe = (namen) => voegItemsToe(m.id, namen, m.kindIds, m.naarMij ? "verzoek" : "toegevoegd");
    const opties = od.opties.filter((o) => !lijst.some((i) => i.naam.toLowerCase() === o.toLowerCase())).slice(0, 18);
    if (controle && magNalopen)
        return <AllesMeegekomen moment={m} daarna={daarna} items={lijst} onKlaar={() => setControle(false)}/>;
    return (<section className="mt-4" aria-label={t("components.SlimmeMeeLijst.meeMetWissel")}>
      <div className="rounded-[26px] px-5 py-4" style={{ background: "rgba(220,230,210,.75)" }}>
        <p className="font-display text-[24px] font-black leading-tight">{m.tijd ? uur(m.tijd) : t("components.SlimmeMeeLijst.geenTijd")}{m.plek ? ` · ${m.plek}` : ""}</p>
        <p className="mt-0.5 text-[15px] text-[#3F5747] first-letter:uppercase">{m.dag} · {m.naarMij ? t("components.SlimmeMeeLijst.naarJou") : t("components.SlimmeMeeLijst.naarAnder")} · {m.namen.join(` ${t("common.en")} `)}</p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#EADFD1]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t("components.SlimmeMeeLijst.ingepakt")}>
          <div className="h-full rounded-full bg-[#4F6B58] transition-all" style={{ width: `${pct}%` }}/>
        </div>
        <p className="mt-2 text-sm font-black text-[#3F5747]">{lijst.length ? (nog.length ? t("components.SlimmeMeeLijst.vanIngepakt", { n: ingepakt.length, totaal: lijst.length }) : <MetVinkje achter>{t("components.SlimmeMeeLijst.allesIngepakt")}</MetVinkje>) : t("components.SlimmeMeeLijst.nogNiets")}</p>
      </div>

      {nog.length ? <>
        <h2 className="mt-5 font-display text-[21px] font-black">{t("components.SlimmeMeeLijst.nogInpakken")} <span className="text-ink-soft">· {nog.length}</span></h2>
        <ul className="mt-2 space-y-2.5">
          {nog.map((item) => (<li key={item.id} className="flex items-center gap-3 rounded-[22px] border border-white/85 bg-white/70 px-4 py-3">
              <button onClick={() => zetIngepakt(item.id, true)} aria-label={t("components.SlimmeMeeLijst.itemIngepakt", { item: optieLabel(t, item.naam) })} className="grid size-8 shrink-0 place-items-center rounded-[9px] border-2 border-[#B9AC9C] bg-white"/>
              <span className="min-w-0 flex-1">
                <span className="block text-[17px] font-black">{optieLabel(t, item.naam)}</span>
                {bron(item) ? <span className="block text-xs text-ink-soft">{bron(item)}</span> : null}
                {item.kindIds.length ? <span className="mt-1 flex flex-wrap gap-1.5">{item.kindIds.map((id) => naam(id)).filter(Boolean).map((n) => <KindPil key={n} naam={n}/>)}</span> : null}
              </span>
              <button onClick={() => haalItemWeg(item.id)} aria-label={t("components.SlimmeMeeLijst.vanLijst", { item: optieLabel(t, item.naam) })} className="grid size-9 place-items-center rounded-full text-ink-soft"><X className="size-4"/></button>
            </li>))}
        </ul>
      </> : null}

      {ingepakt.length ? (<div className="mt-2.5 rounded-[22px] border border-white/85 bg-white/70">
          <button onClick={() => setIngepaktOpen((o) => !o)} aria-expanded={ingepaktOpen} className="flex w-full items-center gap-2 px-4 py-3 text-left">
            <span className="min-w-0 flex-1 truncate text-[16px]"><b className="font-black">{t("components.SlimmeMeeLijst.alIngepakt", { n: ingepakt.length })}</b> <span className="text-ink-soft">{ingepakt.map((i) => optieLabel(t, i.naam)).join(", ")}</span></span>
            <ChevronDown className={`size-5 shrink-0 text-ink-soft transition-transform ${ingepaktOpen ? "rotate-180" : ""}`} aria-hidden/>
          </button>
          {ingepaktOpen ? <ul className="border-t border-[#E9E1D5] px-4 py-1">{ingepakt.map((item) => (<li key={item.id} className="flex items-center gap-3 py-2">
              <button onClick={() => zetIngepakt(item.id, false)} aria-label={t("components.SlimmeMeeLijst.tochNiet", { item: optieLabel(t, item.naam) })} className="grid size-7 shrink-0 place-items-center rounded-[8px] bg-[#4F6B58] text-white"><Check className="size-4"/></button>
              <span className="text-[15px] text-ink-soft line-through">{optieLabel(t, item.naam)}</span>
            </li>))}</ul> : null}
        </div>) : null}

      {toevoegen ? (<div className="mt-4">
          {opties.length ? <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label={t("components.SlimmeMeeLijst.kiesUitLijst")}>{opties.map((o) => <button key={o} type="button" onClick={() => voegToe([o])} className="rounded-full bg-[#DCE3D3] px-3 py-1.5 text-sm font-extrabold text-[#3F5747]">{optieLabel(t, o)}</button>)}</div> : null}
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (nieuw.trim()) {
            voegToe([nieuw.trim()]);
            setNieuw("");
            setToevoegen(false);
        } }}>
            <input autoFocus value={nieuw} onChange={(e) => setNieuw(e.target.value)} placeholder={t("components.SlimmeMeeLijst.watMee")} aria-label={t("components.SlimmeMeeLijst.watMee")} className="h-12 min-w-0 flex-1 rounded-2xl border border-white/85 bg-white px-4 text-[15px] outline-none"/>
            <button disabled={!nieuw.trim()} className="h-12 rounded-full bg-brand px-5 text-sm font-black text-primary-foreground disabled:opacity-45">{t("components.SlimmeMeeLijst.opDeLijst")}</button>
          </form>
        </div>) : (<button onClick={() => setToevoegen(true)} className="mt-5 flex h-[54px] w-full items-center justify-center gap-2 rounded-full bg-brand text-base font-black text-primary-foreground"><Plus className="size-5" aria-hidden/>{t("components.SlimmeMeeLijst.ietsToevoegen")}</button>)}
      <div className="mt-3 flex items-center justify-between px-1 text-[15px] font-black text-brand">
        <Link to="/agenda" search={{ zorgActie: "wijziging", dag: m.datum }}>{t("components.SlimmeMeeLijst.verschuiven")}</Link>
        {magNalopen ? <button onClick={() => setControle(true)}>{t("components.SlimmeMeeLijst.allesMeegekomen")}</button> : null}
      </div>
      {/school|opvang|nursery|childcare/i.test(m.plek ?? "") ? <p className="mt-3 rounded-2xl bg-[#E9EFE3] px-3.5 py-2.5 text-[13.5px] text-[#2F4A3A]"><Trans i18nKey="components.SlimmeMeeLijst.viaSchool" components={{ b: <b/> }}/></p> : null}
      <p className="mt-2 px-1 text-[12px] text-ink-soft">{t("components.SlimmeMeeLijst.standaard")}</p>
    </section>);
}
/** Na de wissel: de ouder bij wie de kinderen nu zijn, loopt de lijst na. Niet meegekomen = op de lijst van de volgende wissel. */
function AllesMeegekomen({ moment, daarna, items, onKlaar }) {
    const { t } = useTranslation();
    const [niet, setNiet] = useState(() => items.filter((i) => i.ontvangen === false).map((i) => i.id));
    const wissel = (id) => setNiet((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
    const namen = items.filter((i) => niet.includes(i.id)).map((i) => optieLabel(t, i.naam));
    const [bezig, setBezig] = useState(false);
    const bevestigen = async () => {
        // Alleen echte (opgeslagen) items; een item dat nog onderweg is, telt mee bij een volgende keer.
        const echt = items.filter((i) => !String(i.id).startsWith("tmp-"));
        setBezig(true);
        const r = await bevestigOntvangen(moment.id, Object.fromEntries(echt.map((i) => [i.id, !niet.includes(i.id)])), daarna?.id);
        setBezig(false);
        if (!r)
            return;
        bevestig(niet.length ? t("components.SlimmeMeeLijst.weerOpLijst", { count: niet.length, items: namen.join(", ") }) : t("components.SlimmeMeeLijst.fijnAlles"));
        onKlaar();
    };
    return (<section className="mt-4" aria-label={t("components.SlimmeMeeLijst.allesMeegekomen")}>
      <h2 className="font-display text-[24px] font-black">{t("components.SlimmeMeeLijst.allesMeegekomen")}</h2>
      <p className="text-sm text-ink-soft">{t("components.SlimmeMeeLijst.tik")}</p>
      <ul className="mt-3 rounded-[22px] border border-white/85 bg-white/70 px-4 py-1">
        {items.map((item) => {
            const mis = niet.includes(item.id);
            return (<li key={item.id} className="flex items-center gap-3 border-b border-[#E9E1D5] py-2.5 last:border-0">
            <span className="min-w-0 flex-1 text-[16px] font-black">{optieLabel(t, item.naam)}</span>
            <button onClick={() => wissel(item.id)} aria-pressed={!mis} className={`inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-black ${mis ? "bg-[#EBD9CC] text-[#5A4636]" : "bg-[#DCE6D2] text-[#2F4A3A]"}`}>
              {mis ? <Minus className="size-4" aria-hidden/> : <Check className="size-4" aria-hidden/>}{mis ? t("components.SlimmeMeeLijst.nietMeegekomen") : t("components.SlimmeMeeLijst.ontvangen")}
            </button>
          </li>);
        })}
      </ul>
      {niet.length ? <p className="mt-3 rounded-2xl bg-[rgba(220,230,210,.85)] px-4 py-3 text-[15px] text-[#2F4A3A]">{t("components.SlimmeMeeLijst.komtWeer", { count: niet.length, items: namen.join(", ") })}</p> : null}
      <button onClick={bevestigen} disabled={bezig} className="mt-5 h-[54px] w-full rounded-full bg-brand text-base font-black text-primary-foreground disabled:opacity-50">{t("components.SlimmeMeeLijst.bevestigen")}</button>
      <button onClick={onKlaar} className="mt-2 min-h-11 w-full text-sm font-bold text-ink-soft">{t("components.SlimmeMeeLijst.terugLijst")}</button>
    </section>);
}
