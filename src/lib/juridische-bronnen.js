import i18n from "@/i18n";
const t = (k, o) => i18n.t(`lib.juridischeBronnen.${k}`, o);
// Organisatienamen en URL's blijven gelijk; groep, titel en uitleg worden bij het lezen vertaald. `groepId` is de vaste sleutel.
const bron = (id, groepId, url) => ({ id, groepId, get groep() { return t(`groep.${groepId}`); }, get titel() { return t(`bron.${id}.titel`); }, get uitleg() { return t(`bron.${id}.uitleg`); }, url });
export const juridischeBronnen = [
    bron("loket", "gratis", "https://www.juridischloket.nl"),
    bron("rijk-scheiden", "officieel", "https://www.rijksoverheid.nl/onderwerpen/scheiden"),
    bron("rechtspraak", "officieel", "https://www.rechtspraak.nl/Onderwerpen/Scheiden"),
    bron("nibud", "geld", "https://www.nibud.nl"),
    bron("mfn", "samen", "https://mfnregister.nl"),
    bron("advocaat", "samen", "https://www.vfas.nl"),
];
const document = (id) => ({ id, get titel() { return t(`document.${id}.titel`); }, get bijgewerkt() { return t(`document.${id}.bijgewerkt`); }, get alineas() { const v = t(`document.${id}.alineas`, { returnObjects: true }); return Array.isArray(v) ? v : []; } });
export const appDocumenten = [document("voorwaarden"), document("privacy"), document("cookies"), document("abonnement")];
