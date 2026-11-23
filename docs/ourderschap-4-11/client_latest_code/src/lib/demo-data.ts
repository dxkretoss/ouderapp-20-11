import avatarSanne from "@/assets/avatar-sanne.jpg";
import avatarJoris from "@/assets/avatar-joris.jpg";
import avatarEmma from "@/assets/avatar-emma.jpg";
import avatarNoah from "@/assets/avatar-noah.jpg";
import { useSyncExternalStore } from "react";
import { leg } from "@/lib/audit-store";

export const parents = {
  sanne: {
    id: "sanne",
    naam: "Sanne",
    volledigeNaam: "Sanne de Vries",
    rol: "Ouder 1",
    avatar: avatarSanne,
    kleur: "brand" as const,
  },
  joris: {
    id: "joris",
    naam: "Joris",
    volledigeNaam: "Joris Bakker",
    rol: "Ouder 2",
    avatar: avatarJoris,
    kleur: "accent" as const,
  },
};

export type ParentId = keyof typeof parents;

export const kinderen = [
  {
    id: "emma",
    naam: "Emma",
    achternaam: "Bakker de Vries",
    leeftijd: 9,
    geboortedatum: "14 april 2016",
    avatar: avatarEmma,
    school: "Basisschool De Boomgaard, groep 6",
    opvang: "BSO Zonnestraal (ma & do)",
    huisarts: "Huisartsenpraktijk Molenwijk · 030 - 234 56 78",
    medisch: "Hooikoorts in het voorjaar. Gebruikt neusspray bij klachten.",
    praktisch: "Zwemt op dinsdag. Heeft een eigen sleutel van beide huizen.",
    contacten: [
      { naam: "Juf Marieke", rol: "Leerkracht groep 6", telefoon: "030 - 111 22 33" },
      { naam: "Oma Riet", rol: "Oma (moederskant)", telefoon: "06 - 12 34 56 78" },
    ],
  },
  {
    id: "noah",
    naam: "Noah",
    achternaam: "Bakker de Vries",
    leeftijd: 6,
    geboortedatum: "2 september 2019",
    avatar: avatarNoah,
    school: "Basisschool De Boomgaard, groep 3",
    opvang: "BSO Zonnestraal (di & vr)",
    huisarts: "Huisartsenpraktijk Molenwijk · 030 - 234 56 78",
    medisch: "Pinda-allergie. EpiPen zit in beide tassen.",
    praktisch: "Voetbalt bij SV Hoograven. Slaapt met knuffel Bram.",
    contacten: [
      { naam: "Meester Sam", rol: "Leerkracht groep 3", telefoon: "030 - 111 22 44" },
      { naam: "Opa Kees", rol: "Opa (vaderskant)", telefoon: "06 - 87 65 43 21" },
    ],
  },
];

export type Categorie =
  | "school"
  | "opvang"
  | "sport"
  | "medisch"
  | "verjaardag"
  | "vakantie"
  | "wissel"
  | "overig";

export const categorieMeta: Record<Categorie, { label: string; icoon: string }> = {
  school: { label: "School", icoon: "🏫" },
  opvang: { label: "Opvang", icoon: "🧸" },
  sport: { label: "Sport", icoon: "⚽" },
  medisch: { label: "Medisch", icoon: "🩺" },
  verjaardag: { label: "Verjaardag", icoon: "🎂" },
  vakantie: { label: "Vakantie", icoon: "🌴" },
  wissel: { label: "Wisselmoment", icoon: "🔁" },
  overig: { label: "Overig", icoon: "📌" },
};

export type Afspraak = {
  id: string;
  titel: string;
  categorie: Categorie;
  kind: string;
  dag: number; // dag van de maand, maart
  datumLabel: string;
  tijd: string;
  locatie: string;
  ouder: ParentId;
};

