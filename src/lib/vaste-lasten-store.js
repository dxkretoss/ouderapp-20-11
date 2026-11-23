import { useSyncExternalStore } from "react";
import i18n from "@/i18n";
let state = {
    lasten: [
        { id: "l1", get wat() { return i18n.t("lib.vasteLastenStore.demo.l1"); }, kind: "Noah", perMaand: 18.5, pctSanne: 50 },
        { id: "l2", get wat() { return i18n.t("lib.vasteLastenStore.demo.l2"); }, kind: "Emma", perMaand: 42, pctSanne: 50 },
        { id: "l3", get wat() { return i18n.t("lib.vasteLastenStore.demo.l3"); }, kind: "Emma & Noah", perMaand: 20, pctSanne: 50 },
    ],
    potjes: [
        { id: "p1", get naam() { return i18n.t("lib.vasteLastenStore.demo.potje"); }, doel: 300, stortingen: [{ wie: "Sanne", bedrag: 50, get datum() { return i18n.t("lib.vasteLastenStore.demo.datum1"); } }, { wie: "Joris", bedrag: 50, get datum() { return i18n.t("lib.vasteLastenStore.demo.datum2"); } }] },
    ],
};
const ls = new Set();
const zet = (s) => { state = { ...state, ...s }; ls.forEach((l) => l()); };
export function voegLastToe(l) { zet({ lasten: [...state.lasten, { ...l, id: `l${Date.now()}` }] }); }
export function stortInPotje(id, wie, bedrag) {
    zet({ potjes: state.potjes.map((p) => (p.id === id ? { ...p, stortingen: [...p.stortingen, { wie, bedrag, datum: i18n.t("common.vandaag") }] } : p)) });
}
/** Alleen een verwijzing naar de rekening; de app verplaatst nooit zelf geld. */
export function koppelRekening(id, rekening) {
    zet({ potjes: state.potjes.map((p) => { if (p.id !== id)
            return p; const { rekening: _oud, ...rest } = p; return rekening ? { ...rest, rekening } : rest; }) });
}
export const geldigeIban = (s) => /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s.replace(/\s/g, "").toUpperCase());
export const potSaldo = (p) => p.stortingen.reduce((s, x) => s + x.bedrag, 0);
export function useVasteLasten() { return useSyncExternalStore((l) => { ls.add(l); return () => ls.delete(l); }, () => state, () => state); }
