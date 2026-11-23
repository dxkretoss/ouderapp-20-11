import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { gezagLabels, useGezagState } from "@/lib/gezag-store";
const groepen = [
    { id: "jonger", max: 11 },
    { id: "tussen", max: 15 },
    { id: "vanaf16", max: 200 },
];
/** "Medische beslissingen & gezag" binnen Gezondheid. Toont alleen; bepaalt nooit wie juridisch toestemming mag geven. */
export function MedischGezag({ kindId, naam, leeftijd }) {
    const { t } = useTranslation();
    const { gezag, bevestigd } = useGezagState();
    const g = gezag[kindId] ?? "onbekend";
    return (<div className="space-y-3 border-t border-border pt-3">
      <p className="font-display text-sm font-bold">{t("components.MedischGezag.titel")}</p>
      <div className="rounded-md bg-white/60 px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{t("components.MedischGezag.vastgelegd")}</p>
        <p className="text-sm">{gezagLabels[g]}</p>
        <p className="mt-1 text-[11px] text-ink-soft">{bevestigd[kindId] ? t("components.MedischGezag.ingevuldBevestigd") : t("components.MedischGezag.ingevuldNietBevestigd")}</p>
      </div>
      <div>
        <p className="text-xs font-semibold">{t("components.MedischGezag.wieBeslist")}</p>
        <ul className="mt-1 space-y-1.5">
          {groepen.map((gr, i) => {
            const huidig = leeftijd <= gr.max && (i === 0 || leeftijd > groepen[i - 1].max);
            return <li key={gr.id} className={`rounded-md px-3 py-2 text-xs ${huidig ? "border border-brand/40 bg-card" : "text-ink-soft"}`}><span className="font-semibold">{t(`components.MedischGezag.groep.${gr.id}.titel`)}{huidig ? t("components.MedischGezag.geldtNu", { naam }) : ""}</span><span className="block">{t(`components.MedischGezag.groep.${gr.id}.uitleg`)}</span></li>;
        })}
        </ul>
        <p className="mt-2 text-xs text-ink-soft">{t("components.MedischGezag.hangtAf")}</p>
      </div>
      <Link to="/beslissingen" search={{ soort: "Medisch", kind: kindId }} className="flex min-h-11 items-center justify-center rounded-full border border-brand/40 text-sm font-semibold text-brand">{t("components.MedischGezag.toevoegen")}</Link>
      <p className="text-[11px] text-ink-soft">{t("components.MedischGezag.geenToestemming")}</p>
    </div>);
}
