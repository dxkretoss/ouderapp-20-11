import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FilterBalk } from "@/components/ui-kit";
import { AppShell, Card, PageHeader } from "@/components/AppShell";
import { AppIcon } from "@/components/AppIcon";
import { eventKop, useAudit } from "@/lib/audit-store";
import { geschiedenisDatum as nlDatum, useAfspraken } from "@/lib/afspraken-store";
import { magAudit } from "@/lib/export-rechten";
import { useTranslation } from "react-i18next";
import i18n, { taalLocale } from "@/i18n";
export const Route = createFileRoute("/tijdlijn")({
    head: () => ({
        meta: [
            { title: i18n.t("common.metaTitel", { titel: i18n.t("routes.tijdlijn.meta.titel") }) },
            { name: "description", content: i18n.t("routes.tijdlijn.meta.beschrijving") },
            { property: "og:title", content: i18n.t("common.metaTitel", { titel: i18n.t("routes.tijdlijn.meta.titel") }) },
            { property: "og:description", content: i18n.t("routes.tijdlijn.meta.ogBeschrijving") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: Tijdlijn,
});
// [categorie-id, icoon]; labels via routes.tijdlijn.cat.<id>.
const auditCat = {
    afspraak: ["agenda", "agenda"], schema: ["verdeling", "zorgregeling"], besluit: ["beslissing", "beslissing"],
    kosten: ["kosten", "kosten"], taak: ["taak", "taken"], spul: ["spul", "doos"], spullen: ["spul", "doos"], overdracht: ["agenda", "overdracht"], document: ["document", "documenten"],
};
const ouder = { type: "ouder" };
function vanAudit(g) {
    const c = g.soort === "dossier" ? (g.itemId.startsWith("gezondheid-") ? ["gezondheid", "medisch"] : undefined) : auditCat[g.soort];
    if (!c || !magAudit(ouder, g.soort))
        return null;
    const w = g.wijzigingen[0];
    return { key: g.eventId, wanneer: new Date(g.moment), heeftTijd: true, cat: c[0], icoon: c[1], kop: eventKop(g), titel: g.itemNaam, detail: w && g.wijzigingen.length === 1 ? `${w.oud} → ${w.nieuw}` : undefined };
}
function Tijdlijn() {
    const { t } = useTranslation();
    const audit = useAudit();
    const afspraken = useAfspraken();
    const regels = [
        ...audit.map(vanAudit).filter((r) => !!r),
        ...afspraken.flatMap((a) => a.geschiedenis.map((g, n) => {
            const d = g.moment ? new Date(g.moment) : nlDatum(g.datum);
            return d ? { key: `${a.id}-${n}-${g.moment ?? g.datum}`, wanneer: d, heeftTijd: !!g.moment, cat: "afspraken", icoon: "afspraak", kop: g.tekst, titel: a.titel } : null;
        }).filter((r) => !!r)),
    ].sort((a, b) => b.wanneer.getTime() - a.wanneer.getTime());
    const cats = ["alles", ...["afspraken", "agenda", "verdeling", "beslissing", "kosten", "taak", "spul", "document", "gezondheid"].filter((c) => regels.some((r) => r.cat === c))].map((id) => ({ id, label: t(`routes.tijdlijn.cat.${id}`) }));
    const [cat, setCat] = useState("alles");
    const zicht = regels.filter((r) => cat === "alles" || r.cat === cat);
    return (<AppShell>
      <PageHeader titel={t("routes.tijdlijn.titel")} subtitel={t("routes.tijdlijn.subtitel")}/>
      <FilterBalk className="mt-5" opties={cats} waarde={cat} onChange={setCat}/>
      <ol className="mt-4 space-y-3 border-l-2 border-brand-soft pl-4">
        {zicht.map((r) => (<li key={r.key}>
            <Card className="flex items-center gap-3">
              <AppIcon functie={r.icoon} maat="md"/>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{r.titel}</p>
                <p className="text-xs">{r.kop}{r.detail ? ` · ${r.detail}` : ""}</p>
                <p className="text-xs text-ink-soft">
                  {r.wanneer.toLocaleDateString(taalLocale(), { day: "numeric", month: "long", year: "numeric" })}
                  {r.heeftTijd ? ` · ${t("routes.tijdlijn.tijd", { tijd: r.wanneer.toLocaleTimeString(taalLocale(), { hour: "2-digit", minute: "2-digit" }) })}` : ""} · {t(`routes.tijdlijn.cat.${r.cat}`)}
                </p>
              </div>
            </Card>
          </li>))}
        {zicht.length === 0 && <p className="text-sm text-ink-soft">{t("routes.tijdlijn.leeg")}</p>}
      </ol>
    </AppShell>);
}
