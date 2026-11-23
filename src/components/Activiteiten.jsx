import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useZorg } from "@/lib/zorg-store";
import { useAfspraken } from "@/lib/afspraken-store";
import { useBudgetten } from "@/lib/budget-store";
import { useVakanties } from "@/lib/vakantie-store";
import { useStart } from "@/lib/start-store";
import { useAudit } from "@/lib/audit-store";
import { useMomentjes } from "@/lib/momentjes-store";
import { useVoorkeuren } from "@/lib/voorkeuren-store";
import { verzamelVoorstellen } from "@/lib/openstaande-voorstellen";
import { heeftNieuws, verzamelActiviteiten } from "@/lib/activiteiten";
import { AppIcon } from "@/components/AppIcon";
import { demoUrenTotWissel, overdrachtHerinnering, useOverdracht } from "@/lib/overdracht-store";
import { zorgweek } from "@/lib/demo-data";
import { evaluatieNodig, leesEvaluaties } from "@/lib/evaluatie-store";
const vandaagIso = () => new Date().toISOString().slice(0, 10);
/** Eén hook die activiteiten afleidt uit de bestaande bronnen; eigen gezin toont geen demo-bronnen. */
export function useActiviteiten() {
    const { t } = useTranslation();
    const zorg = useZorg();
    const afspraken = useAfspraken();
    const budgetten = useBudgetten();
    const vakanties = useVakanties();
    const audit = useAudit();
    const m = useMomentjes();
    const st = useStart();
    const vk = useVoorkeuren();
    const voorstellen = st.eigen ? [] : verzamelVoorstellen({ zorg: zorg.voorstellen, afspraken, budgetten, vakanties }, vandaagIso());
    const od = useOverdracht();
    const basis = verzamelActiviteiten({ ik: "sanne", voorstellen, audit, momentjes: st.eigen ? [] : m.lijst });
    // Herinnering 24 uur vóór de wissel om de overdracht in te vullen (alleen zolang hij niet gedeeld is).
    const uren = demoUrenTotWissel(zorgweek.find((d) => d.wissel)?.datum);
    const herinnering = !st.eigen && overdrachtHerinnering(uren, od.gedeeld.some((o) => o.momentId === "w1"))
        ? [{ id: "overdracht-w1", categorie: "regelen", icoon: "documenten", titel: t("components.Activiteiten.overdracht.titel"), uitleg: t("components.Activiteiten.overdracht.uitleg"), volgorde: Number.MAX_SAFE_INTEGER, tijd: t("components.Activiteiten.nu"), naar: "/overdracht", verzoek: true }]
        : [];
    const evaluatie = typeof window !== "undefined" && evaluatieNodig(leesEvaluaties())
        ? [{ id: "evaluatie", categorie: "regelen", icoon: "rust", titel: t("components.Activiteiten.evaluatie.titel"), uitleg: t("components.Activiteiten.evaluatie.uitleg"), volgorde: Number.MAX_SAFE_INTEGER - 1, tijd: t("components.Activiteiten.nu"), naar: "/evaluatie", verzoek: false }]
        : [];
    const lijst = [...herinnering, ...evaluatie, ...basis];
    return { lijst, voorstellen, gelezen: vk.activiteitGelezen ?? [] };
}
/** Subtiel belletje op Home: alleen een bolletje bij iets nieuws, nooit een teller. */
export function ActiviteitenBel({ inBalk = false } = {}) {
    const { t } = useTranslation();
    const { lijst, gelezen } = useActiviteiten();
    const nieuws = heeftNieuws(lijst, gelezen);
    return (<Link to="/activiteiten" aria-label={nieuws ? t("components.Activiteiten.belNieuws") : t("components.Activiteiten.bel")} className={`relative grid place-items-center rounded-full ${inBalk ? "size-[38px]" : "size-11"}`}>
      {inBalk ? <AppIcon functie="melding" maat="sm" vorm="kaal"/> : <span className="grid size-11 place-items-center rounded-full border border-white/85 bg-white/80 shadow-[0_4px_14px_rgba(60,50,40,.08)]"><AppIcon functie="melding" maat="sm" vorm="kaal"/></span>}
      {nieuws ? <span aria-hidden="true" className={`absolute size-2.5 rounded-full bg-brand ring-2 ring-white ${inBalk ? "right-1.5 top-1.5" : "right-2 top-2"}`}/> : null}
    </Link>);
}
