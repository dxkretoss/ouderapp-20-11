import { useState } from "react";
import { useTranslation } from "react-i18next";
import { tLijst } from "@/i18n";
import { Plus, X } from "lucide-react";
import { useKring } from "@/lib/kring-store";
import { useSlimmeHulp, verwijderRoutine, voegRoutineToe, routineNietNodig } from "@/lib/slimme-hulp";
const dagen = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"];
const kindNaam = { emma: "Emma", noah: "Noah" };
/** Dagen blijven Nederlandse ids (opgeslagen); alleen de weergave wordt vertaald. */
const dagLabel = (d) => { const i = dagen.indexOf(d); return i >= 0 ? tLijst("common.dagen")[i] ?? d : d; };
/** Kring-momenten tonen de dag in de huidige taal; terug naar de Nederlandse id (taalonafhankelijk). */
const dagId = (d) => { const l = (d ?? "").toLowerCase(); if (dagen.includes(l)) return l; const i = tLijst("common.dagen").findIndex((x) => x.toLowerCase() === l); return i >= 0 ? dagen[i] : l; };
/**
 * Persoonlijke routines voor 'Wat moet mee?'. De app mag een patroon voorstellen
 * (spullen die bij een terugkerende activiteit horen), maar maakt nooit zelf een routine:
 * alleen na "Ja, voortaan". Een routine is geen gezamenlijke afspraak.
 */
export function VasteRoutines() {
    const { t } = useTranslation();
    const { routines, routineNietNodig: nietNodig } = useSlimmeHulp();
    const kring = useKring();
    const [open, setOpen] = useState(false);
    const [item, setItem] = useState("");
    const [dag, setDag] = useState("maandag");
    const [kind, setKind] = useState("emma");
    const heeft = (k, d, i) => routines.some((r) => r.kind === k && r.dag === d && r.item.toLowerCase().includes(i.toLowerCase()));
    const voorstellen = kring.momenten
        .filter((m) => m.soort === "afspraak")
        .flatMap((m) => m.kindIds.flatMap((k) => m.mee.map((i) => ({ sleutel: `${m.id}-${k}-${i}`, kind: k, dag: dagId(m.dag), item: i, titel: m.titel }))))
        .filter((p) => p.kind in kindNaam && !heeft(p.kind, p.dag, p.item) && !nietNodig.includes(p.sleutel))
        .slice(0, 2);
    return (<section className="mt-6">
      <h2 className="font-display text-lg font-bold">{t("components.VasteRoutines.titel")}</h2>
      <p className="text-xs text-ink-soft">{t("components.VasteRoutines.uitleg")}</p>
      <ul className="mt-2 space-y-1.5">
        {routines.map((r) => (<li key={r.id} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1">{r.item}<span className="block text-[11px] text-ink-soft">{t("components.VasteRoutines.elkeKind", { dag: dagLabel(r.dag), kind: kindNaam[r.kind] })}</span></span>
            <button onClick={() => verwijderRoutine(r.id)} aria-label={t("components.VasteRoutines.verwijderen", { item: r.item })} className="text-brand"><X className="size-3.5"/></button>
          </li>))}
      </ul>

      {voorstellen.map((p) => (<div key={p.sleutel} className="mt-3 rounded-md bg-muted px-3 py-2 text-sm">
          <p>{t("components.VasteRoutines.hoortBij", { item: p.item.toLowerCase(), kind: kindNaam[p.kind], titel: p.titel.toLowerCase(), dag: dagLabel(p.dag) })}</p>
          <p className="text-xs text-ink-soft">{t("components.VasteRoutines.voortaanVraag")}</p>
          <div className="mt-2 flex gap-2">
            <button onClick={() => voegRoutineToe({ dag: p.dag, kind: p.kind, item: `${p.item} ${kindNaam[p.kind]}`, reden: t("components.VasteRoutines.redenTitel", { dag: dagLabel(p.dag), titel: p.titel.toLowerCase() }) })} className="rounded-full bg-brand px-3 py-1 text-xs font-semibold text-primary-foreground">{t("components.VasteRoutines.jaVoortaan")}</button>
            <button onClick={() => routineNietNodig(p.sleutel)} className="rounded-full border border-border px-3 py-1 text-xs font-semibold">{t("components.VasteRoutines.nietNodig")}</button>
          </div>
        </div>))}

      {open ? (<form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); if (!item.trim())
            return; voegRoutineToe({ dag, kind, item: item.trim(), reden: t("components.VasteRoutines.reden", { dag: dagLabel(dag) }) }); setItem(""); setOpen(false); }}>
          <input value={item} onChange={(e) => setItem(e.target.value)} placeholder={t("components.VasteRoutines.placeholder")} aria-label={t("components.VasteRoutines.watMoetMee")} className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"/>
          <div className="flex gap-2">
            <select value={dag} onChange={(e) => setDag(e.target.value)} aria-label={t("components.VasteRoutines.dag")} className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm">{dagen.map((d) => <option key={d} value={d}>{dagLabel(d)}</option>)}</select>
            <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label={t("components.VasteRoutines.kind")} className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"><option value="emma">Emma</option><option value="noah">Noah</option></select>
          </div>
          <button className="rounded-md border border-border px-3 py-1.5 text-sm font-semibold text-brand">{t("components.VasteRoutines.bewaren")}</button>
        </form>) : (<button onClick={() => setOpen(true)} className="mt-2 inline-flex min-h-10 items-center gap-1 text-xs font-semibold text-brand"><Plus aria-hidden="true" className="size-3.5 shrink-0"/>{t("components.VasteRoutines.toevoegen").replace(/^\+\s*/, "")}</button>)}
    </section>);
}
