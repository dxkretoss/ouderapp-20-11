import i18n from "@/i18n";
export const toonSchaal = [
    { toon: "rustig", get label() { return i18n.t("lib.communicatiemeter.toon.rustig"); } },
    { toon: "vriendelijk", get label() { return i18n.t("lib.communicatiemeter.toon.vriendelijk"); } },
    { toon: "neutraal", get label() { return i18n.t("lib.communicatiemeter.toon.neutraal"); } },
    { toon: "gevoelig", get label() { return i18n.t("lib.communicatiemeter.toon.gevoelig"); } },
    { toon: "verwijtend", get label() { return i18n.t("lib.communicatiemeter.toon.verwijtend"); } },
    { toon: "escalerend", get label() { return i18n.t("lib.communicatiemeter.toon.escalerend"); } },
];
/** Betrouwbare toon uit een bestaand AI-resultaat; zonder of bij twijfel: null ("Nog niet beoordeeld"). */
export function betrouwbareToon(r) {
    if (!r?.toon || r.toon === "onzeker")
        return null;
    // Een dreigend niveau wint altijd van een mildere toon.
    if (r.niveau === "dreigend" || r.niveau === "escalerend")
        return "escalerend";
    return r.toon;
}
/** Positie van de indicator in procenten (0–100), of null zonder beoordeling. */
export function toonPositie(t) {
    if (!t)
        return null;
    const i = toonSchaal.findIndex((s) => s.toon === t);
    return (i / (toonSchaal.length - 1)) * 100;
}
/** "Even anders formuleren?" vanaf oranje. */
export const vraagtHerformulering = (t) => t === "gevoelig" || t === "verwijtend" || t === "escalerend";
/** Groene bevestiging na verzenden: alleen bij een betrouwbare rustige, vriendelijke of neutrale toon. */
export const verdientBevestiging = (r, succesvol = true) => {
    const t = betrouwbareToon(r);
    return succesvol && r?.niveau === "geen" && r.afstemming === "passend" && (t === "rustig" || t === "vriendelijk" || t === "neutraal");
};
export const signaalSchaal = [
    { signaal: "prettig", get label() { return i18n.t("lib.communicatiemeter.signaal.prettig.label"); }, get tekst() { return i18n.t("lib.communicatiemeter.signaal.prettig.tekst"); } },
    { signaal: "zakelijk", get label() { return i18n.t("lib.communicatiemeter.signaal.zakelijk.label"); }, get tekst() { return i18n.t("lib.communicatiemeter.signaal.zakelijk.tekst"); } },
    { signaal: "hard", get label() { return i18n.t("lib.communicatiemeter.signaal.hard.label"); }, get tekst() { return i18n.t("lib.communicatiemeter.signaal.hard.tekst"); } },
    { signaal: "kwetsend", get label() { return i18n.t("lib.communicatiemeter.signaal.kwetsend.label"); }, get tekst() { return i18n.t("lib.communicatiemeter.signaal.kwetsend.tekst"); } },
];
/** Leid één signaal af uit een bestaande beoordeling; zonder of bij twijfel: null. */
export function signaalUitBeoordeling(r) {
    const t = betrouwbareToon(r);
    if (!t)
        return null;
    if (t === "escalerend")
        return "kwetsend";
    if (t === "verwijtend" || t === "gevoelig")
        return "hard";
    if (t === "neutraal")
        return "zakelijk";
    return "prettig";
}
/** Alleen bij Hard of Kwetsend is een andere formulering zinvol om aan te bieden. */
export const signaalVraagtHerformulering = (s) => s === "hard" || s === "kwetsend";
