import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { taalLocale } from "@/i18n";
import { AppIcon } from "@/components/AppIcon";
import { MetVinkje } from "@/components/Tekens";
import { voegMeldingToe } from "@/lib/gesprekken-store";
export function HulpKaart() {
    const { t } = useTranslation();
    return (<div className="space-y-1 rounded-md bg-accent-warm/25 p-3 text-sm">
      <p className="font-semibold">{t("components.Onveilig.hulpNodig")}</p>
      <p><span className="inline-flex items-center gap-1.5 align-middle"><AppIcon functie="nood" maat="sm" vorm="kaal"/>{t("components.Onveilig.directGevaar")}</span>: <a href="tel:112" className="font-semibold underline">{t("components.Onveilig.bel112")}</a></p>
      <p><span className="inline-flex items-center gap-1.5 align-middle"><AppIcon functie="home" maat="sm" vorm="kaal"/>{t("components.Onveilig.veiligThuis")}</span>{t("components.Onveilig.veiligThuisUitleg")} <a href="tel:08002000" className="font-semibold underline">0800-2000</a></p>
      <p className="text-xs text-ink-soft">{t("components.Onveilig.logboekDelen")}</p>
    </div>);
}
export function OnveiligKnop({ gesprek, klein }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [notitie, setNotitie] = useState("");
    const [klaar, setKlaar] = useState(false);
    const nu = new Date();
    const opslaan = () => {
        voegMeldingToe({ id: Date.now(), datum: new Date(2026, 2, 12).toLocaleDateString(taalLocale(), { day: "numeric", month: "long" }), tijd: nu.toTimeString().slice(0, 5), ...(gesprek ? { gesprek } : {}), notitie: notitie.trim() });
        setKlaar(true);
        setNotitie("");
    };
    if (!open)
        return (<button onClick={() => { setOpen(true); setKlaar(false); }} className={`rounded-full border border-border ${klein ? "px-4 py-2.5 text-sm" : "w-full py-3 text-sm"} font-semibold`}>
      {t("components.Onveilig.knop")}
    </button>);
    return (<div className="space-y-3 rounded-md border border-border bg-card p-4 text-left">
      {klaar ? (<>
          <p className="font-semibold"><MetVinkje>{t("components.Onveilig.vastgelegd")}</MetVinkje></p>
          <p className="text-sm text-ink-soft">{t("components.Onveilig.alleenJij")}</p>
        </>) : (<>
          <p className="font-semibold">{t("components.Onveilig.vraag")}</p>
          <p className="text-xs"><Trans i18nKey="components.Onveilig.wieZiet" components={{ b: <b /> }}/></p>
          <p className="text-xs text-ink-soft">{t("components.Onveilig.uitleg")}</p>
          <textarea value={notitie} onChange={(e) => setNotitie(e.target.value)} rows={3} placeholder={t("components.Onveilig.placeholder")} className="w-full rounded-md border border-border bg-card p-3 text-sm"/>
          <div className="flex gap-2">
            <button onClick={opslaan} className="flex-1 rounded-full bg-brand py-2 text-sm font-semibold text-primary-foreground">{t("components.Onveilig.vastleggen")}</button>
            <button onClick={() => setOpen(false)} className="rounded-full border border-border px-4 py-2 text-sm font-semibold">{t("common.annuleren")}</button>
          </div>
        </>)}
      <HulpKaart />
      {klaar && <button onClick={() => setOpen(false)} className="text-sm font-semibold text-brand">{t("common.sluiten")}</button>}
    </div>);
}
