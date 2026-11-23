/**
 * Optionele kalenderinformatie: feestdagen en bijzondere dagen (NL).
 * Dynamisch berekend per jaar (Pasen via de Gregoriaanse rekenregel), zodat er geen jaarlijsten onderhouden hoeven te worden.
 * Alleen informatie — een feestdag verandert nooit de zorgregeling; verdeling loopt via de bestaande voorstelflow.
 */
export type BijzondereDag = { datum: string; naam: string; soort: "feestdag" | "bijzonder" };

/** Bereik dat de app kent: huidig jaar tot en met minimaal 25 jaar vooruit. */
export const EERSTE_JAAR = 2026;
export const LAATSTE_JAAR = EERSTE_JAAR + 25;

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const plus = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export function pasen(j: number): Date {
  const a = j % 19, b = Math.floor(j / 100), c = j % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const maand = Math.floor((h + l - 7 * m + 114) / 31), dag = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(j, maand - 1, dag);
}
/** n-de zondag van een maand (maand 0-based). */
const zondag = (j: number, maand: number, n: number) => {
  const eerste = new Date(j, maand, 1);
  return new Date(j, maand, 1 + ((7 - eerste.getDay()) % 7) + (n - 1) * 7);
};

export function dagenVoorJaar(j: number): BijzondereDag[] {
  const p = pasen(j);
  const koningsdag = new Date(j, 3, 27);
  if (koningsdag.getDay() === 0) koningsdag.setDate(26);
  const lijst: [Date, string, BijzondereDag["soort"]][] = [
    [new Date(j, 0, 1), "Nieuwjaarsdag", "feestdag"],
    [new Date(j, 1, 14), "Valentijnsdag", "bijzonder"],
    [plus(p, -2), "Goede Vrijdag", "feestdag"],
    [p, "Eerste Paasdag", "feestdag"],
    [plus(p, 1), "Tweede Paasdag", "feestdag"],
    [koningsdag, "Koningsdag", "feestdag"],
    [new Date(j, 4, 5), "Bevrijdingsdag", "feestdag"],
    [zondag(j, 4, 2), "Moederdag", "bijzonder"],
    [plus(p, 39), "Hemelvaartsdag", "feestdag"],
    [plus(p, 49), "Eerste Pinksterdag", "feestdag"],
    [plus(p, 50), "Tweede Pinksterdag", "feestdag"],
    [zondag(j, 5, 3), "Vaderdag", "bijzonder"],
    [new Date(j, 10, 11), "Sint-Maarten", "bijzonder"],
    [new Date(j, 11, 5), "Sinterklaasavond", "bijzonder"],
    [new Date(j, 11, 24), "Kerstavond", "bijzonder"],
    [new Date(j, 11, 25), "Eerste Kerstdag", "feestdag"],
    [new Date(j, 11, 26), "Tweede Kerstdag", "feestdag"],
    [new Date(j, 11, 31), "Oudejaarsavond", "bijzonder"],
  ];
  return lijst.map(([d, naam, soort]) => ({ datum: iso(d), naam, soort })).sort((a, b) => a.datum.localeCompare(b.datum));
}

const cache = new Map<number, BijzondereDag[]>();
const jaar = (j: number) => { if (!cache.has(j)) cache.set(j, dagenVoorJaar(j)); return cache.get(j)!; };

/** Alle dagen binnen het ondersteunde bereik (lui berekend). */
export const bijzondereDagen: BijzondereDag[] = Array.from({ length: LAATSTE_JAAR - EERSTE_JAAR + 1 }, (_, i) => jaar(EERSTE_JAAR + i)).flat();

export const bijzondereDagOp = (d: string) => {
  const j = Number(d.slice(0, 4));
  if (j < EERSTE_JAAR || j > LAATSTE_JAAR) return undefined;
  return jaar(j).find((b) => b.datum === d);
};
