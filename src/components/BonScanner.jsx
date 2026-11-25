import { useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { GeldInvoer } from "@/components/GeldInvoer";
import { bewerkGeld, leesGeld } from "@/lib/geld-invoer";
import { useServerFn } from "@/lib/server-fn";
import { AppIcon } from "@/components/AppIcon";
import { Banknote, FolderOpen } from "lucide-react";
import { MetVinkje } from "@/components/Tekens";
import { useBudgettenPaar } from "@/lib/budget-store";
import { useStart } from "@/lib/start-store";
import { leesBon } from "@/lib/bon.functions";
import { kindLabel } from "@/components/KostenTabs";
const docCategorieen = ["Bonnen", "Schooldocumenten", "Medisch", "Verzekeringen", "Officiële afspraken", "Brieven", "Overig"];
/** Documentcategorie en verdeling blijven als (Nederlandse) waarde bewaard; alleen de weergave wordt vertaald. */
const DOC_SLEUTELS = { "Bonnen": "bonnen", "Schooldocumenten": "school", "Medisch": "medisch", "Verzekeringen": "verzekeringen", "Officiële afspraken": "officieel", "Brieven": "brieven", "Overig": "overig" };
const docLabel = (c) => i18n.t(`components.BonScanner.docCategorie.${DOC_SLEUTELS[c]}`);
/** Verklein de foto vóór het uitlezen, zodat het snel en zuinig blijft. */
async function verklein(dataUrl) {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const s = Math.min(1, 1400 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * s);
    c.height = Math.round(img.height * s);
    c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85);
}
export function BonScanner({ standaard = "kosten", standaardPct = 50, onKosten, onDocument, toonVerdeling = true, onKindIds, }) {
    const { t } = useTranslation();
    const invoer = useRef(null);
    const lees = useServerFn(leesBon);
    const afspraak = `${standaardPct} / ${100 - standaardPct}`;
    // Verdeling als bronwaarde: "standaard" (jullie afspraak), "50" of "volledig" (helemaal voor mij); de betaler is altijd de ingelogde ouder.
    const verdeelOpties = [["standaard", t("components.BonScanner.volgensAfspraak", { verdeling: afspraak })], ...(standaardPct === 50 ? [] : [["50", "50 / 50"]]), ["volledig", t("components.BonScanner.volledigSanne")]];
    const st = useStart();
    const kinderOpties = [...(st.kinderen.length > 1 ? [{ waarde: "Alle kinderen", ids: st.kinderen.map((k) => k.id) }] : []), ...st.kinderen.map((k) => ({ waarde: k.naam, ids: [k.id] })), { waarde: "Gezin/algemeen", ids: [] }];
    const [foto, setFoto] = useState(null);
    const [soort, setSoort] = useState(standaard);
    const [naam, setNaam] = useState("");
    const [winkel, setWinkel] = useState("");
    const [datum, setDatum] = useState("");
    const [bedrag, setBedrag] = useState("");
    const [kind, setKind] = useState(kinderOpties[0]?.waarde ?? "Gezin/algemeen");
    const kindIds = kinderOpties.find((k) => k.waarde === kind)?.ids ?? [];
    const [verdeling, setVerdeling] = useState("standaard");
    // De ouder van deze kinderen bepaalt of delen kan (Alleen jij / Gedeeld staat bij de ouder-component).
    useEffect(() => { onKindIds?.(kindIds); }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps
    const [fotoKlein, setFotoKlein] = useState(null);
    const [categorie, setCategorie] = useState(docCategorieen[0]);
    const [ook, setOok] = useState(true);
    const [klaar, setKlaar] = useState(null);
    const [leest, setLeest] = useState(false);
    const [leesMelding, setLeesMelding] = useState(null);
    const budgetten = useBudgettenPaar();
    const [koppel, setKoppel] = useState(null);
    const uitlezen = async (f) => {
        setFotoKlein(f);
        setLeest(true);
        setLeesMelding(null);
        try {
            const g = await lees({ data: { foto: f } });
            if (g.omschrijving)
                setNaam(g.omschrijving);
            if (g.winkel)
                setWinkel(g.winkel);
            if (g.datum) {
                const m = g.datum.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
                setDatum(m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : /^\d{4}-\d{2}-\d{2}$/.test(g.datum) ? g.datum : "");
            }
            if (g.bedrag)
                setBedrag(bewerkGeld(g.bedrag));
            setLeesMelding(g.bedrag || g.winkel ? t("components.BonScanner.herkend") : t("components.BonScanner.weinigHerkend"));
        }
        catch (e) {
            setLeesMelding(e instanceof Error ? e.message : t("lib.bonFunctions.fout.mislukt"));
        }
        finally {
            setLeest(false);
        }
    };
    const kies = (f) => {
        if (!f)
            return;
        const r = new FileReader();
        r.onload = async () => {
            const ruw = String(r.result);
            setFoto(ruw);
            setFotoKlein(null);
            if (soort === "kosten") {
                try {
                    await uitlezen(await verklein(ruw));
                }
                catch {
                    setLeesMelding(t("components.BonScanner.zelfInvullen"));
                }
            }
        };
        r.readAsDataURL(f);
        setKlaar(null);
    };
    /** Zelfde kind, bedrag binnen 10% van een afgesproken budget dat nog niet is uitgegeven. */
    const vindBudget = () => {
        const bedragNummer = leesGeld(bedrag) ?? 0;
        return budgetten.find((b) => b.status === "akkoord" && !b.kostId && Math.abs(b.max - bedragNummer) <= Math.max(2, b.max * 0.1) && (!b.kindIds?.length || kindIds.every((id) => b.kindIds.includes(id))));
    };
    const omschr = () => naam.trim() ? (winkel.trim() && !naam.includes(winkel.trim()) ? `${naam.trim()} (${winkel.trim()})` : naam.trim()) : winkel.trim() || t("components.BonScanner.gescandeBon");
    const finaliseer = async (b) => {
        if (!foto)
            return;
        if (soort === "kosten") {
            const bedragNummer = leesGeld(bedrag) ?? 0;
            if (bedragNummer <= 0)
                return;
            // De (verkleinde) foto gaat als bon mee; opslaan en koppelen aan het budget doet de server in één keer.
            const gelukt = await onKosten({ omschrijving: omschr(), bedrag: bedragNummer, kind, kindIds, verdeling, foto: fotoKlein ?? foto, budgetId: b?.id, ...(/^\d{4}-\d{2}-\d{2}$/.test(datum) ? { datum } : {}) });
            if (gelukt === false)
                return;
            // Ook bij documenten: pas "klaar" melden als die upload echt gelukt is.
            const docGelukt = ook && onDocument ? !!(await onDocument({ naam: t("components.BonScanner.bonNaam", { naam: omschr() }), categorie: "Bonnen", kind, foto })) : false;
            setKlaar(b ? t("components.BonScanner.klaar.gekoppeld", { wat: b.wat }) : docGelukt ? t("components.BonScanner.klaar.kostenEnDocumenten") : t("components.BonScanner.klaar.kosten"));
        }
        else {
            const doc = await onDocument?.({ naam: naam.trim() || t("components.BonScanner.gescandDocument"), categorie, kind, foto });
            if (!doc)
                return; // fout is al gemeld; foto en invoer blijven staan om het opnieuw te proberen
            setKlaar(t("components.BonScanner.klaar.documenten"));
        }
        setFoto(null);
        setNaam("");
        setBedrag("");
        setWinkel("");
        setDatum("");
        setKoppel(null);
        setLeesMelding(null);
    };
    const opslaan = () => {
        if (!foto)
            return;
        if (soort === "kosten" && !koppel) {
            const b = vindBudget();
            if (b) {
                setKoppel(b);
                return;
            }
        }
        finaliseer(koppel ?? undefined);
    };
    const veld = "w-full rounded-xl bg-surface px-3 py-2 text-sm outline-none";
    const tab = (a) => `min-h-10 flex-1 rounded-xl py-2 text-xs font-semibold ${a ? "bg-brand text-primary-foreground" : "text-ink-soft"}`;
    return (<div className="rounded-lg border border-border p-4">
      <input ref={invoer} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { kies(e.target.files?.[0]); e.target.value = ""; }}/>
      {!foto ? (<>
          <button onClick={() => invoer.current?.click()} className="flex w-full items-center gap-3 rounded-md border border-dashed border-brand/40 bg-surface p-4 text-left">
            <AppIcon functie="foto" maat="lg"/>
            <span>
              <span className="block text-sm font-semibold">{t("components.BonScanner.fotograferen")}</span>
              <span className="block text-xs text-ink-soft">{t("components.BonScanner.herkenning")}</span>
            </span>
          </button>
          {klaar ? <p role="status" className="mt-2 text-xs font-semibold text-brand"><MetVinkje>{klaar}</MetVinkje></p> : null}
        </>) : (<div className="space-y-2">
          <img src={foto} alt={t("components.BonScanner.gescandeBon")} className="max-h-56 w-full rounded-md object-contain bg-surface"/>
          {onKosten && onDocument ? <div className="flex rounded-md bg-surface p-1">
            <button onClick={() => setSoort("kosten")} className={tab(soort === "kosten")}><span className="inline-flex items-center justify-center gap-1.5"><Banknote aria-hidden="true" strokeWidth={1.8} className="size-4 shrink-0"/>{t("components.BonScanner.alsKosten")}</span></button>
            <button onClick={() => setSoort("document")} className={tab(soort === "document")}><span className="inline-flex items-center justify-center gap-1.5"><FolderOpen aria-hidden="true" strokeWidth={1.8} className="size-4 shrink-0"/>{t("components.BonScanner.alsDocument")}</span></button>
          </div> : null}
          {leest ? <p role="status" className="animate-pulse rounded-md bg-muted p-2 text-xs text-ink-soft">{t("components.BonScanner.uitlezen")}</p> : leesMelding ? <p role="status" className="rounded-md bg-muted p-2 text-xs text-ink-soft">{leesMelding}</p> : null}
          <input className={veld} aria-label={t("components.BonScanner.omschrijving")} placeholder={soort === "kosten" ? t("components.BonScanner.omschrijvingPlaceholder") : t("components.BonScanner.naamDocument")} value={naam} onChange={(e) => setNaam(e.target.value)}/>
          {soort === "kosten" ? (<>
              <div className="grid grid-cols-2 gap-2">
                <input className={veld} aria-label={t("components.BonScanner.winkel")} placeholder={t("components.BonScanner.winkel")} value={winkel} onChange={(e) => setWinkel(e.target.value)}/>
                <input className={veld} aria-label={t("components.BonScanner.datum")} type="date" value={datum} onChange={(e) => setDatum(e.target.value)}/>
              </div>
              <GeldInvoer label={t("components.BonScanner.bedrag")} value={bedrag} onChange={setBedrag}/>
              {toonVerdeling ? <select className={veld} aria-label={t("components.BonScanner.verdeling")} value={verdeling} onChange={(e) => setVerdeling(e.target.value)}>
                {verdeelOpties.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </select> : null}
            </>) : (<select className={veld} value={categorie} onChange={(e) => setCategorie(e.target.value)}>
              {docCategorieen.map((c) => <option key={c} value={c}>{docLabel(c)}</option>)}
            </select>)}
          <select className={veld} aria-label={t("components.BonScanner.kind")} value={kind} onChange={(e) => setKind(e.target.value)}>
            {kinderOpties.map((k) => <option key={k.waarde} value={k.waarde}>{kindLabel(k.waarde)}</option>)}
          </select>
          {soort === "kosten" && onDocument ? (<label className="flex items-center gap-2 text-xs text-ink-soft">
              <input type="checkbox" checked={ook} onChange={(e) => setOok(e.target.checked)}/> {t("components.BonScanner.ookDocumenten")}
            </label>) : null}
          {koppel ? (<div role="status" className="rounded-md border border-border bg-muted p-3">
              <p className="text-xs text-ink-soft"><Trans i18nKey="components.BonScanner.hoortBij" values={{ bedrag, wat: koppel.wat, kind: kindLabel(koppel.kind) }} components={{ b: <span className="font-semibold"/> }}/></p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button onClick={() => finaliseer(koppel)} className="rounded-full bg-brand px-3 py-1 text-xs font-semibold text-primary-foreground">{t("components.BonScanner.jaKoppelen")}</button>
                <button onClick={() => { setKoppel(null); finaliseer(); }} className="rounded-full border border-border px-3 py-1 text-xs font-semibold">{t("components.BonScanner.andereKostenpost")}</button>
              </div>
            </div>) : null}
          <div className="flex gap-2">
            <button onClick={() => { setFoto(null); setKoppel(null); setLeesMelding(null); }} className="min-h-11 flex-1 rounded-full bg-muted px-4 text-sm font-semibold text-ink-soft">{t("components.BonScanner.opnieuw")}</button>
            <button onClick={opslaan} disabled={leest || (soort === "kosten" && !(leesGeld(bedrag) ?? 0))} className="min-h-11 flex-1 rounded-full bg-brand px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40">{t("components.BonScanner.controleren")}</button>
          </div>
        </div>)}
    </div>);
}
