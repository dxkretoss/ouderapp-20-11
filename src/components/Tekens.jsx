import { ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, X } from "lucide-react";
/**
 * Vaste lucide-iconen voor tekens die vroeger als tekst in de UI stonden (› ‹ ⌄ ✓ ✕ →).
 * Altijd decoratief (aria-hidden); de betekenis staat in de tekst of het aria-label ernaast.
 */
const RICHTING = { rechts: ChevronRight, links: ChevronLeft, omlaag: ChevronDown, omhoog: ChevronUp };
/** Chevron voor rijen, links en uitklappers. `open` draait een omlaag-chevron om. */
export function Chevron({ richting = "rechts", open, className = "size-4" }) {
    const Icon = RICHTING[richting];
    return <Icon aria-hidden="true" strokeWidth={2} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""} ${className}`}/>;
}
/** Vinkje: afgerond, akkoord, gekozen. */
export function Vinkje({ className = "size-4" }) {
    return <Check aria-hidden="true" strokeWidth={2.25} className={`shrink-0 ${className}`}/>;
}
/** Sluiten / verwijderen. */
export function Kruis({ className = "size-4" }) {
    return <X aria-hidden="true" strokeWidth={2} className={`shrink-0 ${className}`}/>;
}
/** Pijl naar rechts voor "verder"-knoppen. */
export function Pijl({ className = "size-4" }) {
    return <ArrowRight aria-hidden="true" strokeWidth={2} className={`shrink-0 ${className}`}/>;
}
/** Linktekst met een chevron erachter ("Bekijken ›") of ervoor ("‹ Terug"). */
export function MetChevron({ children, richting = "rechts", className = "" }) {
    const icoon = <Chevron richting={richting} className="size-[1.05em]"/>;
    return (<span className={`inline-flex items-center gap-0.5 ${className}`}>
      {richting === "links" ? icoon : null}
      <span>{children}</span>
      {richting === "links" ? null : icoon}
    </span>);
}
/** Tekst met een vinkje ervoor ("✓ Bewaard") of erachter ("Afgesproken ✓"). */
export function MetVinkje({ children, achter = false, className = "" }) {
    const icoon = <Vinkje className="size-[1.05em]"/>;
    return (<span className={`inline-flex items-center gap-1 ${className}`}>
      {achter ? null : icoon}
      <span>{children}</span>
      {achter ? icoon : null}
    </span>);
}
