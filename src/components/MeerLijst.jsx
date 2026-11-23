import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AppIcon } from "@/components/AppIcon";
import { Chevron } from "@/components/Tekens";
export function MeerSectie({ titel, items, klein, compact = false, onBezoek }) {
    const { t } = useTranslation();
    if (compact)
        return (<section className="mt-5">
      <h3 className="px-1 text-[13px] font-black uppercase tracking-[0.08em] text-ink-soft">{titel}</h3>
      <div className="mt-2 divide-y divide-[#E9E1D5] rounded-[22px] border border-white/85 bg-white/60 px-3.5">
        {items.map((item) => {
                const binnen = <>
            <AppIcon functie={item.icoon} maat="md"/>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-black leading-snug text-ink">{item.titel}</span>
              <span className="mt-0.5 block text-xs leading-snug text-ink-soft">{item.context ?? item.tekst}</span>
            </span>
            {item.aantal ? <span aria-label={t("components.MeerLijst.wachtOpJou", { n: item.aantal })} className="grid size-5 shrink-0 place-items-center rounded-full bg-brand text-[11px] font-black text-primary-foreground">{item.aantal}</span> : null}
            <Chevron className="size-[18px] text-ink-soft/70"/>
          </>;
                const klas = "flex min-h-[60px] w-full items-center gap-3 py-2.5 text-left";
                return item.onKies
                    ? <button key={item.to} onClick={item.onKies} className={klas}>{binnen}</button>
                    : <Link key={item.to} to={item.to} onClick={() => onBezoek?.(item.to)} className={klas}>{binnen}</Link>;
            })}
      </div>
    </section>);
    return (<section className={klein ? "mt-6" : "mt-8"}>
      {klein ? <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft/80">{titel}</h3> : <h2 className="font-display text-base font-semibold text-ink-soft">{titel}</h2>}
      <div className="mt-2 space-y-0.5">
        {items.map((item) => (<Link key={item.to} to={item.to} onClick={() => onBezoek?.(item.to)} className="group -mx-2 flex min-h-[64px] items-center gap-3.5 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted/60">
            <AppIcon functie={item.icoon} maat="lg"/>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold leading-snug text-ink">{item.titel}</span>
              <span className="mt-0.5 block text-xs leading-snug text-ink-soft">{item.context ?? item.tekst}</span>
            </span>
            {item.aantal ? <span aria-label={t("components.MeerLijst.wachtOpJou", { n: item.aantal })} className="grid size-5 shrink-0 place-items-center rounded-full bg-brand text-[11px] font-black text-primary-foreground">{item.aantal}</span> : null}
            <Chevron className="size-[18px] text-ink-soft/70 group-hover:translate-x-0.5"/>
          </Link>))}
      </div>
    </section>);
}
