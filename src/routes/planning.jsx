import { AgendaVakanties } from "@/components/AgendaVakanties";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { z } from "zod";
import { AppShell, PageHeader } from "@/components/AppShell";
export const Route = createFileRoute("/planning")({
    validateSearch: z.object({ eerder: z.boolean().optional(), toevoegen: z.enum(["vakantie", "verdelen", "bijzonder", "periode"]).optional(), periode: z.string().optional() }),
    head: () => ({
        meta: [
            { title: i18n.t("routes.planning.meta.titel") },
            { name: "description", content: i18n.t("routes.planning.meta.beschrijving") },
            { property: "og:title", content: i18n.t("routes.planning.meta.ogTitel") },
            { property: "og:description", content: i18n.t("routes.planning.meta.ogBeschrijving") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: PlanningInAgenda,
});
function PlanningInAgenda() {
    const zoek = Route.useSearch();
    if (!zoek.eerder)
        return <Navigate to="/agenda" replace search={{ onderdeel: "vakanties", vakantieNieuw: zoek.toevoegen === "bijzonder" ? "bijzonder" : zoek.toevoegen ? "vakantie" : undefined }}/>;
    return <EerderePlanning />;
}
/** Vakanties van het eigen gezin (de oude planningsonderdelen op voorbeelddata zijn verwijderd). */
function EerderePlanning() {
    const { t } = useTranslation();
    const zoek = Route.useSearch();
    return <AppShell><PageHeader titel={t("routes.planning.titel")} terug="/agenda"/><AgendaVakanties toevoegen={zoek.toevoegen === "bijzonder" ? "bijzonder" : zoek.toevoegen ? "vakantie" : undefined}/></AppShell>;
}
