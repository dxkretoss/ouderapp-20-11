import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
import { appDocumenten } from "@/lib/juridische-bronnen";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { Chevron } from "@/components/Tekens";
export const Route = createFileRoute("/juridisch")({
    head: () => ({
        meta: [
            { title: i18n.t("common.metaTitel", { titel: i18n.t("routes.juridisch.meta.titel") }) },
            { name: "description", content: i18n.t("routes.juridisch.meta.beschrijving") },
            { property: "og:title", content: i18n.t("common.metaTitel", { titel: i18n.t("routes.juridisch.meta.titel") }) },
            { property: "og:description", content: i18n.t("routes.juridisch.meta.ogBeschrijving") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: JuridischPagina,
});
function JuridischPagina() {
    const { t } = useTranslation();
    return (<AppShell>
      <PageHeader titel={t("routes.juridisch.titel")} subtitel={t("routes.juridisch.subtitel")} terug="/juridische-hulp"/>
      <div className="mt-6 divide-y divide-border border-y border-border">
        {appDocumenten.map((d) => (<details key={d.id} id={d.id} className="group py-3.5">
            <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold">
              {d.titel}<Chevron className="size-4 text-ink-soft transition-transform group-open:rotate-90"/>
            </summary>
            <p className="mt-1 text-[11px] text-ink-soft">{t("routes.juridisch.bijgewerkt", { datum: d.bijgewerkt })}</p>
            <div className="mt-2 space-y-2 text-sm leading-relaxed">{d.alineas.map((a) => <p key={a}>{a}</p>)}</div>
          </details>))}
      </div>
    </AppShell>);
}
