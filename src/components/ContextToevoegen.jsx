import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { AppIcon } from "@/components/AppIcon";
import { Chevron } from "@/components/Tekens";
/** Rustige tinten die om en om gebruikt worden als een keuze geen eigen tint heeft. */
const TINTEN = [
    { bg: "#DCE3D3", ink: "#3F5747" },
    { bg: "#DFE8F1", ink: "#2E4A68" },
    { bg: "#E6DED3", ink: "#5A4636" },
    { bg: "#E3E0EC", ink: "#4B3F68" },
];
export function ContextToevoegen({ titel, acties, toegestaan = true, open, onOpenChange }) {
    const { t: vertaal } = useTranslation();
    if (!toegestaan)
        return null;
    return (<Sheet {...(open !== undefined ? { open } : {})} {...(onOpenChange ? { onOpenChange } : {})}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="icon" aria-label={titel} title={titel} className="size-10 shrink-0 rounded-full border-0 bg-brand text-primary-foreground shadow-[0_4px_14px_rgba(63,87,71,.25)] hover:bg-brand/90 hover:text-primary-foreground">
          <Plus aria-hidden="true" strokeWidth={2.4} className="size-5"/>
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="left-1/2 w-full max-w-md -translate-x-1/2 rounded-t-2xl border-border bg-background px-5 pb-8 pt-4">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border"/>
        <SheetHeader className="pr-8 text-left">
          <SheetTitle className="lora text-[26px] leading-tight text-ink">{titel}</SheetTitle>
          <SheetDescription className="sr-only">{vertaal("components.ContextToevoegen.beschrijving")}</SheetDescription>
        </SheetHeader>
        {[acties.filter((x) => !x.apart), acties.filter((x) => x.apart)].map((groep, g) => groep.length ? (<div key={g}>
            {g === 1 ? <p className="mt-5 px-1 text-[13px] font-black uppercase tracking-[0.08em] text-ink-soft">{groep[0].apart}</p> : null}
            <div className={`${g === 1 ? "mt-2" : "mt-4"} divide-y divide-[#E9E1D5] rounded-[22px] border border-white/85 bg-white/70 px-3.5`}>
              {groep.map((actie) => {
                const Icon = actie.icoon;
                const t = TINTEN[acties.indexOf(actie) % TINTEN.length];
                return (<SheetClose asChild key={actie.titel}>
                    <button type="button" onClick={actie.onKies} className="flex w-full items-center gap-3 py-3 text-left transition-transform active:scale-[.99]">
                      {actie.functie ? (<span className="grid size-10 shrink-0 place-items-center rounded-[13px]" style={{ background: actie.tint ?? t.bg }}><AppIcon functie={actie.functie} maat="sm" vorm="kaal"/></span>) : (<span className="grid size-10 shrink-0 place-items-center rounded-[13px]" style={{ background: actie.tint ?? t.bg, color: t.ink }}><Icon strokeWidth={1.9} className="size-5"/></span>)}
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15.5px] font-black text-ink">{actie.titel}</span>
                        <span className="mt-0.5 block text-xs leading-snug text-ink-soft">{actie.uitleg}</span>
                      </span>
                      <Chevron className="size-4 text-ink-soft"/>
                    </button>
                  </SheetClose>);
            })}
            </div>
          </div>) : null)}
      </SheetContent>
    </Sheet>);
}
