import i18n, { taalLocale, tLijst } from "@/i18n";
export const abonnementen = [
    { id: "maand", get naam() { return i18n.t("lib.abonnement.plan.maand.naam"); }, prijsCent: 499, periode: "maand", proefDagen: 14 },
    { id: "jaar", get naam() { return i18n.t("lib.abonnement.plan.jaar.naam"); }, prijsCent: 4900, periode: "jaar", proefDagen: 14, get toelichting() { return i18n.t("lib.abonnement.plan.jaar.toelichting"); } },
];
/** Wat in het abonnement zit; tekst wordt bij het lezen in de UI-taal opgehaald. */
export const inbegrepen = () => tLijst("lib.abonnement.inbegrepen");
export const euro = (cent) => (cent / 100).toLocaleString(taalLocale(), { style: "currency", currency: "EUR" });
/** Beperkt bewaarabonnement: prijs en voorwaarden zijn configuratie, geen vaste architectuur. */
export const bewaarPlan = {
    get naam() { return i18n.t("lib.abonnement.bewaarPlan.naam"); },
    prijsCent: 200,
    periode: "maand",
    bewaartermijnMaanden: 24,
    get blijftBewaard() { return tLijst("lib.abonnement.bewaarPlan.blijftBewaard"); },
    get blijftBeschikbaar() { return tLijst("lib.abonnement.bewaarPlan.blijftBeschikbaar"); },
    get gaatUit() { return tLijst("lib.abonnement.bewaarPlan.gaatUit"); },
};
import { useSyncExternalStore } from "react";
let ab = { status: "actief", planId: "jaar", verlengdatum: "2027-01-14", betaalmethode: "App Store" };
const abL = new Set();
export const zetAbonnement = (p) => { ab = { ...ab, ...p }; abL.forEach((l) => l()); };
export const useAbonnement = () => useSyncExternalStore((l) => { abL.add(l); return () => abL.delete(l); }, () => ab, () => ab);
/** Waarom ouders het abonnement nemen: concreet, zonder beloftes die de app niet waarmaakt. */
const voordeel = (functie, id) => ({ functie, id, get titel() { return i18n.t(`lib.abonnement.voordelen.${id}.titel`); }, get tekst() { return i18n.t(`lib.abonnement.voordelen.${id}.tekst`); } });
export const voordelen = [
    voordeel("co", "rustiger"),
    voordeel("agenda", "eenPlek"),
    voordeel("kosten", "verrekenen"),
    voordeel("kindtips", "kindCentraal"),
];
