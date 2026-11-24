/** Geen voorbeeldafspraken meer: de gevolgencheck kijkt alleen naar vaste routines (agenda-koppeling volgt later). */
const afspraken = [];
import { useSlimmeHulp } from "@/lib/slimme-hulp";
import { kindNamen } from "@/lib/zorg-store";
import i18n, { tLijst } from "@/i18n";
const t = (k, o) => i18n.t(`lib.gevolgen.${k}`, o);
/**
 * Gevolgencheck: pure regels die alleen lezen. Toont wat een zorgvoorstel raakt
 * (afspraken en vaste spullen op die dagen); voert nooit zelf iets uit.
 */
// Nederlandse dagnamen: vergelijken met routine.dag (bronwaarde). Tonen via common.dagen.
const weekdagen = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const toonDag = (d) => { const i = weekdagen.indexOf(d); return i >= 0 ? tLijst("common.dagen")[(i + 6) % 7] ?? d : d; };
export function gevolgenVan(v, routines) {
    if (!v.dagen.length)
        return [];
    const namen = v.kinderen.map((k) => kindNamen[k]);
    if (v.soort === "structureel") {
        // Structureel: alles vanaf de eerste dag van de nieuwe regeling, en vaste wekelijkse spullen.
        const vanaf = v.dagen[0] ?? 1;
        const uitS = afspraken
            .filter((a) => a.dag >= vanaf && namen.some((n) => a.kind.includes(n)))
            .slice(0, 5)
            .map((a) => ({ id: `a-${a.id}`, soort: "afspraak", tekst: t("afspraakMaart", { titel: a.titel, dag: a.dag, tijd: a.tijd, kind: a.kind }) }));
        for (const r of routines) {
            if (v.kinderen.includes(r.kind))
                uitS.push({ id: `r-${r.id}`, soort: "spullen", tekst: t("spullenStructureel", { item: r.item, dag: toonDag(r.dag) }) });
        }
        return uitS;
    }
    const uit = [];
    for (const dag of v.dagen) {
        for (const a of afspraken) {
            if (a.dag === dag && namen.some((n) => a.kind.includes(n)))
                uit.push({ id: `a-${a.id}`, soort: "afspraak", tekst: t("afspraak", { titel: a.titel, tijd: a.tijd, kind: a.kind }) });
        }
        const wd = weekdagen[new Date(2026, 2, dag).getDay()];
        for (const r of routines) {
            if (r.dag === wd && v.kinderen.includes(r.kind))
                uit.push({ id: `r-${r.id}-${dag}`, soort: "spullen", tekst: t("spullenMee", { item: r.item }) });
        }
    }
    return uit.filter((g, i) => uit.findIndex((x) => x.id === g.id) === i);
}
export function useGevolgen(v) {
    const { routines } = useSlimmeHulp();
    return gevolgenVan(v, routines);
}
