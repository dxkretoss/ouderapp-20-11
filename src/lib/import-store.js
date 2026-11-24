import { useSyncExternalStore } from "react";
import { importeerAfspraken } from "./afspraken-store";
/** Bevestigde import gaat via de server rechtstreeks in de ene afsprakenbron, met het document als herkomst. */
export const voegGeimporteerdToe = (a) => importeerAfspraken([{ titel: a.titel, tekst: a.tekst, onderwerp: "Overig", bron: a.bron }], a.document);
/** Aantal herkende onderdelen dat nog op een keuze wacht — afgeleid uit de importflow, gedeeld met Home. */
let teControleren = 0;
const ls = new Set();
export const zetTeControleren = (n) => { if (n !== teControleren) {
    teControleren = n;
    ls.forEach((l) => l());
} };
export const useTeControleren = () => useSyncExternalStore((l) => { ls.add(l); return () => ls.delete(l); }, () => teControleren, () => teControleren);
