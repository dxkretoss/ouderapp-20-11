import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useZorg } from "@/lib/zorg-store";
import { useAfspraken, useBesluiten } from "@/lib/afspraken-store";
import { useBudgetten } from "@/lib/budget-store";
import { useVakanties } from "@/lib/vakantie-store";
import { useKosten } from "@/lib/kosten-store";
import { useAanwezigheid } from "@/lib/aanwezigheid-store";
import { useAgenda } from "@/lib/agenda-store";
import { useAudit } from "@/lib/audit-store";
import { useMomentjes } from "@/lib/momentjes-store";
import { useTaken } from "@/lib/taken-store";
import { useMeldingen } from "@/lib/meldingen-store";
import { useGezin } from "@/lib/gezin";
import { verzamelVoorstellen } from "@/lib/openstaande-voorstellen";
import { heeftNieuws, verzamelActiviteiten } from "@/lib/activiteiten";
import { AppIcon } from "@/components/AppIcon";
import { evaluatieNodig, useEvaluaties } from "@/lib/evaluatie-store";
const vandaagIso = () => new Date().toISOString().slice(0, 10);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * Eén hook die activiteiten afleidt uit de bestaande bronnen (alleen lezen): open voorstellen uit de bronnen van alle
 * domeinen, gebeurtenissen van de ander (server-audit), gedeelde momentjes, servermeldingen als de ander iets deed,
 * plus wat op jouw antwoord wacht in taken en beslissingen. Alleen leesmarkeringen worden (per gebruiker, op de server) bewaard.
 * Voorstellen zonder server-id (oude voorbeeldbronnen) tellen nooit mee — zo verschijnt er nooit voorbeelddata als echt.
 */
export function useActiviteiten() {
    const { t } = useTranslation();
    const zorg = useZorg();
    const afspraken = useAfspraken();
    const budgetten = useBudgetten();
    const vakanties = useVakanties();
    const kosten = useKosten();
    const aanwezigheid = useAanwezigheid();
    const agenda = useAgenda();
    const audit = useAudit();
    const m = useMomentjes();
    const { taken } = useTaken();
    const besluiten = useBesluiten();
    const { meldingen, gelezen } = useMeldingen();
    const evaluaties = useEvaluaties();
    const g = useGezin();
    const ik = g.ik?.id ?? "";
    const voorstellen = verzamelVoorstellen({ zorg: zorg.voorstellen ?? [], afspraken, budgetten: budgetten ?? [], vakanties: vakanties ?? [], kosten: kosten ?? [], aanwezigheid: aanwezigheid ?? [], agenda }, vandaagIso())
        .filter((v) => UUID.test(String(v.bronId)));
    const basis = verzamelActiviteiten({ ik, voorstellen, audit, momentjes: m.lijst, meldingen, anderNaam: g.ander?.naam || t("common.deAndereOuder") });
    // Wacht op jouw antwoord in taken en beslissingen (bron = taken/beslissingen zelf; verdwijnt zodra het geregeld is).
    const taakVerzoeken = taken.filter((x) => x.overdragenAan && x.overdragenAan === ik && !x.klaar)
        .map((x) => ({ id: `taak-verzoek-${x.id}`, categorie: "regelen", icoon: "taken", titel: t("components.Activiteiten.taakVerzoek.titel"), uitleg: x.tekst, volgorde: Number.MAX_SAFE_INTEGER - 2, tijd: t("components.Activiteiten.nu"), naar: `/taken#item-${x.id}`, verzoek: true }));
    const besluitVerzoeken = besluiten.filter((b) => b.decision_mode === "goedkeuring" && b.created_by !== ik && !b.responses?.[ik] && b.status === "pending")
        .map((b) => ({ id: `besluit-verzoek-${b.id}`, categorie: "regelen", icoon: "beslissing", titel: t("components.Activiteiten.besluitVerzoek.titel"), uitleg: b.title, volgorde: Number.MAX_SAFE_INTEGER - 3, tijd: t("components.Activiteiten.nu"), naar: `/beslissingen#item-${b.id}`, verzoek: true }));
    const evaluatie = evaluatieNodig(evaluaties)
        ? [{ id: "evaluatie", categorie: "regelen", icoon: "rust", titel: t("components.Activiteiten.evaluatie.titel"), uitleg: t("components.Activiteiten.evaluatie.uitleg"), volgorde: Number.MAX_SAFE_INTEGER - 1, tijd: t("components.Activiteiten.nu"), naar: "/evaluatie", verzoek: false }]
        : [];
    const lijst = [...taakVerzoeken, ...besluitVerzoeken, ...evaluatie, ...basis];
    return { lijst, voorstellen, gelezen };
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
