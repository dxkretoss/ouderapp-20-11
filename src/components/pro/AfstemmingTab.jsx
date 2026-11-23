import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useZorg } from "@/lib/zorg-store";
import { useAfspraken } from "@/lib/afspraken-store";
import { useBudgetten } from "@/lib/budget-store";
import { useVakanties } from "@/lib/vakantie-store";
import { statusTekst, telling, verzamelVoorstellen } from "@/lib/openstaande-voorstellen";
import { FilterBalk } from "@/components/ui-kit";
const kop = "text-sm font-semibold";
/**
 * Feitelijk afstemmingsoverzicht voor bevoegde professionals: alleen wat ouders zelf hebben
 * geregistreerd (voorstellen en reacties). Geen oordeel, geen patroonanalyse, geen conclusies
 * over gedrag of intenties. Getoond voor het fictieve voorbeeldgezin.
 */
export function AfstemmingTab() {
    const { t: tr } = useTranslation();
    const bronLabel = (b) => tr(`pro.AfstemmingTab.bron.${b}`, { defaultValue: b });
    const zorg = useZorg();
    const afspraken = useAfspraken();
    const budgetten = useBudgetten();
    const vakanties = useVakanties();
    const [typeFilter, setTypeFilter] = useState("alle");
    const [statusFilter, setStatusFilter] = useState("alle");
    const vandaag = new Date().toISOString().slice(0, 10);
    const alle = verzamelVoorstellen({ zorg: zorg.voorstellen, afspraken, budgetten, vakanties }, vandaag);
    const t = telling(alle);
    const zichtbaar = alle.filter((v) => (typeFilter === "alle" || v.bron === typeFilter) && (statusFilter === "alle" || v.status === statusFilter));
    const feit = (label, n) => (<div key={label} className="rounded-lg border border-border px-3 py-2">
      <p className="text-lg font-bold text-ink">{n}</p>
      <p className="text-[11px] text-ink-soft">{label}</p>
    </div>);
    return (<section>
      <h3 className={kop}>{tr("pro.AfstemmingTab.titel")}</h3>
      <p className="mt-1 text-[11px] text-ink-soft">
        {tr("pro.AfstemmingTab.uitleg")}
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
        {feit(tr("pro.AfstemmingTab.feit.ingediend"), t.ingediend)}
        {feit(tr("pro.AfstemmingTab.feit.beantwoord"), t.beantwoord)}
        {feit(tr("pro.AfstemmingTab.feit.zonderReactie"), t.zonderReactie)}
        {feit(tr("pro.AfstemmingTab.feit.verstreken"), t.verstreken)}
        {feit(tr("pro.AfstemmingTab.feit.tegenvoorstellen"), t.tegenvoorstellen)}
      </div>
      <div className="mt-4 space-y-2">
        <FilterBalk opties={[{ id: "alle", label: tr("pro.AfstemmingTab.filter.alles") }, { id: "zorg", label: tr("pro.AfstemmingTab.filter.zorg") }, { id: "afspraak", label: tr("pro.AfstemmingTab.filter.afspraken") }, { id: "budget", label: tr("pro.AfstemmingTab.filter.budget") }, { id: "vakantie", label: tr("pro.AfstemmingTab.filter.vakantie") }]} waarde={typeFilter} onChange={setTypeFilter}/>
        <FilterBalk opties={[{ id: "alle", label: tr("pro.AfstemmingTab.filter.alleStatussen") }, ...["wacht-op-reactie", "wacht-op-jouw-reactie", "meer-tijd-gevraagd", "tegenvoorstel-ontvangen", "reactiedatum-verstreken", "akkoord", "niet-akkoord", "ingetrokken", "afgerond"].map((s) => ({ id: s, label: statusTekst[s] }))]} waarde={statusFilter} onChange={setStatusFilter}/>
      </div>
      <ul className="mt-2 divide-y divide-border">
        {zichtbaar.map((v) => (<li key={v.sleutel} className="py-2.5 text-sm">
            <p className="font-semibold">{v.titel} <span className="text-xs font-normal text-ink-soft">· {bronLabel(v.bron)}</span></p>
            <p className="text-xs text-ink-soft">{statusTekst[v.status]}{v.reactieDatum ? ` · ${tr("pro.AfstemmingTab.gewensteReactiedatum", { datum: v.reactieDatum })}` : ""}</p>
          </li>))}
        {zichtbaar.length === 0 ? <li className="py-3 text-sm text-ink-soft">{tr("pro.AfstemmingTab.leeg")}</li> : null}
      </ul>
    </section>);
}
