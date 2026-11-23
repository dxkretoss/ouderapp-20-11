import type { Voorstel as ZorgVoorstel } from "./zorg-store";
import { nodig, type Afspraak } from "./afspraken-store";
import type { Budget } from "./budget-store";
import type { Vakantie } from "./vakantie-store";
import { aanZetBij, type KostLike } from "./kosten-akkoord";
import type { Aanwezigheid } from "./aanwezigheid-store";
import { leesDatum } from "./kosten-akkoord";

/**
 * Openstaande voorstellen — één afgeleid overzicht over alle bestaande bronnen
 * (zorgregeling, afspraken, budgetten, vakanties, losse kosten, aanwezigheid).
 * Puur lezen: deze module slaat niets op en kopieert geen gegevens; elke bron blijft eigenaar
 * van zijn eigen voorstel. Geen reactie betekent nooit automatisch akkoord, en een verstreken
 * reactiedatum wijzigt nooit een afspraak, betaling of zorgregeling.
 */
export type AfstemStatus =
  | "wacht-op-jouw-reactie"
  | "wacht-op-reactie"
  | "meer-tijd-gevraagd"
  | "tegenvoorstel-ontvangen"
  | "reactiedatum-verstreken"
  | "akkoord"
  | "niet-akkoord"
  | "ingetrokken"
  | "afgerond";

export const statusTekst: Record<AfstemStatus, string> = {
  "wacht-op-jouw-reactie": "Wacht op jouw reactie",
  "wacht-op-reactie": "Wacht op reactie",
  "meer-tijd-gevraagd": "Meer tijd gevraagd",
  "tegenvoorstel-ontvangen": "Tegenvoorstel ontvangen",
  "reactiedatum-verstreken": "Reactiedatum verstreken",
  akkoord: "Akkoord",
  "niet-akkoord": "Niet akkoord",
  ingetrokken: "Ingetrokken",
  afgerond: "Afgerond",
};

export type OpenVoorstel = {
  sleutel: string;
  bron: "zorg" | "afspraak" | "budget" | "vakantie" | "kost" | "aanwezigheid";
  bronId: string;
  titel: string;
  omschrijving: string;
  kind?: string | undefined;
  verzonden?: string | undefined;
  /** Gewenste reactiedatum (ISO), een verzoek — nooit een bindende termijn. */
  reactieDatum?: string | undefined;
  status: AfstemStatus;
  /** true = de ingelogde ouder is de aangewezen ontvanger en moet reageren. */
  aanJou: boolean;
  /** Route naar de bestaande flow waar gereageerd wordt. */
  naar: string;
};

/** Is de gewenste reactiedatum voorbij zonder reactie? Het voorstel blijft gewoon openstaan. */
export const datumVerstreken = (reactieDatum: string | undefined, vandaag: string): boolean => {
  if (!reactieDatum) return false;
  const d = leesDatum(reactieDatum, Number(vandaag.slice(0, 4)));
  const v = leesDatum(vandaag, Number(vandaag.slice(0, 4)));
  return !!d && !!v && d.getTime() < v.getTime();
};

/** Status voor een open voorstel met mogelijke reactiedatum of meer-tijd-vraag. */
function openStatus(aanJou: boolean, reactieDatum: string | undefined, vandaag: string, meerTijd: boolean): AfstemStatus {
  if (meerTijd) return "meer-tijd-gevraagd";
  if (datumVerstreken(reactieDatum, vandaag)) return "reactiedatum-verstreken";
  return aanJou ? "wacht-op-jouw-reactie" : "wacht-op-reactie";
}

export function zorgVoorstelItem(v: ZorgVoorstel, vandaag: string): OpenVoorstel {
  const aanJou = v.van === "Joris";
  const status: AfstemStatus =
    v.status === "geaccepteerd" ? "akkoord"
    : v.status === "afgewezen" ? "niet-akkoord"
    : v.status === "ingetrokken" ? "ingetrokken"
    : v.status === "alternatief" ? "tegenvoorstel-ontvangen"
    : openStatus(aanJou, v.reactieDatum, vandaag, !!v.meerTijd);
  return {
    sleutel: `zorg-${v.id}`, bron: "zorg", bronId: v.id,
    titel: "Wijzigingsvoorstel verdeling", omschrijving: `${v.datumLabel} · ${v.tekst}`,
    kind: v.kinderen.join(" & "), reactieDatum: v.reactieDatum,
    status, aanJou,
    naar: `/zorgregeling?voorstel=${v.id}`,
  };
}

export function afspraakItem(a: Afspraak): OpenVoorstel | null {
  if (!a.voorstel) return null;
  const open = nodig(a.voorstel).length > 0;
  const aanJou = open && nodig(a.voorstel).includes("Sanne");
  return {
    sleutel: `afspraak-${a.id}`, bron: "afspraak", bronId: a.id,
    titel: a.titel, omschrijving: a.voorstel.tekst ?? a.tekst,
    kind: a.kind, verzonden: a.voorstel.datum,
    status: open ? (aanJou ? "wacht-op-jouw-reactie" : "wacht-op-reactie") : "afgerond",
    aanJou, naar: `/afspraken?afspraak=${a.id}`,
  };
}

