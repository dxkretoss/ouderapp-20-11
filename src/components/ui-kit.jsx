import { useTranslation } from "react-i18next";
import { Card } from "@/components/AppShell";
import { AppIcon } from "@/components/AppIcon";
import { Button } from "@/components/ui/button";
import { Check, Circle, Dot, Info } from "lucide-react";
import { Chevron } from "@/components/Tekens";
/** Eén filterbalk voor de hele app (Alle | Nieuw | Actie nodig, categorieën, tabs). */
export function FilterBalk({ opties, waarde, onChange, className = "", doorlopen = false, }) {
    return (<div className={`flex border-b border-border ${doorlopen ? "flex-wrap gap-x-4 gap-y-2" : "gap-5 overflow-x-auto"} ${className}`} role="tablist">
      {opties.map((o) => {
            const id = typeof o === "string" ? o : o.id;
            const label = typeof o === "string" ? o : o.label;
            const actief = id === waarde;
            return (<Button type="button" variant="ghost" key={id} role="tab" aria-selected={actief} onClick={() => onChange(id)} className={`h-auto shrink-0 rounded-none border-b-2 px-1 ${doorlopen ? "py-2" : "py-1.5"} text-sm font-semibold hover:bg-transparent hover:text-inherit transition-colors ${actief ? "border-brand text-ink" : "border-transparent text-ink-soft"}`}>
            {label}
          </Button>);
        })}
    </div>);
}
const toonIcoon = { info: Info, actie: Dot, neutraal: Circle };
const toonStijl = {
    info: "text-brand",
    actie: "text-accent-foreground",
    neutraal: "text-ink-soft",
    klaar: "text-brand",
};
/** Eén meldings-/statusbadge voor de hele app. */
export function Badge({ toon = "neutraal", children, className = "" }) {
    return (<span className={`inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold ${toonStijl[toon]} ${className}`}>
      {toon === "klaar"
            ? <span aria-hidden className="inline-flex size-3.5 items-center justify-center rounded-full bg-brand text-primary-foreground"><Check className="size-2.5" strokeWidth={3}/></span>
            : (() => { const Icon = toonIcoon[toon] ?? Circle; return <Icon aria-hidden className={toon === "actie" ? "size-4 -mx-1" : "size-3"} strokeWidth={toon === "actie" ? 4 : 2.25}/>; })()}{children}
    </span>);
}
/** Eén overzichtskaart: dossier (professional), gezin, afspraak of document. */
export function OverzichtKaart({ icoon, titel, sub, badges, rechts, children, onClick, className = "", }) {
    const inhoud = (<>
      <div className="flex items-center gap-3">
        {icoon ? <div className="grid size-11 shrink-0 place-items-center rounded-md border border-border text-lg">{icoon}</div> : null}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{titel}</p>
          {sub ? <p className="text-xs text-ink-soft">{sub}</p> : null}
        </div>
        {rechts}
      </div>
      {badges ? <div className="mt-2 flex flex-wrap gap-1">{badges}</div> : null}
      {children}
    </>);
    return (<Card className={className}>
      {onClick ? <button onClick={onClick} className="block w-full text-left">{inhoud}</button> : inhoud}
    </Card>);
}
/** Eén inklapbare sectie: vervangt horizontale tabs, zodat alles onder elkaar zichtbaar blijft. */
export function Sectie({ titel, sub, open = false, children }) {
    return (<details open={open} className="group border-b border-border py-3 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block font-display text-lg font-medium text-ink">{titel}</span>
          {sub ? <span className="block text-xs text-ink-soft">{sub}</span> : null}
        </span>
        <span aria-hidden className="shrink-0 text-ink-soft transition-transform group-open:rotate-90"><Chevron className="size-4"/></span>
      </summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>);
}
/** Vast potlood rechtsboven: betekent altijd "Deze informatie aanpassen". */
export function BewerkPotlood({ onClick, label: eigenLabel, className = "" }) {
    const { t } = useTranslation();
    const label = eigenLabel ?? t("components.uiKit.bewerk");
    return (<button type="button" onClick={onClick} aria-label={label} title={label} className={`absolute right-2 top-2 inline-flex size-11 items-center justify-center rounded-full text-ink-soft hover:bg-muted ${className}`}>
      <AppIcon functie="notitie" maat="sm" vorm="kaal"/>
    </button>);
}
