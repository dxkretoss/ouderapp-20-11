import i18n from "@/i18n";
export const verhaalActies = ["bericht", "vakanties", "samen_regelen", "taken", "afspraken", "agenda", "praten", "niets"];
const actie = (id, to) => ({ get label() { return i18n.t(`lib.verhaal.actie.${id}`); }, ...(to ? { to } : {}) });
export const actieInfo = {
    bericht: actie("bericht", "/berichten"),
    vakanties: actie("vakanties", "/planning"),
    samen_regelen: actie("samen_regelen", "/activiteiten"),
    taken: actie("taken", "/taken"),
    afspraken: actie("afspraken", "/afspraken"),
    agenda: actie("agenda", "/agenda"),
    praten: actie("praten"),
    niets: actie("niets"),
};
/** Maximaal drie geldige acties; de actuele vraag bepaalt relevantie, niet de modus. */
export function kiesActies(acties, _modus) {
    const geldig = acties.filter((a) => verhaalActies.includes(a));
    return [...new Set(geldig)].slice(0, 3);
}
/** Lokale herkenning van ernstige zorgen; toont altijd hulpinformatie, ook als de AI faalt. */
export function zorgSignaal(tekst) {
    return /\b(sla(at|an)? me|geslagen|mishandel|geweld|bedreig|dreigt|stalk|achtervolg|bang voor (hem|haar)|niet veilig|onveilig|zelfmoord|mezelf (iets )?aan(doen)?|niet meer leven|dood willen|wil dood|zelfbeschadig|snijd mezelf|misbruik)/i.test(tekst)
        // Engelse signalen, zodat de hulpinformatie ook in de Engelse app verschijnt.
        || /\b(hits? me|beats? me|beaten|abus(e|ed|ive)|violen(t|ce)|threat(en)?|stalk|follow(s|ing)? me|(afraid|scared) of (him|her)|not safe|unsafe|suicid|kill myself|hurt myself|harm myself|self[- ]harm|want to die|don'?t want to live|cut myself)/i.test(tekst);
}
export const contextCategorieen = ["vakanties", "voorstellen", "taken", "afspraken"];
export const categorieLabel = {
    get vakanties() { return i18n.t("lib.verhaal.categorie.vakanties"); },
    get voorstellen() { return i18n.t("lib.verhaal.categorie.voorstellen"); },
    get taken() { return i18n.t("lib.verhaal.categorie.taken"); },
    get afspraken() { return i18n.t("lib.verhaal.categorie.afspraken"); },
};
const vakStatus = (s, van) => s === "afgesproken" ? "bevestigd (afgesproken)" : s === "voorstel" ? `voorstel van ${van ?? "onbekend"}, nog GEEN akkoord` : s === "open" ? "nog niet geregeld" : "ingetrokken";
/** Bouwt alleen de gekozen, relevante categorieën op. Voorstellen worden nooit als afspraak benoemd. */
export function bouwVerhaalContext(b, kies) {
    const delen = [];
    if (kies.includes("vakanties"))
        delen.push("VAKANTIES:\n" + b.vakanties.map((v) => `- ${v.naam} (${v.periode}): ${v.ouder} — ${vakStatus(v.status, v.van)}`).join("\n"));
    if (kies.includes("voorstellen"))
        delen.push("OPEN VOORSTELLEN (geen afspraak tot akkoord):\n" + (b.voorstellen.length ? b.voorstellen.map((v) => `- ${v.titel}: ${v.status}`).join("\n") : "- geen"));
    if (kies.includes("taken"))
        delen.push("TAKEN:\n" + b.taken.filter((t) => !t.klaar).map((t) => `- ${t.tekst}: ${t.wie ? `regelt ${t.wie}` : "nog niemand"}${t.overdragenAan ? " (overdracht wacht op acceptatie)" : ""}`).join("\n"));
    if (kies.includes("afspraken"))
        delen.push("VASTGELEGDE AFSPRAKEN:\n" + b.afspraken.map((a) => `- ${a.titel}: ${a.tekst}`).join("\n"));
    return delen.join("\n\n");
}
// --- Apparaatopslag: toestemming en bewaarde gesprekken ---
const TOESTEMMING = "onzeapp-verhaal-toestemming";
const BEWAARD = "onzeapp-verhaal-bewaard";
export function leesToestemming() {
    try {
        const v = localStorage.getItem(TOESTEMMING);
        return v === "ja" || v === "nee" ? v : null;
    }
    catch {
        return null;
    }
}
export function zetToestemming(v) {
    try {
        if (v)
            localStorage.setItem(TOESTEMMING, v);
        else
            localStorage.removeItem(TOESTEMMING);
    }
    catch { /* geen opslag */ }
}
export function leesBewaard() {
    try {
        const r = JSON.parse(localStorage.getItem(BEWAARD) ?? "[]");
        return Array.isArray(r) ? r : [];
    }
    catch {
        return [];
    }
}
export function bewaarGesprek(b) {
    try {
        localStorage.setItem(BEWAARD, JSON.stringify(b.map(({ rol, tekst }) => ({ rol, tekst }))));
    }
    catch { /* geen opslag */ }
}
export function verwijderBewaard() {
    try {
        localStorage.removeItem(BEWAARD);
    }
    catch { /* geen opslag */ }
}
