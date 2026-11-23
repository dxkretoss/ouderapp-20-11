import type { CoachResultaat } from "./coach.functions";

/** Toon "Even anders formuleren?" alleen bij een signaal, en niet opnieuw voor hetzelfde ongewijzigde concept. */
export function moetWaarschuwen(r: Pick<CoachResultaat, "niveau">, tekst: string, alGewaarschuwd: string | null): boolean {
  if (r.niveau === "geen") return false;
  if (r.niveau === "dreigend") return true; // veiligheid gaat altijd voor
  return tekst.trim() !== (alGewaarschuwd ?? "").trim();
}

/** Een AI-vermoeden van afwijking telt alleen als er een bevestigde afspraak is om tegen te houden. */
export const toonAfwijking = (aiVermoeden: boolean, bevestigdeAfspraak: boolean) => aiVermoeden && bevestigdeAfspraak;

/** Een analyse blijft alleen geldig voor exact dezelfde tekst en gesprekscontext. */
export function analyseVoor<T>(cache: { sleutel: string; resultaat: T } | null, sleutel: string): T | null {
  return cache?.sleutel === sleutel ? cache.resultaat : null;
}
