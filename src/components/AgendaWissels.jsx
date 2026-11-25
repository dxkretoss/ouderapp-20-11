import { useState } from "react";
import { useTranslation } from "react-i18next";
import { taalLocale } from "@/i18n";
import { Link } from "@tanstack/react-router";
import { AppIcon } from "@/components/AppIcon";
import { Chevron, MetVinkje } from "@/components/Tekens";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ouderLabel } from "@/lib/agenda-zorg";
import { useOverdracht } from "@/lib/overdracht-store";
import { dt } from "@/lib/agenda-datum";
import { uur } from "@/lib/tijd-tekst";
/**
 * One derived handover per child/date; no new appointment or handover record. The links open the checklist
 * and the handover note of THIS moment (moment id = date), also for a past handover.
 */
export function AgendaWissels({ datum, gegevens }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const od = useOverdracht();
    if (!gegevens.wissels.length)
        return null;
    const gedeeld = od.gedeeld.some((o) => o.momentId === datum);
    return <section className="my-2 rounded-[20px] border-2 border-[#A9BCA8] bg-[#E9EFE3] px-3.5 py-3 text-[#26211D]">
    <button type="button" className="flex w-full items-center gap-3 text-left" onClick={() => setOpen(true)}><AppIcon functie="wissel" maat="lg"/><span className="min-w-0 flex-1"><span className="block text-[16px] font-black">{t("components.AgendaWissels.wisseldag")}</span><span className="block text-sm text-[#3F5747]">{dt(datum).toLocaleDateString(taalLocale(), { day: "numeric", month: "long" })} · {gegevens.wissels.map((k) => `${k.naam}${k.tijd ? ` · ${uur(k.tijd)}` : ""}`).join(" · ")}</span></span><Chevron className="size-5 text-[#3F5747]"/></button>
    <div className="mt-2.5 grid grid-cols-2 gap-2">
      <Link to="/overdracht" search={{ moment: datum }} className="flex h-11 items-center justify-center rounded-full border border-white/90 bg-white/85 text-sm font-black text-[#2F4A3A]">{t("components.AgendaWissels.paklijst")}</Link>
      <Link to="/overdracht" search={{ moment: datum }} hash="overdracht" className="flex h-11 items-center justify-center gap-1.5 rounded-full bg-brand text-sm font-black text-primary-foreground">{gedeeld ? <MetVinkje>{t("components.AgendaWissels.overdrachtKlaar")}</MetVinkje> : t("components.AgendaWissels.overdrachtInvullen")}</Link>
    </div>
    <Sheet open={open} onOpenChange={setOpen}><SheetContent side="bottom" className="left-1/2 max-h-[90dvh] w-full max-w-md -translate-x-1/2 overflow-y-auto rounded-t-2xl bg-background px-5 pb-8"><SheetHeader><SheetTitle>{t("components.AgendaWissels.wisselmoment")}</SheetTitle><SheetDescription>{dt(datum).toLocaleDateString(taalLocale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</SheetDescription></SheetHeader><div className="mt-3 divide-y divide-border">{gegevens.wissels.map((k) => <div key={k.id} className="py-3 text-sm"><p className="font-semibold">{k.tijd ? (k.naar === "sanne" ? t("components.AgendaWissels.gaatNaarJou", { naam: k.naam, tijd: uur(k.tijd) }) : t("components.AgendaWissels.gaatNaarAnder", { naam: k.naam, tijd: uur(k.tijd) })) : t("components.AgendaWissels.wisseltVanHuis", { naam: k.naam })}</p><p className="mt-1 text-xs text-ink-soft">{ouderLabel(k.van)} → {ouderLabel(k.naar)}</p><p className="mt-1 text-xs text-ink-soft">{t("components.AgendaWissels.locatie", { plek: k.plek || t("components.AgendaWissels.nietIngevuld") })}</p>{k.uitzondering ? <p className="mt-1 text-xs">{k.uitzondering}</p> : null}</div>)}</div><div className="mt-3 grid gap-2"><Button asChild variant="outline"><Link to="/overdracht" search={{ moment: datum }} onClick={() => setOpen(false)}>{t("components.AgendaWissels.paklijst")}</Link></Button><Button asChild><Link to="/overdracht" search={{ moment: datum }} hash="overdracht" onClick={() => setOpen(false)}>{t("components.AgendaWissels.overdracht")}</Link></Button><Button asChild variant="outline"><Link to="/agenda" search={{ zorgActie: "wijziging", dag: datum }} onClick={() => setOpen(false)}>{t("components.AgendaWissels.wijzigingVoorstellen")}</Link></Button></div></SheetContent></Sheet>
  </section>;
}
