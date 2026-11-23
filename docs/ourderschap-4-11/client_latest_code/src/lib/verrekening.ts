// Interne verrekenmotor voor de kostenmodule.
// Principe: openstaande kosten worden tegen elkaar weggestreept;
// alleen het netto resterende saldo hoeft te worden betaald.
// De motor is volledig onafhankelijk van een externe betaalprovider.

import type { Kostenpost } from "@/lib/demo-data";

export type OuderId = "sanne" | "joris";

/** Statussen van een kostenpost in de verrekenflow. */
export type KostenStatus = "concept" | "wacht" | "bevestigd" | "verrekend" | "betwist";

export const statusLabel: Record<KostenStatus, string> = {
  concept: "Concept",
  wacht: "Afstemmen",
  bevestigd: "Bevestigd",
  verrekend: "Afgerekend",
  betwist: "Nog niet geregeld · geen akkoord",
};

/** Aandeel van een ouder in een kostenpost, op basis van de verdelingstekst. */
export function aandeelVan(k: Kostenpost, ouder: OuderId): number {
  const s = k.aandeelSanne;
  return ouder === "sanne" ? s : Math.round((k.bedrag - s) * 100) / 100;
}

export type SaldoKant = {
  /** Kostenposten waarvoor deze ouder nog moet bijdragen. */
  posten: { post: Kostenpost; aandeel: number }[];
  totaal: number;
};

