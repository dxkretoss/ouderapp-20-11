/**
 * Pure hulpjes voor lijstitems ("Nog nodig"). De lijst zelf staat op de server (lib/nog-nodig-store.js);
 * afvinken verandert alleen het item, nooit budgetten of uitgaven.
 */
export const nieuwLijstItem = (tekst, wie, kind, klaar = false) => ({ id: Date.now() + Math.random(), tekst, wie, kind, klaar });
export const toggleLijstItem = (lijst, id) => lijst.map((i) => i.id === id ? { ...i, klaar: !i.klaar } : i);
