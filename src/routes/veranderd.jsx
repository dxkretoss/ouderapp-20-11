import i18n from "@/i18n";
import { useTranslation } from "react-i18next";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Check, Plus } from "lucide-react";
import { AppIcon } from "@/components/AppIcon";
import { Chevron, MetChevron, MetVinkje } from "@/components/Tekens";
import { AppShell, PageHeader } from "@/components/AppShell";
import { contactKandidaten, kandidatenVoor, persoonLabel, regelStatus, useKring, wijzigMoment, zetWie } from "@/lib/kring-store";
import { dienVoorstelIn } from "@/lib/zorg-store";
import { meeLijst, useTaken } from "@/lib/taken-store";
import { HulpForm } from "@/components/HulpVragen";
import { uur } from "@/lib/tijd-tekst";
const situaties = ["ziek", "later", "halen", "anderhaalt", "afspraak", "taak", "anders"];
export const Route = createFileRoute("/veranderd")({
    validateSearch: z.object({ situatie: z.enum(situaties).optional(), moment: z.string().optional(), kind: z.enum(["emma", "noah"]).optional() }),
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
const kindNaam = { emma: "Emma", noah: "Noah" };
const kop = "text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft";
const knop = "rounded-md border border-border px-3 py-2 text-left text-sm";
const primair = "rounded-md bg-brand px-4 py-2 text-sm font-semibold text-primary-foreground";
const momentLabel = (m) => `${m.dag} · ${uur(m.tijd)} · ${m.titel}`;
function Veranderd() {
    const { t } = useTranslation();
    const router = useRouter();
    const s = Route.useSearch();
    const kring = useKring();
    const ga = (p) => router.navigate({ to: "/veranderd", search: { ...s, ...p }, replace: true });
    const moment = kring.momenten.find((m) => m.id === s.moment);
    const kind = s.kind ?? moment?.kindIds[0];
    return (<AppShell>
      <PageHeader titel={t("routes.veranderd.titel")} subtitel={s.situatie ? situatieTitel(s.situatie) : t("routes.veranderd.waarover")} terug="/"/>
      {moment ? (<p className="mt-4 border-l-2 border-brand pl-3 text-sm">
          <b>{momentLabel(moment)}</b>
          <span className="block text-xs text-ink-soft">{moment.kindIds.map((k) => kindNaam[k]).join(" & ")} · {moment.plek}</span>
        </p>) : null}

      {!s.situatie ? (<ul className="mt-6 divide-y divide-border border-y border-border">
          {opties.map((o) => (<li key={o.id}>
              <button onClick={() => ga({ situatie: o.id })} className="flex w-full items-center gap-3 py-3.5 text-left">
                <AppIcon functie={o.icoon}/>
                <span className="flex-1 text-sm font-semibold">{situatieTitel(o.id)}</span>
                <Chevron className="size-4 text-ink-soft"/>
              </button>
            </li>))}
        </ul>) : s.situatie === "later" ? (<Later moment={moment}/>) : s.situatie === "ziek" ? (<Ziek kind={kind} onKind={(k) => ga({ kind: k })} onAfspraak={(id) => ga({ situatie: "afspraak", moment: id })} onHalen={(id) => ga({ situatie: "anderhaalt", moment: id })}/>) : s.situatie === "halen" || s.situatie === "anderhaalt" ? (<Halen moment={moment} kind={kind} kiesMoment={(id) => ga({ moment: id })} direct={s.situatie === "anderhaalt"} onTijd={() => ga({ situatie: "afspraak" })}/>) : s.situatie === "afspraak" ? (<AfspraakWijzigen moment={moment} kind={kind} kiesMoment={(id) => ga({ moment: id })}/>) : s.situatie === "taak" ? (<div className="mt-6 space-y-3">
          <p className="text-sm text-ink-soft">{t("routes.veranderd.taak.uitleg")}</p>
          <Link to="/taken" className={`inline-block ${primair}`}>{t("routes.veranderd.taak.naar")}</Link>
        </div>) : (<div className="mt-6 space-y-3">
          <p className="text-sm text-ink-soft">{t("routes.veranderd.anders.uitleg")}</p>
          <div className="grid gap-2">
            <Link to="/berichten" className={`${knop} flex min-h-11 items-center justify-between gap-2`}>{t("routes.veranderd.anders.bericht")}<Chevron className="size-4 text-ink-soft"/></Link>
            <Link to="/samen-regelen" className={`${knop} flex min-h-11 items-center justify-between gap-2`}>{t("routes.veranderd.anders.samen")}<Chevron className="size-4 text-ink-soft"/></Link>
          </div>
        </div>)}
      {s.situatie ? <button onClick={() => router.navigate({ to: "/veranderd", search: {}, replace: true })} className="mt-8 inline-flex min-h-10 items-center text-xs font-semibold text-ink-soft"><MetChevron richting="links">{t("routes.veranderd.andereSituatie")}</MetChevron></button> : null}
    </AppShell>);
}
function KindKeuze({ kind, onKind }) {
    return (<div className="mt-2 flex gap-2">
      {["emma", "noah"].map((k) => (<button key={k} onClick={() => onKind(k)} aria-pressed={kind === k} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${kind === k ? "bg-brand text-primary-foreground" : "border border-border text-ink-soft"}`}>{kindNaam[k]}</button>))}
    </div>);
}
const gevolgOpties = ["school", "halen", "wissel", "activiteit", "geen"];
function Ziek({ kind, onKind, onAfspraak, onHalen }) {
    const { t } = useTranslation();
    const kring = useKring();
    const [gevolgen, setGevolgen] = useState([]);
    const toggle = (id) => setGevolgen((g) => (id === "geen" ? (g.includes("geen") ? [] : ["geen"]) : g.includes(id) ? g.filter((x) => x !== id) : [...g.filter((x) => x !== "geen"), id]));
    const voorKind = kind ? kring.momenten.filter((m) => m.kindIds.includes(kind)) : [];
    const wissel = voorKind.find((m) => m.soort === "wissel");
    const afspraak = voorKind.find((m) => m.soort === "afspraak");
    return (<div className="mt-6 space-y-6">
      <div><p className={kop}>{t("routes.veranderd.ziek.wie")}</p><KindKeuze kind={kind} onKind={onKind}/></div>
      {kind ? (<div>
          <p className={kop}>{t("routes.veranderd.ziek.gevolgen")}</p>
          <div className="mt-2 grid gap-2">
            {gevolgOpties.map((g) => (<label key={g} className="flex items-center gap-3 text-sm">
                <input type="checkbox" checked={gevolgen.includes(g)} onChange={() => toggle(g)} className="size-4 accent-[var(--brand)]"/>{t(`routes.veranderd.ziek.gevolg.${g}`)}
              </label>))}
          </div>
        </div>) : null}
      {kind && gevolgen.length ? (<div className="space-y-4 border-t border-border pt-4">
          {gevolgen.includes("school") ? <p className="text-sm">{t("routes.veranderd.ziek.school")}</p> : null}
          {gevolgen.includes("wissel") && wissel ? (<div>
              <p className="text-sm">{t("routes.veranderd.ziek.wisselGepland", { dag: wissel.dag, tijd: uur(wissel.tijd) })}</p>
              <p className="text-xs text-ink-soft">{t("routes.veranderd.ziek.wisselUitleg")}</p>
              <Link to="/zorgregeling" search={{ actie: "wijziging", bron: "ziek" }} className="mt-2 inline-flex min-h-10 items-center text-sm font-semibold text-brand"><MetChevron>{t("routes.veranderd.ziek.wijzigingVoorstellen")}</MetChevron></Link>
            </div>) : null}
          {gevolgen.includes("halen") && wissel ? (<div>
              <p className="text-sm">{momentLabel(wissel)}</p>
              <button onClick={() => onHalen(wissel.id)} className="mt-1 inline-flex min-h-10 items-center text-left text-sm font-semibold text-brand"><MetChevron>{t("routes.veranderd.ziek.iemandAnders")}</MetChevron></button>
            </div>) : null}
          {gevolgen.includes("activiteit") && afspraak ? (<div>
              <p className="text-sm">{t("routes.veranderd.ziek.afspraakGepland", { titel: afspraak.titel, dag: afspraak.dag.toLowerCase(), tijd: uur(afspraak.tijd) })}</p>
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
    const kring = useKring();
    const lijst = kring.momenten.filter((m) => (!kind || m.kindIds.includes(kind)) && (!filter || filter(m)));
    if (moment)
        return null;
    return (<div className="mt-6">
      <p className={kop}>{t("routes.veranderd.welkMoment")}</p>
      <div className="mt-2 grid gap-2">
        {lijst.map((m) => <button key={m.id} onClick={() => kiesMoment(m.id)} className={knop}>{momentLabel(m)}</button>)}
      </div>
    </div>);
}
function Halen({ moment, kind, kiesMoment, direct, onTijd }) {
    const { t } = useTranslation();
    useKring();
    useTaken();
    const [kringOpen, setKringOpen] = useState(direct);
    const [hulpOpen, setHulpOpen] = useState(false);
    useEffect(() => setKringOpen(direct), [direct]);
    if (!moment)
        return <MomentKeuze kind={kind} moment={moment} kiesMoment={kiesMoment}/>;
    const status = regelStatus(moment.id);
    const kandidaten = kandidatenVoor(moment);
    return (<div className="mt-6 space-y-5">
      {status && status.wie !== "sanne" && status.wie !== "joris" ? (<p className={`text-sm font-semibold ${status.bevestigd ? "text-brand" : "text-ink-soft"}`}>{status.bevestigd ? <MetVinkje achter>{status.tekst}</MetVinkje> : status.tekst}</p>) : null}
      {!kringOpen ? (<div>
          <p className={kop}>{t("routes.veranderd.halen.watDoen")}</p>
          <div className="mt-2 grid gap-2">
            <button onClick={() => setKringOpen(true)} className={knop}>{t("routes.veranderd.halen.kring")}</button>
            <Link to="/zorgregeling" search={{ actie: "wijziging", bron: "veranderd" }} className={knop}>{t("routes.veranderd.halen.andereOplossing")}</Link>
            <button onClick={onTijd} className={knop}>{t("routes.veranderd.halen.tijd")}</button>
            <button onClick={onTijd} className={knop}>{t("routes.veranderd.halen.locatie")}</button>
            <button onClick={() => setHulpOpen(true)} className={knop}>{t("routes.veranderd.halen.netwerk")}</button>
          </div>
          {hulpOpen ? <HulpForm voorstel={{ kind: moment.kindIds.length > 1 ? "beide" : moment.kindIds[0] ?? "emma", wat: moment.titel, tijd: moment.tijd }} onKlaar={() => setHulpOpen(false)}/> : null}
        </div>) : (<div>
          <p className={kop}>{t("routes.veranderd.halen.wieOvernemen")}</p>
          <div className="mt-2 grid gap-2">
            {kandidaten.map((p) => (<button key={p.id} onClick={() => zetWie(moment.id, p.id)} aria-pressed={status?.wie === p.id} className={`${knop} flex items-center justify-between ${status?.wie === p.id ? "border-brand" : ""}`}>
                <span>{t("routes.veranderd.halen.vragen", { naam: persoonLabel(p) })}</span>{status?.wie === p.id ? <Check className="size-4 text-brand"/> : null}
              </button>))}
            {contactKandidaten(moment).map((p) => (<button key={p.id} onClick={() => zetWie(moment.id, p.id)} aria-pressed={status?.wie === p.id} className={`${knop} flex items-center justify-between ${status?.wie === p.id ? "border-brand" : ""}`}>
                <span>{persoonLabel(p)} <span className="text-[11px] font-normal text-ink-soft">{t("routes.veranderd.halen.zonderApp")}</span></span>{status?.wie === p.id ? <Check className="size-4 text-brand"/> : null}
              </button>))}
            {status && status.wie !== "sanne" && status.wie !== "joris" ? <p className="text-[11px] text-ink-soft">{status.bevestigd ? <MetVinkje achter>{status.tekst}</MetVinkje> : status.tekst}</p> : null}
            {kandidaten.length === 0 ? <p className="text-sm text-ink-soft">{t("routes.veranderd.halen.niemand")}</p> : null}
            <Link to="/kring/$kindId" params={{ kindId: moment.kindIds[0] }} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-brand"><Plus aria-hidden="true" className="size-4 shrink-0"/>{t("routes.veranderd.halen.verzorgerToevoegen").replace(/^\+\s*/, "")}</Link>
          </div>
          <p className="mt-3 text-[11px] text-ink-soft">{t("routes.veranderd.halen.vragenUitleg")}</p>
          {status && status.wie !== "sanne" && status.wie !== "joris" && kandidaten.some((p) => p.id === status.wie) ? (<div className="mt-4 border-t border-border pt-3">
              <p className={kop}>{t("routes.veranderd.halen.teZien", { naam: kandidaten.find((p) => p.id === status.wie) ? persoonLabel(kandidaten.find((p) => p.id === status.wie)) : "" })}</p>
              <p className="mt-1 text-sm font-semibold">{moment.dag} · {moment.titel}</p>
              <p className="text-xs text-ink-soft">{uur(moment.tijd)} · {moment.plek}</p>
              <p className="mt-1 text-xs">{t("routes.veranderd.halen.mee", { lijst: meeLijst(moment).join(", ") })}</p>
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
                soort: "eenmalig", aanleiding: "moment", kinderen: moment.kindIds, dagen: [],
                tekst: `${moment.titel} ${moment.dag.toLowerCase()}: ${tijd !== moment.tijd ? `${uur(moment.tijd)} → ${uur(tijd)}` : ""}${plek !== moment.plek ? ` ${moment.plek} → ${plek}` : ""}`.trim(),
                datumLabel: `${moment.dag} ${moment.tijd}`,
                moment: { id: moment.id, ...(tijd !== moment.tijd ? { tijd } : {}), ...(plek !== moment.plek ? { plek } : {}) },
            });
            setKlaar(t("routes.veranderd.afspraak.voorstelVerstuurd"));
        }
        else {
            wijzigMoment(moment.id, { tijd, plek });
            setKlaar(t("routes.veranderd.afspraak.aangepast"));
        }
    };
    return (<div className="mt-6 space-y-3">
      {isWissel ? <p className="text-xs text-ink-soft">{t("routes.veranderd.afspraak.wisselUitleg")}</p> : null}
      <label className="block text-xs text-ink-soft">{t("routes.veranderd.afspraak.tijd")}<input type="time" value={tijd} onChange={(e) => setTijd(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-ink"/></label>
      <label className="block text-xs text-ink-soft">{t("routes.veranderd.afspraak.locatie")}<input value={plek} onChange={(e) => setPlek(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-ink"/></label>
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
        return <p className="mt-6 flex items-center gap-2 text-sm font-semibold"><Check className="size-4 text-brand"/> {t("routes.veranderd.later.klaar")}</p>;
    return (<div className="mt-6 space-y-4">
      <p className={kop}>{t("routes.veranderd.later.hoeveel")}</p>
      <div className="flex flex-wrap gap-2">
        {[10, 20, 30].map((m) => (<button key={m} onClick={() => { setMin(m); setAnder(false); }} aria-pressed={min === m} className={`rounded-full px-4 py-2 text-sm font-semibold ${min === m ? "bg-brand text-primary-foreground" : "border border-border"}`}>{t("routes.veranderd.later.plusMin", { m })}</button>))}
        <button onClick={() => { setAnder(true); setMin(null); }} aria-pressed={ander} className={`rounded-full px-4 py-2 text-sm font-semibold ${ander ? "bg-brand text-primary-foreground" : "border border-border"}`}>{t("routes.veranderd.later.andereTijd")}</button>
      </div>
      {ander ? <input type="time" value={tijd} onChange={(e) => setTijd(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2 text-sm" aria-label={t("routes.veranderd.later.verwachteTijd")}/> : null}
      {tekst ? (<div className="space-y-3">
          <p className={kop}>{t("routes.veranderd.later.berichtAan")}</p>
          <p className="border-l-2 border-brand pl-3 text-sm">{tekst}</p>
          <button onClick={() => setKlaar(true)} className={primair}>{t("routes.veranderd.later.versturen")}</button>
        </div>) : null}
    </div>);
}
