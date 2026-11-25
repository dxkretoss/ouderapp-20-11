import { useGezin } from "@/lib/gezin";
import { useKostenPaar } from "@/lib/kosten-store";
/**
 * Kan een kostenitem met deze kinderen gedeeld worden, en met wie?
 * - Met kinderen: de ene andere ouder die al deze kinderen met jou deelt (per kind kan dat een andere zijn).
 * - Zonder kinderen ("Gezin/algemeen"): de gekozen andere ouder op de Kosten-pagina.
 * `gemengd`: de kinderen horen bij verschillende andere ouders → één gedeeld item kan niet (MIXED_CHILDREN).
 */
export function useDeelOpties(kindIds = []) {
    const g = useGezin();
    const paar = useKostenPaar();
    const ids = (kindIds ?? []).filter(Boolean);
    if (!ids.length)
        return { kan: !!paar.partnerId, anderId: paar.partnerId ?? null, gemengd: false };
    const gemengd = g.gemengd(ids);
    const ander = gemengd ? null : g.anderVoor(ids);
    return { kan: !!ander, anderId: ander?.id ?? null, gemengd };
}
