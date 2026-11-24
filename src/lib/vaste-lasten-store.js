import { api } from "@/lib/api";
import { kostenBron, useKostenBron } from "@/lib/kosten-store";
/**
 * Vaste lasten (recurring_expenses via manage-expenses): alleen weergave. Ze worden nooit een uitgave
 * en tellen niet mee in het saldo. Spaarpotjes zijn uit de app gehaald (klantbesluit); de bestaande
 * savings_pots-records blijven op de server onaangeroerd voor migratie en export.
 */
export async function voegLastToe(l) {
    try {
        const r = await api("manage-expenses", "create-recurring", { title: l.wat, amount: l.perMaand, child_ids: l.kindIds ?? [], my_pct: l.pctIk ?? 50 });
        kostenBron.vervang("recurring", r.recurring);
        return true;
    }
    catch (e) {
        kostenBron.fout(e);
        return false;
    }
}
export const geldigeIban = (s) => /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s.replace(/\s/g, "").toUpperCase());
export function useVasteLasten() {
    const { lasten } = useKostenBron();
    return { lasten, potjes: [] };
}
