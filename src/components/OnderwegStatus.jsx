import { useTranslation } from "react-i18next";
import { onderwegVoor, useKring, useOphalen } from "@/lib/kring-store";
/** Rustige, tijdelijke status bij een overdracht. Alleen "onderweg", nooit locatie, route of aankomsttijd. */
export function OnderwegStatus({ momentId }) {
    const { t } = useTranslation();
    useKring();
    const s = useOphalen();
    const o = onderwegVoor(momentId, s);
    if (!o)
        return null;
    const tekst = o.soort === "ik" ? t("components.OnderwegStatus.jij") : o.soort === "ander" ? t("components.OnderwegStatus.andereOuder") : t("components.OnderwegStatus.onderweg", { wie: o.naam });
    return <p role="status" className="mt-2 rounded-md bg-brand-soft px-3 py-2 text-sm font-semibold">{tekst}</p>;
}
