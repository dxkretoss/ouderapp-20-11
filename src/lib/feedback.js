import i18n from "@/i18n";
import { useEffect } from "react";
import { toast } from "sonner";
/** Toont een opgeslagen bevestiging ook als pop-up, zodat je hem ziet waar je ook bent op de pagina. */
export function useBevestigPopup(tekst) {
    useEffect(() => { const kort = tekst ? kortePopup(tekst) : null; if (kort)
        bevestig(kort); }, [tekst]);
}
/**
 * Korte, vaste pop-uptekst bij een (langere) bevestiging op de pagina.
 * "Geregeld!" alleen als de tekst zelf al een definitieve bevestiging beschrijft. Geen succes → null.
 */
export function kortePopup(tekst) {
    const t = tekst.replace(new RegExp("^" + String.fromCharCode(0x2713) + "\\s*"), "");
    // Herkent zowel Nederlandse als Engelse bevestigingsteksten.
    if (/^kies hieronder|^choose below/i.test(t))
        return null;
    if (/niet akkoord|afgewezen|not agreed|declined|rejected/i.test(t))
        return i18n.t("lib.feedback.popup.nietAkkoord");
    if (/ingetrokken|withdrawn/i.test(t))
        return i18n.t("lib.feedback.popup.ingetrokken");
    if (/voorgesteld|voorstel.*verstuurd|wijzigingsvoorstel|vraag verstuurd|voorstel staat klaar|proposed|proposal.*sent|change proposal|request sent|proposal is ready/i.test(t))
        return i18n.t("lib.feedback.popup.verstuurd");
    if (/ging akkoord|ja gezegd|verdeling is aangepast|^afgesproken|\bagreed\b|said yes|split has been (updated|changed)|^agreed/i.test(t))
        return i18n.t("lib.feedback.popup.bevestigd", { geregeld: i18n.t("common.geregeld") });
    if (/^(persoonlijke )?afspraak toegevoegd|^(personal )?appointment added/i.test(t))
        return i18n.t("lib.feedback.popup.toegevoegd");
    return t;
}
/** Zachte trilling alleen waar het apparaat dat ondersteunt; nooit vereist. */
export function zachteTril() {
    try {
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
            if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
                return;
            navigator.vibrate(12);
        }
    }
    catch {
        /* geen ondersteuning: gewoon doorgaan */
    }
}
/** Eén bevestiging voor de hele app. Alleen aanroepen nádat de actie echt is opgeslagen. */
export function bevestig(tekst, opties) {
    if (opties?.tril)
        zachteTril();
    // Vaste id: een nieuwe bevestiging vervangt de vorige, nooit meerdere tegelijk.
    toast.success(tekst, {
        id: "bevestiging",
        description: opties?.uitleg,
        duration: opties?.ongedaan ? 6000 : 3000,
        action: opties?.ongedaan ? { label: i18n.t("lib.feedback.ongedaanMaken"), onClick: opties.ongedaan } : undefined,
    });
}
/** Eén begrijpelijke foutmelding, met opnieuw proberen waar dat kan. */
export function meldFout(tekst, opnieuw) {
    toast.error(tekst, { id: "bevestiging", duration: 6000, action: opnieuw ? { label: i18n.t("lib.feedback.opnieuwProberen"), onClick: opnieuw } : undefined });
}
