import { useTranslation } from "react-i18next";
import { AppIcon } from "@/components/AppIcon";
import { useGezin } from "@/lib/gezin";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from "@/components/ui/alert-dialog";
/**
 * "Alleen jij" / "Gedeeld" voor praktische items (taken, spullen, nog nodig, documenten, momentjes).
 * - Nieuwe items zijn standaard privé ("Alleen jij").
 * - Solo-kinderen: geen keuze (privé per definitie), dus niets tonen.
 * - Gedeeld zonder kind en met 2+ andere ouders: kies voor welke andere ouder.
 * - Kinderen van verschillende andere ouders: MIXED_CHILDREN-melding, niet versturen.
 */
const D = "components.DelenKeuze.";
/** Kan dit (met deze kinderen) überhaupt gedeeld worden? Zonder kinderen: als er een andere ouder is. */
export function kanDelen(g, kindIds = []) {
    const ids = [...new Set(kindIds)].filter(Boolean);
    if (!ids.length)
        return g.coOuders.length > 0;
    return ids.some((k) => g.isSamen(k));
}
/**
 * Controle vóór versturen. Geeft { ok, gedeeld, anderId, fout } terug.
 * `anderId` alleen nodig (en meegestuurd) zonder kinderen; met kinderen bepaalt de server de andere ouder.
 */
export function deelCheck(g, kindIds, gedeeld, anderId) {
    const ids = [...new Set(kindIds ?? [])].filter(Boolean);
    if (!gedeeld || !kanDelen(g, ids))
        return { ok: true, gedeeld: false, anderId: undefined };
    if (ids.length) {
        if (g.gemengd(ids))
            return { ok: false, gedeeld: true, fout: "MIXED_CHILDREN" };
        return { ok: true, gedeeld: true, anderId: undefined };
    }
    if (g.coOuders.length === 1)
        return { ok: true, gedeeld: true, anderId: g.coOuders[0].id };
    if (anderId && g.coOuders.some((c) => c.id === anderId))
        return { ok: true, gedeeld: true, anderId };
    return { ok: false, gedeeld: true, fout: "KIES_OUDER" };
}
/** Klein label op een item (zelfde vorm als bij kosten: components/DeelKeuze). */
export function DeelLabel({ gedeeld, className = "" }) {
    const { t } = useTranslation();
    return (<span className={`inline-flex h-6 w-fit shrink-0 items-center gap-1 rounded-full px-2 text-[12px] font-extrabold ${gedeeld ? "bg-[#E9EFE3] text-[#3F5747]" : "bg-[rgba(226,216,203,.7)] text-[#5C5650]"} ${className}`}>
      <AppIcon functie={gedeeld ? "oog" : "slot"} maat="sm" vorm="kaal"/>{gedeeld ? t(D + "gedeeld") : t(D + "alleenJij")}
    </span>);
}
function Chip({ aan, onClick, children }) {
    return <button type="button" onClick={onClick} aria-pressed={aan} className={`min-h-9 rounded-full border px-3 py-1.5 text-xs font-semibold ${aan ? "border-brand bg-brand text-primary-foreground" : "border-border bg-card"}`}>{children}</button>;
}
const segment = (aan) => `flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full text-sm font-black ${aan ? "bg-white text-[#3F5747] shadow-[0_2px_8px_rgba(60,50,40,.08)]" : "font-bold text-ink-soft"}`;
/**
 * Keuze in een formulier. Props: kindIds, gedeeld, onGedeeld(bool), anderId, onAnderId(id), vast (gedeeld verplicht, bv.
 * een taak die je aan de andere ouder vraagt), className. Toont niets voor alleen Solo-kinderen of zonder andere ouder.
 */
export function DelenKeuze({ kindIds = [], gedeeld, onGedeeld, anderId, onAnderId, vast = false, className = "" }) {
    const { t } = useTranslation();
    const g = useGezin();
    const ids = [...new Set(kindIds)].filter(Boolean);
    if (!kanDelen(g, ids))
        return null;
    const aan = vast || gedeeld;
    const check = deelCheck(g, ids, aan, anderId);
    const kiesOuder = aan && !ids.length && g.coOuders.length > 1;
    return (<fieldset className={className}>
      <legend className="text-sm font-semibold">{t(D + "wieZiet")}</legend>
      <div role="radiogroup" aria-label={t(D + "wieZiet")} className="mt-1 flex rounded-full bg-[rgba(226,216,203,.55)] p-1">
        <button type="button" role="radio" aria-checked={!aan} disabled={vast} onClick={() => onGedeeld(false)} className={`${segment(!aan)} disabled:opacity-50`}><AppIcon functie="slot" maat="sm" vorm="kaal"/>{t(D + "alleenJij")}</button>
        <button type="button" role="radio" aria-checked={aan} onClick={() => onGedeeld(true)} className={segment(aan)}><AppIcon functie="oog" maat="sm" vorm="kaal"/>{t(D + "gedeeld")}</button>
      </div>
      {kiesOuder ? (<div className="mt-2">
          <p className="text-xs text-ink-soft">{t(D + "metWie")}</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {g.coOuders.map((c, i) => <Chip key={c.id} aan={anderId === c.id} onClick={() => onAnderId?.(c.id)}>{c.naam || t(D + "andereOuderN", { n: i + 1 })}</Chip>)}
          </div>
        </div>) : null}
      {check.fout === "MIXED_CHILDREN" ? <p role="alert" className="mt-1.5 text-xs text-destructive">{t("lib.api.fout.MIXED_CHILDREN")}</p> : null}
      <p className="mt-1 px-1 text-[11px] text-ink-soft">{vast ? t(D + "uitlegVast") : aan ? t(D + "uitlegGedeeld") : t(D + "uitlegPrive")}</p>
    </fieldset>);
}
/** Bevestigen vóór verwijderen. */
export function VerwijderDialoog({ open, onOpenChange, titel, tekst, onBevestig }) {
    const { t } = useTranslation();
    return (<AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[calc(100%-2rem)] rounded-xl shadow-none sm:max-w-md">
        <AlertDialogTitle>{titel ?? t(D + "verwijderTitel")}</AlertDialogTitle>
        <AlertDialogDescription>{tekst ?? t(D + "verwijderTekst")}</AlertDialogDescription>
        <AlertDialogFooter><AlertDialogCancel>{t("common.annuleren")}</AlertDialogCancel><AlertDialogAction onClick={onBevestig}>{t("common.verwijderen")}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>);
}
