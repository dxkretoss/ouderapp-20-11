import i18n from "@/i18n";
import { useTranslation } from "react-i18next";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell, Card, PageHeader } from "@/components/AppShell";
import { EmailKoppelingInstellen } from "@/components/EmailKoppelingInstellen";
import { AndereOuderUitnodigen } from "@/components/AndereOuderUitnodigen";
import { useAuth } from "@/lib/auth-store";
import { AppIcon } from "@/components/AppIcon";
import { MetChevron, Vinkje } from "@/components/Tekens";
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
/** Voorbeeldnotities: tekst wordt bij het lezen vertaald. */
const logboek = ["l1", "l2", "l3"].map((id) => ({
    id,
    get datum() { return i18n.t(`routes.solo.logboek.${id}.datum`); },
    get tekst() { return i18n.t(`routes.solo.logboek.${id}.tekst`); },
}));
function Solo() {
    const { t } = useTranslation();
    const [aan, setAan] = useState(false);
    const [notities, setNotities] = useState(logboek);
    const [nieuw, setNieuw] = useState("");
    const account = useAuth().gebruiker;
    const [email, setEmail] = useState(account?.email ?? "");
    return (<AppShell>
      <PageHeader titel={t("routes.solo.titel")} subtitel={t("routes.solo.subtitel")}/>

      <Card className="mt-6">
        <p className="text-sm leading-relaxed">
          {t("routes.solo.intro")}
        </p>
        <button onClick={() => setAan(!aan)} className="mt-4 flex w-full items-center justify-between rounded-md bg-surface px-4 py-3">
          <span className="text-sm font-semibold">{aan ? t("routes.solo.modusAan") : t("routes.solo.modusUit")}</span>
          <span className={`relative h-6 w-11 rounded-full transition-colors ${aan ? "bg-brand" : "bg-border"}`}>
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
        <textarea value={nieuw} onChange={(e) => setNieuw(e.target.value)} placeholder={t("routes.solo.placeholder")} rows={3} className="w-full resize-none rounded-xl bg-surface p-3 text-sm outline-none"/>
        <button disabled={!nieuw.trim()} onClick={() => {
            setNotities([{ id: String(Date.now()), datum: t("common.vandaag"), tekst: nieuw.trim() }, ...notities]);
            setNieuw("");
        }} className="mt-2 w-full rounded-xl bg-brand py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">
          {t("common.toevoegen")}
        </button>
      </Card>
      <div className="mt-3 space-y-3">
        {notities.map((n) => (<Card key={n.id}>
            <p className="text-[11px] font-semibold text-ink-soft">{n.datum}</p>
            <p className="mt-1 text-sm">{n.tekst}</p>
          </Card>))}
      </div>

      <h2 className="mt-6 font-display font-bold">{t("routes.solo.communicatie")}</h2>
      <EmailKoppelingInstellen />

      <h2 className="mt-6 font-display font-bold">{t("routes.solo.account")}</h2>
      <Card className="mt-3">
        <p className="text-xs text-ink-soft">{t("routes.solo.accountUitleg")}</p>
        <label className="mt-3 block text-xs font-semibold text-ink-soft">{t("routes.solo.email")}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm font-normal text-ink"/>
        </label>
      </Card>

      <Card id="samen" className="mt-6 scroll-mt-4 bg-accent-soft">
        <p className="text-sm font-semibold">{t("routes.solo.samen.titel")}</p>
        <p className="mt-1 text-xs text-ink-soft">{t("routes.solo.samen.uitleg")}</p>
        <AndereOuderUitnodigen />
        <Link to="/professionals" className="mt-2 inline-flex min-h-10 items-center text-xs font-semibold text-brand">
          <MetChevron>{t("routes.solo.mediator")}</MetChevron>
        </Link>
      </Card>
    </AppShell>);
}
