import { createFileRoute, Navigate } from "@tanstack/react-router";
import i18n from "@/i18n";
import { z } from "zod";
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
/** De zorgregeling staat in de Agenda (ZorgAfstemmen); deze route stuurt oude links daarheen door. */
function ZorgregelingWrap() {
    const zoek = Route.useSearch();
    return <Navigate to="/agenda" replace search={{ zorgActie: zoek.actie === "regeling" ? "regeling" : zoek.actie === "wijziging" ? "wijziging" : undefined, zorgVoorstel: zoek.voorstel, kind: zoek.kind, omschrijving: zoek.omschrijving }}/>;
}
