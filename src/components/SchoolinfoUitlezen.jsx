import { useState } from "react";
import { useTranslation } from "react-i18next";
import { taalLocale } from "@/i18n";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@/lib/server-fn";
import { Loader2 } from "lucide-react";
import { leesSchoolinfo } from "@/lib/schoolinfo.functions";
import { Button } from "@/components/ui/button";
import { uur } from "@/lib/tijd-tekst";
const nl = (d) => { const x = new Date(d); return isNaN(+x) ? d : x.toLocaleDateString(taalLocale(), { weekday: "short", day: "numeric", month: "long" }); };
export function SchoolinfoUitlezen() {
    const { t } = useTranslation();
    const lees = useServerFn(leesSchoolinfo);
    const [open, setOpen] = useState(false);
    const [tekst, setTekst] = useState("");
    const [bezig, setBezig] = useState(false);
    const [fout, setFout] = useState("");
    const [items, setItems] = useState(null);
    const [weg, setWeg] = useState([]);
    const [selectie, setSelectie] = useState({});
    const start = async () => {
        setBezig(true);
        setFout("");
        setItems(null);
        setWeg([]);
        setSelectie({});
        try {
            setItems(await lees({ data: { tekst, vandaag: new Date().toISOString().slice(0, 10) } }));
        }
        catch (e) {
            setFout(e instanceof Error ? e.message : t("components.SchoolinfoUitlezen.fout"));
        }
        finally {
            setBezig(false);
        }
    };
    if (!open)
        return (<button onClick={() => setOpen(true)} className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-left">
      <p className="text-sm font-semibold">{t("components.SchoolinfoUitlezen.titel")}</p>
      <p className="text-xs text-ink-soft">{t("components.SchoolinfoUitlezen.intro")}</p>
    </button>);
    return (<div className="rounded-md border border-border bg-card p-4">
      <p className="font-display text-base">{t("components.SchoolinfoUitlezen.titel")}</p>
      <textarea value={tekst} onChange={(e) => setTekst(e.target.value)} rows={5} aria-label={t("components.SchoolinfoUitlezen.tekstLabel")} placeholder={t("components.SchoolinfoUitlezen.placeholder")} className="mt-3 w-full resize-none rounded-2xl border border-border bg-card px-3 py-2 text-sm outline-none"/>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button onClick={() => { setOpen(false); setItems(null); }} className="rounded-full border border-border py-2 text-sm font-semibold text-ink-soft">{t("common.sluiten")}</button>
        <button onClick={start} disabled={bezig || tekst.trim().length < 10} className="min-h-11 rounded-full bg-brand px-5 text-sm font-semibold text-primary-foreground disabled:opacity-40">{t("components.SchoolinfoUitlezen.uitlezen")}</button>
      </div>
      {bezig ? <p role="status" className="mt-3 flex items-center gap-2 text-sm text-ink-soft"><Loader2 className="size-4 animate-spin"/> {t("components.SchoolinfoUitlezen.bezig")}</p> : null}
      {fout ? <p role="alert" className="mt-3 rounded-md bg-secondary px-3 py-2 text-xs">{fout}</p> : null}
      {items && !items.length ? <p className="mt-3 text-sm text-ink-soft">{t("components.SchoolinfoUitlezen.geen")}</p> : null}
      {items?.length ? (<ul className="mt-3 divide-y divide-border border-y border-border">
          {items.map((it, i) => {
                const k = `${i}`;
                if (weg.includes(k))
                    return null;
                return (<li key={k} className="py-2.5">
              <p className="text-sm font-semibold">{it.titel}</p>
              <p className="text-xs text-ink-soft">{nl(it.datum)}{it.tijd ? ` · ${uur(it.tijd)}` : ""}{it.kindNaam ? ` · ${it.kindNaam}` : ""}{!it.zeker ? t("components.SchoolinfoUitlezen.controleren") : ""}</p>
              <fieldset className="mt-2 space-y-1 text-sm"><legend className="text-xs font-semibold">{t("components.SchoolinfoUitlezen.meenemen")}</legend>
                <p className="py-2">{t("components.SchoolinfoUitlezen.afspraakInAgenda")}</p>
                {["kosten", "taak", "voorbereiding"].map((soort) => {
                        const label = soort === "kosten" ? (it.bedrag ? t("components.SchoolinfoUitlezen.budget", { bedrag: taalLocale() === "nl-NL" ? it.bedrag.toFixed(2).replace(".", ",") : it.bedrag.toFixed(2) }) : "") : soort === "taak" ? it.taak : it.voorbereiding;
                        if (!label)
                            return null;
                        return <label key={soort} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={selectie[k]?.[soort] ?? false} onChange={(e) => setSelectie((s) => ({ ...s, [k]: { kosten: false, taak: false, voorbereiding: false, ...s[k], [soort]: e.target.checked } }))}/>{label}</label>;
                    })}
              </fieldset>
              <div className="mt-2 flex gap-2">
                <Button asChild className="min-h-11 bg-brand text-primary-foreground shadow-none"><Link to="/agenda" search={{ nieuw: true, titel: it.titel, datum: it.datum || undefined, tijd: it.tijd || undefined, kind: it.kind || undefined, importBedrag: selectie[k]?.kosten ? it.bedrag ?? undefined : undefined, importTaak: selectie[k]?.taak ? it.taak : undefined, importMee: selectie[k]?.voorbereiding ? it.voorbereiding : undefined }}>{t("components.SchoolinfoUitlezen.controleer")}</Link></Button>
                <Button variant="ghost" className="min-h-11 text-ink-soft" onClick={() => setWeg((w) => [...w, k])}>{t("components.SchoolinfoUitlezen.nietNu")}</Button>
              </div>
            </li>);
            })}
        </ul>) : null}
      {items?.length ? <p className="mt-2 text-[11px] text-ink-soft">{t("components.SchoolinfoUitlezen.nogNiets")}</p> : null}
    </div>);
}
