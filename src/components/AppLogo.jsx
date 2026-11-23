import { useTranslation } from "react-i18next";
/**
 * Merk: app-icoon + woordmerk "Ouderschap & Co" in de huisletter.
 * (Het oorspronkelijke logo-bestand stond alleen op de Lovable-assetserver en is lokaal niet beschikbaar.)
 * `formaat`: "groot" voor start/vergrendeling, "klein" voor kopregels.
 */
export function AppLogo({ className = "", slogan = false, formaat = "groot" }) {
    const { t } = useTranslation();
    const groot = formaat === "groot";
    return (<div className={`min-w-0 ${className}`}>
      <div className={`flex items-center justify-center ${groot ? "gap-3" : "gap-2"}`} role="img" aria-label={t("common.appNaam")}>
        <img src="/favicon.png" alt="" width={64} height={64} className={`${groot ? "size-14 rounded-[18px]" : "size-9 rounded-xl"} shrink-0 bg-[#E9EFE3] p-1 shadow-[0_4px_14px_rgba(63,87,71,.18)]`}/>
        <span className={`font-display font-black leading-[1.05] tracking-tight text-[#2F4A3A] dark:text-ink ${groot ? "text-[26px]" : "text-[17px]"}`} aria-hidden="true">
          Ouderschap<br/><span className="text-brand">&amp; Co</span>
        </span>
      </div>
      {slogan ? <p className={`${groot ? "mt-3" : "mt-1.5"} text-center text-xs text-ink-soft`}>{t("components.AppLogo.slogan")}</p> : null}
    </div>);
}
