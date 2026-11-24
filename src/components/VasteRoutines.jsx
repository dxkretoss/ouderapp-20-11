import { useState } from "react";
import { useTranslation } from "react-i18next";
import { tLijst } from "@/i18n";
import { Plus, X } from "lucide-react";
import { useStart } from "@/lib/start-store";
import { useOverdracht, verwijderRoutine, voegRoutineToe } from "@/lib/overdracht-store";
const dagen = ["elke", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"];
/** Dagen blijven Nederlandse ids (opgeslagen); alleen de weergave wordt vertaald. */
const dagLabel = (t, d) => { if (d === "elke") return t("components.VasteRoutines.elkeWissel"); const i = dagen.indexOf(d) - 1; return i >= 0 ? tLijst("common.dagen")[i] ?? d : d; };
/**
 * Vaste spullen per kind (bron: manage-handover). Ze komen bij elke wissel vanzelf op de paklijst ("Vast").
 * Beide ouders kunnen de lijst aanpassen. De app maakt nooit zelf een vaste routine aan.
 */
export function VasteRoutines() {
    const { t } = useTranslation();
    const { routines } = useOverdracht();
    const st = useStart();
    const [open, setOpen] = useState(false);
    const [item, setItem] = useState("");
    const [dag, setDag] = useState("elke");
    const [kind, setKind] = useState(st.kinderen[0]?.id ?? "");
    const naam = (id) => st.kinderen.find((k) => k.id === id)?.naam ?? "";
    if (!st.kinderen.length)
        return null;
    return (<section className="mt-6">
      <h2 className="font-display text-lg font-bold">{t("components.VasteRoutines.titel")}</h2>
      <p className="text-xs text-ink-soft">{t("components.VasteRoutines.uitleg")}</p>
      <ul className="mt-2 space-y-1.5">
        {routines.map((r) => (<li key={r.id} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1">{r.item}<span className="block text-[11px] text-ink-soft">{r.dag === "elke" ? t("components.VasteRoutines.elkeWisselKind", { kind: naam(r.kind) }) : t("components.VasteRoutines.elkeKind", { dag: dagLabel(t, r.dag), kind: naam(r.kind) })}</span></span>
            <button onClick={() => verwijderRoutine(r.id)} aria-label={t("components.VasteRoutines.verwijderen", { item: r.item })} className="grid size-9 place-items-center text-brand"><X className="size-3.5"/></button>
          </li>))}
      </ul>

      {open ? (<form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); if (!item.trim() || !(kind || st.kinderen[0]?.id))
            return; voegRoutineToe({ dag, kind: kind || st.kinderen[0].id, item: item.trim(), reden: dag === "elke" ? "" : t("components.VasteRoutines.reden", { dag: dagLabel(t, dag) }) }); setItem(""); setOpen(false); }}>
          <input value={item} onChange={(e) => setItem(e.target.value)} placeholder={t("components.VasteRoutines.placeholder")} aria-label={t("components.VasteRoutines.watMoetMee")} className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"/>
          <div className="flex gap-2">
            <select value={dag} onChange={(e) => setDag(e.target.value)} aria-label={t("components.VasteRoutines.dag")} className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm">{dagen.map((d) => <option key={d} value={d}>{dagLabel(t, d)}</option>)}</select>
            <select value={kind || st.kinderen[0]?.id} onChange={(e) => setKind(e.target.value)} aria-label={t("components.VasteRoutines.kind")} className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm">{st.kinderen.map((k) => <option key={k.id} value={k.id}>{k.naam}</option>)}</select>
          </div>
          <button className="rounded-md border border-border px-3 py-1.5 text-sm font-semibold text-brand">{t("components.VasteRoutines.bewaren")}</button>
        </form>) : (<button onClick={() => setOpen(true)} className="mt-2 inline-flex min-h-10 items-center gap-1 text-xs font-semibold text-brand"><Plus aria-hidden="true" className="size-3.5 shrink-0"/>{t("components.VasteRoutines.toevoegen").replace(/^\+\s*/, "")}</button>)}
    </section>);
}