export function budgetItem(b: Budget, vandaag: string): OpenVoorstel {
  const open = b.status === "wacht" || b.status === "tegenvoorstel";
  const aanJou = open && b.aanZet === "Sanne";
  const meerTijd = open && b.stappen.at(-1)?.wat.startsWith("Meer tijd gevraagd") === true;
  const status: AfstemStatus =
    b.status === "akkoord" ? "akkoord"
    : b.status === "uitgegeven" ? "afgerond"
    : b.status === "geweigerd" ? "niet-akkoord"
    : b.status === "ingetrokken" ? "ingetrokken"
    : b.status === "tegenvoorstel" && !aanJou ? "tegenvoorstel-ontvangen"
    : openStatus(aanJou, b.reactieDatum, vandaag, meerTijd);
  const laatste = [...b.stappen].reverse().find((s) => s.bedrag !== undefined)?.bedrag ?? b.max;
  return {
    sleutel: `budget-${b.id}`, bron: "budget", bronId: b.id,
    titel: `Budget: ${b.wat}`, omschrijving: `€ ${laatste} · verdeling ${b.pctSanne} / ${100 - b.pctSanne}`,
    kind: b.kind, verzonden: b.stappen[0]?.moment, reactieDatum: b.reactieDatum,
    status, aanJou, naar: `/kosten?budget=${b.id}`,
  };
}

export function vakantieItem(v: Vakantie): OpenVoorstel | null {
  if (v.status !== "voorstel" && v.status !== "ingetrokken") return null;
  const aanJou = v.status === "voorstel" && v.van === "Joris";
  return {
    sleutel: `vakantie-${v.id}`, bron: "vakantie", bronId: v.id,
    titel: `Vakantie: ${v.naam}`, omschrijving: `${v.periode}${v.details ? ` · ${v.details}` : ""}`,
    status: v.status === "ingetrokken" ? "ingetrokken" : aanJou ? "wacht-op-jouw-reactie" : "wacht-op-reactie",
    aanJou, naar: `/vakantie/${v.id}`,
  };
}

export function kostItem(k: KostLike & { id: string }): OpenVoorstel | null {
  if (k.status !== "wacht" && k.status !== "betwist") return null;
  const aanJou = k.status === "wacht" && aanZetBij(k) === "sanne";
  return {
    sleutel: `kost-${k.id}`, bron: "kost", bronId: k.id,
    titel: `Uitgave: ${k.omschrijving}`, omschrijving: `€ ${k.bedrag} · ${k.kind}`,
    kind: k.kind, verzonden: k.datum,
    status: k.status === "betwist" ? "niet-akkoord" : aanJou ? "wacht-op-jouw-reactie" : "wacht-op-reactie",
    aanJou, naar: "/kosten",
  };
}

export function aanwezigheidItem(a: Aanwezigheid): OpenVoorstel | null {
  if (a.fase !== "voorstel") return null;
  const aanJou = a.door === "joris";
  return {
    sleutel: `aanwezig-${a.afspraakId}`, bron: "aanwezigheid", bronId: a.afspraakId,
    titel: "Aanwezigheid afstemmen", omschrijving: a.geschiedenis[0]?.tekst ?? "",
    status: aanJou ? "wacht-op-jouw-reactie" : "wacht-op-reactie",
    aanJou, naar: "/agenda",
  };
}

export type VoorstelBronnen = {
  zorg: readonly ZorgVoorstel[];
  afspraken: readonly Afspraak[];
  budgetten: readonly Budget[];
  vakanties: readonly Vakantie[];
  kosten?: readonly (KostLike & { id: string })[];
  aanwezigheid?: readonly Aanwezigheid[];
};

/** Het complete overzicht, afgeleid uit de bestaande bronnen. */
export function verzamelVoorstellen(b: VoorstelBronnen, vandaag: string): OpenVoorstel[] {
  return [
    ...b.zorg.map((v) => zorgVoorstelItem(v, vandaag)),
    ...b.afspraken.map(afspraakItem),
    ...b.budgetten.map((x) => budgetItem(x, vandaag)),
    ...b.vakanties.map(vakantieItem),
    ...(b.kosten ?? []).map(kostItem),
    ...(b.aanwezigheid ?? []).map(aanwezigheidItem),
  ].filter((x): x is OpenVoorstel => x !== null);
}

const OPEN: AfstemStatus[] = ["wacht-op-jouw-reactie", "wacht-op-reactie", "meer-tijd-gevraagd", "tegenvoorstel-ontvangen", "reactiedatum-verstreken"];
export const isOpen = (v: OpenVoorstel) => OPEN.includes(v.status);
export const wachtOpJou = (l: readonly OpenVoorstel[]) => l.filter((v) => v.aanJou && isOpen(v));
export const wachtOpAnder = (l: readonly OpenVoorstel[]) => l.filter((v) => !v.aanJou && isOpen(v));
export const afgerond = (l: readonly OpenVoorstel[]) => l.filter((v) => !isOpen(v));

/** Feitelijke telling voor het professionele afstemmingsoverzicht — geen oordeel, alleen aantallen. */
export function telling(l: readonly OpenVoorstel[]) {
  return {
    ingediend: l.length,
    beantwoord: l.filter((v) => v.status === "akkoord" || v.status === "niet-akkoord" || v.status === "afgerond").length,
    zonderReactie: l.filter((v) => v.status === "wacht-op-reactie" || v.status === "wacht-op-jouw-reactie" || v.status === "meer-tijd-gevraagd").length,
    verstreken: l.filter((v) => v.status === "reactiedatum-verstreken").length,
    tegenvoorstellen: l.filter((v) => v.status === "tegenvoorstel-ontvangen").length,
  };
}
