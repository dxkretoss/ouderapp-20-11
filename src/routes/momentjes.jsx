import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import i18n, { taalLocale } from "@/i18n";
import { AppShell, BackButton, Card } from "@/components/AppShell";
import { DeelMomentje, MomentjeKaart } from "@/components/Momentjes";
import { kinderen } from "@/lib/demo-data";
import { setHerinnering, setProfessionals, useMomentjes, voegMomentjeToe } from "@/lib/momentjes-store";
import { bevestig } from "@/lib/feedback";
import { AppIcon } from "@/components/AppIcon";
import { useStart } from "@/lib/start-store";
import { useOnthouden } from "@/lib/onthouden";
import { useNavigate } from "@tanstack/react-router";
// Eigen gezin: eigen momentjes (geen voorbeelddata), met plusje en toevoegformulier.
function MomentjesPaginaWrap() {
    const st = useStart();
    if (st.eigen)
        return <EigenMomentjes />;
    return <MomentjesPagina />;
}
function EigenMomentjes() {
    const { t } = useTranslation();
    const st = useStart();
    const { lijst } = useMomentjes();
    const nav = useNavigate();
    const [nieuw, setNieuw] = useState(false);
    const [tekst, setTekst] = useState("");
    const [kind, setKind] = useState(st.kinderen[0]?.id ?? "");
    const eigen = lijst.filter((m) => st.kinderen.some((k) => k.id === m.kindId));
    const kindNaamVan = (id) => st.kinderen.find((k) => k.id === id)?.naam ?? "";
    const opslaan = () => {
        if (!tekst.trim() || !kind)
            return;
        const nu = new Date();
        voegMomentjeToe({
            id: `m${Date.now()}`, kindId: kind, van: "sanne", tekst: tekst.trim(),
            wanneer: t("routes.momentjes.eigen.wanneer", { datum: nu.toLocaleDateString(taalLocale(), { weekday: "short", day: "numeric", month: "long" }), tijd: nu.toLocaleTimeString(taalLocale(), { hour: "2-digit", minute: "2-digit" }) }),
            datum: nu.toISOString().slice(0, 10), moment: "geen", prive: false,
        });
        bevestig(t("routes.momentjes.eigen.bewaard"), { uitleg: tekst.trim() });
        setTekst("");
        setNieuw(false);
    };
    const knop = (aan) => `min-h-11 rounded-full border px-3 text-sm ${aan ? "border-brand bg-brand-soft font-semibold" : "border-border"}`;
    return (<AppShell>
      <div className="flex items-center gap-3">
        <BackButton terug="/meer"/>
        <h1 className="lora min-w-0 flex-1 text-[32px] leading-tight">{t("routes.momentjes.titel")}</h1>
        <button aria-label={t("routes.momentjes.eigen.toevoegen")} onClick={() => setNieuw(true)} className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-2xl leading-none text-primary-foreground"><Plus aria-hidden="true" strokeWidth={2.25} className="size-5"/></button>
      </div>
      {nieuw ? (<Card className="mt-4 space-y-3">
          <p className="font-display text-lg font-bold">{t("routes.momentjes.eigen.nieuw")}</p>
          <label className="block text-sm font-semibold">{t("routes.momentjes.eigen.watBewaren")}<textarea value={tekst} onChange={(e) => setTekst(e.target.value)} placeholder={t("routes.momentjes.eigen.placeholder")} rows={3} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-normal"/></label>
          {st.kinderen.length ? (<fieldset><legend className="text-sm font-semibold">{t("routes.momentjes.eigen.welkKind")}</legend><div className="mt-1 flex flex-wrap gap-2">
              {st.kinderen.map((k) => <button key={k.id} onClick={() => setKind(k.id)} aria-pressed={kind === k.id} className={knop(kind === k.id)}>{k.naam}</button>)}
            </div></fieldset>) : null}
          <div className="flex gap-2">
            <button onClick={opslaan} className="min-h-11 flex-1 rounded-full bg-brand text-sm font-semibold text-primary-foreground">{t("routes.momentjes.eigen.bewaren")}</button>
            <button onClick={() => setNieuw(false)} className="min-h-11 px-3 text-sm text-ink-soft">{t("common.annuleren")}</button>
          </div>
        </Card>) : null}
      {!eigen.length && !nieuw ? (<div className="mt-10 flex flex-col items-center text-center">
          <p className="font-display text-lg font-bold">{t("routes.momentjes.eigen.rustig")}</p>
          <p className="mt-1 max-w-xs text-sm text-ink-soft">{t("routes.momentjes.eigen.leegUitleg")}</p>
          <button onClick={() => setNieuw(true)} className="mt-5 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-primary-foreground">{t("routes.momentjes.eigen.eerste")}</button>
          <button onClick={() => nav({ to: "/meer" })} className="mt-3 min-h-11 text-sm font-semibold text-ink-soft">{t("routes.momentjes.eigen.terugMenu")}</button>
        </div>) : null}
      <div className="mt-4 space-y-3">
        {eigen.map((m) => (<Card key={m.id}>
            <p className="text-xs font-semibold text-ink-soft">{kindNaamVan(m.kindId)} · {m.wanneer}</p>
            <p className="mt-1 text-sm">{m.tekst}</p>
          </Card>))}
      </div>
    </AppShell>);
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
    const [open, setOpen] = useState(false);
    const [filter, setFilter] = useOnthouden("momenten-filter", "alle", ["alle", "emma", "noah", "mijlpaal"]);
    const zichtbaar = filter === "alle" ? lijst : filter === "mijlpaal" ? lijst.filter((m) => m.mijlpaal) : lijst.filter((m) => m.kindId === filter);
    const opties = [["alle", t("routes.momentjes.filter.samen")], ...kinderen.map((k) => [k.id, k.naam]), ["mijlpaal", t("routes.momentjes.filter.mijlpalen")]];
    return (<AppShell>
      <div className="flex items-center gap-3">
        <BackButton terug="/meer"/>
        <h1 className="lora min-w-0 flex-1 text-[32px] leading-tight">{t("routes.momentjes.titel")}</h1>
        <button aria-label={t("routes.momentjes.deel")} onClick={() => setOpen(true)} className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-2xl leading-none text-primary-foreground"><Plus aria-hidden="true" strokeWidth={2.25} className="size-5"/></button>
      </div>
      <p className="mt-1.5 text-[14.5px] text-ink-soft">{t("routes.momentjes.intro")}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {opties.map(([id, naam]) => {
            const k = kinderen.find((x) => x.id === id);
            const aan = filter === id;
            return k ? (<button key={id} onClick={() => setFilter(id)} aria-pressed={aan} className={`flex h-9 items-center gap-1.5 rounded-full pl-1 pr-3.5 text-sm font-black ${aan ? "border-2 border-brand bg-white" : "bg-white/60"}`}>
              <span className="grid size-7 place-items-center rounded-full text-xs font-black text-white" style={{ background: k.kleur ?? "#8A7E72" }}>{naam[0]}</span>{naam}
            </button>) : (<button key={id} onClick={() => setFilter(id)} aria-pressed={aan} className={`h-9 rounded-full px-4 text-sm font-extrabold ${aan ? "bg-brand text-primary-foreground" : "border border-white/95 bg-white/75"}`}>{naam}</button>);
        })}
      </div>
      <div className="mt-3 space-y-3">
        {zichtbaar.map((m) => <MomentjeKaart key={m.id} m={m}/>)}
        {zichtbaar.length === 0 ? <p className="py-6 text-center text-sm text-ink-soft">{t("routes.momentjes.leeg")}</p> : null}
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
