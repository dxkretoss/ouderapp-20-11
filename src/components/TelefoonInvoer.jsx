import { useEffect, useId, useState } from "react";
import PhoneInput, { formatPhoneNumberIntl, isValidPhoneNumber, parsePhoneNumber } from "react-phone-number-input";
import flags from "react-phone-number-input/flags";
import labelsNl from "react-phone-number-input/locale/nl.json";
import labelsEn from "react-phone-number-input/locale/en.json";
import { getExampleNumber } from "libphonenumber-js";
import voorbeelden from "libphonenumber-js/mobile/examples";
import "react-phone-number-input/style.css";
import { useTranslation } from "react-i18next";
/**
 * Telefoonnummer met landkeuze (vlag + landcode). Bewaart altijd internationaal (E.164, bv. "+31612345678").
 * - Per land maximaal zoveel cijfers als dat land toestaat (limitMaxLength), bv. India 10, Nederland 9.
 * - Geldig = past bij de nummerregels van dat land (isValidPhoneNumber), niet alleen "lijkt mogelijk".
 * - Melding pas na het verlaten van het veld, met een voorbeeld van een goed nummer in dat land.
 * Oudere waarden zoals "06 12345678" worden als Nederlands nummer gelezen; vlaggen zitten in de bundel.
 */
const STANDAARD_LAND = "NL";
/** Bewaarde waarde → E.164 voor het invoerveld (of undefined als het geen telefoonnummer is). */
export function naarInternationaal(v) {
    if (!v)
        return undefined;
    try {
        return parsePhoneNumber(String(v), STANDAARD_LAND)?.number ?? undefined;
    }
    catch {
        return undefined;
    }
}
/** Leeg is toegestaan (optioneel veld); ingevuld moet het een geldig nummer voor het gekozen land zijn. */
export const isGeldigTelefoon = (v) => !v || isValidPhoneNumber(naarInternationaal(v) ?? String(v));
/** Nette weergave van een bewaard nummer ("+31 6 12345678"); onleesbare oude tekst blijft zoals hij was. */
export function toonTelefoon(v) {
    const e164 = naarInternationaal(v);
    return e164 ? formatPhoneNumberIntl(e164) || v : v ?? "";
}
/** Voor een tel:-link. */
export const telLink = (v) => `tel:${naarInternationaal(v) ?? String(v ?? "").replace(/[^\d+]/g, "")}`;
/** Voorbeeld van een geldig (mobiel) nummer in een land, zoals je het daar schrijft ("+31 6 12345678"). */
function voorbeeldVoor(land) {
    try {
        return getExampleNumber(land, voorbeelden)?.formatInternational() ?? "";
    }
    catch {
        return "";
    }
}
/**
 * Maximaal aantal cijfers (na de landcode) per land = de lengte van een gewoon mobiel nummer daar:
 * India 10, Nederland 9, België 9, VK 10, VS 10, Duitsland 11. Zo kun je niet verder typen dan een echt nummer.
 */
function maxCijfers(land) {
    try {
        return getExampleNumber(land, voorbeelden)?.nationalNumber.length || 15;
    }
    catch {
        return 15;
    }
}
const nationaleCijfers = (v) => {
    try {
        return parsePhoneNumber(v)?.nationalNumber.length ?? 0;
    }
    catch {
        return String(v ?? "").replace(/\D/g, "").length;
    }
};
export function TelefoonInvoer({ value, onChange, id, ariaLabel, className = "" }) {
    const { t, i18n } = useTranslation();
    const eigenId = useId();
    const veldId = id ?? `tel-${eigenId}`;
    // Te veel cijfers: het veld opnieuw opbouwen vanuit de bewaarde waarde (de bibliotheek houdt zelf getypte tekst bij).
    const [herbouw, setHerbouw] = useState(0);
    useEffect(() => {
        if (!herbouw)
            return;
        const el = document.getElementById(veldId);
        el?.focus();
        el?.setSelectionRange?.(el.value.length, el.value.length);
    }, [herbouw, veldId]);
    const waarde = naarInternationaal(value);
    const [land, setLand] = useState(() => {
        try {
            return (waarde && parsePhoneNumber(waarde)?.country) || STANDAARD_LAND;
        }
        catch {
            return STANDAARD_LAND;
        }
    });
    const [verlaten, setVerlaten] = useState(false);
    const ongeldig = !!waarde && !isValidPhoneNumber(waarde);
    const toonFout = ongeldig && verlaten;
    const voorbeeld = voorbeeldVoor(land);
    return (<div className={className}>
      <PhoneInput key={herbouw} international limitMaxLength defaultCountry={STANDAARD_LAND} countryCallingCodeEditable={false} flags={flags} labels={i18n.resolvedLanguage === "en" ? labelsEn : labelsNl} value={waarde} onChange={(v) => {
            if (v && nationaleCijfers(v) > maxCijfers(land)) {
                setHerbouw((n) => n + 1);
                return;
            }
            onChange(v ?? "");
        }} onCountryChange={(c) => setLand(c || STANDAARD_LAND)} onBlur={() => setVerlaten(true)} className={`telefoon-invoer ${toonFout ? "telefoon-ongeldig" : ""}`} numberInputProps={{ id: veldId, "aria-label": ariaLabel, "aria-invalid": ongeldig || undefined, autoComplete: "tel" }}/>
      {toonFout ? <p role="alert" className="mt-1 text-[11px] font-semibold text-[#A4533E]">{voorbeeld ? t("components.TelefoonInvoer.ongeldigVoorbeeld", { voorbeeld }) : t("components.TelefoonInvoer.ongeldig")}</p> : null}
    </div>);
}
