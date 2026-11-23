import { tLijst } from "@/i18n";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { kinderen, parents } from "@/lib/demo-data";
import { AppIcon } from "@/components/AppIcon";
import { Annoyed, Frown, Laugh, Meh, Smile } from "lucide-react";
import { isOverdrachtsdag, markeerCheckinGetoond, setCheckinAan, useCheckin } from "@/lib/checkin-store";
/** Vijf gezichtjes, van verdrietig tot heel goed: vaste id + lucide-icoon. */
const gevoel = [
    { id: "verdrietig", icoon: Frown },
    { id: "nietGoed", icoon: Annoyed },
    { id: "gaatWel", icoon: Meh },
    { id: "goed", icoon: Smile },
    { id: "heelGoed", icoon: Laugh },
];
function Keuzes({ opties, waarde, onKies }) {
    return (<div className="mt-1.5 flex flex-wrap gap-1.5">
      {opties.map((o) => (<button key={o} onClick={() => onKies(o)} className={`min-h-10 rounded-full border px-3 py-1.5 text-xs font-semibold ${waarde === o ? "border-brand bg-brand text-primary-foreground" : "border-border bg-white/70"}`}>
          {o}
        </button>))}
    </div>);
}
export function DagCheckin() {
    const { t } = useTranslation();
    const { aan, getoond, voorbeeld } = useCheckin();
    const [antw, setAntw] = useState({});
    const [verstuurd, setVerstuurd] = useState(false);
    if (!voorbeeld && (!aan || getoond || !isOverdrachtsdag()))
        return null;
    const zet = (id, p) => setAntw((a) => ({ ...a, [id]: { ...a[id], ...p } }));
    const sluit = () => markeerCheckinGetoond();
    return (<div className="app-modal-achter z-40" onClick={sluit}>
      <div className="app-modal" onClick={(e) => e.stopPropagation()}>
        {verstuurd ? (<div className="py-6 text-center">
            <AppIcon functie="momentjes" maat="lg" className="mx-auto"/>
            <p className="mt-2 font-display text-lg font-bold">{t("components.DagCheckin.gedeeldMet", { naam: parents.joris.naam })}</p>
            <p className="mt-1 text-sm text-ink-soft">{t("components.DagCheckin.fijn")}</p>
            <button onClick={sluit} className="mt-5 w-full rounded-md bg-brand py-3 text-sm font-semibold text-primary-foreground">
              {t("components.DagCheckin.naarOverzicht")}
            </button>
          </div>) : (<>
            <p className="text-xs font-semibold tracking-wider text-brand uppercase">{t("components.DagCheckin.kop")}</p>
            <p className="mt-1 font-display text-lg font-bold">{t("components.DagCheckin.vraag")}</p>
            <p className="mt-1 text-xs text-ink-soft">{t("components.DagCheckin.optioneel", { naam: parents.joris.naam })}</p>
            <div className="mt-4 space-y-3">
              {kinderen.map((k) => (<div key={k.id} className="rounded-md border border-border bg-white/60 p-3">
                  <div className="flex items-center gap-2">
                    <img src={k.avatar} alt={k.naam} className="size-8 rounded-full object-cover"/>
                    <p className="font-semibold">{k.naam}</p>
                  </div>
                  <p className="mt-3 text-xs text-ink-soft">{t("components.DagCheckin.voelt", { naam: k.naam })}</p>
                  <div className="mt-1.5 flex justify-between">
                    {gevoel.map(({ id: g, icoon: Gezicht }) => (<button key={g} onClick={() => zet(k.id, { gevoel: g })} aria-label={t(`components.DagCheckin.gevoelLabel.${g}`)} aria-pressed={antw[k.id]?.gevoel === g} className={`grid size-11 place-items-center rounded-full text-[var(--ic-honing)] transition ${antw[k.id]?.gevoel === g ? "scale-110 bg-brand-soft ring-2 ring-brand" : "bg-white/70"}`}>
                        <Gezicht aria-hidden="true" strokeWidth={1.75} className="size-6"/>
                      </button>))}
                  </div>
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-soft"><AppIcon functie="slapen" maat="sm" vorm="kaal"/>{t("components.DagCheckin.geslapen")}</p>
                  <Keuzes opties={tLijst("components.DagCheckin.slaapOpties")} waarde={antw[k.id]?.slaap} onKies={(v) => zet(k.id, { slaap: v })}/>
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-soft"><AppIcon functie="eten" maat="sm" vorm="kaal"/>{t("components.DagCheckin.gegeten")}</p>
                  <Keuzes opties={tLijst("components.DagCheckin.etenOpties")} waarde={antw[k.id]?.eten} onKies={(v) => zet(k.id, { eten: v })}/>
                </div>))}
            </div>
            <button disabled={Object.keys(antw).length === 0} onClick={() => setVerstuurd(true)} className="mt-4 w-full rounded-md bg-brand py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40">
              {t("components.DagCheckin.delenMet", { naam: parents.joris.naam })}
            </button>
            <div className="mt-2 flex justify-between text-xs font-semibold text-ink-soft">
              <button onClick={sluit} className="min-h-10 py-2">{t("components.DagCheckin.nuNiet")}</button>
              <button onClick={() => { setCheckinAan(false); sluit(); }} className="min-h-10 py-2">{t("components.DagCheckin.nietMeer")}</button>
            </div>
          </>)}
      </div>
    </div>);
}
