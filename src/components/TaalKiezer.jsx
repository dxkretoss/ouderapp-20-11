import { useTranslation } from "react-i18next";
import { TALEN, zetTaal } from "@/i18n";
/** Taalkeuze in Instellingen → Weergave. De keuze wordt op het apparaat bewaard (onzeapp-taal). */
export function TaalKiezer() {
    const { t, i18n } = useTranslation();
    const actief = i18n.resolvedLanguage;
    return (<div className="py-3">
      <p className="text-[15px] font-black">{t("components.TaalKiezer.titel")}</p>
      <p className="text-xs leading-snug text-ink-soft">{t("components.TaalKiezer.uitleg")}</p>
      <div className="mt-2 flex gap-1 rounded-full bg-[rgba(226,216,203,.55)] p-1" role="radiogroup" aria-label={t("components.TaalKiezer.titel")}>
        {TALEN.map((taal) => (<button key={taal.id} lang={taal.id} role="radio" aria-checked={actief === taal.id} onClick={() => zetTaal(taal.id)} className={`min-h-9 flex-1 rounded-full text-[13.5px] ${actief === taal.id ? "bg-white font-black text-[#3F5747] shadow-[0_2px_8px_rgba(60,50,40,.08)]" : "font-bold text-ink-soft"}`}>{taal.naam}</button>))}
      </div>
    </div>);
}
