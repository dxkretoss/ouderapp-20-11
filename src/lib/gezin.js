import { useMemo } from "react";
import { authState, useAuth } from "@/lib/auth-store";
import { startState, useStart } from "@/lib/start-store";
/**
 * Wie is wie in het eigen gezin.
 * - ik: de ingelogde ouder (profiel-id van de server)
 * - coOuders: alle gekoppelde andere ouders (per kind kan dat een andere ouder zijn:
 *   kind 1 met ouder A, kind 2 met ouder B)
 * - ander: de andere ouder ALLEEN als er precies één is (het gewone gezin), anders null —
 *   gebruik dan anderVoor(kindIds) voor de andere ouder van die kinderen
 * - kinderen: de kinderen uit start-store (server-uuid's), elk met `ouders` (andere gekoppelde ouders)
 * Solo of Samen geldt per kind (isSamen): een kind is Samen als er een gekoppelde andere ouder bij hoort.
 */
const persoon = (a) => ({ id: a.id, naam: a.name || "", beeld: a.avatar ?? null });
function bouw(g, s) {
    const co = (s.coOuders ?? []).map(persoon);
    const kinderen = s.kinderen ?? [];
    const actief = new Set(co.map((c) => c.id));
    /** De gekoppelde andere ouder(s) van één kind. */
    const vanKind = (kindId) => (kinderen.find((k) => k.id === kindId)?.ouders ?? []).map((o) => o.id).filter((id) => actief.has(id));
    /** De ene andere ouder die ALLE gegeven kinderen met mij deelt; zonder kinderen de enige co-ouder. Anders null. */
    const anderVoor = (kindIds = []) => {
        const ids = [...new Set(kindIds)].filter(Boolean);
        if (!ids.length)
            return co.length === 1 ? co[0] : null;
        const gedeeld = vanKind(ids[0]).filter((p) => ids.every((k) => vanKind(k).includes(p)));
        return gedeeld.length === 1 ? co.find((c) => c.id === gedeeld[0]) ?? null : null;
    };
    return {
        ik: g ? { id: g.id, naam: g.name || "", beeld: g.avatar ?? null } : null,
        ander: co.length === 1 ? co[0] : null,
        coOuders: co,
        kinderen,
        gekoppeld: co.length > 0,
        anderVoor,
        isSamen: (kindId) => vanKind(kindId).length > 0,
        /** Deze kinderen horen bij verschillende andere ouders (dan kan één gedeeld item niet). */
        gemengd: (kindIds = []) => {
            const ids = [...new Set(kindIds)].filter(Boolean);
            return ids.some((k) => vanKind(k).length) && !anderVoor(ids);
        },
    };
}
/** Huidige gezinsrollen zonder hook (voor stores en losse functies). */
export const gezinState = () => bouw(authState().gebruiker, startState());
/** Is dit profiel-id de ingelogde ouder? */
export const isIk = (id) => !!id && id === authState().gebruiker?.id;
/** Naam bij een profiel-id: "jij"-vorm laat de UI zelf bepalen; hier de echte naam of null. */
export function naamVan(id) {
    const { ik, coOuders } = gezinState();
    if (ik && id === ik.id)
        return ik.naam;
    return coOuders.find((c) => c.id === id)?.naam ?? null;
}
export function useGezin() {
    const a = useAuth();
    const s = useStart();
    return useMemo(() => bouw(a.gebruiker, s), [a.gebruiker, s]);
}
