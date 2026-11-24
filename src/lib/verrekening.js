// Interne verrekenmotor voor de kostenmodule.
// Principe: openstaande kosten worden tegen elkaar weggestreept;
// alleen het netto resterende saldo hoeft te worden betaald.
// De motor is volledig onafhankelijk van een externe betaalprovider.
import i18n from "@/i18n";
import { budgetSnapshot } from "./budget-store";
import { beoordeelKosten } from "./kosten-akkoord";
export const statusLabel = {
    get concept() { return i18n.t("lib.verrekening.status.concept"); },
    get wacht() { return i18n.t("lib.verrekening.status.wacht"); },
    get bevestigd() { return i18n.t("lib.verrekening.status.bevestigd"); },
    get verrekend() { return i18n.t("lib.verrekening.status.verrekend"); },
    get betwist() { return i18n.t("lib.verrekening.status.betwist"); },
    get opgeslagen() { return i18n.t("lib.verrekening.status.opgeslagen"); },
    get ingetrokken() { return i18n.t("lib.verrekening.status.ingetrokken"); },
};
/** Weergavenaam van een kostencategorie; de opgeslagen waarde ("School", "Bon" …) blijft de sleutel. */
export const categorieLabel = (c) => i18n.t(`lib.verrekening.categorie.${c}`, { defaultValue: c });
/** Aandeel van een ouder ("ik" = de kijker, "ander" = de andere ouder) in een kostenpost. */
export function aandeelVan(k, ouder) {
    const s = k.aandeelIk;
    return ouder === "ik" ? s : Math.round((k.bedrag - s) * 100) / 100;
}
const r2 = (n) => Math.round(n * 100) / 100;
/**
 * Rekent openstaande (bevestigde) kosten tegen elkaar weg, vanuit de kijker ("ik").
 * Alleen posten met status "openstaand"/"bevestigd", of "wacht" die volgens beoordeelKosten volledig
 * binnen een afgesproken budget valt, tellen mee; concepten, betwiste, opgeslagen (kindrekening /
 * helemaal voor mij) en al verrekende posten niet. Budgetten zelf tellen nooit mee.
 * netto > 0: de andere ouder betaalt jou.
 */
export function berekenSaldo(lijst, budgetten = budgetSnapshot()) {
    const uniekeLijst = lijst.filter((k, i) => lijst.findIndex((x) => x.id === k.id) === i);
    const beoordeling = beoordeelKosten(uniekeLijst, budgetten);
    const meenemen = uniekeLijst.filter((k) => k.bron !== "kindrekening" && (k.status === "openstaand" || k.status === "bevestigd" || (k.status === "wacht" && beoordeling.get(k.id)?.soort === "gedekt")));
    const anderAanIk = { posten: [], totaal: 0 };
    const ikAanAnder = { posten: [], totaal: 0 };
    for (const k of meenemen) {
        if (k.betaaldDoor === "ik") {
            const aandeel = aandeelVan(k, "ander");
            anderAanIk.posten.push({ post: k, aandeel });
            anderAanIk.totaal = r2(anderAanIk.totaal + aandeel);
        }
        else {
            const aandeel = aandeelVan(k, "ik");
            ikAanAnder.posten.push({ post: k, aandeel });
            ikAanAnder.totaal = r2(ikAanAnder.totaal + aandeel);
        }
    }
    return {
        anderAanIk,
        ikAanAnder,
        // Oude namen (Home leest ze nog): zelfde objecten, vanuit de kijker.
        jorisAanSanne: anderAanIk,
        sanneAanJoris: ikAanAnder,
        netto: r2(anderAanIk.totaal - ikAanAnder.totaal),
        aantalPosten: meenemen.length,
    };
}
/** Eén verdeelsleutel per gezin (de kostenafspraak); per categorie valt terug op "Algemeen". */
export const standaardSleutels = { Algemeen: { ik: 50, ander: 50 } };
export function sleutelVoor(sleutels, categorie) {
    return sleutels?.[categorie] ?? sleutels?.["Algemeen"] ?? { ik: 50, ander: 50 };
}
const VERREKEN_STATUSSEN = ["nog-te-betalen", "betaalverzoek-gedeeld", "wacht-op-ontvanger", "ontvangst-bevestigd", "afgerond"];
export const verrekeningStatus = (status) => i18n.t(`lib.verrekening.verrekenStatus.${VERREKEN_STATUSSEN.includes(status) ? status : "nog-te-betalen"}`);
/** Alleen expliciete deelnemers mogen een overgang uitvoeren; openen van een link is geen overgang. */
export function betaalOvergang(v, door, actie) {
    const mag = actie === "aangegeven" ? door === v.van && (v.status === "nog-te-betalen" || v.status === "betaalverzoek-gedeeld")
        : actie === "ontvangen" ? door === v.aan && (v.status === "nog-te-betalen" || v.status === "betaalverzoek-gedeeld" || v.status === "wacht-op-ontvanger")
            : door === v.aan && v.status === "ontvangst-bevestigd";
    if (!mag)
        return null;
    const status = actie === "aangegeven" ? "wacht-op-ontvanger" : actie === "ontvangen" ? "ontvangst-bevestigd" : "afgerond";
    return { ...v, status, gebeurtenissen: [...(v.gebeurtenissen ?? []), { status, door, moment: new Date().toISOString() }] };
}
/** Bekende betaalverzoekhosts, geen willekeurige of onveilige URL. Controleert geen bankbedrag of betaling. */
export function veiligeBetaallink(tekst) {
    try {
        const url = new URL(tekst.trim());
        if (url.protocol !== "https:" || url.username || url.password || url.port || !["tikkie.me", "betaalverzoek.rabobank.nl", "www.abnamro.nl", "abnamro.nl"].includes(url.hostname) || url.pathname === "/")
            return null;
        return url.href;
    }
    catch {
        return null;
    }
}
/** Geen provider gekoppeld: bewust leeg, de interne motor blijft werken. */
export const geenPaymentService = {
    async createPaymentRequest() {
        throw new Error(i18n.t("lib.verrekening.geenProvider"));
    },
    async getPaymentStatus() {
        return "niet-gestart";
    },
    async handlePaymentConfirmation() { },
};
export function afrekenWeergave(modus, vandaagIso) {
    if (modus === "zelf")
        return "zelf";
    if (modus === "maandelijks") {
        const d = new Date(vandaagIso + "T12:00:00");
        const laatste = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        return d.getDate() >= laatste ? "moment" : "tussenstand";
    }
    return "direct";
}