export const afspraken: Afspraak[] = [
  {
    id: "a1",
    titel: "Ouderavond · De Boomgaard",
    categorie: "school",
    kind: "Emma",
    dag: 12,
    datumLabel: "Vandaag",
    tijd: "19:00",
    locatie: "Basisschool De Boomgaard",
    ouder: "sanne",
  },
  {
    id: "a2",
    titel: "Voetbaltraining",
    categorie: "sport",
    kind: "Noah",
    dag: 13,
    datumLabel: "Donderdag 13 maart",
    tijd: "17:00",
    locatie: "SV Hoograven",
    ouder: "joris",
  },
  {
    id: "a3",
    titel: "Wisselmoment",
    categorie: "wissel",
    kind: "Emma & Noah",
    dag: 14,
    datumLabel: "Vrijdag 14 maart",
    tijd: "14:30",
    locatie: "Basisschool De Boomgaard",
    ouder: "joris",
  },
  {
    id: "a4",
    titel: "Tandarts",
    categorie: "medisch",
    kind: "Noah",
    dag: 15,
    datumLabel: "Zaterdag 15 maart",
    tijd: "10:30",
    locatie: "Tandartspraktijk Vliegend Hert",
    ouder: "joris",
  },
  {
    id: "a5",
    titel: "Zwemles",
    categorie: "sport",
    kind: "Emma",
    dag: 18,
    datumLabel: "Dinsdag 18 maart",
    tijd: "16:15",
    locatie: "Zwembad De Kwakel",
    ouder: "joris",
  },
  {
    id: "a6",
    titel: "BSO Zonnestraal",
    categorie: "opvang",
    kind: "Noah",
    dag: 20,
    datumLabel: "Donderdag 20 maart",
    tijd: "14:00",
    locatie: "BSO Zonnestraal",
    ouder: "sanne",
  },
  {
    id: "a7",
    titel: "Verjaardag Emma",
    categorie: "verjaardag",
    kind: "Emma",
    dag: 25,
    datumLabel: "Dinsdag 25 maart",
    tijd: "Hele dag",
    locatie: "Bij Sanne thuis",
    ouder: "sanne",
  },
  {
    id: "a8",
    titel: "Voorjaarsvakantie",
    categorie: "vakantie",
    kind: "Emma & Noah",
    dag: 28,
    datumLabel: "28 maart t/m 5 april",
    tijd: "Hele week",
    locatie: "Bij Joris · Ardennen",
    ouder: "joris",
  },
];

// Zorgregeling maart: week op / week af, met een paar uitzonderingen
export const zorgweek: { dag: string; datum: number; ouder: ParentId; wissel?: boolean }[] = [
  { dag: "Ma", datum: 10, ouder: "sanne" },
  { dag: "Di", datum: 11, ouder: "sanne" },
  { dag: "Wo", datum: 12, ouder: "sanne" },
  { dag: "Do", datum: 13, ouder: "sanne" },
  { dag: "Vr", datum: 14, ouder: "joris", wissel: true },
  { dag: "Za", datum: 15, ouder: "joris" },
  { dag: "Zo", datum: 16, ouder: "joris" },
];

export const zorgmaand: { datum: number; ouder: ParentId; uitzondering?: string | undefined }[] = Array.from(
  { length: 31 },
  (_, i) => {
    const datum = i + 1;
    const weekIndex = Math.floor((datum + 2) / 7);
    let ouder: ParentId = weekIndex % 2 === 0 ? "joris" : "sanne";
    let uitzondering: string | undefined;
    if (datum >= 28) {
      ouder = "joris";
      uitzondering = "Voorjaarsvakantie";
    }
    if (datum === 25) {
      ouder = "sanne";
      uitzondering = "Verjaardag Emma";
    }
    return { datum, ouder, uitzondering };
  },
);

export type Bericht = {
  id: string;
  van: ParentId;
  tekst: string;
  tijd: string;
};

export type Gesprek = {
  id: string;
  onderwerp: string;
  icoon: string;
  ongelezen: number;
  laatste: string;
  laatsteTijd: string;
  berichten: Bericht[];
};

