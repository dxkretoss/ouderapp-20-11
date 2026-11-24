import { AppIcon } from "@/components/AppIcon";
import { useTranslation } from "react-i18next";
import { useGezin } from "@/lib/gezin";
/**
 * Eén vaste regel die zegt wie iets ziet, zodat niemand hoeft te twijfelen.
 * "samen": de andere ouder ziet het ook. "jij": alleen voor jou.
 * Zonder gekoppelde andere ouder: "ziet dit ook zodra jullie gekoppeld zijn".
 */
export function Zichtbaar({ voor, ander, eigen, className = "" }) {
    const { t } = useTranslation();
    const g = useGezin();
    if (eigen === undefined)
        eigen = !g.ander;
    if (!ander)
        ander = t("common.deAndereOuder");
    const tekst = voor === "jij"
        ? t("components.Zichtbaar.alleenJou")
        : eigen ? t("components.Zichtbaar.eigen") : t("components.Zichtbaar.ziet", { naam: ander }).replace(/^./, (c) => c.toUpperCase());
    return (<p className={`flex items-center gap-1.5 px-1 text-[12.5px] font-semibold text-ink-soft ${className}`}>
      <AppIcon functie={voor === "jij" ? "slot" : "oog"} maat="sm" vorm="kaal"/>{tekst}
    </p>);
}
