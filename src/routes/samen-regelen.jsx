import { createFileRoute, Navigate } from "@tanstack/react-router";
import { z } from "zod";
import i18n from "@/i18n";
export const Route = createFileRoute("/samen-regelen")({
    head: () => ({
        meta: [
            { title: i18n.t("common.metaTitel", { titel: i18n.t("routes.samenRegelen.meta.titel") }) },
            { name: "description", content: i18n.t("routes.samenRegelen.meta.beschrijving") },
            { property: "og:title", content: i18n.t("common.metaTitel", { titel: i18n.t("routes.samenRegelen.meta.titel") }) },
            { property: "og:description", content: i18n.t("routes.samenRegelen.meta.ogBeschrijving") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    validateSearch: z.object({ voor: z.string().optional() }),
    component: SamenRegelenVerwijzing,
});
function SamenRegelenVerwijzing() {
    return <Navigate to="/activiteiten" search={{ onderdeel: "regelen" }} replace/>;
}
