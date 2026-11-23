/** Lokale kalenderdatums, zonder UTC-verschuiving. Gedeeld door Home en Agenda. */
export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const dt = (s: string) => new Date(`${s}T00:00`);
export const plusDagen = (s: string, n: number) => { const d = dt(s); d.setDate(d.getDate() + n); return iso(d); };
export const maandagVan = (s: string) => plusDagen(s, -((dt(s).getDay() + 6) % 7));
export type AgendaItem = { id: string; titel: string; datum: string; tijd: string; categorie: string; kind: string; herhaling?: { freq: string; interval: number; eenheid: string; eind?: string | undefined } | undefined; overslaan?: string[] | undefined };
export function voorkomens(a: AgendaItem, van: string, tot: string): string[] {
  const h = a.herhaling;
  if (!h || h.freq === "geen") return a.datum >= van && a.datum <= tot ? [a.datum] : [];
  const uit: string[] = [];
  const start = dt(a.datum);
  for (let i = 0; i < 500; i++) {
    let d = new Date(start);
    const plusMaanden = (n: number) => new Date(start.getFullYear(), start.getMonth() + n, Math.min(start.getDate(), new Date(start.getFullYear(), start.getMonth() + n + 1, 0).getDate()));
    if (h.freq === "wekelijks") d.setDate(d.getDate() + 7 * i);
    else if (h.freq === "tweewekelijks") d.setDate(d.getDate() + 14 * i);
    else if (h.freq === "maandelijks") d = plusMaanden(i);
    else if (h.eenheid === "weken") d.setDate(d.getDate() + 7 * h.interval * i);
    else d = plusMaanden(h.interval * i);
    const s = iso(d);
    if (s > tot || (h.eind && s > h.eind)) break;
    if (s >= van && !a.overslaan?.includes(s)) uit.push(s);
  }
  return uit;
}
export function agendaItems(data: unknown[]): AgendaItem[] {
  return data.filter((a): a is AgendaItem => !!a && typeof a === "object" && "id" in a && "datum" in a && "titel" in a && typeof a.id === "string" && typeof a.datum === "string" && typeof a.titel === "string");
}