import { useTranslation } from "react-i18next";
/** Uitleg zonder toegang te verlenen, gegevens te lezen of AI aan te roepen. */
export function CoPrivacy() {
    const { t } = useTranslation();
    return <details className="mt-4 border-y border-border py-2 text-sm">
    <summary className="flex min-h-11 cursor-pointer items-center font-semibold">{t("components.CoPrivacy.titel")}</summary>
    <div className="space-y-2 pb-3 text-ink-soft">
      <p>{t("components.CoPrivacy.p1")}</p>
      <p>{t("components.CoPrivacy.p2")}</p>
      <p>{t("components.CoPrivacy.p3")}</p>
      <p>{t("components.CoPrivacy.p4")}</p>
    </div>
  </details>;
}
