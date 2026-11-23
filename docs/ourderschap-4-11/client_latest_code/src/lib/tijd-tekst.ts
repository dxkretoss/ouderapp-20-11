/** Weergave van een tijdstip in lopende tekst: "14:30" → "14:30 uur". Voegt nooit dubbel "uur" toe; laat andere tekst (bijv. "Hele dag") staan. */
export function uur(t?: string | null): string {
  if (!t) return "";
  const s = t.trim();
  return /\d{1,2}:\d{2}$/.test(s) ? `${s} uur` : s;
}

/** Zet "uur" achter ieder tijdstip in een tekst, zonder dubbele toevoeging. */
export function metUur(tekst: string): string {
  return tekst.replace(/\b(\d{1,2}:\d{2})\b(?!:|\s*uur)/g, "$1 uur");
}
