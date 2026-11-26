import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useVakanties, verdeelSuggestie, stelVerdelingVoor } from "@/lib/vakantie-store";
export function VerdeelHulp() {
    const { t } = useTranslation();
    const vak = useVakanties();
    const [open, setOpen] = useState(false);
    const { telling, voorstel } = verdeelSuggestie(vak);
    if (!voorstel.length)
        return null;
    return (<div className="rounded-md border border-border bg-card px-4 py-3">
      <button onClick={() => setOpen(!open)} className="w-full text-left">
        <p className="text-sm font-semibold">{t("components.VerdeelHulp.titel")}</p>
        <p className="text-xs text-ink-soft">{t("components.VerdeelHulp.open", { count: voorstel.length })}</p>
      </button>
      {open ? (<div className="mt-3">
          <p className="text-xs text-ink-soft">{t("components.VerdeelHulp.telling", { sanne: telling.Sanne, joris: telling.Joris })}</p>
          <p className="mt-2 text-xs text-ink-soft">{t("components.VerdeelHulp.mogelijkheden")}</p>
          <ul className="mt-2 divide-y divide-border border-y border-border text-sm">
            {voorstel.map((v) => <li key={v.id} className="flex justify-between gap-3 py-2"><span>{v.naam} <span className="text-xs text-ink-soft">· {v.periode}</span></span><span className="font-semibold">{v.ouder}</span></li>)}
          </ul>
          <p className="mt-2 text-[11px] text-ink-soft">{t("components.VerdeelHulp.verandertNiets")}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button onClick={() => setOpen(false)} className="rounded-full border border-border py-2 text-sm font-semibold text-ink-soft">{t("components.VerdeelHulp.nietNu")}</button>
            <button onClick={() => { voorstel.forEach((v) => stelVerdelingVoor(v.id, v.ouder)); setOpen(false); }} className="rounded-full bg-brand py-2 text-sm font-semibold text-primary-foreground">{t("components.VerdeelHulp.alsVoorstel")}</button>
          </div>
        </div>) : null}
    </div>);
}
/** Reishulp: per afgesproken vakantie snelkoppelingen naar bestaande flows (agenda, taak, kosten), vooraf ingevuld. Maakt zelf niets aan. */
export function ReisHulp() {
    const { t } = useTranslation();
    const vak = useVakanties().filter((v) => v.status === "afgesproken" && v.details);
    const [open, setOpen] = useState(null);
    if (!vak.length)
        return null;
    return (<div className="rounded-md border border-border bg-card px-4 py-3">
      <p className="text-sm font-semibold">{t("components.VerdeelHulp.reis.titel")}</p>
      <p className="text-xs text-ink-soft">{t("components.VerdeelHulp.reis.intro")}</p>
      <ul className="mt-2 divide-y divide-border border-y border-border">
        {vak.map((v) => (<li key={v.id} className="py-2">
            <button onClick={() => setOpen(open === v.id ? null : v.id)} className="w-full text-left text-sm">{v.naam} <span className="text-xs text-ink-soft">· {v.periode} · {v.details}</span></button>
            {open === v.id ? (<div className="mt-2 flex flex-wrap gap-2">
                <Link to="/agenda" search={{ nieuw: true, titel: t("components.VerdeelHulp.reis.vertrekTitel", { naam: v.naam }) }} className="inline-flex min-h-9 items-center rounded-full border border-brand/40 px-3.5 text-xs font-semibold text-brand">{t("components.VerdeelHulp.reis.vertrek")}</Link>
                <Link to="/taken" search={{ taak: t("components.VerdeelHulp.reis.paklijstTaak", { naam: v.naam }) }} className="inline-flex min-h-9 items-center rounded-full border border-brand/40 px-3.5 text-xs font-semibold text-brand">{t("components.VerdeelHulp.reis.paklijst")}</Link>
                <Link to="/kosten" search={{ uitgave: t("components.VerdeelHulp.reis.reisUitgave", { naam: v.naam }) }} className="inline-flex min-h-9 items-center rounded-full border border-brand/40 px-3.5 text-xs font-semibold text-brand">{t("components.VerdeelHulp.reis.reiskosten")}</Link>
              </div>) : null}
          </li>))}
      </ul>
      <p className="mt-2 text-[11px] text-ink-soft">{t("components.VerdeelHulp.reis.nietsVanzelf")}</p>
    </div>);
}