export const gesprekken: Gesprek[] = [
  {
    id: "algemeen",
    onderwerp: "Dagelijks",
    icoon: "💬",
    ongelezen: 2,
    laatste: "Kan ik Emma morgen om 15:00 uur ophalen?",
    laatsteTijd: "09:12",
    berichten: [
      { id: "b1", van: "joris", tekst: "Goedemorgen! Noah heeft zijn gymtas bij mij laten liggen.", tijd: "08:40" },
      { id: "b2", van: "sanne", tekst: "Geen probleem, hij heeft hier nog een reservetas.", tijd: "08:52" },
      { id: "b3", van: "joris", tekst: "Kan ik Emma morgen om 15:00 ophalen?", tijd: "09:12" },
    ],
  },
  {
    id: "school",
    onderwerp: "School",
    icoon: "🏫",
    ongelezen: 0,
    laatste: "Ik ga naar de ouderavond vanavond, ik stuur je een samenvatting.",
    laatsteTijd: "Gisteren",
    berichten: [
      { id: "b4", van: "sanne", tekst: "Ouderavond is woensdag 19:00 uur. Zal ik gaan?", tijd: "Ma 19:02" },
      { id: "b5", van: "joris", tekst: "Ja prima, ik heb dan training met Noah.", tijd: "Ma 19:30" },
      { id: "b6", van: "sanne", tekst: "Ik ga naar de ouderavond vanavond, ik stuur je een samenvatting.", tijd: "Gisteren" },
    ],
  },
  {
    id: "vakantie",
    onderwerp: "Vakantieplanning",
    icoon: "🌴",
    ongelezen: 0,
    laatste: "Zullen we de zomervakantie in tweeën delen?",
    laatsteTijd: "Ma 20:15",
    berichten: [
      { id: "b7", van: "joris", tekst: "Zullen we de zomervakantie in tweeën delen?", tijd: "Ma 20:15" },
    ],
  },
  {
    id: "kosten",
    onderwerp: "Kosten & betalen",
    icoon: "💶",
    ongelezen: 0,
    laatste: "De nieuwe voetbalschoenen heb ik toegevoegd bij Kosten.",
    laatsteTijd: "Za 11:04",
    berichten: [
      { id: "b8", van: "joris", tekst: "De nieuwe voetbalschoenen heb ik toegevoegd bij Kosten.", tijd: "Za 11:04" },
    ],
  },
];

export type Kostenpost = {
  id: string;
  omschrijving: string;
  categorie: string;
  icoon: string;
  kind: string;
  datum: string;
  bedrag: number;
  betaaldDoor: ParentId;
  verdeling: string;
  aandeelSanne: number;
  status: "betaald" | "openstaand" | "concept" | "wacht" | "bevestigd" | "verrekend" | "betwist";
  /** Wie moet reageren na een verstuurd tegenvoorstel; ontbreekt = wie niet betaalde. */
  aanZet?: ParentId | undefined;
};

export const kosten: Kostenpost[] = [
  { id: "k-zwem", omschrijving: "Extra zwemles", categorie: "Sport", icoon: "🏊", kind: "Noah", datum: "10 maart", bedrag: 40, betaaldDoor: "joris", verdeling: "50 / 50", aandeelSanne: 20, status: "wacht" },
  { id: "k-kamp", omschrijving: "Schoolkamp Emma", categorie: "School", icoon: "🏫", kind: "Emma", datum: "11 maart", bedrag: 90, betaaldDoor: "joris", verdeling: "50 / 50", aandeelSanne: 45, status: "wacht" },
  {
    id: "k1",
    omschrijving: "Voetbalschoenen",
    categorie: "Sport",
    icoon: "⚽",
    kind: "Noah",
    datum: "8 maart",
    bedrag: 64.95,
    betaaldDoor: "joris",
    verdeling: "50 / 50",
    aandeelSanne: 32.48,
    status: "openstaand",
  },
  {
    id: "k2",
    omschrijving: "Schoolreisje groep 6",
    categorie: "School",
    icoon: "🏫",
    kind: "Emma",
    datum: "5 maart",
    bedrag: 42.0,
    betaaldDoor: "sanne",
    verdeling: "50 / 50",
    aandeelSanne: 21.0,
    status: "openstaand",
  },
  {
    id: "k3",
    omschrijving: "Winterjas",
    categorie: "Kleding",
    icoon: "🧥",
    kind: "Emma",
    datum: "2 maart",
    bedrag: 79.99,
    betaaldDoor: "sanne",
    verdeling: "60 / 40",
    aandeelSanne: 48.0,
    status: "betaald",
  },
  {
    id: "k4",
    omschrijving: "Tandarts controle",
    categorie: "Medisch",
    icoon: "🩺",
    kind: "Noah",
    datum: "28 februari",
    bedrag: 38.5,
    betaaldDoor: "joris",
    verdeling: "50 / 50",
    aandeelSanne: 19.25,
    status: "betaald",
  },
  {
    id: "k5",
    omschrijving: "Zwemles maandtermijn",
    categorie: "Sport",
    icoon: "🏊",
    kind: "Emma",
    datum: "1 maart",
    bedrag: 52.0,
    betaaldDoor: "sanne",
    verdeling: "50 / 50",
    aandeelSanne: 26.0,
    status: "betaald",
  },
];

