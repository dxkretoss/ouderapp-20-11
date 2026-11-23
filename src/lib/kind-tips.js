/**
 * "Je kind en de scheiding": algemene tips over wat er tussen ouders en kinderen kan spelen (missen, loyaliteit, verdriet).
 * Vaste tekst, geen AI. Gebaseerd op o.a. NJi (Gezien en gehoord worden) en Ouders van Nu (Scheiding verwerken).
 * zeg: per leeftijd (jong = tot 6, midden = 6 t/m 11, oud = 12+) en voor meerdere kinderen samen. {kind} = naam of namen.
 * Teksten staan in src/locales (lib.kindTips*); getters zodat de taal pas bij het lezen telt.
 */
import i18n from "@/i18n";
import { tips1 } from "./kind-tips-1";
import { tips2 } from "./kind-tips-2";
import { tips3 } from "./kind-tips-3";
const thema = (id, tegel, inkt) => ({
    get naam() { return i18n.t(`lib.kindTips.themas.${id}.naam`); },
    get sub() { return i18n.t(`lib.kindTips.themas.${id}.sub`); },
    tegel, inkt,
});
export const themas = [
    thema("missen", "#DFE8F1", "#2E4A68"),
    thema("loyaliteit", "#F3E1E4", "#7A3B48"),
    thema("verdriet", "#EBD9CC", "#6E3A24"),
    thema("vragen", "#DCE3D3", "#3F5747"),
    thema("vertellen", "#E3E0EC", "#4B3F68"),
    thema("tweeHuizen", "#EFE1C9", "#6E5014"),
    thema("nieuweGezinnen", "#E6DFD3", "#5A4636"),
    thema("specialeDagen", "#F1E4D6", "#6E4A2A"),
    thema("voorJezelf", "#E9EFE3", "#2F4A3A"),
];
export { hulpStandaard } from "./kind-tips-basis";
export const kindTips = [...tips1, ...tips2, ...tips3];
export const bronnen = [
    { get naam() { return i18n.t("lib.kindTips.bronnen.nji"); }, url: "https://www.nji.nl/kennis/scheiding/gezien-en-gehoord-worden-steun-voor-kinderen-met-gescheiden-ouders" },
    { get naam() { return i18n.t("lib.kindTips.bronnen.oudersVanNu"); }, url: "https://www.oudersvannu.nl/kind/opvoeden/scheiding-verwerken" },
];
