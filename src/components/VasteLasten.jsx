import { useState } from "react";
import { useTranslation } from "react-i18next";
import { taalLocale } from "@/i18n";
import { GeldInvoer } from "@/components/GeldInvoer";
import { leesGeld } from "@/lib/geld-invoer";
import { useVasteLasten, voegLastToe } from "@/lib/vaste-lasten-store";
import { Chevron } from "@/components/Tekens";
import { kindLabel } from "@/components/KostenTabs";
import { useStart } from "@/lib/start-store";
const euro = (n) => n.toLocaleString(taalLocale(), { style: "currency", currency: "EUR" });
const veld = "rounded-md border border-border bg-background px-3 py-2 text-sm";
export function VasteLasten() {
    const { t } = useTranslation();
    const { lasten } = useVasteLasten();
    const [open, setOpen] = useState(false);
    const [wat, setWat] = useState("");
    const [bedrag, setBedrag] = useState("");
    const st = useStart();
    const kindOpties = [...st.kinderen.map((k) => ({ waarde: k.id, label: k.naam, ids: [k.id] })), ...(st.kinderen.length > 1 ? [{ waarde: "alle", label: kindLabel("Alle kinderen"), ids: st.kinderen.map((k) => k.id) }] : []), { waarde: "gezin", label: kindLabel("Gezin/algemeen"), ids: [] }];
    const [kind, setKind] = useState(kindOpties[0]?.waarde ?? "gezin");
    const totaal = lasten.reduce((s, l) => s + l.perMaand, 0);
    const jouwDeel = lasten.reduce((s, l) => s + (l.perMaand * l.pctIk) / 100, 0);
    const [toon, setToon] = useState(null);
    const Rij = ({ id, titel, sub }) => (<button onClick={() => setToon(toon === id ? null : id)} aria-expanded={toon === id} className="flex min-h-14 w-full items-center gap-3 py-2.5 text-left">
      <span className="min-w-0 flex-1"><span className="block font-display text-sm font-bold">{titel}</span><span className="block truncate text-xs text-ink-soft">{sub}</span></span>
      <Chevron richting="omlaag" open={toon === id} className="size-4 text-ink-soft"/>
    </button>);
    return (<section className="mt-6 divide-y divide-border border-y border-border">
      <div>
      <Rij id="lasten" titel={t("components.VasteLasten.titel")} sub={t("components.VasteLasten.sub", { aantal: lasten.length, totaal: euro(totaal) })}/>
      {toon === "lasten" ? <div className="pb-3">
      <div className="flex justify-end">
        <button onClick={() => setOpen((o) => !o)} className="text-xs font-semibold text-brand">{open ? t("common.sluiten") : t("components.VasteLasten.toevoegen")}</button>
      </div>
      {open ? (<form className="mt-2 grid gap-2" onSubmit={async (e) => { e.preventDefault(); const b = leesGeld(bedrag) ?? 0; if (!wat.trim() || !(b > 0))
                return; if (await voegLastToe({ wat: wat.trim(), kindIds: kindOpties.find((k) => k.waarde === kind)?.ids ?? [], perMaand: b, pctIk: 50 })) {
                setWat("");
                setBedrag("");
                setOpen(false);
            } }}>
          <input className={veld} placeholder={t("components.VasteLasten.watPlaceholder")} value={wat} onChange={(e) => setWat(e.target.value)}/>
          <div className="grid grid-cols-2 gap-2">
            <GeldInvoer label={t("components.VasteLasten.perMaand")} value={bedrag} onChange={setBedrag}/>
            <select className={veld} aria-label={t("components.VasteLasten.voor")} value={kind} onChange={(e) => setKind(e.target.value)}>{kindOpties.map((k) => <option key={k.waarde} value={k.waarde}>{k.label}</option>)}</select>
          </div>
          <button className="rounded-md bg-brand py-2 text-sm font-semibold text-primary-foreground">{t("components.VasteLasten.opslaan")}</button>
        </form>) : null}
      <ul className="mt-2 divide-y divide-border">
        {lasten.map((l) => (<li key={l.id} className="flex items-center justify-between py-2.5 text-sm">
            <div><p className="font-semibold">{l.wat}</p><p className="text-xs text-ink-soft">{kindLabel(l.kind)} · {l.pctIk}/{100 - l.pctIk}</p></div>
            <span className="font-semibold">{euro(l.perMaand)}<span className="text-xs font-normal text-ink-soft"> {t("components.VasteLasten.mnd")}</span></span>
          </li>))}
      </ul>
      <p className="mt-1 text-xs text-ink-soft">{t("components.VasteLasten.samen", { totaal: euro(totaal), deel: euro(jouwDeel) })}</p>

      </div> : null}
      </div>
    </section>);
}