export type Saldo = {
  /** Wat Joris nog aan Sanne moet betalen. */
  jorisAanSanne: SaldoKant;
  /** Wat Sanne nog aan Joris moet betalen. */
  sanneAanJoris: SaldoKant;
  /** Netto saldo: positief = Joris betaalt Sanne, negatief = andersom. */
  netto: number;
  aantalPosten: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Rekent openstaande (bevestigde) kosten tegen elkaar weg.
 * Alleen posten met status "openstaand" (bestaande data) of "bevestigd"
 * tellen mee; concepten, betwiste en al verrekende posten niet.
 */
export function berekenSaldo(lijst: Kostenpost[]): Saldo {
  const meenemen = lijst.filter(
    (k) => (k.status as string) === "openstaand" || (k.status as string) === "bevestigd",
  );
  const jorisAanSanne: SaldoKant = { posten: [], totaal: 0 };
  const sanneAanJoris: SaldoKant = { posten: [], totaal: 0 };
  for (const k of meenemen) {
    if (k.betaaldDoor === "sanne") {
      const aandeel = aandeelVan(k, "joris");
      jorisAanSanne.posten.push({ post: k, aandeel });
      jorisAanSanne.totaal = r2(jorisAanSanne.totaal + aandeel);
    } else {
      const aandeel = aandeelVan(k, "sanne");
      sanneAanJoris.posten.push({ post: k, aandeel });
      sanneAanJoris.totaal = r2(sanneAanJoris.totaal + aandeel);
    }
  }
  return {
    jorisAanSanne,
    sanneAanJoris,
    netto: r2(jorisAanSanne.totaal - sanneAanJoris.totaal),
    aantalPosten: meenemen.length,
  };
}

/** Standaardverdeelsleutels per categorie (door de ouders zelf ingesteld). */
export type Verdeelsleutels = Record<string, { sanne: number; joris: number }>;

export const standaardSleutels: Verdeelsleutels = {
  Algemeen: { sanne: 60, joris: 40 },
  School: { sanne: 50, joris: 50 },
  Sport: { sanne: 50, joris: 50 },
  Medisch: { sanne: 60, joris: 40 },
  Opvang: { sanne: 70, joris: 30 },
  Kleding: { sanne: 60, joris: 40 },
  Activiteiten: { sanne: 50, joris: 50 },
  Overig: { sanne: 50, joris: 50 },
};

export function sleutelVoor(sleutels: Verdeelsleutels, categorie: string) {
  return sleutels[categorie] ?? sleutels["Algemeen"] ?? { sanne: 50, joris: 50 };
}

export type VerrekenModus = "direct" | "maandelijks" | "zelf";

export type Verrekening = {
  id: string;
  maand: string;
  bedrag: number;
  van: OuderId;
  aan: OuderId;
  datum: string;
  wijze: string;
  status: "afgerond" | "wacht-op-ontvanger" | "nog-te-betalen" | "betaalverzoek-gedeeld" | "ontvangst-bevestigd";
  kostIds?: string[];
  betaalverzoek?: string;
  gebeurtenissen?: readonly { status: Verrekening["status"]; door: OuderId; moment: string }[];
};

export const verrekeningStatus = (status: string) => ({
  "nog-te-betalen": "Nog te betalen",
  "betaalverzoek-gedeeld": "Betaalverzoek gedeeld",
  "wacht-op-ontvanger": "Betaling aangegeven door betaler",
  "ontvangst-bevestigd": "Betaling bevestigd door ontvanger",
  afgerond: "Afgerond",
}[status] ?? "Nog te betalen");

/** Alleen expliciete deelnemers mogen een overgang uitvoeren; openen van een link is geen overgang. */
export function betaalOvergang(v: Verrekening, door: OuderId, actie: "aangegeven" | "ontvangen" | "afronden"): Verrekening | null {
  const mag = actie === "aangegeven" ? door === v.van && (v.status === "nog-te-betalen" || v.status === "betaalverzoek-gedeeld")
    : actie === "ontvangen" ? door === v.aan && (v.status === "nog-te-betalen" || v.status === "betaalverzoek-gedeeld" || v.status === "wacht-op-ontvanger")
    : door === v.aan && v.status === "ontvangst-bevestigd";
  if (!mag) return null;
  const status = actie === "aangegeven" ? "wacht-op-ontvanger" : actie === "ontvangen" ? "ontvangst-bevestigd" : "afgerond";
  return { ...v, status, gebeurtenissen: [...(v.gebeurtenissen ?? []), { status, door, moment: new Date().toISOString() }] };
}

/** Bekende betaalverzoekhosts, geen willekeurige of onveilige URL. Controleert geen bankbedrag of betaling. */
export function veiligeBetaallink(tekst: string): string | null {
  try {
    const url = new URL(tekst.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.port || !["tikkie.me", "betaalverzoek.rabobank.nl", "www.abnamro.nl", "abnamro.nl"].includes(url.hostname) || url.pathname === "/") return null;
    return url.href;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Toekomstige betaalprovider: abstracte laag.
// De verrekenmotor hierboven werkt volledig onafhankelijk; een provider
// (bijv. een betaalverzoekdienst) kan later deze interface implementeren
// zonder de kostenmodule te wijzigen.
// ---------------------------------------------------------------------------

export type PaymentRequest = {
  paymentReference: string;
  bedrag: number;
  van: OuderId;
  aan: OuderId;
  providerTransactionId?: string;
  paymentStatus: "niet-gestart" | "open" | "betaald" | "mislukt";
};

export interface PaymentService {
  createPaymentRequest(input: { bedrag: number; van: OuderId; aan: OuderId }): Promise<PaymentRequest>;
  getPaymentStatus(paymentReference: string): Promise<PaymentRequest["paymentStatus"]>;
  handlePaymentConfirmation(paymentReference: string): Promise<void>;
}

/** Geen provider gekoppeld: bewust leeg, de interne motor blijft werken. */
export const geenPaymentService: PaymentService = {
  async createPaymentRequest() {
    throw new Error("Er is nog geen betaalprovider gekoppeld.");
  },
  async getPaymentStatus() {
    return "niet-gestart" as const;
  },
  async handlePaymentConfirmation() {},
};

/** Hoe het saldo bovenaan Kosten getoond wordt, op basis van de bestaande afrekeninstelling.
 *  "maandelijks": tussenstand tot de laatste dag van de maand, dan is het afrekenmoment. */
export type AfrekenWeergave = "direct" | "tussenstand" | "moment" | "zelf";
export function afrekenWeergave(modus: string, vandaagIso: string): AfrekenWeergave {
  if (modus === "zelf") return "zelf";
  if (modus === "maandelijks") {
    const d = new Date(vandaagIso + "T12:00:00");
    const laatste = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return d.getDate() >= laatste ? "moment" : "tussenstand";
  }
  return "direct";
}
