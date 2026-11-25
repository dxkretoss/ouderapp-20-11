import { useTranslation } from "react-i18next";
import { AppIcon } from "@/components/AppIcon";
/**
 * "Alleen jij" / "Gedeeld" voor kosten, vaste lasten en spaarpotjes (klantregel: nieuw is altijd privé,
 * delen is een bewuste keuze). `kan` false: delen kan niet (Solo-kind, geen andere ouder); dan alleen
 * het label "Alleen jij" met een korte reden.
 */
export function DeelKeuze({ gedeeld, onChange, kan = true, className = "" }) {
    const { t } = useTranslation();
    const knop = (aan) => `flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full text-sm font-black ${aan ? "bg-white text-[#3F5747] shadow-[0_2px_8px_rgba(60,50,40,.08)]" : "font-bold text-ink-soft"}`;
    if (!kan)
        return (<div className={className}>
      <DeelLabel gedeeld={false}/>
      <p className="mt-1 text-[11px] text-ink-soft">{t("components.DeelKeuze.kanNiet")}</p>
    </div>);
    return (<div className={className}>
      <div role="radiogroup" aria-label={t("components.DeelKeuze.label")} className="flex rounded-full bg-[rgba(226,216,203,.55)] p-1">
        <button type="button" role="radio" aria-checked={!gedeeld} onClick={() => onChange(false)} className={knop(!gedeeld)}><AppIcon functie="slot" maat="sm" vorm="kaal"/>{t("components.DeelKeuze.alleenJij")}</button>
        <button type="button" role="radio" aria-checked={!!gedeeld} onClick={() => onChange(true)} className={knop(!!gedeeld)}><AppIcon functie="oog" maat="sm" vorm="kaal"/>{t("components.DeelKeuze.gedeeld")}</button>
      </div>
      <p className="mt-1 px-1 text-[11px] text-ink-soft">{gedeeld ? t("components.DeelKeuze.gedeeldUitleg") : t("components.DeelKeuze.alleenJijUitleg")}</p>
    </div>);
}
/** Klein label op een item: "Alleen jij" of "Gedeeld". */
export function DeelLabel({ gedeeld, className = "" }) {
    const { t } = useTranslation();
    return (<span className={`inline-flex h-6 items-center gap-1 rounded-full px-2 text-[12px] font-extrabold ${gedeeld ? "bg-[#E9EFE3] text-[#3F5747]" : "bg-[rgba(226,216,203,.7)] text-[#5C5650]"} ${className}`}>
      <AppIcon functie={gedeeld ? "oog" : "slot"} maat="sm" vorm="kaal"/>{gedeeld ? t("components.DeelKeuze.gedeeld") : t("components.DeelKeuze.alleenJij")}
    </span>);
}