export const documenten = [
  {
    id: "d1",
    naam: "Ouderschapsplan 2025",
    categorie: "Officiële afspraken",
    kind: "Emma & Noah",
    gewijzigd: "8 maart",
    grootte: "1,2 MB",
    icoon: "📄",
  },
  {
    id: "d2",
    naam: "Rapport Emma · groep 6",
    categorie: "School",
    kind: "Emma",
    gewijzigd: "1 maart",
    grootte: "480 kB",
    icoon: "🏫",
  },
  {
    id: "d3",
    naam: "Allergiepaspoort Noah",
    categorie: "Medisch",
    kind: "Noah",
    gewijzigd: "12 februari",
    grootte: "220 kB",
    icoon: "🩺",
  },
  {
    id: "d4",
    naam: "Zorgverzekering kinderen",
    categorie: "Verzekeringen",
    kind: "Emma & Noah",
    gewijzigd: "4 januari",
    grootte: "760 kB",
    icoon: "🛡️",
  },
  {
    id: "d5",
    naam: "Paspoortkopieën",
    categorie: "Overig",
    kind: "Emma & Noah",
    gewijzigd: "20 december",
    grootte: "1,8 MB",
    icoon: "🛂",
  },
];

export const onderlingeAfspraken = [
  {
    id: "o1",
    titel: "Schermtijd",
    icoon: "📱",
    tekst: "Doordeweeks maximaal 1 uur per dag, in het weekend 2 uur. Geen schermen aan tafel.",
    gewijzigd: "Bijgewerkt op 2 maart",
    doorWie: "Samen vastgelegd",
  },
  {
    id: "o2",
    titel: "Bedtijden",
    icoon: "🌙",
    tekst: "Noah om 19:30 uur naar bed, Emma om 20:30 uur. In het weekend een half uur later.",
    gewijzigd: "Bijgewerkt op 14 januari",
    doorWie: "Samen vastgelegd",
  },
  {
    id: "o3",
    titel: "Halen en brengen",
    icoon: "🚗",
    tekst: "De ouder bij wie de kinderen komen, haalt ze op. Wisselmoment standaard bij school om 14:30 uur.",
    gewijzigd: "Bijgewerkt op 8 maart",
    doorWie: "Samen vastgelegd",
  },
  {
    id: "o4",
    titel: "Kleding en spullen",
    icoon: "🎒",
    tekst: "Basisgarderobe in beide huizen. Favoriete knuffels en gymtas reizen mee.",
    gewijzigd: "Bijgewerkt op 5 december",
    doorWie: "Samen vastgelegd",
  },
  {
    id: "o5",
    titel: "Vakanties",
    icoon: "🌴",
    tekst: "Schoolvakanties worden gelijk verdeeld. Uiterlijk 8 weken vooraf samen ingepland.",
    gewijzigd: "Bijgewerkt op 20 februari",
    doorWie: "Samen vastgelegd",
  },
  {
    id: "o6",
    titel: "Medische beslissingen",
    icoon: "🩺",
    tekst: "Niet-spoedeisende behandelingen bespreken we altijd samen voordat we een afspraak maken.",
    gewijzigd: "Bijgewerkt op 11 januari",
    doorWie: "Samen vastgelegd",
  },
];

export type Toegang = "geen" | "bekijken" | "bijdragen";

export const professionals = [
  {
    id: "p1",
    naam: "Marloes Jansen",
    rol: "Mediator",
    organisatie: "Mediationpraktijk Midden",
    status: "Actief tot 1 juni",
    initialen: "MJ",
    rechten: {
      Agenda: "bekijken" as Toegang,
      Zorgregeling: "bekijken" as Toegang,
      Berichten: "geen" as Toegang,
      Kosten: "geen" as Toegang,
      Documenten: "bijdragen" as Toegang,
      Afspraken: "bijdragen" as Toegang,
    },
  },
  {
    id: "p2",
    naam: "Ruben Smit",
    rol: "Gezinscoach",
    organisatie: "Buurtteam Utrecht",
    status: "Uitnodiging verstuurd",
    initialen: "RS",
    rechten: {
      Agenda: "bekijken" as Toegang,
      Zorgregeling: "geen" as Toegang,
      Berichten: "geen" as Toegang,
      Kosten: "geen" as Toegang,
      Documenten: "geen" as Toegang,
      Afspraken: "bekijken" as Toegang,
    },
  },
];

// Centrale kindbank: aanvullende gegevens per kind, gedeeld door alle onderdelen.
export const kindbank: Record<
  string,
  {
    huishoudens: string[];
    klas: string;
    schoolInfo: string;
    tandarts: string;
    apotheek: string;
    allergieen: string;
    medicatie: string;
    maten: { kleding: string; schoen: string; sport?: string; gewijzigd: string };
    activiteiten: { icoon: string; naam: string; wanneer: string }[];
    verzekering: string;
    trainer?: { naam: string; rol: string; telefoon: string };
  }
