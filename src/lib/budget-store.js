/**
 * Budgetvoorstellen: afspraken over een TOEKOMSTIGE uitgave. Nooit zelf een kostenpost.
 * Flow: voorstel → reactie (Akkoord / Ander voorstel / Niet akkoord / Meer tijd nodig) → eventueel ander voorstel →
 * akkoord ("Afgesproken budget") → later "Uitgave toevoegen" via de bestaande kostenflow.
 * Bron: `manage-expenses` (budget_proposals + append-only budget_steps), gelezen via kosten-store.
 * Wie mag reageren, intrekken of herinneren bepaalt de server op basis van de sessie; `wie`-argumenten
 * worden alleen nog voor compatibiliteit aangenomen en genegeerd.
 */
import { api } from "@/lib/api";
import { geldigUitstelMoment } from "@/lib/budget-uitstel";
import { kostenBron, kostenSnapshot, useKostenBron, useKostenPaar } from "@/lib/kosten-store";
export const budgetSnapshot = () => kostenSnapshot().budgetten;
const vervang = (b) => kostenBron.vervang("budgets", b);
async function stuur(actie, velden, optimistisch) {
    const id = velden.budget_id;
    const oud = id ? kostenBron.ruw().budgets.find((b) => b.id === id) : null;
    if (oud && optimistisch)
        vervang({ ...oud, ...optimistisch });
    try {
        const r = await api("manage-expenses", actie, velden);
        vervang(r.budget);
        return r.budget;
    }
    catch (e) {
        if (oud)
            vervang(oud);
        kostenBron.fout(e);
        return null;
    }
}
/**
 * Nieuw voorstel: { wat, kindIds?, max, pctIk (of oud: pctSanne), toelichting?, reactieDatum?, categorie?, periode?, anderId? }.
 * anderId: de andere ouder (nodig bij twee of meer co-ouders als er geen kind gekozen is).
 * Geeft (async) het id van het opgeslagen voorstel, of null.
 */
export async function nieuwBudget(b) {
    const r = await stuur("create-budget", { budget: { title: b.wat, child_ids: b.kindIds ?? [], amount: b.max, my_pct: b.pctIk ?? b.pctSanne ?? 50, note: b.toelichting || undefined, response_date: b.reactieDatum || undefined, category: b.categorie, period: b.periode, ...(b.anderId ? { other_parent_id: b.anderId } : {}) } });
    return r?.id ?? null;
}
const reactieCode = (r) => (typeof r === "object" ? "ander_voorstel" : r === "akkoord" ? "akkoord" : "niet_akkoord");
/** r: "akkoord" | "geweigerd" | { tegen: bedrag, pctIk? }. */
export async function reageer(id, _wie, r) {
    if (typeof r === "object" && (!Number.isFinite(r.tegen) || r.tegen <= 0))
        return false;
    const code = reactieCode(r);
    const extra = typeof r === "object" ? { amount: r.tegen, ...(r.pctIk !== undefined ? { my_pct: r.pctIk } : {}) } : {};
    return !!(await stuur("respond-budget", { budget_id: id, response: code, ...extra }, code === "akkoord" ? { turn_to_respond: null, status: "akkoord" } : code === "niet_akkoord" ? { turn_to_respond: null } : null));
}
/** Een wijziging blijft in hetzelfde record; het afgesproken bedrag en de verdeling gelden tot akkoord. */
export async function wijzigBudgetVoorstel(id, _wie, bedrag, pctIk) {
    if (!Number.isFinite(bedrag) || bedrag <= 0 || !Number.isFinite(pctIk) || pctIk < 0 || pctIk > 100)
        return false;
    return !!(await stuur("change-budget", { budget_id: id, amount: bedrag, my_pct: pctIk }));
}
/** Alleen de indiener (die wacht) kan een open voorstel intrekken. */
export async function trekBudgetIn(id) {
    return !!(await stuur("withdraw-budget", { budget_id: id }));
}
/** Meer tijd vragen: alleen wie aan zet is; het voorstel blijft open, zonder instemming of verplichting. */
export async function vraagMeerTijdBudget(id, _wie, tot) {
    if (tot && !geldigUitstelMoment(tot))
        return false;
    return !!(await stuur("respond-budget", { budget_id: id, response: "meer_tijd", ...(tot ? { review_at: tot } : {}) }));
}
/** Vriendelijke herinnering: alleen de indiener die wacht; de server begrenst het aantal. */
export async function stuurBudgetHerinnering(id) {
    return !!(await stuur("remind-budget", { budget_id: id }));
}
export function useBudgetten() {
    return useKostenBron().budgetten;
}
/** Budgetten van het gekozen ouderpaar (Kosten-pagina). Bij één co-ouder gelijk aan useBudgetten. */
export function useBudgettenPaar() {
    return useKostenPaar().budgetten;
}
