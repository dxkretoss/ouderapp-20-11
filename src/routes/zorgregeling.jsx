import { ZorgAfstemmen } from "@/components/ZorgAfstemmen";
import { createFileRoute, Link, Navigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n, { tLijst } from "@/i18n";
import { BewerkPotlood, FilterBalk } from "@/components/ui-kit";
import { kindNamen, uitzonderingenVan, useZorg, zorgDag } from "@/lib/zorg-store";
import { z } from "zod";
import { CalendarRange, Repeat2 } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Chevron, MetChevron } from "@/components/Tekens";
import { ContextToevoegen } from "@/components/ContextToevoegen";
import { parents } from "@/lib/demo-data";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/zorgregeling")({
    validateSearch: z.object({ actie: z.string().optional(), type: z.enum(["ruil", "nachtje", "regeling"]).optional(), bron: z.string().optional(), omschrijving: z.string().optional(), voorstel: z.string().optional(), kind: z.string().optional() }),
    head: () => ({
        meta: [
            { title: i18n.t("routes.zorgregeling.meta.titel") },
            { name: "description", content: i18n.t("routes.zorgregeling.meta.beschrijving") },
            { property: "og:title", content: i18n.t("routes.zorgregeling.meta.titel") },
            { property: "og:description", content: i18n.t("routes.zorgregeling.meta.ogBeschrijving") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: ZorgregelingWrap,
});
function ZorgregelingWrap() {
    const zoek = Route.useSearch();
    return <Navigate to="/agenda" replace search={{ zorgActie: zoek.actie === "regeling" ? "regeling" : zoek.actie === "wijziging" ? "wijziging" : undefined, zorgVoorstel: zoek.voorstel, kind: zoek.kind, omschrijving: zoek.omschrijving }}/>;
}
/** Demo maart 2025 begint op zaterdag: index 0 = zaterdag. Namen uit de vertaling (maandag eerst). */
const weekdag = () => { const d = tLijst("common.dagen"); return [5, 6, 0, 1, 2, 3, 4].map((i) => d[i]); };
const maart = () => tLijst("common.maanden")[2];
const VANDAAG = 12;
function Zorgregeling() {
    const { t } = useTranslation();
    const router = useRouter();
    const zoek = Route.useSearch();
    const actie = zoek.actie === "regeling" || zoek.actie === "wijziging" ? zoek.actie : undefined;
    const zorg = useZorg();
    const [kind, setKind] = useState(zoek.kind === "noah" ? "noah" : "emma");
    useEffect(() => {
        const v = zorg.voorstellen.find((v) => v.id === zoek.voorstel);
        const k = v?.kinderen[0];
        if (k)
            setKind(k);
        if (v)
            requestAnimationFrame(() => document.getElementById(`item-${v.id}`)?.scrollIntoView({ block: "center" }));
    }, [zoek.voorstel]);
    const [gekozen, setGekozen] = useState(null);
    const [andersOpen, setAndersOpen] = useState(false);
    const leeg = 5;
    const dagen = tLijst("common.dagenKort").map((d) => d.charAt(0).toUpperCase() + d.slice(1));
    const maand = Array.from({ length: 31 }, (_, i) => ({ datum: i + 1, ...zorgDag(zorg, kind, i + 1) }));
    const normaal = (d) => zorgDag({ ...zorg, uitz: [] }, kind, d).ouder;
    const uitzRaw = uitzonderingenVan(zorg, kind);
    const groepen = [...new Set(uitzRaw.map((u) => `${u.reden}|${u.ouder}`))].map((k) => {
        const [reden, ouder] = k.split("|");
        const d = uitzRaw.filter((u) => u.reden === reden && u.ouder === ouder).map((u) => u.dag).sort((a, b) => a - b);
        return { reden, ouder, label: d.length > 1 ? t("routes.zorgregeling.periode", { van: d[0], tot: d[d.length - 1], maand: maart() }) : t("routes.zorgregeling.datum", { dag: d[0], maand: maart() }) };
    });
    const nuBij = ["emma", "noah"].map((k) => ({ k, o: zorgDag(zorg, k, VANDAAG).ouder }));
    const zelfde = nuBij.every((x) => x.o === nuBij[0].o);
    const nuOuder = maand[VANDAAG - 1].ouder;
    const wissel = maand.find((d) => d.datum > VANDAAG && d.ouder !== nuOuder);
    const naam = (o) => (o === "sanne" ? t("routes.zorgregeling.jou") : parents[o].naam);
    const open = (a) => router.navigate({ to: "/zorgregeling", search: { actie: a, bron: "zorgregeling" } });
    const dag = gekozen ? maand[gekozen - 1] : undefined;
    return (<AppShell>
      <PageHeader titel={t("routes.zorgregeling.titel")} subtitel={t("routes.zorgregeling.subtitel")} terug="/" actie={<div className="flex items-center gap-1">
          <BewerkPotlood onClick={() => open("regeling")} label={t("routes.zorgregeling.vastAanpassen")}/>
          <ContextToevoegen titel={t("routes.zorgregeling.toevoegen.titel")} acties={[
                { titel: t("routes.zorgregeling.toevoegen.dag.titel"), uitleg: t("routes.zorgregeling.toevoegen.dag.uitleg"), icoon: Repeat2, onKies: () => open("wijziging") },
                { titel: t("routes.zorgregeling.toevoegen.vast.titel"), uitleg: t("routes.zorgregeling.toevoegen.vast.uitleg"), icoon: CalendarRange, onKies: () => open("regeling") },
            ]}/>
        </div>}/>
      <ZorgAfstemmen startActie={actie} kind={kind} doel={zoek.voorstel} voorstelType={zoek.type} bronOmschrijving={zoek.omschrijving} sluit={() => router.navigate({ to: "/zorgregeling", search: {}, replace: true })}/>
      <div className="mt-4 grid grid-cols-2 gap-4 border-y border-border py-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">{t("routes.zorgregeling.nu")}</p>
          <p className="mt-1 text-sm font-semibold">{zelfde ? t("routes.zorgregeling.beidenBij", { wie: naam(nuBij[0].o) }) : nuBij.map((x) => t("routes.zorgregeling.kindBij", { kind: kindNamen[x.k], wie: naam(x.o) })).join(" · ")}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">{t("routes.zorgregeling.volgendeWissel")}</p>
          {wissel ? <p className="mt-1 text-sm font-semibold">{t("routes.zorgregeling.wissel", { weekdag: weekdag()[(wissel.datum - 1) % 7][0].toUpperCase() + weekdag()[(wissel.datum - 1) % 7].slice(1), dag: wissel.datum, maand: maart(), naam: parents[wissel.ouder].naam })}</p> : <p className="mt-1 text-sm text-ink-soft">{t("routes.zorgregeling.geenWissel")}</p>}
          <Link to="/overdracht" className="mt-1 inline-flex min-h-10 items-center text-xs font-semibold text-brand"><MetChevron>{t("routes.zorgregeling.overdracht")}</MetChevron></Link>
        </div>
      </div>
      <FilterBalk className="mt-4" opties={[{ id: "emma", label: "Emma" }, { id: "noah", label: "Noah" }]} waarde={kind} onChange={(k) => { setKind(k); setGekozen(null); }}/>
      <div className="mt-3">
        <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">{t("routes.zorgregeling.bestaand", { maand: maart(), kind: kindNamen[kind] })}</p><Button variant="outline" size="sm" onClick={() => open("wijziging")}>{t("routes.zorgregeling.wijzigingVoorstellen")}</Button></div>
        <div className="mt-2 grid grid-cols-7 gap-1 text-center">
          {dagen.map((d) => <span key={d} className="text-[11px] font-semibold text-ink-soft">{d}</span>)}
          {Array.from({ length: leeg }).map((_, i) => <span key={`l${i}`}/>)}
          {maand.map((d) => {
            const kl = `relative grid h-8 place-items-center rounded-lg text-xs font-semibold ${d.ouder === "sanne" ? "bg-brand-soft text-brand" : "bg-accent-soft text-accent-foreground"} ${d.datum === VANDAAG ? "ring-2 ring-brand" : ""}`;
            return d.uitzondering ? (<button key={d.datum} onClick={() => setGekozen(gekozen === d.datum ? null : d.datum)} aria-label={t("routes.zorgregeling.anders", { dag: d.datum, maand: maart() })} className={kl}>
                {d.datum}<span className="absolute right-1 top-1 size-1.5 rounded-full bg-[var(--ic-koraal)]"/>
              </button>) : <div key={d.datum} className={kl}>{d.datum}</div>;
        })}
        </div>
        <div className="mt-2 flex gap-4 text-[11px] text-ink-soft">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded bg-brand-soft"/> {parents.sanne.naam}</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded bg-accent-soft"/> {parents.joris.naam}</span>
          <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-[var(--ic-koraal)]"/> {t("routes.zorgregeling.andersDanNormaal")}</span>
        </div>
        {dag?.uitzondering ? (<div className="mt-3 border-l-2 border-brand pl-3 text-sm">
            <p className="font-semibold">{t("routes.zorgregeling.dagLang", { weekdag: weekdag()[(dag.datum - 1) % 7], dag: dag.datum, maand: maart() })}</p>
            <p className="text-xs text-ink-soft">{t("routes.zorgregeling.normaal", { naam: parents[normaal(dag.datum)].naam })}</p>
            <p className="text-xs text-ink-soft">{t("routes.zorgregeling.dezeKeer", { naam: parents[dag.ouder].naam })}</p>
            <p className="text-xs text-ink-soft">{t("routes.zorgregeling.reden", { reden: dag.uitzondering })}</p>
          </div>) : null}
      </div>
      {groepen.length ? (<div className="mt-5">
          <button onClick={() => setAndersOpen(!andersOpen)} aria-expanded={andersOpen} className="flex w-full items-center justify-between py-2 text-left">
            <span>
              <span className="block text-sm font-semibold">{t("routes.zorgregeling.aantalAnders", { count: uitzRaw.length })}</span>
              <span className="block text-xs text-ink-soft">{groepen.map((g) => g.reden).join(" · ")}</span>
            </span>
            <Chevron richting="omlaag" open={andersOpen} className="size-4 text-ink-soft"/>
          </button>
          {andersOpen ? (<ul className="divide-y divide-border border-t border-border">
              {groepen.map((u) => (<li key={u.reden + u.ouder} className="flex items-center justify-between py-2.5">
                  <span><span className="block text-sm font-semibold">{u.reden}</span><span className="block text-xs text-ink-soft">{t("routes.zorgregeling.alleenDezeKeer", { label: u.label })}</span></span>
                  <span className="text-xs font-semibold text-brand">{t("routes.zorgregeling.bij", { naam: parents[u.ouder].naam })}</span>
                </li>))}
            </ul>) : null}
        </div>) : null}
    </AppShell>);
}
