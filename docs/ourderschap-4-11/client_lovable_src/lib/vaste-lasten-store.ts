import { useSyncExternalStore } from "react";

/** Vaste lasten en spaarpotjes: alleen overzicht; een betaling wordt pas een kostenpost via de bestaande kostenflow. */
export type VasteLast = { id: string; wat: string; kind: string; perMaand: number; pctSanne: number };
export type Spaarrekening = { naam: string; iban: string };
export type Potje = { id: string; naam: string; doel?: number; rekening?: Spaarrekening; stortingen: { wie: "Sanne" | "Joris"; bedrag: number; datum: string }[] };

type State = { lasten: VasteLast[]; potjes: Potje[] };
let state: State = {
  lasten: [
    { id: "l1", wat: "Contributie voetbal", kind: "Noah", perMaand: 18.5, pctSanne: 50 },
    { id: "l2", wat: "Zwemles", kind: "Emma", perMaand: 42, pctSanne: 50 },
    { id: "l3", wat: "Zakgeld", kind: "Emma & Noah", perMaand: 20, pctSanne: 50 },
  ],
  potjes: [
    { id: "p1", naam: "Kinderpotje", doel: 300, stortingen: [{ wie: "Sanne", bedrag: 50, datum: "1 maart" }, { wie: "Joris", bedrag: 50, datum: "2 maart" }] },
  ],
};
const ls = new Set<() => void>();
const zet = (s: Partial<State>) => { state = { ...state, ...s }; ls.forEach((l) => l()); };

export function voegLastToe(l: Omit<VasteLast, "id">) { zet({ lasten: [...state.lasten, { ...l, id: `l${Date.now()}` }] }); }
export function stortInPotje(id: string, wie: "Sanne" | "Joris", bedrag: number) {
  zet({ potjes: state.potjes.map((p) => (p.id === id ? { ...p, stortingen: [...p.stortingen, { wie, bedrag, datum: "Vandaag" }] } : p)) });
}
/** Alleen een verwijzing naar de rekening; de app verplaatst nooit zelf geld. */
export function koppelRekening(id: string, rekening: Spaarrekening | null) {
  zet({ potjes: state.potjes.map((p) => { if (p.id !== id) return p; const { rekening: _oud, ...rest } = p; return rekening ? { ...rest, rekening } : rest; }) });
}
export const geldigeIban = (s: string) => /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s.replace(/\s/g, "").toUpperCase());
export const potSaldo = (p: Potje) => p.stortingen.reduce((s, x) => s + x.bedrag, 0);
export function useVasteLasten() { return useSyncExternalStore((l) => { ls.add(l); return () => ls.delete(l); }, () => state, () => state); }
