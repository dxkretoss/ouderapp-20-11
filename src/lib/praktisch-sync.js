import { toast } from "sonner";
import { useSyncExternalStore } from "react";
import { foutTekst } from "@/lib/api";
import { authState, opAuth } from "@/lib/auth-store";
import { bijTerugkeer } from "@/lib/terugkeer";
/**
 * Serverbronnen van het praktische domein (taken, spullen, momentjes, documenten, afspraken, geschiedenis,
 * meldingen, evaluaties): laden na inloggen, verversen bij focus (geen realtime: RLS blokkeert dat),
 * leegmaken bij afmelden of een ander account. Elke store meldt zich één keer aan met `serverBron`.
 */
const bronnen = new Set();
let gestart = false;
let voorId = null;
const MIN_TUSSEN = 4000;
/** Een bron geldt als "in gebruik" als een scherm hem de laatste minuut opvroeg. */
const IN_GEBRUIK = 60_000;
/** Gegevens ouder dan dit worden bij het volgende gebruik op de achtergrond ververst. */
const VERSHEID = 120_000;
function huidigAccount() {
    const a = authState();
    return (a.status === "aan" || a.status === "onboarding") && a.gebruiker ? a.gebruiker.id : null;
}
function controleer() {
    const id = huidigAccount();
    if (id === voorId)
        return;
    voorId = id;
    bronnen.forEach((b) => { b.wis(); if (id)
        b.ververs(true); });
}
function start() {
    if (gestart || typeof window === "undefined")
        return;
    gestart = true;
    opAuth(controleer);
    queueMicrotask(controleer);
    // Terug in de app: alleen bronnen die een scherm de laatste minuut gebruikte; de rest ververst pas bij gebruik.
    bijTerugkeer("praktisch", () => { if (voorId)
        bronnen.forEach((b) => { if (Date.now() - b.gebruikt < IN_GEBRUIK) b.ververs(false); }); });
}
/** Meldt een bron aan. `laad()` haalt alles op (async), `wis()` zet de store terug naar leeg. */
export function serverBron({ laad, wis }) {
    let laatst = 0;
    let bezig = null;
    // Laadstatus voor de schermen: "leeg" (nog niets), "laden" (eerste keer onderweg), "klaar", "fout" (eerste keer mislukt).
    let status = "leeg";
    const statusLuisteraars = new Set();
    const zetStatus = (s) => { if (status !== s) {
        status = s;
        statusLuisteraars.forEach((l) => l());
    } };
    const b = {
        gebruikt: 0,
        wis: () => { zetStatus("leeg"); wis(); },
        ververs(direct) {
            if (bezig || (!direct && Date.now() - laatst < MIN_TUSSEN))
                return bezig ?? Promise.resolve();
            laatst = Date.now();
            if (status !== "klaar")
                zetStatus("laden");
            bezig = Promise.resolve().then(laad)
                .then(() => zetStatus("klaar"), (e) => { zetStatus(status === "klaar" ? "klaar" : "fout"); meldFout(e); })
                .finally(() => { bezig = null; });
            return bezig;
        },
    };
    bronnen.add(b);
    return {
        /** Zorgt dat het volgen loopt (aanroepen vanuit hooks/getters; doet niets op de server-side render of in tests). */
        zorg: () => {
            start();
            if (gestart && voorId === null)
                controleer();
            b.gebruikt = Date.now();
            // Verouderd en een scherm vraagt erom: op de achtergrond verversen (niet tijdens het renderen).
            if (voorId && status === "klaar" && !bezig && Date.now() - laatst > VERSHEID)
                queueMicrotask(() => b.ververs(false));
        },
        ververs: () => b.ververs(true),
        isEigen: () => voorId !== null,
        /** "leeg" | "laden" | "klaar" | "fout" — voor laad- en foutweergaven (zie LaadStatus in components/Laden). */
        useStatus: () => useSyncExternalStore((l) => { statusLuisteraars.add(l); return () => statusLuisteraars.delete(l); }, () => status, () => status),
    };
}
/** Rustige foutmelding (één toast tegelijk per bron), zoals start-store. */
export function meldFout(e, id = "praktisch-fout") {
    if (e?.code === "UNAUTHORIZED" || typeof window === "undefined")
        return;
    toast.error(foutTekst(e), { id });
}
/** Optimistisch bijwerken: `doe()` past de store direct aan en geeft een terugdraaifunctie; daarna de server. */
export async function optimistisch(doe, aanroep, foutId) {
    const terug = doe();
    try {
        return await aanroep();
    }
    catch (e) {
        terug?.();
        meldFout(e, foutId);
        return undefined;
    }
}
/** Bestand → data-URL (base64), voor uploads via een edge function. */
export function leesAlsDataUrl(file) {
    return new Promise((ok, fout) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result));
        r.onerror = () => fout(r.error);
        r.readAsDataURL(file);
    });
}
/** Foto verkleinen (max 1600px) en opnieuw als JPEG opslaan: kleiner bestand en geen EXIF/locatie. */
export async function verkleinFoto(file, max = 1600) {
    const bmp = await createImageBitmap(file);
    const schaal = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * schaal);
    c.height = Math.round(bmp.height * schaal);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    return c.toDataURL("image/jpeg", 0.82);
}
