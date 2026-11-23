/** Gedeelde besluiten (demo), gelezen door Besluiten en Dossier exporteren. */
export type Log = { wanneer: string; wie: string; wat: string };
export type Beslissing = {
  id: number;
  titel: string;
  soort: string;
  kind: string;
  sanne?: "akkoord" | "niet" | undefined;
  joris?: "akkoord" | "niet";
  modus: "goedkeuring" | "informatie" | "mening";
  log: Log[];
};


export const start: Beslissing[] = [
  { id: 1, titel: "Emma naar middelbare school Het Lyceum (open dag 12 april)", soort: "Schoolkeuze", kind: "emma", sanne: "akkoord", modus: "goedkeuring", log: [{ wanneer: "10 mrt 20:14", wie: "Sanne", wat: "Voorstel gedaan" }] },
  { id: 2, titel: "Noah beugel laten plaatsen bij orthodontist", soort: "Medisch", kind: "noah", sanne: "akkoord", joris: "akkoord", modus: "goedkeuring", log: [
    { wanneer: "2 mrt 09:30 uur", wie: "Joris", wat: "Voorstel gedaan" },
    { wanneer: "3 mrt 18:02 uur", wie: "Sanne", wat: "Akkoord" },
    { wanneer: "3 mrt 18:05 uur", wie: "Joris", wat: "Correctie: start in mei i.p.v. april" },
  ] },
];
