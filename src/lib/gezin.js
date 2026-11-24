import { useMemo } from "react";
import { authState, useAuth } from "@/lib/auth-store";
import { startState, useStart } from "@/lib/start-store";
/**
 * Wie is wie in het eigen gezin — de vervanger van de vaste "sanne"/"joris" uit de demo.
 * - ik: de ingelogde ouder (profiel-id van de server)
 * - ander: de gekoppelde andere ouder (eerste actieve koppeling) of null
 * - kinderen: de kinderen uit start-store (server-uuid's)
 * Stores die vroeger "sanne"/"joris" bewaarden, slaan voortaan profiel-id's op en vergelijken met ik.id.
 */
function bouw(g, s) {
    const a = s.coOuders?.[0] ?? null;
    return {
        ik: g ? { id: g.id, naam: g.name || "", beeld: g.avatar ?? null } : null,
        ander: a ? { id: a.id, naam: a.name || "", beeld: a.avatar ?? null } : null,
        kinderen: s.kinderen ?? [],
        gekoppeld: !!a,
    };
}
/** Huidige gezinsrollen zonder hook (voor stores en losse functies). */
export const gezinState = () => bouw(authState().gebruiker, startState());
/** Is dit profiel-id de ingelogde ouder? */
export const isIk = (id) => !!id && id === authState().gebruiker?.id;
/** Naam bij een profiel-id: "jij"-vorm laat de UI zelf bepalen; hier de echte naam of null. */
export function naamVan(id) {
    const { ik, ander } = gezinState();
    if (ik && id === ik.id)
        return ik.naam;
    if (ander && id === ander.id)
        return ander.naam;
    return null;
}
export function useGezin() {
    const a = useAuth();
    const s = useStart();
    return useMemo(() => bouw(a.gebruiker, s), [a.gebruiker, s]);
}
