import { GeschiedenisKnop } from "@/components/Geschiedenis";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { AppShell, Card, PageHeader } from "@/components/AppShell";
import { useGezagState } from "@/lib/gezag-store";
import { useStart } from "@/lib/start-store";
import { useGezin } from "@/lib/gezin";
import { laadWeergave } from "@/components/Laden";
import { afsprakenBron } from "@/lib/afspraken-store";
import { neemBesluitVoor, reageerOpBesluit, trekBesluitIn, useBesluiten } from "@/lib/afspraken-store";
import { VoorstelIntrekken } from "@/components/VoorstelIntrekken";
import { bevestig } from "@/lib/feedback";
import { useTranslation } from "react-i18next";
import i18n, { taalLocale } from "@/i18n";
import { MetVinkje } from "@/components/Tekens";
export const Route = createFileRoute("/beslissingen")({
    head: () => ({
        meta: [
            { title: i18n.t("common.metaTitel", { titel: i18n.t("routes.beslissingen.meta.titel") }) },
            { name: "description", content: i18n.t("routes.beslissingen.meta.beschrijving") },
            { property: "og:title", content: i18n.t("common.metaTitel", { titel: i18n.t("routes.beslissingen.meta.titel") }) },
            { property: "og:description", content: i18n.t("routes.beslissingen.meta.ogBeschrijving") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    validateSearch: z.object({ soort: z.string().optional(), kind: z.string().optional() }),
    component: Beslissingen,
});
// Opgeslagen soort-waarden (ook in zoekparameters); labels via routes.beslissingen.soort.<sleutel>.
const soortSleutel = { Schoolkeuze: "school", Medisch: "medisch", Verhuizing: "verhuizing", "Verdeling van de week": "verdeling", Opvoeding: "opvoeding" };
const soorten = Object.keys(soortSleutel);
const N = "routes.beslissingen.";
const soortNaam = (x, t) => (soortSleutel[x] ? t(`routes.beslissingen.soort.${soortSleutel[x]}`) : x);
const wanneerTekst = (iso) => new Date(iso).toLocaleString(taalLocale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
/**
 * Beslissingen (bron: manage-agreements, type "decision"). Bij gezamenlijk gezag is het een voorstel waarop alleen de
 * andere ouder antwoordt (eenmalig, definitief); anders een mening vragen of ter informatie delen. Het logboek groeit alleen.
 */
function status(b, ik, t) {
    if (b.status === "withdrawn")
        return { t: t(N + "ingetrokken"), c: "bg-bg-muted" };
    if (b.decision_mode !== "goedkeuring")
        return { t: b.decision_mode === "informatie" ? t(N + "terInformatie") : t(N + "graagMening"), c: "bg-bg-muted" };
    const r = Object.values(b.responses ?? {});
    if (r.includes("niet"))
        return { t: t("common.nietAkkoord"), c: "bg-accent-warm/40" };
    if (r.filter((x) => x === "akkoord").length >= 2)
        return { t: t(N + "samenAkkoord"), c: "bg-brand text-primary-foreground" };
    return { t: t(N + "inAfwachting"), c: "bg-white" };
}
function Beslissingen() {
    const { t } = useTranslation();
    const { gezag } = useGezagState();
    const st = useStart();
    const g = useGezin();
    const laadStatus = afsprakenBron.useStatus();
    const lijst = [...useBesluiten()].sort((a, b) => b.created_at.localeCompare(a.created_at));
    const [titel, setTitel] = useState("");
    const zoek = Route.useSearch();
    const [soort, setSoort] = useState(soorten.includes(zoek.soort ?? "") ? zoek.soort : soorten[0]);
    const [kind, setKind] = useState(st.kinderen.some((k) => k.id === zoek.kind) ? zoek.kind : st.kinderen[0]?.id ?? "");
    useEffect(() => { if (!kind && st.kinderen[0])
        setKind(st.kinderen[0].id); }, [kind, st.kinderen]);
    const [mening, setMening] = useState("mening");
    const [openLog, setOpenLog] = useState(null);
    const [bezig, setBezig] = useState(false);
    const ik = g.ik?.id;
    // De andere ouder van het gekozen kind (per kind kan dat een andere ouder zijn).
    const anderNaam = (kind && g.anderVoor([kind])?.naam) || t("common.deAndereOuder");
    const naamVan = (id) => (id === ik ? g.ik?.naam || t("common.jij") : g.coOuders.find((c) => c.id === id)?.naam || t("common.deAndereOuder"));
    const kindSamen = !!kind && g.isSamen(kind);
    const samen = gezag[kind] === "gezamenlijk" && kindSamen;
    const voorstellen = async () => {
        if (!titel.trim() || !kind || bezig)
            return;
        setBezig(true);
        const b = await neemBesluitVoor({ titel: titel.trim(), soort, kindId: kind, modus: samen ? "goedkeuring" : mening });
        setBezig(false);
        if (b) {
            setTitel("");
            bevestig(!kindSamen ? t(N + "melding.vastgelegd") : samen ? t(N + "melding.voorgesteld") : t(N + "melding.gedeeld"));
        }
    };
    const logTekst = (h) => (h.type === "voorstel" ? t(N + "log.voorstelGedaan") : h.type === "gedeeld" ? t(N + "log.gedeeld") : h.type === "akkoord" ? t("common.akkoord") : h.type === "niet" ? t("common.nietAkkoord") : h.type === "ingetrokken" ? t(N + "ingetrokken") : h.type);
    const reactie = (b, id) => b.responses?.[id];
    return (<AppShell>
      <PageHeader titel={t(N + "titel")} subtitel={t(N + "subtitel")}/>

      <Card className="mt-5 space-y-3">
        <p className="text-sm font-semibold">{t(N + "nieuw")}</p>
        <input value={titel} maxLength={200} onChange={(e) => setTitel(e.target.value)} placeholder={t(N + "placeholderEigen")} className="w-full min-h-11 rounded-2xl border border-white/70 bg-card p-3 text-sm"/>
        <div className="flex gap-2">
          <select value={soort} onChange={(e) => setSoort(e.target.value)} className="min-w-0 flex-1 min-h-11 rounded-2xl border border-white/70 bg-card p-2.5 text-sm">{soorten.map((x) => <option key={x} value={x}>{soortNaam(x, t)}</option>)}</select>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="min-w-0 flex-1 min-h-11 rounded-2xl border border-white/70 bg-card p-2.5 text-sm">{st.kinderen.map((k) => <option key={k.id} value={k.id}>{k.naam}</option>)}</select>
        </div>
        {samen ? (<p className="text-xs text-ink-soft">{t(N + "pasAlsAllebei")}</p>) : (<div className="flex gap-2">
            {["mening", "informatie"].map((m) => (<button key={m} onClick={() => setMening(m)} className={`min-h-10 flex-1 rounded-full border px-3 text-xs font-semibold ${mening === m ? "border-brand bg-white" : "border-border bg-surface text-ink-soft"}`}>{m === "mening" ? t(N + "graagMening") : t(N + "terInformatie")}</button>))}
          </div>)}
        {!kindSamen ? <p className="text-xs text-ink-soft">{t(N + "alleenVoorJezelf")}</p> : null}
        <button onClick={voorstellen} disabled={!titel.trim() || !kind || bezig} className="min-h-12 w-full rounded-full bg-brand px-5 text-sm font-semibold text-primary-foreground disabled:opacity-40">{!kindSamen ? t(N + "vastleggen") : samen ? t(N + "voorstellenAan", { naam: anderNaam }) : t(N + "delenMet", { naam: anderNaam })}</button>
      </Card>

      <div className="mt-5 space-y-3">
        {lijst.map((b) => {
            const stt = status(b, ik, t);
            const k = st.kinderen.find((x) => b.child_ids?.includes(x.id));
            // De andere ouder van DEZE beslissing (het paar), niet "de" andere ouder van het gezin.
            const ander = b.created_by === ik ? b.other_parent_id : b.created_by;
            const open = b.decision_mode === "goedkeuring" && b.status === "pending";
            const magReageren = open && b.created_by !== ik && !reactie(b, ik);
            const magIntrekken = open && b.created_by === ik && !Object.keys(b.responses ?? {}).some((id) => id !== ik);
            const log = b.history ?? [];
            return (<Card key={b.id} id={`item-${b.id}`} className="zoekdoel space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 text-[11px] tracking-wider text-ink-soft uppercase">{soortNaam(b.decision_kind, t)}{k ? ` · ${k.naam}` : ""}</span>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${stt.c}`}>{stt.t}</span>
              </div>
              <div className="flex items-start justify-between gap-2"><p className="min-w-0 font-semibold">{b.title}</p><GeschiedenisKnop soort="besluit" itemId={b.id} naam={b.title}/></div>
              {b.decision_mode === "goedkeuring" && (<div className="flex flex-wrap gap-4 text-xs text-ink-soft">
                  {[ik, b.created_by === ik ? ander : b.created_by].filter(Boolean).map((id) => (<span key={id} className="inline-flex items-center gap-1">{naamVan(id)}: {reactie(b, id) === "akkoord" ? <MetVinkje>{t(N + "vinkAkkoord")}</MetVinkje> : reactie(b, id) === "niet" ? t(N + "audit.nietAkkoord") : "…"}</span>))}
                </div>)}
              {magIntrekken ? <VoorstelIntrekken onBevestig={async () => { if (await trekBesluitIn(b.id))
                    bevestig(t(N + "melding.ingetrokken")); }}/> : null}
              {magReageren ? (<div className="grid grid-cols-2 gap-2">
                  <button onClick={async () => { if (await reageerOpBesluit(b.id, "akkoord"))
                    bevestig(t(N + "melding.beantwoord")); }} className="min-h-11 w-full rounded-full bg-brand px-4 text-sm font-semibold text-primary-foreground">{t("common.akkoord")}</button>
                  <button onClick={async () => { if (await reageerOpBesluit(b.id, "niet"))
                    bevestig(t(N + "melding.beantwoord")); }} className="min-h-11 w-full rounded-full border border-border bg-white px-4 text-sm font-semibold">{t("common.nietAkkoord")}</button>
                </div>) : null}
              <button onClick={() => setOpenLog(openLog === b.id ? null : b.id)} className="min-h-10 text-xs font-semibold text-brand">{openLog === b.id ? t(N + "verbergLogboek") : t(N + "logboek", { n: log.length })}</button>
              {openLog === b.id && (<ol className="space-y-1 border-l-2 border-brand-soft pl-3 text-xs">
                  {log.map((l, i) => <li key={i}><span className="text-ink-soft">{wanneerTekst(l.at)} · {naamVan(l.by)}</span> — {logTekst(l)}</li>)}
                </ol>)}
            </Card>);
        })}
        {!lijst.length ? (laadWeergave(laadStatus, afsprakenBron.ververs) ?? <p className="rounded-xl bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)] px-3 py-3 text-center text-sm text-ink-soft">{t(N + "leeg")}</p>) : null}
      </div>
      <p className="mt-4 text-xs text-ink-soft">{t(N + "voetnoot")}</p>
    </AppShell>);
}
