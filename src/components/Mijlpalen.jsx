import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppIcon } from "@/components/AppIcon";
import { Kruis } from "@/components/Tekens";
import { DeelLabel, DelenKeuze, VerwijderDialoog } from "@/components/DelenKeuze";
import { useGezin } from "@/lib/gezin";
import { bevestig } from "@/lib/feedback";
import { useMomentjes, verwijderMomentje, voegMijlpaalToe } from "@/lib/momentjes-store";
/**
 * Mijlpalen staan in de ene momentjesbron (manage-moments, soort "mijlpaal"): { id, kind, jaar, tekst, gedeeld }.
 * Nieuw = standaard "Alleen jij"; bij een Samen-kind kan de ouder kiezen om te delen.
 */
export const voegMijlpaal = (m) => voegMijlpaalToe(m);
export const useMijlpalenLijst = () => useMomentjes().mijlpalen;
export function Mijlpalen({ kindId, naam, momentjesPerJaar }) {
    const { t } = useTranslation();
    const g = useGezin();
    const alle = useMijlpalenLijst().filter((m) => m.kind === kindId);
    const [tekst, setTekst] = useState("");
    const [gedeeld, setGedeeld] = useState(false);
    const [bezig, setBezig] = useState(false);
    const [weg, setWeg] = useState(null);
    const samen = g.isSamen(kindId);
    const jaren = [...new Set([...alle.map((m) => m.jaar), ...Object.keys(momentjesPerJaar).map(Number)])].sort((a, b) => b - a);
    const bewaar = async (e) => {
        e.preventDefault();
        if (!tekst.trim() || bezig)
            return;
        setBezig(true);
        const gelukt = await voegMijlpaal({ kind: kindId, jaar: new Date().getFullYear(), tekst: tekst.trim(), gedeeld: samen && gedeeld });
        setBezig(false);
        if (gelukt) {
            setTekst("");
            bevestig(t("components.Mijlpalen.opgeslagen"));
        }
    };
    const verwijder = async () => {
        const m = weg;
        setWeg(null);
        if (m && await verwijderMomentje(m.id))
            bevestig(t("components.Mijlpalen.verwijderd"));
    };
    return (<section className="mt-6">
      <h2 className="font-display font-bold">{t("components.Mijlpalen.titel", { naam })}</h2>
      <form className="mt-2 flex gap-2" onSubmit={bewaar}>
        <input className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm" maxLength={2000} placeholder={t("components.Mijlpalen.placeholder")} value={tekst} onChange={(e) => setTekst(e.target.value)}/>
        <button disabled={!tekst.trim() || bezig} className="rounded-md bg-brand px-3 text-sm font-semibold text-primary-foreground disabled:opacity-40">{t("components.Mijlpalen.bewaar")}</button>
      </form>
      {tekst.trim() ? <DelenKeuze className="mt-2" kindIds={[kindId]} gedeeld={gedeeld} onGedeeld={setGedeeld}/> : null}
      <div className="mt-3 space-y-4">
        {jaren.map((j) => {
            const items = alle.filter((m) => m.jaar === j);
            const mom = momentjesPerJaar[j] ?? 0;
            return (<div key={j}>
              <p className="text-xs font-semibold text-ink-soft">{j} · {t("components.Mijlpalen.aantal", { count: items.length })}{mom ? t("components.Mijlpalen.momentjes", { n: mom }) : ""}</p>
              <ul className="mt-1 space-y-1">
                {items.map((m) => (<li key={m.id} className="flex items-start gap-1.5 text-sm">
                    <AppIcon functie="mijlpaal" maat="sm" vorm="kaal" className="mt-0.5"/>
                    <span className="min-w-0 flex-1">{m.tekst}{samen ? <DeelLabel gedeeld={!m.vanMij || m.gedeeld} className="ml-1.5 align-middle"/> : null}</span>
                    {m.vanMij ? <button onClick={() => setWeg(m)} aria-label={t("components.Mijlpalen.verwijderLabel", { tekst: m.tekst })} className="-my-2 grid size-10 shrink-0 place-items-center text-ink-soft"><Kruis className="size-4"/></button> : null}
                  </li>))}
              </ul>
            </div>);
        })}
      </div>
      <VerwijderDialoog open={!!weg} onOpenChange={(o) => !o && setWeg(null)} titel={t("components.Mijlpalen.verwijderTitel")} onBevestig={verwijder}/>
    </section>);
}
