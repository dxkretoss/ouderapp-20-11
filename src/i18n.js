import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { enGB, nl as nlDatum } from "date-fns/locale";
import nl from "./locales/nl.json";
import en from "./locales/en.json";
/** Beschikbare talen. Nieuwe taal = één JSON in src/locales plus één regel hier. */
export const TALEN = [
    { id: "nl", naam: "Nederlands", locale: "nl-NL", datum: nlDatum },
    { id: "en", naam: "English", locale: "en-GB", datum: enGB },
];
export const TAAL_SLEUTEL = "onzeapp-taal";
i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
    resources: { nl: { translation: nl }, en: { translation: en } },
    fallbackLng: "nl",
    supportedLngs: TALEN.map((t) => t.id),
    load: "languageOnly",
    // Teksten staan direct in de bundel: synchroon laden, zodat i18n.t() ook buiten React meteen werkt.
    initAsync: false,
    interpolation: { escapeValue: false },
    returnNull: false,
    // Alleen de bewaarde keuze telt; zonder keuze blijft de app Nederlands.
    detection: { order: ["localStorage"], lookupLocalStorage: TAAL_SLEUTEL, caches: ["localStorage"] },
});
const huidige = () => TALEN.find((t) => t.id === i18n.resolvedLanguage) ?? TALEN[0];
/** Locale voor toLocaleString / Intl (vervangt vaste "nl-NL"). */
export const taalLocale = () => huidige().locale;
/** date-fns locale voor format(). */
export const datumLocale = () => huidige().datum;
/** Lijst uit de vertalingen (bijv. weekdagen): i18n.t met returnObjects. */
export const tLijst = (sleutel) => {
    const v = i18n.t(sleutel, { returnObjects: true });
    return Array.isArray(v) ? v : [];
};
export function zetTaal(id) {
    return i18n.changeLanguage(id);
}
const zetHtmlTaal = () => {
    if (typeof document !== "undefined")
        document.documentElement.lang = huidige().id;
};
zetHtmlTaal();
i18n.on("languageChanged", zetHtmlTaal);
export default i18n;
