import { createFileRoute, Navigate } from "@tanstack/react-router";
import i18n from "@/i18n";
import { z } from "zod";
export const Route = createFileRoute("/wissel")({
    validateSearch: z.object({ actie: z.enum(["ruil", "nachtje"]).optional(), bron: z.string().optional() }),
    head: () => ({
        meta: [
            { title: i18n.t("routes.wissel.meta.titel") },
            { name: "description", content: i18n.t("routes.wissel.meta.beschrijving") },
            { property: "og:title", content: i18n.t("routes.wissel.meta.titel") },
            { property: "og:description", content: i18n.t("routes.wissel.meta.ogBeschrijving") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: Wissel,
});
/**
 * De oude wisselassistent draaide op voorbeelddata en had geen ingang meer. Een eigen gezin regelt de wissel
 * op Overdracht (paklijst, overdracht, terugblik) en ruilen/extra nacht via een zorgvoorstel in de Agenda.
 */
function Wissel() {
    const { actie } = Route.useSearch();
    return actie ? <Navigate to="/agenda" replace search={{ zorgActie: "wijziging" }}/> : <Navigate to="/overdracht" replace/>;
}
