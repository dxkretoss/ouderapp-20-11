/**
 * Eén centrale "terug in de app"-trigger voor alle stores, in plaats van een eigen `focus`-listener per store.
 *
 * Waarom: `focus` vuurt ook bij klikken in DevTools, na een dialoog of bij wisselen tussen iframes, en elke store
 * haalde dan alles opnieuw op (tientallen verzoeken per tabwissel). Hier:
 * - alleen als de pagina echt verborgen was (andere tab/app) en minstens VERBORGEN_MIN lang;
 * - of als de verbinding terugkomt (`online`);
 * - per taak hooguit eens per `minMs` (standaard 60 s), ook als meerdere triggers kort na elkaar komen.
 */
const VERBORGEN_MIN = 30_000;
const taken = new Map();
let gestart = false;
let verborgenSinds = null;

function draai(forceer = false) {
    const nu = Date.now();
    for (const t of taken.values()) {
        if (!forceer && nu - t.laatst < t.minMs)
            continue;
        t.laatst = nu;
        try {
            const r = t.fn();
            if (r && typeof r.catch === "function")
                r.catch(() => { });
        }
        catch { /* een store die faalt mag de andere niet tegenhouden */ }
    }
}

function start() {
    if (gestart || typeof document === "undefined")
        return;
    gestart = true;
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
            verborgenSinds = Date.now();
            return;
        }
        const wasWeg = verborgenSinds !== null && Date.now() - verborgenSinds >= VERBORGEN_MIN;
        verborgenSinds = null;
        if (wasWeg)
            draai();
    });
    window.addEventListener("online", () => draai(true));
}

/**
 * Registreer een verversing bij terugkeer. `naam` is uniek per taak (opnieuw registreren vervangt de oude).
 * Geeft een afmeldfunctie terug (voor taken die bij een scherm horen).
 */
export function bijTerugkeer(naam, fn, { minMs = 60_000 } = {}) {
    start();
    taken.set(naam, { fn, minMs, laatst: Date.now() });
    return () => { if (taken.get(naam)?.fn === fn) taken.delete(naam); };
}
