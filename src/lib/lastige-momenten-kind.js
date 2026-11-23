import i18n from "@/i18n";
/** Zinnen per leeftijdsgroep (samen, jong, midden, oud) bij een moment-id. Tekst uit lib.lastigeMomentenKind.zeg. */
const GROEPEN = ["samen", "jong", "midden", "oud"];
const IDS = [3, 5, 6, 7, 8, 9, 10, 11, 17, 20, 21, 22, 23, 24, 26, 31, 32, 33, 34, 35, 37];
export const zegPerKind = Object.fromEntries(IDS.map((id) => [id, Object.defineProperties({}, Object.fromEntries(GROEPEN.map((g) => [g, {
        enumerable: true,
        get: () => i18n.t(`lib.lastigeMomentenKind.zeg.${id}.${g}`),
    }])))]));
/** Leeftijdsgroep bij een leeftijd in jaren; onbekend = midden. */
export function leeftijdGroep(jaren) {
    if (jaren == null || Number.isNaN(jaren))
        return "midden";
    return jaren < 6 ? "jong" : jaren < 12 ? "midden" : "oud";
}
