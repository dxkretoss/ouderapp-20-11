import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppIcon } from "@/components/AppIcon";
import { useMomentjes, voegMijlpaalToe } from "@/lib/momentjes-store";
/** Mijlpalen staan in de ene momentjesbron (manage-moments, soort "mijlpaal"): { id, kind, jaar, tekst }. */
export const voegMijlpaal = (m) => voegMijlpaalToe(m);
export const useMijlpalenLijst = () => useMomentjes().mijlpalen;
export function Mijlpalen({ kindId, naam, momentjesPerJaar }) {
    const { t } = useTranslation();
    const alle = useMijlpalenLijst().filter((m) => m.kind === kindId);
    const [tekst, setTekst] = useState("");
    const jaren = [...new Set([...alle.map((m) => m.jaar), ...Object.keys(momentjesPerJaar).map(Number)])].sort((a, b) => b - a);
    return (<section className="mt-6">
      <h2 className="font-display font-bold">{t("components.Mijlpalen.titel", { naam })}</h2>
      <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!tekst.trim())
        return; voegMijlpaal({ kind: kindId, jaar: new Date().getFullYear(), tekst: tekst.trim() }); setTekst(""); }}>
        <input className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder={t("components.Mijlpalen.placeholder")} value={tekst} onChange={(e) => setTekst(e.target.value)}/>
        <button className="rounded-md bg-brand px-3 text-sm font-semibold text-primary-foreground">{t("components.Mijlpalen.bewaar")}</button>
      </form>
      <div className="mt-3 space-y-4">
        {jaren.map((j) => {
            const items = alle.filter((m) => m.jaar === j);
            const mom = momentjesPerJaar[j] ?? 0;
            return (<div key={j}>
              <p className="text-xs font-semibold text-ink-soft">{j} · {t("components.Mijlpalen.aantal", { count: items.length })}{mom ? t("components.Mijlpalen.momentjes", { n: mom }) : ""}</p>
              <ul className="mt-1 space-y-1">
                {items.map((m) => <li key={m.id} className="flex items-start gap-1.5 text-sm"><AppIcon functie="mijlpaal" maat="sm" vorm="kaal" className="mt-0.5"/><span>{m.tekst}</span></li>)}
              </ul>
            </div>);
        })}
      </div>
    </section>);
}
