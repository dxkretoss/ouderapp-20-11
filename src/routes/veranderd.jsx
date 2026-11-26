import i18n from "@/i18n";
import { useTranslation } from "react-i18next";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Check, Plus } from "lucide-react";
import { AppIcon } from "@/components/AppIcon";
import { Chevron, MetChevron, MetVinkje } from "@/components/Tekens";
import { AppShell, PageHeader } from "@/components/AppShell";
import { contactKandidaten, groepeerPerPaar, kandidatenVoor, persoonLabel, regelStatus, trekToewijzingIn, useKring, useOphalen, zetWie } from "@/lib/kring-store";
import { dienVoorstelIn } from "@/lib/zorg-store";
import { useMemo } from "react";
import { useStart } from "@/lib/start-store";
import { useAgenda, wijzigAfspraak } from "@/lib/agenda-store";
import { itemsVoor, useOverdracht, useWisselMomenten } from "@/lib/overdracht-store";
import { startNuAfstemmen } from "@/lib/nu-afstemmen-store";
import { iso, plusDagen, voorkomens, dt } from "@/lib/agenda-datum";
import { taalLocale } from "@/i18n";
import { HulpForm } from "@/components/HulpVragen";
import { uur } from "@/lib/tijd-tekst";
import { chip as chipStijl, VELD } from "@/lib/ui-stijl";
const situaties = ["ziek", "later", "halen", "anderhaalt", "afspraak", "taak", "anders"];
export const Route = createFileRoute("/veranderd")({
    validateSearch: z.object({ situatie: z.enum(situaties).optional(), moment: z.string().optional(), kind: z.string().optional() }),
    head: () => ({
        meta: [
            { title: i18n.t("common.metaTitel", { titel: i18n.t("routes.veranderd.meta.titel") }) },
            { name: "description", content: i18n.t("routes.veranderd.meta.beschrijving") },
            { property: "og:title", content: i18n.t("common.metaTitel", { titel: i18n.t("routes.veranderd.meta.titel") }) },
            { property: "og:description", content: i18n.t("routes.veranderd.meta.ogBeschrijving") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: Veranderd,
});
const opties = [
    { id: "ziek", icoon: "ziek" },
    { id: "later", icoon: "later" },
    { id: "halen", icoon: "ophalen" },
    { id: "afspraak", icoon: "planwijziging" },
    { id: "anders", icoon: "iets" },
];
/** Titel per situatie (ook de extra situaties anderhaalt/taak). */
const situatieTitel = (id) => (situaties.includes(id) ? i18n.t(`routes.veranderd.situatie.${id}`) : "");
/**
 * Momenten van de komende twee weken uit dezelfde bronnen als Agenda en Overdracht: wisselmomenten (afgeleid
 * uit de zorgverdeling) en gedeelde afspraken. Wisselmomenten veranderen alleen via een voorstel.
 */
function useMomenten() {
    const { t } = useTranslation();
    const wissels = useWisselMomenten(14);
    const agenda = useAgenda();
    const vandaag = iso(new Date());
    return useMemo(() => [
        ...wissels.filter((m) => m.datum >= vandaag).map((m) => ({ ...m, titel: t("routes.veranderd.wisselmoment") })),
        ...agenda.events.filter((a) => a.gedeeld !== false).flatMap((a) => voorkomens(a, vandaag, plusDagen(vandaag, 14)).map((d) => ({ id: `${a.id}|${d}`, afspraak: a, soort: "afspraak", datum: d, tijd: a.tijd ?? "", plek: a.locatie ?? "", titel: a.titel, kindIds: a.kindIds, get dag() { return dt(d).toLocaleDateString(taalLocale(), { weekday: "long", day: "numeric", month: "long" }); } }))),
    ].sort((a, b) => (a.datum + a.tijd).localeCompare(b.datum + b.tijd)), [wissels, agenda.events, vandaag, t]);
}
const useKindNaam = () => { const st = useStart(); return (id) => st.kinderen.find((k) => k.id === id)?.naam ?? ""; };
const kop = "px-1 text-[13px] font-semibold text-ink-soft";
const kaart = "rounded-[22px] border border-white/85 bg-white/60 shadow-[0_1px_2px_rgba(0,0,0,0.03)]";
const veld = `mt-1.5 w-full ${VELD}`;
const chip = chipStijl;
const knop = `flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold ${kaart}`;
const primair = "inline-flex min-h-12 w-full items-center justify-center rounded-full bg-brand px-5 text-sm font-semibold text-primary-foreground shadow-sm";
const momentLabel = (m) => `${m.dag}${m.tijd ? ` · ${uur(m.tijd)}` : ""} · ${m.titel}`;
function Veranderd() {
    const { t } = useTranslation();
    const router = useRouter();
    const s = Route.useSearch();
    const momenten = useMomenten();
    const kindNaam = useKindNaam();
    const ga = (p) => router.navigate({ to: "/veranderd", search: { ...s, ...p }, replace: true });
    const moment = momenten.find((m) => m.id === s.moment);
    const kind = s.kind ?? moment?.kindIds[0];
    return (<AppShell>
      <PageHeader titel={t("routes.veranderd.titel")} subtitel={s.situatie ? situatieTitel(s.situatie) : t("routes.veranderd.waarover")} terug="/"/>
      {moment ? (<div className={`mt-4 flex items-center gap-3 px-4 py-3 ${kaart}`}><span className="h-10 w-1 shrink-0 rounded-full bg-brand" aria-hidden/><p className="min-w-0 text-sm">
          <b className="first-letter:uppercase block">{momentLabel(moment)}</b>
          <span className="block text-xs text-ink-soft">{moment.kindIds.map((k) => kindNaam(k)).join(" & ")}{moment.plek ? ` · ${moment.plek}` : ""}</span>
        </p></div>) : null}

      {!s.situatie ? (<ul className="mt-6 space-y-2.5">
          {opties.map((o) => (<li key={o.id}>
              <button onClick={() => ga({ situatie: o.id })} className={`flex min-h-16 w-full items-center gap-3.5 px-4 py-3 text-left transition active:scale-[0.99] ${kaart}`}>
                <AppIcon functie={o.icoon}/>
                <span className="flex-1 text-[15px] font-semibold">{situatieTitel(o.id)}</span>
                <Chevron className="size-4 text-ink-soft"/>
              </button>
            </li>))}
        </ul>) : s.situatie === "later" ? (<Later moment={moment}/>) : s.situatie === "ziek" ? (<Ziek kind={kind} onKind={(k) => ga({ kind: k })} onAfspraak={(id) => ga({ situatie: "afspraak", moment: id })} onHalen={(id) => ga({ situatie: "anderhaalt", moment: id })}/>) : s.situatie === "halen" || s.situatie === "anderhaalt" ? (<Halen moment={moment} kind={kind} kiesMoment={(id) => ga({ moment: id })} direct={s.situatie === "anderhaalt"} onTijd={() => ga({ situatie: "afspraak" })}/>) : s.situatie === "afspraak" ? (<AfspraakWijzigen moment={moment} kind={kind} kiesMoment={(id) => ga({ moment: id })}/>) : s.situatie === "taak" ? (<div className="mt-6 space-y-3">
          <p className={`px-4 py-3 text-sm text-ink-soft ${kaart}`}>{t("routes.veranderd.taak.uitleg")}</p>
          <Link to="/taken" className={primair}>{t("routes.veranderd.taak.naar")}</Link>
        </div>) : (<div className="mt-6 space-y-3">
          <p className="px-1 text-sm text-ink-soft">{t("routes.veranderd.anders.uitleg")}</p>
          <div className="grid gap-2">
            <Link to="/berichten" className={knop}>{t("routes.veranderd.anders.bericht")}<Chevron className="size-4 text-ink-soft"/></Link>
            <Link to="/samen-regelen" className={knop}>{t("routes.veranderd.anders.samen")}<Chevron className="size-4 text-ink-soft"/></Link>
          </div>
        </div>)}
      {s.situatie ? <button onClick={() => router.navigate({ to: "/veranderd", search: {}, replace: true })} className="mt-8 inline-flex min-h-10 items-center text-xs font-semibold text-ink-soft"><MetChevron richting="links">{t("routes.veranderd.andereSituatie")}</MetChevron></button> : null}
    </AppShell>);
}
function KindKeuze({ kind, onKind }) {
    const st = useStart();
    return (<div className="mt-2 flex flex-wrap gap-2">
      {st.kinderen.map((k) => (<button key={k.id} onClick={() => onKind(k.id)} aria-pressed={kind === k.id} className={chip(kind === k.id)}>{k.naam}</button>))}
    </div>);
}
const gevolgOpties = ["school", "halen", "wissel", "activiteit", "geen"];
function Ziek({ kind, onKind, onAfspraak, onHalen }) {
    const { t } = useTranslation();
    const momenten = useMomenten();
    const [gevolgen, setGevolgen] = useState([]);
    const toggle = (id) => setGevolgen((g) => (id === "geen" ? (g.includes("geen") ? [] : ["geen"]) : g.includes(id) ? g.filter((x) => x !== id) : [...g.filter((x) => x !== "geen"), id]));
    const voorKind = kind ? momenten.filter((m) => m.kindIds.includes(kind)) : [];
    const wissel = voorKind.find((m) => m.soort === "wissel");
    const afspraak = voorKind.find((m) => m.soort === "afspraak");
    return (<div className="mt-6 space-y-6">
      <div><p className={kop}>{t("routes.veranderd.ziek.wie")}</p><KindKeuze kind={kind} onKind={onKind}/></div>
      {kind ? (<div>
          <p className={kop}>{t("routes.veranderd.ziek.gevolgen")}</p>
          <div className={`mt-2 divide-y divide-border px-4 ${kaart}`}>
            {gevolgOpties.map((g) => (<label key={g} className="flex min-h-12 cursor-pointer items-center gap-3 py-2.5 text-sm">
                <input type="checkbox" checked={gevolgen.includes(g)} onChange={() => toggle(g)} className="size-5 shrink-0 accent-[var(--brand)]"/>{t(`routes.veranderd.ziek.gevolg.${g}`)}
              </label>))}
          </div>
        </div>) : null}
      {kind && gevolgen.length ? (<div className={`space-y-4 p-4 ${kaart}`}>
          {gevolgen.includes("school") ? <p className="text-sm">{t("routes.veranderd.ziek.school")}</p> : null}
          {gevolgen.includes("wissel") && wissel ? (<div>
              <p className="text-sm">{t("routes.veranderd.ziek.wisselGepland", { dag: wissel.dag, tijd: wissel.tijd ? uur(wissel.tijd) : "" })}</p>
              <p className="text-xs text-ink-soft">{t("routes.veranderd.ziek.wisselUitleg")}</p>
              <Link to="/agenda" search={{ zorgActie: "wijziging", dag: wissel.datum, kind }} className="mt-2 inline-flex min-h-10 items-center text-sm font-semibold text-brand"><MetChevron>{t("routes.veranderd.ziek.wijzigingVoorstellen")}</MetChevron></Link>
            </div>) : null}
          {gevolgen.includes("halen") && wissel ? (<div>
              <p className="text-sm">{momentLabel(wissel)}</p>
              <button onClick={() => onHalen(wissel.id)} className="mt-1 inline-flex min-h-10 items-center text-left text-sm font-semibold text-brand"><MetChevron>{t("routes.veranderd.ziek.iemandAnders")}</MetChevron></button>
            </div>) : null}
          {gevolgen.includes("activiteit") && afspraak ? (<div>
              <p className="text-sm">{t("routes.veranderd.ziek.afspraakGepland", { titel: afspraak.titel, dag: afspraak.dag.toLowerCase(), tijd: afspraak.tijd ? uur(afspraak.tijd) : "" })}</p>
              <button onClick={() => onAfspraak(afspraak.id)} className="mt-1 inline-flex min-h-10 items-center text-sm font-semibold text-brand"><MetChevron>{t("routes.veranderd.ziek.afspraakAanpassen")}</MetChevron></button>
            </div>) : null}
          {gevolgen.includes("geen") ? <p className="text-sm">{t("routes.veranderd.ziek.blijftGepland")}</p> : null}
          <Link to="/berichten" className="inline-flex min-h-10 items-center text-sm font-semibold text-brand"><MetChevron>{t("routes.veranderd.ziek.laten")}</MetChevron></Link>
          <p className="text-[11px] text-ink-soft">{t("routes.veranderd.ziek.geenAdvies")}</p>
        </div>) : null}
    </div>);
}
function MomentKeuze({ kind, moment, kiesMoment, filter }) {
    const { t } = useTranslation();
    const momenten = useMomenten();
    const lijst = momenten.filter((m) => (!kind || m.kindIds.includes(kind)) && (!filter || filter(m)));
    if (moment)
        return null;
    return (<div className="mt-6">
      <p className={kop}>{t("routes.veranderd.welkMoment")}</p>
      <div className="mt-2 grid gap-2">
        {lijst.map((m) => <button key={m.id} onClick={() => kiesMoment(m.id)} className={knop}><span className="min-w-0 first-letter:uppercase">{momentLabel(m)}</span><Chevron className="size-4 shrink-0 text-ink-soft"/></button>)}
        {!lijst.length ? <p className="text-sm text-ink-soft">{t("routes.veranderd.geenMomenten")}</p> : null}
      </div>
    </div>);
}
function Halen({ moment, kind, kiesMoment, direct, onTijd }) {
    const { t } = useTranslation();
    useKring();
    useOphalen();
    const od = useOverdracht();
    const [kringOpen, setKringOpen] = useState(direct);
    const [hulpOpen, setHulpOpen] = useState(false);
    useEffect(() => setKringOpen(direct), [direct]);
    if (!moment)
        return <MomentKeuze kind={kind} moment={moment} kiesMoment={kiesMoment}/>;
    // Eén gedeeld item gaat naar één andere ouder: bij kinderen van verschillende ouders alleen de groep van het gekozen kind.
    const groep = groepeerPerPaar(moment.kindIds).find((g) => !kind || g.kids.includes(kind)) ?? { kids: moment.kindIds };
    const basis = kind && moment.kindIds.includes(kind) ? kind : groep.kids[0];
    const status = regelStatus(moment.id, basis);
    const kringStatus = status && status.wieSoort !== "parent" ? status : null;
    const kandidaten = kandidatenVoor(moment, groep.kids);
    const kies = (id) => zetWie(moment, id, basis);
    return (<div className="mt-6 space-y-5">
      {kringStatus ? (<p className={`text-sm font-semibold ${kringStatus.bevestigd ? "text-brand" : kringStatus.status === "declined" ? "text-[#A4533E]" : "text-ink-soft"}`}>{kringStatus.bevestigd ? <MetVinkje achter>{kringStatus.tekst}</MetVinkje> : kringStatus.tekst}</p>) : null}
      {!kringOpen ? (<div>
          <p className={kop}>{t("routes.veranderd.halen.watDoen")}</p>
          <div className="mt-2 grid gap-2">
            <button onClick={() => setKringOpen(true)} className={knop}><span className="min-w-0">{t("routes.veranderd.halen.kring")}</span><Chevron className="size-4 shrink-0 text-ink-soft"/></button>
            <Link to="/agenda" search={{ zorgActie: "wijziging", dag: moment.datum }} className={knop}><span className="min-w-0">{t("routes.veranderd.halen.andereOplossing")}</span><Chevron className="size-4 shrink-0 text-ink-soft"/></Link>
            <button onClick={onTijd} className={knop}><span className="min-w-0">{t("routes.veranderd.halen.tijd")}</span><Chevron className="size-4 shrink-0 text-ink-soft"/></button>
            <button onClick={onTijd} className={knop}><span className="min-w-0">{t("routes.veranderd.halen.locatie")}</span><Chevron className="size-4 shrink-0 text-ink-soft"/></button>
            <button onClick={() => setHulpOpen(true)} className={knop}><span className="min-w-0">{t("routes.veranderd.halen.netwerk")}</span><Chevron className="size-4 shrink-0 text-ink-soft"/></button>
          </div>
          {hulpOpen ? <HulpForm voorstel={{ kind: moment.kindIds.length > 1 ? "beide" : moment.kindIds[0] ?? "beide", wat: moment.titel, tijd: moment.tijd }} onKlaar={() => setHulpOpen(false)}/> : null}
        </div>) : (<div>
          <p className={kop}>{t("routes.veranderd.halen.wieOvernemen")}</p>
          <div className="mt-2 grid gap-2">
            {kandidaten.map((p) => (<button key={p.id} onClick={() => kies(p.id)} aria-pressed={kringStatus?.wie === p.id && kringStatus.status !== "declined"} className={`${knop} ${kringStatus?.wie === p.id && kringStatus.status !== "declined" ? "!border-brand !bg-brand-soft" : ""}`}>
                <span>{t("routes.veranderd.halen.vragen", { naam: persoonLabel(p) })}</span>{kringStatus?.wie === p.id && kringStatus.status !== "declined" ? <Check className="size-4 text-brand"/> : null}
              </button>))}
            {contactKandidaten({ ...moment, kindIds: groep.kids }).map((p) => (<button key={p.id} onClick={() => kies(p.id)} aria-pressed={kringStatus?.wie === p.id && kringStatus.status !== "declined"} className={`${knop} ${kringStatus?.wie === p.id && kringStatus.status !== "declined" ? "!border-brand !bg-brand-soft" : ""}`}>
                <span>{persoonLabel(p)} <span className="text-[11px] font-normal text-ink-soft">{t("routes.veranderd.halen.zonderApp")}</span></span>{kringStatus?.wie === p.id && kringStatus.status !== "declined" ? <Check className="size-4 text-brand"/> : null}
              </button>))}
            {kringStatus ? <p className="text-[11px] text-ink-soft">{kringStatus.bevestigd ? <MetVinkje achter>{kringStatus.tekst}</MetVinkje> : kringStatus.tekst}</p> : null}
            {kringStatus && !String(kringStatus.id).startsWith("tmp-") ? <button onClick={() => trekToewijzingIn(kringStatus.id)} className="inline-flex min-h-10 items-center text-left text-sm font-semibold text-ink-soft">{t("routes.kringKindId.lijst.intrekken")}</button> : null}
            {kandidaten.length === 0 ? <p className="text-sm text-ink-soft">{t("routes.veranderd.halen.niemand")}</p> : null}
            <Link to="/kring/$kindId" params={{ kindId: basis }} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-brand"><Plus aria-hidden="true" className="size-4 shrink-0"/>{t("routes.veranderd.halen.verzorgerToevoegen").replace(/^\+\s*/, "")}</Link>
          </div>
          <p className="mt-3 text-[11px] text-ink-soft">{t("routes.veranderd.halen.vragenUitleg")}</p>
          {kringStatus && kringStatus.status !== "declined" && kandidaten.some((p) => p.id === kringStatus.wie) ? (<div className={`mt-4 p-4 ${kaart}`}>
              <p className={kop}>{t("routes.veranderd.halen.teZien", { naam: persoonLabel(kandidaten.find((p) => p.id === kringStatus.wie)) })}</p>
              <p className="mt-1 text-sm font-semibold">{moment.dag} · {moment.titel}</p>
              <p className="text-xs text-ink-soft">{moment.tijd ? uur(moment.tijd) : ""}{moment.plek ? ` · ${moment.plek}` : ""}</p>
              <p className="mt-1 text-xs">{t("routes.veranderd.halen.mee", { lijst: itemsVoor(od, moment.id).map((i) => i.naam).join(", ") || "-" })}</p>
              {moment.daarna ? <p className="text-xs">{t("routes.veranderd.halen.daarna", { tekst: moment.daarna })}</p> : null}
              <p className="mt-1 text-[11px] text-ink-soft">{t("routes.veranderd.halen.geenBerichten")}</p>
            </div>) : null}
        </div>)}
    </div>);
}
function AfspraakWijzigen({ moment, kind, kiesMoment }) {
    const { t } = useTranslation();
    const [tijd, setTijd] = useState(moment?.tijd ?? "");
    const [plek, setPlek] = useState(moment?.plek ?? "");
    const [klaar, setKlaar] = useState(null);
    useEffect(() => { setTijd(moment?.tijd ?? ""); setPlek(moment?.plek ?? ""); setKlaar(null); }, [moment?.id]);
    if (!moment)
        return <MomentKeuze kind={kind} moment={moment} kiesMoment={kiesMoment}/>;
    const isWissel = moment.soort === "wissel";
    const opslaan = () => {
        if (isWissel) {
            dienVoorstelIn({
                soort: "eenmalig", aanleiding: "moment", kinderen: moment.kindIds, datums: [],
                tekst: `${moment.titel} ${moment.dag.toLowerCase()}: ${tijd !== moment.tijd ? `${uur(moment.tijd)} → ${uur(tijd)}` : ""}${plek !== moment.plek ? ` ${moment.plek} → ${plek}` : ""}`.trim(),
                datumLabel: `${moment.dag} ${moment.tijd}`,
                moment: { datum: moment.datum, ...(tijd && tijd !== moment.tijd ? { tijd, oud: moment.tijd || null } : {}) },
            });
            setKlaar(t("routes.veranderd.afspraak.voorstelVerstuurd"));
        }
        else {
            // Gewone afspraak: zelfde regels als in de Agenda (gedeeld + gekoppeld: voorstel aan de andere ouder).
            wijzigAfspraak(moment.afspraak.id, { ...moment.afspraak, tijd, locatie: plek }, moment.afspraak.herhaling ? "alleen" : "reeks", moment.datum);
            setKlaar(t("routes.veranderd.afspraak.aangepast"));
        }
    };
    return (<div className="mt-6 space-y-4">
      {isWissel ? <p className={`px-4 py-3 text-xs leading-relaxed text-ink-soft ${kaart}`}>{t("routes.veranderd.afspraak.wisselUitleg")}</p> : null}
      <label className="block px-1 text-[13px] font-semibold text-ink-soft">{t("routes.veranderd.afspraak.tijd")}<input type="time" value={tijd} onChange={(e) => setTijd(e.target.value)} className={veld}/></label>
      <label className="block px-1 text-[13px] font-semibold text-ink-soft">{t("routes.veranderd.afspraak.locatie")}<input value={plek} onChange={(e) => setPlek(e.target.value)} className={veld}/></label>
      {klaar ? <p className="text-sm font-semibold text-brand">{klaar}</p> : (<button disabled={tijd === moment.tijd && plek === moment.plek} onClick={opslaan} className={`${primair} disabled:opacity-40`}>{isWissel ? t("routes.veranderd.afspraak.voorstelVersturen") : t("common.opslaan")}</button>)}
    </div>);
}
function Later({ moment }) {
    const { t } = useTranslation();
    const [min, setMin] = useState(null);
    const [ander, setAnder] = useState(false);
    const [tijd, setTijd] = useState("");
    const [klaar, setKlaar] = useState(false);
    const wat = moment ? `${moment.titel} (${uur(moment.tijd)})` : t("routes.veranderd.later.onsWisselmoment");
    const tekst = min ? t("routes.veranderd.later.minuten", { min, wat }) : tijd ? t("routes.veranderd.later.tijd", { wat, tijd: uur(tijd) }) : "";
    if (klaar)
        return <p className={`mt-6 flex items-center gap-2 px-4 py-3 text-sm font-semibold ${kaart}`}><Check className="size-4 shrink-0 text-brand"/> {t("routes.veranderd.later.klaar")}</p>;
    return (<div className="mt-6 space-y-4">
      <p className={kop}>{t("routes.veranderd.later.hoeveel")}</p>
      <div className="flex flex-wrap gap-2">
        {[10, 20, 30].map((m) => (<button key={m} onClick={() => { setMin(m); setAnder(false); }} aria-pressed={min === m} className={chip(min === m)}>{t("routes.veranderd.later.plusMin", { m })}</button>))}
        <button onClick={() => { setAnder(true); setMin(null); }} aria-pressed={ander} className={chip(ander)}>{t("routes.veranderd.later.andereTijd")}</button>
      </div>
      {ander ? <input type="time" value={tijd} onChange={(e) => setTijd(e.target.value)} className={`${veld} max-w-40`} aria-label={t("routes.veranderd.later.verwachteTijd")}/> : null}
      {tekst ? (<div className="space-y-3">
          <p className={kop}>{t("routes.veranderd.later.berichtAan")}</p>
          <p className="rounded-2xl rounded-bl-md bg-brand-soft px-4 py-3 text-sm text-ink">{tekst}</p>
          <button onClick={() => { startNuAfstemmen({ categorie: "halen", kindIds: moment?.kindIds ?? [], titel: tekst, toelichting: "", reactieGewenst: "zsm", ...(moment?.tijd ? { oudeTijd: moment.tijd } : {}) }); setKlaar(true); }} className={primair}>{t("routes.veranderd.later.versturen")}</button>
        </div>) : null}
    </div>);
}
