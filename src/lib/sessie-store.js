import { useSyncExternalStore } from "react";
import { start } from "@/lib/start-store";
import { auth, authState, opAuth } from "@/lib/auth-store";
/**
 * Sessie = het account (auth-store). Deze module houdt de oude, overal gebruikte API:
 * - "eigen": aangemeld én welkomstappen af (auth-status "aan") → het eigen gezin
 * - "uit": geen (geldige) sessie, nog aan het laden, of de welkomstappen zijn nog niet af
 * Het voorbeeldgezin bestaat niet meer als sessie.
 */
/** Pagina's die ook zonder sessie open mogen: start, inloggen/registreren/herstellen en uitnodigingslinks. */
export const OPENBARE_PADEN = ["/welkom", "/inloggen", "/registreren", "/verifieren", "/wachtwoord-vergeten", "/uitnodiging"];
export const sessieStatus = () => (authState().status === "aan" ? "eigen" : "uit");
export const isAangemeld = () => sessieStatus() !== "uit";
export function useSessie() {
    return useSyncExternalStore((l) => opAuth(l), sessieStatus, () => "uit");
}
export const sessie = {
    /** Welkomstappen afgerond: het profiel is al bijgewerkt via auth-store. */
    aanmeldenEigen: () => { start.terugNaarEigen(); },
    /** Doorgaan met een geldige, bewaarde sessie. */
    doorgaanEigen: () => { start.terugNaarEigen(); },
    /** Voorbeeldgezin is verwijderd; blijft als no-op voor oude aanroepen. */
    voorbeeld: () => { },
    /** Afmelden: server-sessie intrekken, token en gezinsgegevens op dit apparaat wissen. */
    afmelden: async () => {
        try {
            sessionStorage.removeItem("onzeapp-ontgrendeld");
        }
        catch { /* geen opslag */ }
        await auth.logout();
    },
};
