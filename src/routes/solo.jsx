import i18n, { taalLocale } from "@/i18n";
import { emailKoppelingAan, professionalsAan } from "@/lib/fase";
import { useTranslation } from "react-i18next";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { start, useStart } from "@/lib/start-store";
import { persoonlijkBron, usePersoonlijk, vanSoort, verwijderPersoonlijk, voegPersoonlijkToe } from "@/lib/persoonlijk-store";
import { laadWeergave } from "@/components/Laden";
import { AppShell, Card, PageHeader } from "@/components/AppShell";
import { EmailKoppelingInstellen } from "@/components/EmailKoppelingInstellen";
import { AndereOuderUitnodigen } from "@/components/AndereOuderUitnodigen";
import { useAuth } from "@/lib/auth-store";
import { AppIcon } from "@/components/AppIcon";
import { Kruis, MetChevron, Vinkje } from "@/components/Tekens";
export const Route = createFileRoute("/solo")({
    head: () => ({
        meta: [
            { title: i18n.t("common.metaTitel", { titel: i18n.t("routes.solo.meta.titel") }) },
            { name: "description", content: i18n.t("routes.solo.meta.beschrijving") },
            { property: "og:title", content: i18n.t("common.metaTitel", { titel: i18n.t("routes.solo.meta.titel") }) },
            { property: "og:description", content: i18n.t("routes.solo.meta.ogBeschrijving") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: Solo,
});
const voordelen = [
    { id: "agenda", icoon: "agenda" },
    { id: "kosten", icoon: "kosten" },
    { id: "logboek", icoon: "logboek" },
    { id: "documenten", icoon: "map" },
];
function Solo() {
    const { t } = useTranslation();
    // Solo-modus is het profielveld usage_mode (via start-store: optimistisch, bij een fout terug + melding).
    const st = useStart();
    const aan = st.gebruik === "zelf" || st.gebruik === "alleen";
    // Logboek: privé op de server (manage-personal, solo_note), nieuwste eerst.
    const ps = usePersoonlijk();
    const laadStatus = persoonlijkBron.useStatus();
    const notities = [...vanSoort(ps, "solo_note")].reverse();
    const [nieuw, setNieuw] = useState("");
    const [bezig, setBezig] = useState(false);
    const email = useAuth().gebruiker?.email ?? "";
    const voegToe = async () => {
        const tekst = nieuw.trim();
        if (!tekst || bezig)
            return;
        setBezig(true);
        const r = await voegPersoonlijkToe("solo_note", { tekst: tekst.slice(0, 4000) });
        setBezig(false);
        if (r)
            setNieuw("");
    };
    const datumVan = (iso) => new Date(iso).toLocaleString(taalLocale(), { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
    return (<AppShell>
      <PageHeader titel={t("routes.solo.titel")} subtitel={t("routes.solo.subtitel")}/>

      <Card className="mt-6">
        <p className="text-sm leading-relaxed">
          {t("routes.solo.intro")}
        </p>
        <button onClick={() => void start.zetGebruik(aan ? "samen" : "zelf")} role="switch" aria-checked={aan} className="mt-4 flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3 text-left">
          <span className="min-w-0 text-sm font-semibold">{aan ? t("routes.solo.modusAan") : t("routes.solo.modusUit")}</span>
          <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${aan ? "bg-brand" : "bg-border"}`}>
            <span className={`absolute top-0.5 size-5 rounded-full bg-card shadow transition-all ${aan ? "left-5" : "left-0.5"}`}/>
          </span>
        </button>
        {aan ? (<p className="mt-3 flex items-start gap-1 text-xs text-brand"><Vinkje className="mt-px size-3.5"/><span>{t("routes.solo.alleen")}</span></p>) : null}
      </Card>

      <h2 className="mt-6 font-display font-bold">{t("routes.solo.watSolo")}</h2>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {voordelen.map((v) => (<Card key={v.id}>
            <AppIcon functie={v.icoon} maat="md"/>
            <p className="mt-2 text-sm font-semibold">{t(`routes.solo.voordeel.${v.id}.titel`)}</p>
            <p className="mt-1 text-xs text-ink-soft">{t(`routes.solo.voordeel.${v.id}.tekst`)}</p>
          </Card>))}
      </div>

      <h2 className="mt-6 font-display font-bold">{t("routes.solo.logboekTitel")}</h2>
      <p className="mt-1 text-xs text-ink-soft">
        {t("routes.solo.logboekUitleg")}
      </p>
      <Card className="mt-3">
        <textarea value={nieuw} onChange={(e) => setNieuw(e.target.value)} placeholder={t("routes.solo.placeholder")} rows={3} maxLength={4000} className="w-full resize-none rounded-2xl border border-border bg-card p-3 text-sm outline-none"/>
        <button disabled={!nieuw.trim() || bezig} onClick={() => void voegToe()} className="mt-2 min-h-11 w-full rounded-full bg-brand px-5 text-sm font-semibold text-primary-foreground disabled:opacity-40">
          {t("common.toevoegen")}
        </button>
      </Card>
      <div className="mt-3 space-y-3">
        {laadStatus === "klaar" ? (notities.length ? notities.map((n) => (<Card key={n.id}>
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 text-[11px] font-semibold text-ink-soft">{datumVan(n.aangemaakt)}</p>
              <button onClick={() => void verwijderPersoonlijk(n.id)} aria-label={t("routes.solo.notitieVerwijderen")} className="-mr-2 -mt-2 grid size-10 shrink-0 place-items-center text-ink-soft"><Kruis className="size-3.5"/></button>
            </div>
            <p className="mt-1 whitespace-pre-line text-sm">{n.data.tekst}</p>
          </Card>)) : <p className="rounded-xl bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)] px-3 py-3 text-center text-sm text-ink-soft">{t("routes.solo.logboekLeeg")}</p>) : laadWeergave(laadStatus, persoonlijkBron.ververs)}
      </div>

      {/* E-mail koppelen hoort niet bij deze fase (zie lib/fase.js): dan ook geen lege kop. */}
      {emailKoppelingAan ? <><h2 className="mt-6 font-display font-bold">{t("routes.solo.communicatie")}</h2><EmailKoppelingInstellen /></> : null}

      <h2 className="mt-6 font-display font-bold">{t("routes.solo.account")}</h2>
      <Card className="mt-3">
        <p className="text-xs text-ink-soft">{t("routes.solo.accountUitleg")}</p>
        {email ? <div className="mt-3 text-xs font-semibold text-ink-soft">{t("routes.solo.email")}
          <p className="mt-1 break-all text-sm font-normal text-ink">{email}</p>
        </div> : null}
      </Card>

      <Card id="samen" className="mt-6 scroll-mt-4 bg-accent-soft">
        <p className="text-sm font-semibold">{t("routes.solo.samen.titel")}</p>
        <p className="mt-1 text-xs text-ink-soft">{t("routes.solo.samen.uitleg")}</p>
        <AndereOuderUitnodigen />
        {professionalsAan ? (<Link to="/professionals" className="mt-2 inline-flex min-h-10 items-center text-xs font-semibold text-brand">
            <MetChevron>{t("routes.solo.mediator")}</MetChevron>
          </Link>) : null}
      </Card>
    </AppShell>);
}
