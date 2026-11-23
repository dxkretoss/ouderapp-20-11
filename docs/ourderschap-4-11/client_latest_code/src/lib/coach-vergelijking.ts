/** Alleen hoofdletters, witruimte en afsluitende leestekens zijn geen herformulering. */
export function heeftHerformulering(origineel: string, voorstel: string): boolean {
  const normaliseer = (tekst: string) => tekst.normalize("NFC").trim().toLocaleLowerCase("nl-NL").replace(/\s+/g, " ").replace(/[.!?…]+$/, "").trim();
  return !!voorstel.trim() && normaliseer(origineel) !== normaliseer(voorstel);
}