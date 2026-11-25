import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLopendeAanroepen } from "@/lib/api";
/**
 * Laadweergaven in de stijl van de mobiele app (altijd binnen de telefoonkolom, nooit een
 * website-achtig scherm over de hele breedte).
 */
/** Klein draaiend rondje in de huiskleur. */
export function Draaier({ className = "size-7" }) {
    return <span aria-hidden="true" className={`inline-block animate-spin rounded-full border-[3px] border-[color-mix(in_oklab,var(--brand)_20%,transparent)] border-t-brand motion-reduce:[animation-duration:2.4s] ${className}`}/>;
}
/** Volledig scherm terwijl de sessie of het gezin laadt: alleen een draaier, midden in de app-kolom. */
export function AppLaden() {
    const { t } = useTranslation();
    return (<div className="app-canvas min-h-[100dvh]" role="status" aria-live="polite">
      <div className="mx-auto grid min-h-[100dvh] max-w-md place-items-center">
        <Draaier />
        <span className="sr-only">{t("common.laden")}</span>
      </div>
    </div>);
}
/** Placeholder-blokken binnen een pagina (AppShell) zolang de eerste gegevens onderweg zijn. */
export function PaginaSkelet({ kaarten = 3 }) {
    const { t } = useTranslation();
    const blok = "animate-pulse rounded-[22px] bg-[color-mix(in_oklab,var(--foreground)_7%,transparent)] motion-reduce:animate-none";
    return (<div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{t("common.laden")}</span>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2.5 pt-1">
          <div className={`${blok} h-8 w-3/5 rounded-full`}/>
          <div className={`${blok} h-3.5 w-2/5 rounded-full`}/>
        </div>
        <div className={`${blok} size-10 rounded-full`}/>
      </div>
      <div className="mt-7 space-y-3">
        {Array.from({ length: kaarten }, (_, i) => (<div key={i} className={`${blok} ${i === 0 ? "h-32" : "h-20"}`} style={{ animationDelay: `${i * 120}ms` }}/>))}
      </div>
    </div>);
}
/**
 * Dunne laadbalk bovenin de app-kolom zolang er een server-aanroep loopt. Verschijnt pas na 150 ms,
 * zodat snelle aanroepen niet knipperen; achtergrond-verversingen tellen niet mee (api `stil`).
 */
export function Laadbalk() {
    const lopend = useLopendeAanroepen();
    const [zichtbaar, setZichtbaar] = useState(false);
    useEffect(() => {
        if (!lopend) {
            setZichtbaar(false);
            return;
        }
        const t = setTimeout(() => setZichtbaar(true), 150);
        return () => clearTimeout(t);
    }, [lopend > 0]); // eslint-disable-line react-hooks/exhaustive-deps
    return (<div aria-hidden="true" className={`pointer-events-none fixed left-1/2 top-0 z-[60] h-[3px] w-full max-w-md -translate-x-1/2 overflow-hidden transition-opacity duration-300 ${zichtbaar ? "opacity-100" : "opacity-0"}`} style={{ top: "env(safe-area-inset-top, 0px)" }}>
      <div className="laadbalk-schuif h-full w-2/5 rounded-full bg-brand"/>
    </div>);
}
/** Inhoud van een pagina laadt nog: draaier + tekst, midden in de beschikbare ruimte (onder de kop, boven de onderbalk). */
export function InhoudLaden({ hoogte = "min-h-[55dvh]" }) {
    const { t } = useTranslation();
    return (<div className={`flex ${hoogte} flex-col items-center justify-center gap-3`} role="status" aria-live="polite">
      <Draaier />
      <span className="text-sm font-semibold text-ink-soft">{t("common.laden")}</span>
    </div>);
}

/** Eerste keer laden mislukt: rustige melding met "Opnieuw proberen" (in plaats van een leeg scherm). */
export function LaadFout({ onOpnieuw }) {
    const { t } = useTranslation();
    return (<div role="alert" className="mt-6 rounded-[22px] bg-surface p-5 text-center">
      <p className="text-sm text-ink-soft">{t("common.laadFout")}</p>
      {onOpnieuw ? <button onClick={onOpnieuw} className="mt-3 min-h-11 rounded-full bg-brand px-5 text-sm font-semibold text-primary-foreground">{t("common.opnieuwProberen")}</button> : null}
    </div>);
}
/**
 * Laad- of foutweergave voor een serverbron (`bron.useStatus()`): geeft een element terug zolang er
 * nog geen gegevens zijn, anders null (dan toont de pagina zijn eigen inhoud of lege staat).
 */
export function laadWeergave(status, onOpnieuw) {
    if (status === "leeg" || status === "laden")
        return <InhoudLaden />;
    if (status === "fout")
        return <LaadFout onOpnieuw={onOpnieuw}/>;
    return null;
}
