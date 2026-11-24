/** Vandaag als YYYY-MM-DD in de lokale tijdzone (voor `max` op datumvelden, bv. een geboortedatum). */
export function vandaagIso(d = new Date()) {
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dag = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${dag}`;
}
/** Ligt een YYYY-MM-DD-datum na vandaag? */
export const inToekomst = (iso) => !!iso && iso > vandaagIso();
