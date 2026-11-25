import { api } from "@/lib/api";
import { kostenBron, useKostenPaar } from "@/lib/kosten-store";
/**
 * Vaste lasten (recurring_expenses) en spaarpotjes (savings_pots + stortingen) via manage-expenses.
 * Vaste lasten zijn alleen weergave: ze worden nooit een uitgave en tellen niet mee in het saldo.
 * Spaarpotjes zijn per kind, privé ("Alleen jij") of gedeeld met de andere ouder van dat kind.
 * Privé is de standaard; delen gaat alleen expliciet (`gedeeld: true`).
 */
async function stuur(actie, velden, lijst, sleutel) {
    try {
        const r = await api("manage-expenses", actie, velden);
        if (r?.[sleutel])
            kostenBron.vervang(lijst, r[sleutel]);
        return r?.[sleutel] ?? true;
    }
    catch (e) {
        kostenBron.fout(e);
        return null;
    }
}
async function verwijder(actie, velden, lijst, id) {
    const oud = kostenBron.ruw()[lijst];
    kostenBron.zet({ [lijst]: oud.filter((x) => x.id !== id) });
    try {
        await api("manage-expenses", actie, velden);
        return true;
    }
    catch (e) {
        kostenBron.zet({ [lijst]: oud });
        kostenBron.fout(e);
        return false;
    }
}
const deelVelden = (l) => (l.gedeeld === undefined ? {} : { shared: !!l.gedeeld, ...(l.gedeeld && l.anderId ? { other_parent_id: l.anderId } : {}) });
/* ---------- vaste lasten ---------- */
/** { wat, perMaand, kindIds?, pctIk?, gedeeld?, anderId? } */
export async function voegLastToe(l) {
    return !!(await stuur("create-recurring", { title: l.wat, amount: l.perMaand, child_ids: l.kindIds ?? [], my_pct: l.pctIk ?? 50, interval: "monthly", shared: !!l.gedeeld, ...(l.gedeeld && l.anderId ? { other_parent_id: l.anderId } : {}) }, "recurring", "recurring"));
}
/** Alleen wie de vaste last maakte. Velden als bij toevoegen; gedeeld false maakt hem weer privé. */
export async function wijzigLast(id, l) {
    return !!(await stuur("update-recurring", { recurring_id: id, ...(l.wat !== undefined ? { title: l.wat } : {}), ...(l.perMaand !== undefined ? { amount: l.perMaand, interval: "monthly" } : {}), ...(l.kindIds !== undefined ? { child_ids: l.kindIds } : {}), ...(l.pctIk !== undefined ? { my_pct: l.pctIk } : {}), ...deelVelden(l) }, "recurring", "recurring"));
}
export const verwijderLast = (id) => verwijder("delete-recurring", { recurring_id: id }, "recurring", id);
/* ---------- spaarpotjes ---------- */
/** { wat, doel?, start?, kindIds, gedeeld?, anderId?, notitie? } */
export async function maakPotje(p) {
    return !!(await stuur("create-pot", { pot: { title: p.wat, target_amount: p.doel ?? 0, start_amount: p.start || undefined, child_ids: p.kindIds ?? [], note: p.notitie || undefined, shared: !!p.gedeeld, ...(p.gedeeld && p.anderId ? { other_parent_id: p.anderId } : {}) } }, "pots", "pot"));
}
export async function wijzigPotje(id, p) {
    return !!(await stuur("update-pot", { pot_id: id, pot: { ...(p.wat !== undefined ? { title: p.wat } : {}), ...(p.doel !== undefined ? { target_amount: p.doel } : {}), ...(p.kindIds !== undefined ? { child_ids: p.kindIds } : {}), ...(p.notitie !== undefined ? { note: p.notitie } : {}), ...deelVelden(p) } }, "pots", "pot"));
}
export const verwijderPotje = (id) => verwijder("delete-pot", { pot_id: id }, "pots", id);
export async function stortInPotje(id, bedrag, notitie) {
    return !!(await stuur("add-deposit", { pot_id: id, amount: bedrag, ...(notitie ? { note: notitie } : {}) }, "pots", "pot"));
}
export async function verwijderStorting(stortingId) {
    return !!(await stuur("remove-deposit", { deposit_id: stortingId }, "pots", "pot"));
}
export const geldigeIban = (s) => /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s.replace(/\s/g, "").toUpperCase());
/** Vaste lasten en spaarpotjes van het gekozen ouderpaar (plus je eigen privé-items). */
export function useVasteLasten() {
    const { lasten, potjes, status } = useKostenPaar();
    return { lasten, potjes, status };
}
