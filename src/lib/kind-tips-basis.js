import i18n, { tLijst } from "@/i18n";
/** Standaard "Hulp zoeken als"-tekst (lib.kindTipsBasis.hulpStandaard). */
export const hulpStandaard = () => i18n.t("lib.kindTipsBasis.hulpStandaard");
/**
 * Eén tip met getters: de teksten komen uit src/locales (lib.<ns>.tips.<id>.*) en worden pas bij het lezen vertaald,
 * zodat een taalwissel meteen doorwerkt. Vorm blijft gelijk: vraag, kort, doen[], zeg{samen,jong,midden,oud},
 * reageren[{kind,jij}], liever[], idee (optioneel), kind, voorJou, hulp.
 */
export function vertaaldeTip(ns, id, thema, { idee = true, standaardHulp = false } = {}) {
    const k = (veld) => `lib.${ns}.tips.${id}.${veld}`;
    const tip = {
        id, thema,
        get vraag() { return i18n.t(k("vraag")); },
        get kort() { return i18n.t(k("kort")); },
        get doen() { return tLijst(k("doen")); },
        get zeg() { return i18n.t(k("zeg"), { returnObjects: true }); },
        get reageren() { return tLijst(k("reageren")); },
        get liever() { return tLijst(k("liever")); },
        get kind() { return i18n.t(k("kind")); },
        get voorJou() { return i18n.t(k("voorJou")); },
        get hulp() { return standaardHulp ? hulpStandaard() : i18n.t(k("hulp")); },
    };
    if (idee)
        Object.defineProperty(tip, "idee", { get: () => i18n.t(k("idee")), enumerable: true });
    return tip;
}
