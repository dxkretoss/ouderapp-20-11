import { Link } from "@tanstack/react-router";
import { AppIcon, type Functie } from "@/components/AppIcon";

export type MeerLijstItem = {
  to: string;
  titel: string;
  tekst: string;
  icoon: Functie;
  context?: string;
  /** Aantal open acties dat op deze gebruiker wacht; 0 of leeg = geen badge. */
  aantal?: number;
};

export function MeerSectie({ titel, items, klein }: { titel: string; items: MeerLijstItem[]; klein?: boolean }) {
  return (
    <section className={klein ? "mt-6" : "mt-8"}>
      {klein ? <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft/80">{titel}</h3> : <h2 className="font-display text-base font-semibold text-ink-soft">{titel}</h2>}
      <div className="mt-2 space-y-0.5">
        {items.map((item) => {
          return (
            <Link key={item.to} to={item.to} className="group -mx-2 flex min-h-[64px] items-center gap-3.5 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted/60">
<AppIcon functie={item.icoon} maat="lg" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold leading-snug text-ink">{item.titel}</span>
                <span className="mt-0.5 block text-xs leading-snug text-ink-soft">{item.context ?? item.tekst}</span>
              </span>
              {item.aantal ? <span aria-label={`${item.aantal} wacht op jou`} className="grid size-5 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklch,var(--ic-koraal)_22%,transparent)] text-[11px] font-bold text-ink">{item.aantal}</span> : null}
              <span aria-hidden="true" className="text-lg text-ink-soft/70 transition-transform group-hover:translate-x-0.5">›</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}