import i18n from "@/i18n";
import { useTranslation } from "react-i18next";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell, Card, PageHeader } from "@/components/AppShell";
import { AppIcon } from "@/components/AppIcon";
import { useStart } from "@/lib/start-store";
export const Route = createFileRoute("/rondleiding")({
    head: () => ({
        meta: [
            { title: i18n.t("common.metaTitel", { titel: i18n.t("routes.rondleiding.meta.titel") }) },
            { name: "description", content: i18n.t("routes.rondleiding.meta.beschrijving") },
            { property: "og:title", content: i18n.t("common.metaTitel", { titel: i18n.t("routes.rondleiding.meta.titel") }) },
            { property: "og:description", content: i18n.t("routes.rondleiding.meta.ogBeschrijving") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: Rondleiding,
});
function Rondleiding() {
    const { t } = useTranslation();
    const S = (id, k) => t(`routes.rondleiding.stap.${id}.${k}`);
    const s = useStart();
    const [i, setI] = useState(0);
    const kids = s.eigen && s.kinderen.length ? s.kinderen.map((k) => k.naam).join(" & ") : t("routes.rondleiding.jeKinderen");
    const stappen = [
        { icoon: "home", titel: S("home", "titel"), tekst: t("routes.rondleiding.stap.home.tekst", { kids }), to: "/", knop: S("home", "knop") },
        { icoon: "kinderen", titel: S("kinderen", "titel"), tekst: S("kinderen", "tekst"), to: s.eigen ? "/" : "/kinderen", knop: s.kinderen.length ? S("kinderen", "knop") : S("kinderen", "knopToevoegen"), klaar: s.kinderen.length > 0 },
        { icoon: "zorgregeling", titel: S("verdeling", "titel"), tekst: S("verdeling", "tekst"), to: s.eigen ? "/" : "/zorgregeling", knop: S("verdeling", "knop"), klaar: s.regeling !== null },
        { icoon: "agenda", titel: S("agenda", "titel"), tekst: S("agenda", "tekst"), to: "/agenda", knop: S("agenda", "knop"), klaar: s.afspraakToegevoegd },
        { icoon: "berichten", titel: S("berichten", "titel"), tekst: S("berichten", "tekst"), to: "/berichten", knop: S("berichten", "knop") },
        { icoon: "kosten", titel: S("kosten", "titel"), tekst: S("kosten", "tekst"), to: "/kosten", knop: S("kosten", "knop") },
        ...(s.gebruik === "samen" ? [{ icoon: "samen", titel: S("ander", "titel"), tekst: S("ander", "tekst"), to: "/instellingen", knop: S("ander", "knop"), klaar: s.uitgenodigd }] : []),
        { icoon: "meer", titel: S("menu", "titel"), tekst: S("menu", "tekst"), to: "/meer", knop: S("menu", "knop") },
    ];
    const stap = stappen[i];
    const laatste = i === stappen.length - 1;
    return (<AppShell>
      <PageHeader titel={t("routes.rondleiding.titel")} subtitel={s.eigen && s.naam ? t("routes.rondleiding.welkom", { naam: s.naam }) : t("routes.rondleiding.subtitel")} terug="/meer"/>
      <p className="mt-5 text-xs text-ink-soft">{t("routes.rondleiding.stapVan", { n: i + 1, totaal: stappen.length })}</p>
      <div className="mt-2 flex gap-1" aria-hidden>
        {stappen.map((_, n) => <span key={n} className={`h-1 flex-1 rounded-full ${n <= i ? "bg-brand" : "bg-border"}`}/>)}
      </div>
      <Card className="mt-4">
        <div className="flex items-center gap-3">
          <AppIcon functie={stap.icoon} maat="lg"/>
          <div>
            <h2 className="font-display text-lg font-bold">{stap.titel}</h2>
            {stap.klaar ? <p className="text-xs text-brand">{t("routes.rondleiding.alIngesteld")}</p> : null}
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed">{stap.tekst}</p>
        <Link to={stap.to} className="mt-4 block w-full rounded-xl border border-border py-2.5 text-center text-sm font-semibold">{stap.knop}</Link>
      </Card>
      <div className="mt-4 flex gap-2">
        <button disabled={i === 0} onClick={() => setI(i - 1)} className="flex-1 rounded-xl border border-border py-3 text-sm font-semibold disabled:opacity-40">{t("common.vorige")}</button>
        {laatste
            ? <Link to="/" className="flex-1 rounded-xl bg-brand py-3 text-center text-sm font-semibold text-primary-foreground">{t("routes.rondleiding.klaar")}</Link>
            : <button onClick={() => setI(i + 1)} className="flex-1 rounded-xl bg-brand py-3 text-sm font-semibold text-primary-foreground">{t("common.volgende")}</button>}
      </div>
      <p className="mt-4 text-center text-xs text-ink-soft">{t("routes.rondleiding.opnieuw")}</p>
    </AppShell>);
}
