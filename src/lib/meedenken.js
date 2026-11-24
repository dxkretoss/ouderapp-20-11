import { bevatBelediging } from "./belediging";
import { mogelijkeOnveiligheid } from "./communicatie-suggesties";
export const meedenkKeuzes = ["Even ventileren", "Gesprek begrijpen", "Reactie opstellen", "Wat is afgesproken?"];
/** Never the live composer: with consent only the last six messages of the open conversation ("ik" = the signed-in parent). */
export function voorbeeldContext(berichten, toestemming, eigen) {
    if (!toestemming || eigen)
        return [];
    return berichten.slice(-6).map((b) => ({ van: b.van === "ik" || b.van === "sanne" ? "ik" : "ander", tekst: b.tekst.slice(0, 1200) }));
}
export function conceptBruikbaar(tekst) {
    return !!tekst.trim() && !bevatBelediging(tekst) && !mogelijkeOnveiligheid(tekst);
}
export function overnameKeuze(huidig, concept, bevestigd = false) {
    if (!conceptBruikbaar(concept) || (huidig.trim() && !bevestigd))
        return null;
    return concept;
}
