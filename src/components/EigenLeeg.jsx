import { AppShell, BackButton } from "@/components/AppShell";
import { Assistent } from "@/components/Assistent";
import { useTranslation } from "react-i18next";
import { AppIcon } from "@/components/AppIcon";
/**
 * Lege weergave voor een eigen gezin: de pagina begint leeg in plaats van met
 * het voorbeeldgezin, met uitleg en één duidelijke eerste stap.
 * Met toevoegLabel/onToevoeg komt er een primaire toevoegknop én een plusje rechtsboven.
 */
export function EigenLeeg({ titel, icoon, tekst, knop, onKnop, extra, toevoegLabel, onToevoeg, }) {
    const { t } = useTranslation();
    return (<AppShell>
      <div className="flex items-start gap-3">
        <BackButton terug="/"/>
        <h1 className="lora flex-1 text-[32px] leading-tight">{titel}</h1>
        {onToevoeg ? (<button aria-label={toevoegLabel ?? t("common.toevoegen")} onClick={onToevoeg} className="inline-flex size-11 items-center justify-center rounded-full text-xl font-semibold text-brand hover:bg-muted">
            +
          </button>) : null}
        <div className="mt-1"><Assistent pagina={titel}/></div>
      </div>
      <div className="mt-10 flex flex-col items-center text-center">
        <AppIcon functie={icoon} maat="lg" className="size-16 rounded-2xl"/>
        <p className="mt-4 font-display text-lg font-bold">{t("components.EigenLeeg.rustig")}</p>
        <p className="mt-1 max-w-xs text-sm text-ink-soft">{tekst}</p>
        {/* Acties als één nette kolom met gelijke breedte: hoofdactie bovenaan, de rest eronder. */}
        <div className="mt-6 flex w-full max-w-xs flex-col gap-2.5">
          {onToevoeg ? (<button onClick={onToevoeg} className="min-h-12 w-full rounded-full bg-brand px-5 text-sm font-semibold text-primary-foreground">
              {toevoegLabel ?? t("common.toevoegen")}
            </button>) : null}
          <button onClick={onKnop} className={onToevoeg ? "min-h-11 w-full rounded-full border border-border bg-card px-5 text-sm font-semibold text-ink-soft" : "min-h-12 w-full rounded-full bg-brand px-5 text-sm font-semibold text-primary-foreground"}>
            {knop}
          </button>
          {extra}
        </div>
      </div>
    </AppShell>);
}
