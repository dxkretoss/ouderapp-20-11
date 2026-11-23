import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, LogOut } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Chevron } from "@/components/Tekens";
import { sessie } from "@/lib/sessie-store";
import { useAuth } from "@/lib/auth-store";
const N = "components.Afmelden.";
/**
 * Uitloggen: rij met bevestiging. De server-sessie wordt ingetrokken en de gezinsgegevens op dit
 * apparaat gewist (ze staan veilig in het account); daarna opnieuw laden op /welkom.
 */
export function AfmeldenRij({ className = "" }) {
    const { t } = useTranslation();
    const a = useAuth();
    const naam = a.gebruiker?.name || a.gebruiker?.email || t(N + "jij");
    const [open, setOpen] = useState(false);
    const [bezig, setBezig] = useState(false);
    const afmelden = async () => {
        setBezig(true);
        await sessie.afmelden();
        // Volledig opnieuw laden: ook alle geheugen-stores van dit account zijn dan leeg.
        window.location.replace("/welkom");
    };
    return (<>
      <button type="button" onClick={() => setOpen(true)} className={`flex min-h-14 w-full items-center gap-3 rounded-[22px] border border-[#EAD9D2] bg-white/70 px-4 py-3 text-left active:scale-[.99] ${className}`}>
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#F6E7E1] text-[#A4533E]"><LogOut className="size-[18px]" strokeWidth={1.9} aria-hidden="true"/></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-extrabold text-[#A4533E]">{t(N + "knop")}</span>
          <span className="block truncate text-xs text-ink-soft">{t(N + "sub", { naam })}</span>
        </span>
        <Chevron className="size-4 text-ink-soft"/>
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="left-1/2 w-full max-w-md -translate-x-1/2 rounded-t-2xl bg-background px-5 pb-8" style={{ paddingBottom: "max(2rem, calc(env(safe-area-inset-bottom, 0px) + 1.25rem))" }}>
          <SheetHeader className="text-left">
            <SheetTitle className="font-display text-xl font-medium">{t(N + "titel")}</SheetTitle>
            <SheetDescription>{t(N + "tekst", { naam })}</SheetDescription>
          </SheetHeader>
          <div className="mt-5 grid gap-2">
            <button type="button" onClick={afmelden} disabled={bezig} aria-busy={bezig || undefined} className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#A4533E] text-sm font-black text-white active:scale-[.99] disabled:opacity-60">
              {bezig ? <Loader2 className="size-4 animate-spin" aria-hidden="true"/> : <LogOut className="size-4" strokeWidth={2.2} aria-hidden="true"/>}{t(N + "bevestig")}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="h-12 rounded-full border border-border text-sm font-bold">{t("common.annuleren")}</button>
          </div>
        </SheetContent>
      </Sheet>
    </>);
}
