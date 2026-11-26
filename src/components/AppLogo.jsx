import { useTranslation } from "react-i18next";
/**
 * Merk: het logo "Ouderschap & Co" (public/ouderschap-co-logo.png; voor het web verkleind als .webp).
 * `formaat`: "groot" voor start/vergrendeling, "klein" voor kopregels.
 */
export function AppLogo({ className = "", slogan = false, formaat = "groot" }) {
    const { t } = useTranslation();
    const groot = formaat === "groot";
    return (<div className={`min-w-0 ${className}`}>
      <picture>
        <source srcSet="/ouderschap-co-logo.webp" type="image/webp"/>
        <img src="/ouderschap-co-logo.png" alt={t("common.appNaam")} width={1507} height={468} decoding="async" className={`mx-auto h-auto object-contain ${groot ? "w-full max-w-[260px]" : "w-auto max-h-8"} dark:brightness-[1.6] dark:saturate-[.8]`}/>
      </picture>
      {slogan ? <p className={`${groot ? "mt-3" : "mt-1.5"} text-center text-xs text-ink-soft`}>{t("components.AppLogo.slogan")}</p> : null}
    </div>);
}
/** Alleen het app-icoon (public/favicon.png), voor kleine plekken zoals de kopregel op Home. */
export function AppIcoonMerk({ className = "" }) {
    const { t } = useTranslation();
    return <img src="/favicon.png" alt={t("common.appNaam")} width={64} height={64} className={`size-11 shrink-0 object-contain ${className}`}/>;
}
