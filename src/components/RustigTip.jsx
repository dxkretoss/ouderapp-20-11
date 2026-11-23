import { useTranslation } from "react-i18next";
import { useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { Button } from "@/components/ui/button";
import { kiesReminder } from "@/lib/afstemming";
import { useVoorkeuren } from "@/lib/voorkeuren-store";
/** Eén korte, sluitbare kindgerichte tip — alleen als Rustig regelen aan staat. */
export function RustigTip({ moment, veiligheid = false }) {
    const { t } = useTranslation();
    const aan = useVoorkeuren().gestructureerdAfstemmen;
    const [gesloten, setGesloten] = useState([]);
    const r = kiesReminder(moment, { aan, veiligheid, gesloten });
    if (!r)
        return null;
    return <div className="flex items-center gap-2 text-xs text-ink-soft"><AppIcon functie="slim" maat="sm" vorm="kaal"/><span className="flex-1">{r.tekst}</span><Button variant="ghost" size="icon" aria-label={t("components.RustigTip.sluiten")} className="size-11" onClick={() => setGesloten([...gesloten, r.moment])}><AppIcon functie="niet" maat="sm" vorm="kaal"/></Button></div>;
}
/** Zichtbare knopteksten: in Rustig regelen overal dezelfde drie keuzes. */
export function useKeuzeTeksten() {
    const { t } = useTranslation();
    const aan = useVoorkeuren().gestructureerdAfstemmen;
    return aan ? { akkoord: t("common.akkoord"), ander: t("common.anderVoorstel"), niet: t("common.nietAkkoord") } : { akkoord: t("common.akkoord"), ander: t("components.RustigTip.anderVoorstelDoen"), niet: t("components.RustigTip.afwijzen") };
}
