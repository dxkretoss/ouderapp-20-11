import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { AppShell, BackButton, Card } from "@/components/AppShell";
import { DeelMomentje, MomentjeKaart } from "@/components/Momentjes";
import { setHerinnering, setProfessionals, useMomentjes } from "@/lib/momentjes-store";
import { ProfielBeeld } from "@/components/ProfielBeeld";
import { AppIcon } from "@/components/AppIcon";
import { useStart } from "@/lib/start-store";
import { useOnthouden } from "@/lib/onthouden";
import { useNavigate } from "@tanstack/react-router";
// Eigen gezin (altijd, na inloggen): momentjes van de server (manage-moments), volledige weergave.
function MomentjesPaginaWrap() {
    return <MomentjesPagina />;
}
export const Route = createFileRoute("/momentjes")({
    head: () => ({
        meta: [
            { title: i18n.t("routes.momentjes.meta.titel") },
            { name: "description", content: i18n.t("routes.momentjes.meta.beschrijving") },
            { property: "og:title", content: i18n.t("routes.momentjes.meta.titel") },
            { property: "og:description", content: i18n.t("routes.momentjes.intro") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: MomentjesPaginaWrap,
});
function Schakel({ aan, onClick, label, uitleg }) {
    return (<button onClick={onClick} className="flex w-full items-center justify-between gap-3 py-3 text-left">
      <div><p className="text-sm font-semibold">{label}</p><p className="text-xs text-ink-soft">{uitleg}</p></div>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${aan ? "bg-brand" : "bg-border"}`}>
        <span className={`absolute top-0.5 size-5 rounded-full bg-card shadow transition-all ${aan ? "left-5" : "left-0.5"}`}/>
      </span>
    </button>);
}
function MomentjesPagina() {
    const { t } = useTranslation();
    const { lijst, herinnering, professionals } = useMomentjes();
    const st = useStart();
    const kinderen = st.kinderen;
    const nav = useNavigate();
    const [open, setOpen] = useState(false);
    const [filter, setFilter] = useOnthouden("momenten-filter", "alle", ["alle", ...kinderen.map((k) => k.id), "mijlpaal"]);
    const zichtbaar = filter === "alle" ? lijst : filter === "mijlpaal" ? lijst.filter((m) => m.mijlpaal) : lijst.filter((m) => m.kindId === filter);
    const opties = [["alle", t("routes.momentjes.filter.samen")], ...kinderen.map((k) => [k.id, k.naam]), ["mijlpaal", t("routes.momentjes.filter.mijlpalen")]];
    return (<AppShell>
      <div className="flex items-center gap-3">
        <BackButton terug="/meer"/>
        <h1 className="lora min-w-0 flex-1 text-[32px] leading-tight">{t("routes.momentjes.titel")}</h1>
        <button aria-label={t("routes.momentjes.deel")} disabled={!kinderen.length} onClick={() => setOpen(true)} className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-2xl leading-none text-primary-foreground"><Plus aria-hidden="true" strokeWidth={2.25} className="size-5"/></button>
      </div>
      <p className="mt-1.5 text-[14.5px] text-ink-soft">{t("routes.momentjes.intro")}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {opties.map(([id, naam]) => {
            const k = kinderen.find((x) => x.id === id);
            const aan = filter === id;
            return k ? (<button key={id} onClick={() => setFilter(id)} aria-pressed={aan} className={`flex h-9 items-center gap-1.5 rounded-full pl-1 pr-3.5 text-sm font-black ${aan ? "border-2 border-brand bg-white" : "bg-white/60"}`}>
              <ProfielBeeld beeld={k.beeld} naam={naam} kleur={k.kleur ?? "#8A7E72"} maat={28}/>{naam}
            </button>) : (<button key={id} onClick={() => setFilter(id)} aria-pressed={aan} className={`h-9 rounded-full px-4 text-sm font-extrabold ${aan ? "bg-brand text-primary-foreground" : "border border-white/95 bg-white/75"}`}>{naam}</button>);
        })}
      </div>
      <div className="mt-3 space-y-3">
        {zichtbaar.map((m) => <MomentjeKaart key={m.id} m={m}/>)}
        {zichtbaar.length === 0 && lijst.length ? <p className="py-6 text-center text-sm text-ink-soft">{t("routes.momentjes.leeg")}</p> : null}
        {!lijst.length ? (<div className="mt-6 flex flex-col items-center text-center">
            <p className="font-display text-lg font-bold">{t("routes.momentjes.eigen.rustig")}</p>
            <p className="mt-1 max-w-xs text-sm text-ink-soft">{t("routes.momentjes.eigen.leegUitleg")}</p>
            {kinderen.length ? <button onClick={() => setOpen(true)} className="mt-5 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-primary-foreground">{t("routes.momentjes.eigen.eerste")}</button> : null}
            <button onClick={() => nav({ to: "/meer" })} className="mt-3 min-h-11 text-sm font-semibold text-ink-soft">{t("routes.momentjes.eigen.terugMenu")}</button>
          </div>) : null}
      </div>
      <h2 className="mt-6 px-1 text-[13px] font-black uppercase tracking-[0.08em] text-ink-soft">{t("routes.momentjes.privacyKop")}</h2>
      <Card className="mt-2 divide-y divide-border rounded-[22px] border-white/85 bg-white/60 py-1">
        <Schakel aan={herinnering} onClick={() => setHerinnering(!herinnering)} label={t("routes.momentjes.herinnering.label")} uitleg={<Trans i18nKey="routes.momentjes.herinnering.uitleg" components={{ hart: <AppIcon functie="momentjes" maat="sm" vorm="kaal" className="align-middle"/> }}/>}/>
        <Schakel aan={professionals} onClick={() => setProfessionals(!professionals)} label={t("routes.momentjes.professionals.label")} uitleg={t("routes.momentjes.professionals.uitleg")}/>
      </Card>
      <p className="mt-3 text-xs text-ink-soft">
        {t("routes.momentjes.vrijwillig")}
      </p>
      <DeelMomentje open={open} onSluit={() => setOpen(false)}/>
    </AppShell>);
}
