import { useSyncExternalStore } from "react";

/**
 * Apparaatvoorkeuren (thema, bijzondere dagen, app-vergrendeling).
 * Bewust per apparaat opgeslagen: het zijn weergave- en beveiligingskeuzes, geen gezinsdata.
 * Voor vergrendeling wordt alleen een verwijzing (credential-id) naar de passkey van het
 * apparaat bewaard — nooit biometrische gegevens.
 */
export type Thema = "licht" | "donker" | "automatisch";
export type Voorkeuren = {
  thema: Thema;
  bijzonderTonen: boolean;
  bijzonderHerinneren: boolean;
  vergrendelId: string | null;
  /** Slimme hulp — elk onderdeel apart uit te zetten. */
  slimSuggesties: boolean;
  weekVooruit: boolean;
  overdrachtHulp: boolean;
  conflictControle: boolean;
  /** Rustmodus: tussen 21:00 en 07:00 geen meldingen over berichten. */
  rustmodus: boolean;
  /** Niet-urgente meldingen samen in één bericht; Nu afstemmen blijft apart. */
  bundelen: boolean;
  /** Nu afstemmen komt ook tijdens rustmodus door en wordt nooit gebundeld. */
  nuAfstemmenAltijd: boolean;
  /** Living Home: sfeerlaag bovenaan Home. */
  livingHome: boolean;
  weerEffecten: boolean;
  seizoenEffecten: boolean;
  bijzondereMomenten: boolean;
  beweging: "automatisch" | "verminderd";
  weerPlaats: string;
  /** Tijden van de rustmodus (HH:MM). */
  rustVan: string;
  rustTot: string;
  /** Berichten: maximaal drie vastgezette gesprekken en tijdelijk gedempte gesprekken (id → tot-tijdstip). */
  vastgezet: string[];
  gedempt: Record<string, number>;
  /** AI-schrijfhulp in Berichten (Help met formuleren, Help mij antwoorden, samenvatten). */
  aiSchrijfhulp: boolean;
  /** Rustiger communiceren: AI-check vóór versturen. Uit = geen analyse vóór versturen. */
  rustigerCommuniceren: boolean;
  communicatieSuggesties: boolean;
  verborgenCommunicatieSuggesties: ("verduidelijking" | "agenda" | "verschil" | "taak")[];
  /** Gestructureerd afstemmen: alleen de eigen weergave; beperkt nooit de andere ouder, spoed of veiligheid. */
  gestructureerdAfstemmen: boolean;
  /** Herinneringen bij openstaande voorstellen pauzeren (bijv. bij veiligheids- of contactafspraken). Voorstellen blijven gewoon zichtbaar. */
  herinneringenGepauzeerd: boolean;
};

const SLEUTEL = "onzeapp-voorkeuren";
const standaard: Voorkeuren = { thema: "automatisch", bijzonderTonen: true, bijzonderHerinneren: false, vergrendelId: null, slimSuggesties: true, weekVooruit: true, overdrachtHulp: true, conflictControle: true, rustmodus: false, bundelen: true, nuAfstemmenAltijd: true, livingHome: true, weerEffecten: true, seizoenEffecten: true, bijzondereMomenten: true, beweging: "automatisch", weerPlaats: "Haarlem", rustVan: "21:00", rustTot: "07:00", vastgezet: [], gedempt: {}, aiSchrijfhulp: true, rustigerCommuniceren: true, communicatieSuggesties: true, verborgenCommunicatieSuggesties: [], gestructureerdAfstemmen: false, herinneringenGepauzeerd: false };
let staat: Voorkeuren = standaard;
let geladen = false;
const luisteraars = new Set<() => void>();

function laad() {
  if (geladen || typeof window === "undefined") return;
  geladen = true;
  try {
    const opgeslagen = JSON.parse(localStorage.getItem(SLEUTEL) ?? "{}");
    delete opgeslagen.slaapjes; // de slaapjes-teller bestaat niet meer
    staat = { ...standaard, ...opgeslagen };
  } catch { /* standaard */ }
}

export function zetVoorkeur<K extends keyof Voorkeuren>(k: K, v: Voorkeuren[K]) {
  laad();
  staat = { ...staat, [k]: v };
  try { localStorage.setItem(SLEUTEL, JSON.stringify(staat)); } catch { /* privémodus */ }
  if (k === "thema") pasThemaToe();
  luisteraars.forEach((l) => l());
}

export function useVoorkeuren(): Voorkeuren {
  return useSyncExternalStore(
    (l) => { laad(); luisteraars.add(l); l(); return () => luisteraars.delete(l); },
    () => { laad(); return staat; },
    () => standaard,
  );
}

export function pasThemaToe() {
  if (typeof window === "undefined") return;
  laad();
  const donker = staat.thema === "donker" || (staat.thema === "automatisch" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", donker);
}

/** Inline script in <head> zodat er geen lichte flits is bij donker thema. */
export const themaScript = `(function(){try{var v=JSON.parse(localStorage.getItem("${SLEUTEL}")||"{}");var t=v.thema||"automatisch";if(t==="donker"||(t==="automatisch"&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}})()`;

export const MAX_VASTGEZET = 3;
/** Zet vast of maak los; geeft false als er al drie vastgezet zijn. */
export function wisselVastgezet(id: string): boolean {
  laad();
  const nu = staat.vastgezet;
  if (nu.includes(id)) { zetVoorkeur("vastgezet", nu.filter((x) => x !== id)); return true; }
  if (nu.length >= MAX_VASTGEZET) return false;
  zetVoorkeur("vastgezet", [...nu, id]);
  return true;
}
/** Dempt gewone meldingen voor één gesprek; spoed (Nu afstemmen) en overdrachten blijven altijd doorkomen. */
export function dempGesprek(id: string, uren: number | null) {
  laad();
  const g = { ...staat.gedempt };
  if (uren === null) delete g[id]; else g[id] = Date.now() + uren * 3600_000;
  zetVoorkeur("gedempt", g);
}
export const isGedempt = (v: Voorkeuren, id: string) => (v.gedempt[id] ?? 0) > Date.now();
