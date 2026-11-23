import i18n from "@/i18n";
/** Weergave van een tijdstip in lopende tekst: "14:30" → "14:30 uur". Voegt nooit dubbel "uur" toe; laat andere tekst (bijv. "Hele dag") staan. */
export function uur(t) {
    if (!t)
        return "";
    const s = t.trim();
    return /\d{1,2}:\d{2}$/.test(s) ? i18n.t("lib.tijdTekst.uur", { tijd: s }) : s;
}
/** Zet "uur" achter ieder tijdstip in een tekst, zonder dubbele toevoeging. */
export function metUur(tekst) {
    return tekst.replace(/\b(\d{1,2}:\d{2})\b(?!:|\s*uur)/g, i18n.t("lib.tijdTekst.uur", { tijd: "$1" }));
}