> = {
  emma: {
    huishoudens: ["Bij Sanne · Molenstraat 12, Utrecht", "Bij Joris · Kanaalweg 48, Utrecht"],
    klas: "Groep 6 · juf Marieke",
    schoolInfo: "Gym op maandag. Schoolreisje 4 juni.",
    tandarts: "Tandartspraktijk Vliegend Hert · 030 - 345 67 89",
    apotheek: "Apotheek Overvecht · 030 - 456 78 90",
    allergieen: "Hooikoorts (voorjaar)",
    medicatie: "Neusspray 1x per dag bij klachten",
    maten: { kleding: "140", schoen: "34", sport: "Zwempak 140", gewijzigd: "2 maart" },
    activiteiten: [
      { icoon: "🏊", naam: "Zwemles", wanneer: "Dinsdag 16:15 uur · De Kwakel" },
      { icoon: "🎹", naam: "Pianoles", wanneer: "Donderdag 15:30 uur" },
    ],
    verzekering: "Zorgverzekering via Sanne · polis 123456",
  },
  noah: {
    huishoudens: ["Bij Sanne · Molenstraat 12, Utrecht", "Bij Joris · Kanaalweg 48, Utrecht"],
    klas: "Groep 3 · meester Sam",
    schoolInfo: "Leesmap elke vrijdag mee terug.",
    tandarts: "Tandartspraktijk Vliegend Hert · 030 - 345 67 89",
    apotheek: "Apotheek Overvecht · 030 - 456 78 90",
    allergieen: "Pinda-allergie",
    medicatie: "EpiPen zit in beide tassen",
    maten: { kleding: "122", schoen: "30", sport: "Voetbalschoenen 30", gewijzigd: "20 februari" },
    activiteiten: [{ icoon: "⚽", naam: "Voetbal", wanneer: "Donderdag 17:00 uur · SV Hoograven" }],
    verzekering: "Zorgverzekering via Joris · polis 654321",
    trainer: { naam: "Trainer Dennis", rol: "Voetbaltrainer SV Hoograven", telefoon: "06 - 11 22 33 44" },
  },
};

export type Gezondheid = { huisarts: string; tandarts: string; apotheek: string; allergieen: string; medicatie: string; verzekering: string; bijzonderheden: string };
let gezondheid: Record<string, Gezondheid> = Object.fromEntries(kinderen.map((k) => {
  const b = kindbank[k.id];
  return [k.id, { huisarts: k.huisarts, tandarts: b?.tandarts ?? "", apotheek: b?.apotheek ?? "", allergieen: b?.allergieen ?? "", medicatie: b?.medicatie ?? "", verzekering: b?.verzekering ?? "", bijzonderheden: k.medisch }];
}));
const gezondheidLuisteraars = new Set<() => void>();
export function useGezondheid(kindId: string) {
  return useSyncExternalStore((l) => { gezondheidLuisteraars.add(l); return () => gezondheidLuisteraars.delete(l); }, () => gezondheid[kindId], () => gezondheid[kindId]);
}
export function bewaarGezondheid(kindId: string, nieuw: Gezondheid) {
  const oud = gezondheid[kindId];
  const kind = kinderen.find((k) => k.id === kindId);
  if (!oud || !kind) return;
  const labels: Record<keyof Gezondheid, string> = { huisarts: "Huisarts", tandarts: "Tandarts", apotheek: "Apotheek", allergieen: "Allergieën", medicatie: "Medicatie", verzekering: "Zorgverzekering", bijzonderheden: "Bijzonderheden" };
  const velden = Object.keys(labels) as (keyof Gezondheid)[];
  if (!velden.some((v) => oud[v] !== nieuw[v])) return;
  gezondheid = { ...gezondheid, [kindId]: { ...nieuw } };
  for (const veld of velden) {
    if (oud[veld] === nieuw[veld]) continue;
    leg("dossier", `gezondheid-${kindId}-${veld}`, `${labels[veld]} · ${kind.naam}`, "UPDATED", { veld: labels[veld], oud: oud[veld], nieuw: nieuw[veld] }, "Sanne", { kinderen: [kind.naam], meta: { type: "Gezondheid" } });
  }
  gezondheidLuisteraars.forEach((l) => l());
}
