import { useSyncExternalStore } from "react";

/**
 * Nederlandse schoolvakanties per regio (kalenderinformatie, géén zorgverdeling).
 * Verdeling tijdens een vakantie loopt altijd via de bestaande voorstel- en akkoordflow.
 */
export type Regio = "noord" | "midden" | "zuid";
export const regioLabel: Record<Regio, string> = { noord: "Regio Noord", midden: "Regio Midden", zuid: "Regio Zuid" };
export const regioUitleg: Record<Regio, string> = {
  noord: "o.a. Groningen, Friesland, Drenthe, Overijssel, Noord-Holland",
  midden: "o.a. Utrecht, Zuid-Holland, deel Gelderland en Noord-Brabant",
  zuid: "o.a. Limburg, Zeeland, grootste deel Noord-Brabant",
};

export type Schoolvakantie = { naam: string; van: string; tot: string };
type Rij = { naam: string; noord: [string, string]; midden: [string, string]; zuid: [string, string] };
const alle = (van: string, tot: string): Pick<Rij, Regio> => ({ noord: [van, tot], midden: [van, tot], zuid: [van, tot] });

const tabel: Rij[] = [
  { naam: "Herfstvakantie", noord: ["2025-10-18", "2025-10-26"], midden: ["2025-10-18", "2025-10-26"], zuid: ["2025-10-11", "2025-10-19"] },
  { naam: "Kerstvakantie", ...alle("2025-12-20", "2026-01-04") },
  { naam: "Voorjaarsvakantie", ...alle("2026-02-14", "2026-02-22") },
  { naam: "Meivakantie", ...alle("2026-04-25", "2026-05-03") },
  { naam: "Zomervakantie", noord: ["2026-07-04", "2026-08-16"], midden: ["2026-07-18", "2026-08-30"], zuid: ["2026-07-11", "2026-08-23"] },
  { naam: "Herfstvakantie", noord: ["2026-10-17", "2026-10-25"], midden: ["2026-10-17", "2026-10-25"], zuid: ["2026-10-10", "2026-10-18"] },
  { naam: "Kerstvakantie", ...alle("2026-12-19", "2027-01-03") },
];

let regio: Regio = "midden";
const luisteraars = new Set<() => void>();
export function zetRegio(r: Regio) { regio = r; luisteraars.forEach((l) => l()); }
export function useRegio() {
  return useSyncExternalStore((l) => { luisteraars.add(l); return () => luisteraars.delete(l); }, () => regio, () => regio);
}

export const vakantiesVoor = (r: Regio): Schoolvakantie[] => tabel.map((t) => ({ naam: t.naam, van: t[r][0], tot: t[r][1] }));
export const vakantieOp = (r: Regio, iso: string) => vakantiesVoor(r).find((v) => iso >= v.van && iso <= v.tot);
export const vakantiesTussen = (r: Regio, van: string, tot: string) => vakantiesVoor(r).filter((v) => v.tot >= van && v.van <= tot);
