import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@/lib/server-fn";
import { FileUp, Loader2, CircleHelp } from "lucide-react";
import { herkenAfspraken } from "@/lib/ouderschapsplan.functions";
import { zetTeControleren } from "@/lib/import-store";
import { importeerAfspraken } from "@/lib/afspraken-store";
import { useGezin } from "@/lib/gezin";
import { uploadDocument } from "@/lib/documenten-store";
import { useTranslation } from "react-i18next";
import { taalLocale } from "@/i18n";
import { MetChevron, MetVinkje, Vinkje } from "@/components/Tekens";
// Bewaard tussen paginabezoeken, zodat Home en Documenten dezelfde open punten tonen.
const cache = { bestand: null, items: null, docStatus: null };
export function OuderschapsplanImport({ onOpgeslagen }) {
    const { t } = useTranslation();
    const herken = useServerFn(herkenAfspraken);
    const input = useRef(null);
    const [bestand, setBestand] = useState(cache.bestand);
    const [bezig, setBezig] = useState(false);
    const [fout, setFout] = useState("");
    const [items, setItems] = useState(cache.items);
    const [toon, setToon] = useState(!!cache.items);
    const [selectie, setSelectie] = useState([]);
    const [opslaan, setOpslaan] = useState(false);
    // Het origineel in Documenten: "bezig" | "ok" | "fout" — pas "opgeslagen" tonen als de server het bevestigt.
    const [docStatus, setDocStatus] = useState(cache.docStatus);
    // Afspraken uit het plan gelden voor het hele gezin; met meerdere andere ouders kies je met wie.
    const g = useGezin();
    const kiesOuder = g.coOuders.length > 1;
    const [ander, setAnder] = useState("");
    useEffect(() => { cache.bestand = bestand; cache.items = items; cache.docStatus = docStatus; }, [bestand, items, docStatus]);
    const kies = async (f) => {
        if (!f)
            return;
        if (f.size > 10 * 1024 * 1024)
            return setFout(t("components.OuderschapsplanImport.teGroot"));
        setFout("");
        setItems(null);
        setSelectie([]);
        const buf = new Uint8Array(await f.arrayBuffer());
        let bin = "";
        for (let i = 0; i < buf.length; i += 0x8000)
            bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        const grootte = f.size > 1024 * 1024 ? `${(f.size / 1024 / 1024).toLocaleString(taalLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB` : `${Math.ceil(f.size / 1024)} kB`;
        const b = { naam: f.name, type: f.type || "application/pdf", url: URL.createObjectURL(f), data: btoa(bin), grootte };
        setBestand(b);
        // Origineel ongewijzigd bewaard in Documenten (privé-opslag van het gezin).
        setDocStatus("bezig");
        uploadDocument(f, { naam: f.name.replace(/\.[a-z0-9]+$/i, ""), categorie: "Officiële afspraken", bron: "ouderschapsplan" }).then((d) => {
            setDocStatus(d ? "ok" : "fout");
            if (d)
                onOpgeslagen?.({ naam: d.naam, grootte, id: d.id });
        });
    };
    const start = async () => {
        if (!bestand)
            return;
        setBezig(true);
        setFout("");
        try {
            const r = await herken({ data: { naam: bestand.naam, type: bestand.type, data: bestand.data } });
            setItems(r.map((g) => ({ ...g, keuze: "open", tekst: g.voorstel })));
            setToon(false);
        }
        catch (e) {
            setFout(e instanceof Error ? e.message : t("components.OuderschapsplanImport.fout"));
        }
        finally {
            setBezig(false);
        }
    };
    useEffect(() => { zetTeControleren(items ? items.filter((x) => x.keuze === "open" || x.keuze === "aanpassen").length : 0); }, [items]);
    const zet = (i, p) => setItems((l) => l.map((x, n) => (n === i ? { ...x, ...p } : x)));
    /** Alle gekozen onderdelen in één keer naar de ene afsprakenbron; pas na bevestiging van de server "toegevoegd". */
    const voegSelectieToe = async () => {
        const gekozen = selectie.filter((i) => items[i] && (items[i].keuze === "open" || items[i].keuze === "aanpassen") && items[i].tekst.trim());
        if (!gekozen.length || opslaan || (kiesOuder && !ander))
            return;
        setOpslaan(true);
        const gelukt = await importeerAfspraken(gekozen.map((i) => ({ titel: items[i].onderdeel, tekst: items[i].tekst.trim(), onderwerp: "Overig", bron: items[i].bron })), bestand.naam, { anderId: kiesOuder ? ander : undefined });
        setOpslaan(false);
        if (!gelukt)
            return;
        setItems((l) => l.map((x, n) => (gekozen.includes(n) ? { ...x, keuze: "toegevoegd" } : x)));
        setSelectie([]);
    };
    return (<section className="rounded-lg border border-border bg-card p-4">
      <p className="font-display text-lg">{t("components.OuderschapsplanImport.titel")}</p>
      <p className="mt-1 text-xs text-ink-soft">{t("components.OuderschapsplanImport.uitleg")}</p>
      <input ref={input} type="file" accept="application/pdf,text/plain,.pdf,.txt" className="hidden" onChange={(e) => kies(e.target.files?.[0])} aria-label={t("components.OuderschapsplanImport.kiezen")}/>
      {!bestand ? (<button onClick={() => input.current?.click()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-brand/40 py-2.5 text-sm font-semibold text-brand">
          <FileUp className="size-4"/> {t("components.OuderschapsplanImport.toevoegen")}
        </button>) : (<div className="mt-3 space-y-3">
          {docStatus === "ok" ? <p className="text-sm font-semibold text-brand"><MetVinkje achter>{t("components.OuderschapsplanImport.opgeslagen")}</MetVinkje> <span className="font-normal text-ink-soft">· {bestand.naam}</span></p>
            : docStatus === "fout" ? <p role="alert" className="text-sm text-ink-soft">{t("components.OuderschapsplanImport.nietOpgeslagen")} <span className="text-ink-soft">· {bestand.naam}</span></p>
                : <p role="status" className="flex items-center gap-2 text-sm text-ink-soft"><Loader2 className="size-4 animate-spin"/>{t("components.OuderschapsplanImport.bezigOpslaan")} <span>· {bestand.naam}</span></p>}
          {!items ? (<button onClick={start} disabled={bezig} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {bezig ? <><Loader2 className="size-4 animate-spin"/> {t("components.OuderschapsplanImport.herkennenBezig")}</> : t("components.OuderschapsplanImport.herkennen")}
            </button>) : null}
          <p className="text-[11px] text-ink-soft">{t("components.OuderschapsplanImport.disclaimer")}</p>
        </div>)}
      {fout ? <p role="alert" className="mt-3 rounded-md bg-secondary px-3 py-2 text-xs">{fout}</p> : null}

      {items ? (<div className="mt-4">
          {items.length === 0 ? <p className="text-sm text-ink-soft">{t("components.OuderschapsplanImport.geenGevonden")}</p> : (<>
              <p className="text-sm font-semibold">{t("components.OuderschapsplanImport.gevonden", { count: items.length })}</p>
              <ul className="mt-2 space-y-1 text-sm">
                {items.map((g, i) => <li key={i} className={`flex items-start gap-1.5 ${g.zeker ? "" : "text-accent-warm"}`}>{g.zeker ? <Vinkje className="mt-[3px] size-4 text-brand"/> : <CircleHelp aria-hidden className="mt-[3px] size-4 shrink-0"/>}<span>{g.onderdeel}{g.zeker ? "" : t("components.OuderschapsplanImport.controleNodig")}</span></li>)}
              </ul>
              {!toon ? <button onClick={() => setToon(true)} className="mt-3 w-full rounded-full border border-border py-2.5 text-sm font-semibold">{t("components.OuderschapsplanImport.bekijkGevonden")}</button> : (<div className="mt-4 space-y-3">
                  <p className="font-display text-lg">{t("components.OuderschapsplanImport.ditGevonden")}</p>
                  {items.map((g, i) => (<div key={i} className="rounded-md border border-border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold">{g.onderdeel}</p>
                        {!g.zeker ? <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold">{t("components.OuderschapsplanImport.controleer")}</span> : null}
                      </div>
                      <p className="mt-1 text-sm text-ink-soft">{g.samenvatting}</p>
                      <p className="mt-2 text-[11px] text-ink-soft">{t("components.OuderschapsplanImport.bron", { bron: g.bron })}</p>
                      <p className="mt-2 text-xs text-ink-soft">{t("components.OuderschapsplanImport.verwerking")}</p>
                      {g.keuze === "aanpassen" ? (<textarea value={g.tekst} onChange={(e) => zet(i, { tekst: e.target.value })} rows={2} className="mt-1 w-full rounded-2xl border border-border bg-card px-2 py-1.5 text-sm outline-none"/>) : <p className="text-sm font-semibold">"{g.tekst}"</p>}
                      {g.keuze === "toegevoegd" ? <p className="mt-2 text-xs font-semibold text-brand"><MetVinkje achter>{t("components.OuderschapsplanImport.toegevoegd")}</MetVinkje></p>
                            : g.keuze === "niet" ? <p className="mt-2 text-xs text-ink-soft">{t("components.OuderschapsplanImport.nietToegevoegd")} <button className="underline" onClick={() => zet(i, { keuze: "open" })}>{t("components.OuderschapsplanImport.ongedaan")}</button></p>
                                : (<div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                            <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={selectie.includes(i)} disabled={!g.tekst.trim()} onChange={(e) => setSelectie((l) => e.target.checked ? [...l, i] : l.filter((n) => n !== i))}/>{t("components.OuderschapsplanImport.meenemen")}</label>
                            <button onClick={() => zet(i, { keuze: "niet" })} className="rounded-full border border-border px-3 py-1.5 text-ink-soft">{t("components.OuderschapsplanImport.nietToevoegen")}</button>
                            {g.keuze !== "aanpassen" ? <button onClick={() => zet(i, { keuze: "aanpassen" })} className="rounded-full border border-border px-3 py-1.5 text-ink-soft">{t("components.OuderschapsplanImport.aanpassen")}</button> : null}
                          </div>)}
                    </div>))}
                  <p className="text-xs text-ink-soft">{t("components.OuderschapsplanImport.controleerSelectie")}</p>
                  {kiesOuder ? (<fieldset>
                      <legend className="text-xs font-semibold">{t("components.OuderschapsplanImport.metWie")}</legend>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {g.coOuders.map((c, n) => <button key={c.id} type="button" onClick={() => setAnder(c.id)} aria-pressed={ander === c.id} className={`min-h-9 rounded-full border px-3 py-1.5 text-xs font-semibold ${ander === c.id ? "border-brand bg-brand text-primary-foreground" : "border-border bg-card"}`}>{c.naam || t("components.DelenKeuze.andereOuderN", { n: n + 1 })}</button>)}
                      </div>
                    </fieldset>) : null}
                  <button disabled={opslaan || (kiesOuder && !ander) || !selectie.some((i) => items[i] && (items[i].keuze === "open" || items[i].keuze === "aanpassen") && items[i].tekst.trim())} onClick={voegSelectieToe} className="flex w-full items-center justify-center gap-2 min-h-12 rounded-full bg-brand px-3 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40">{opslaan ? <Loader2 className="size-4 animate-spin"/> : null}{t("components.OuderschapsplanImport.selectieToevoegen")}</button>
                  <Link to="/afspraken" className="flex min-h-10 items-center justify-center text-xs font-semibold text-brand"><MetChevron>{t("components.OuderschapsplanImport.naarAfspraken")}</MetChevron></Link>
                </div>)}
            </>)}
        </div>) : null}
    </section>);
}
