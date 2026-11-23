import { AppIcon } from "@/components/AppIcon";
import { useTranslation } from "react-i18next";
/**
 * Eén vaste regel die zegt wie iets ziet, zodat niemand hoeft te twijfelen.
 * "samen": de andere ouder ziet het ook. "jij": alleen voor jou.
 */
export function Zichtbaar({ voor, ander = "Joris", eigen = false, className = "" }) {
    const { t } = useTranslation();
    const tekst = voor === "jij"
        ? t("components.Zichtbaar.alleenJou")
        : eigen ? t("components.Zichtbaar.eigen") : t("components.Zichtbaar.ziet", { naam: ander });
    return (<p className={`flex items-center gap-1.5 px-1 text-[12.5px] font-semibold text-ink-soft ${className}`}>
      <AppIcon functie={voor === "jij" ? "slot" : "oog"} maat="sm" vorm="kaal"/>{tekst}
    </p>);
}
