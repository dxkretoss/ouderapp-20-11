import { useSyncExternalStore } from "react";
import { leg } from "@/lib/audit-store";

/**
 * "Nu afstemmen": tijdgevoelige praktische zaken tussen ouders (geen noodhulp).
 * Blijft zichtbaar tot hij is opgelost; een reactie wijzigt nooit vanzelf de planning.
 */
export type NaCategorie = "halen" | "ziek" | "planning" | "vergeten" | "anders";
export type NaReactie = "zsm" | "15" | "30" | "60" | "eigen";
export type NuAfstemmen = Readonly<{
  id: string;
  categorie: NaCategorie;
  kindIds: string[];
  titel: string;
  toelichting: string;
  reactieGewenst: NaReactie;
  van: "jij" | "ander";
  status: "open" | "opgelost";
  /** Snelle reacties die bij deze situatie passen. */
  opties: string[];
  antwoord?: string;
  moment: string;
  /** Bij een tijdwijziging: afgesproken en voorgesteld tijdstip, voor het spoedscherm. */
  oudeTijd?: string;
  nieuweTijd?: string;
}>;

export const categorieLabel: Record<NaCategorie, string> = {
  halen: "Ophalen / brengen", ziek: "Kind ziek", planning: "Planning gewijzigd", vergeten: "Iets vergeten / nodig", anders: "Anders",
};
export const reactieLabel: Record<NaReactie, string> = {
  zsm: "Zo snel mogelijk", "15": "Binnen 15 minuten", "30": "Binnen 30 minuten", "60": "Binnen 1 uur", eigen: "Eigen moment",
};
export const standaardOpties: Record<NaCategorie, string[]> = {
  halen: ["Ik haal op", "Dat tijdstip is goed", "Ander voorstel"],
  ziek: ["Ik kan opvangen", "Houd me op de hoogte", "Ander voorstel"],
  planning: ["Is goed", "Lukt niet", "Ander voorstel"],
  vergeten: ["Ik breng het", "Is niet nodig", "Ander voorstel"],
  anders: ["Is goed", "Ik bel even", "Ander voorstel"],
};

let lijst: NuAfstemmen[] = [
  {
    id: "na-demo", categorie: "halen", kindIds: ["emma"], titel: "Ophalen om 15:00 uur lukt niet",
    toelichting: "Staat vast in het verkeer. Verwachte aankomst 15:35 uur.", reactieGewenst: "15", van: "ander", status: "opgelost", antwoord: "Niet meer actueel",
    opties: ["Ik haal Emma op", "15:35 uur is goed", "Ander voorstel"], moment: new Date().toISOString(),
    oudeTijd: "15:00", nieuweTijd: "15:35",
  },
];
const listeners = new Set<() => void>();
const meld = () => listeners.forEach((l) => l());

export function startNuAfstemmen(d: Omit<NuAfstemmen, "id" | "van" | "status" | "opties" | "moment">) {
  const n: NuAfstemmen = { ...d, id: crypto.randomUUID(), van: "jij", status: "open", opties: standaardOpties[d.categorie], moment: new Date().toISOString() };
  lijst = [n, ...lijst];
  leg("besluit", n.id, `Nu afstemmen: ${n.titel}`, "CREATED", undefined, "Sanne", { kinderen: n.kindIds });
  meld();
  return n.id;
}

/** Reageren lost de situatie op; het antwoord wordt vastgelegd, de planning verandert niet vanzelf. */
export function reageerNuAfstemmen(id: string, antwoord: string) {
  const n = lijst.find((x) => x.id === id);
  if (!n || n.status === "opgelost") return;
  lijst = lijst.map((x) => (x.id === id ? { ...x, status: "opgelost", antwoord } : x));
  leg("besluit", id, `Nu afstemmen: ${n.titel}`, "UPDATED", { veld: "reactie", oud: "open", nieuw: antwoord }, "Sanne", { kinderen: n.kindIds });
  meld();
}

export function useNuAfstemmen() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => lijst, () => lijst);
}
/** Lezen zonder hook, voor koppelingen uit andere lagen (bijvoorbeeld "Afgestemd ✓" bij een afspraak). */
export const nuLijst = () => lijst;
export const openNuAfstemmen = (l: readonly NuAfstemmen[]) => l.filter((x) => x.status === "open");
