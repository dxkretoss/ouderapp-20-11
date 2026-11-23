import { useSyncExternalStore } from "react";

/** Vakantieverdeling — één bron voor Vakanties & bijzondere dagen én Home. Een voorstel geldt pas na akkoord. */
export type Ouder = "Sanne" | "Joris" | "Samen" | "Nog open";
export type Vakantie = { id: string; naam: string; periode: string; ouder: Ouder; details: string; status: "afgesproken" | "open" | "voorstel" | "ingetrokken"; van?: string | undefined };

let lijst: readonly Vakantie[] = [
  { id: "v1", naam: "Voorjaarsvakantie", periode: "14–22 feb", ouder: "Joris", details: "Skiën Oostenrijk · paspoorten mee", status: "afgesproken" },
  { id: "v2", naam: "Pasen", periode: "5–6 apr", ouder: "Samen", details: "Paasbrunch bij oma", status: "afgesproken" },
  { id: "v3", naam: "Meivakantie", periode: "25 apr–3 mei", ouder: "Sanne", details: "Texel · vertrek 10:00 uur", status: "afgesproken" },
  { id: "v4", naam: "Zomervakantie deel 1", periode: "18 jul–2 aug", ouder: "Nog open", details: "", status: "open" },
  { id: "v5", naam: "Zomervakantie deel 2", periode: "3–30 aug", ouder: "Joris", details: "", status: "voorstel", van: "Joris" },
  { id: "v6", naam: "Kerst", periode: "24–26 dec", ouder: "Nog open", details: "", status: "open" },
];
const ls = new Set<() => void>();
const zet = (n: readonly Vakantie[]) => { lijst = n; ls.forEach((l) => l()); };

export function useVakanties() {
  return useSyncExternalStore((l) => { ls.add(l); return () => ls.delete(l); }, () => lijst, () => lijst);
}
export const voegVakantieVoorstelToe = (v: Omit<Vakantie, "id" | "status" | "van">) =>
  zet([...lijst, { ...v, id: `v-${Date.now()}`, status: "voorstel", van: "Sanne" }]);
export const stelVerdelingVoor = (id: string, ouder: Ouder) =>
  zet(lijst.map((v) => (v.id === id && v.status === "open" ? { ...v, ouder, status: "voorstel", van: "Sanne" } : v)));
/** Akkoord: pas nu wordt het "Afgesproken". */
export function accepteerVakantie(id: string, door = "Joris"): boolean {
  const v = lijst.find((x) => x.id === id);
  if (!v || v.status !== "voorstel" || !v.van || v.van === door) return false;
  zet(lijst.map((x) => x.id === id ? { ...x, status: "afgesproken" } : x));
  return true;
}
/** Niet akkoord: het voorstel vervalt en de vakantie is weer "nog niet geregeld"; bestaande verdeling blijft gelden. */
export function wijsVakantieAf(id: string, door = "Sanne"): boolean {
  const v = lijst.find((x) => x.id === id);
  if (!v || v.status !== "voorstel" || !v.van || v.van === door) return false;
  zet(lijst.map((x) => x.id === id ? { ...x, ouder: "Nog open", status: "open", van: undefined } : x));
  return true;
}
/** Withdrawal retains the same source object and is final. */
export function trekVakantieIn(id: string, door = "Sanne"): boolean {
  const v = lijst.find((x) => x.id === id);
  if (!v || v.status !== "voorstel" || v.van !== door) return false;
  zet(lijst.map((x) => x.id === id ? { ...x, status: "ingetrokken" } : x));
  return true;
}

/** Verdeelhulp: telt afgesproken vakanties per ouder en stelt voor open vakanties om-en-om voor, beginnend bij wie het minst heeft. De telling weegt de lengte van een vakantie niet mee, dus ze zegt niets over wat eerlijk of passend is. Alleen een suggestie; niets verandert vanzelf. */
export function verdeelSuggestie(l: readonly Vakantie[]) {
  const telling = { Sanne: 0, Joris: 0 };
  l.forEach((v) => { if (v.status === "afgesproken" && (v.ouder === "Sanne" || v.ouder === "Joris")) telling[v.ouder]++; });
  let volgende: "Sanne" | "Joris" = telling.Sanne <= telling.Joris ? "Sanne" : "Joris";
  const voorstel = l.filter((v) => v.status === "open").map((v) => { const o = volgende; volgende = o === "Sanne" ? "Joris" : "Sanne"; return { id: v.id, naam: v.naam, periode: v.periode, ouder: o }; });
  return { telling, voorstel };
}
export const vakantieLijst = () => lijst;
