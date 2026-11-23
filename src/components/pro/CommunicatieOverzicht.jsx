import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppIcon } from "@/components/AppIcon";
import { MetChevron } from "@/components/Tekens";
import { Badge, FilterBalk } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
/** No parent content or derived signals enter this component before a protected source exists. */
export function CommunicatieOverzicht({ gezinnen, onOpen }) {
    const { t } = useTranslation();
    const [periode, setPeriode] = useState("7 dagen");
    const [informatie, setInformatie] = useState(false);
    return <section className="border-b border-border py-4" aria-label={t("pro.CommunicatieOverzicht.ariaLabel")}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-display text-xl">{t("pro.CommunicatieOverzicht.titel")}</h2>
      <Badge>{t("pro.CommunicatieOverzicht.geenToegang")}</Badge>
    </div>
    <FilterBalk doorlopen opties={[{ id: "7 dagen", label: t("pro.CommunicatieOverzicht.periode.dagen7") }, { id: "30 dagen", label: t("pro.CommunicatieOverzicht.periode.dagen30") }]} waarde={periode} onChange={setPeriode} className="mt-2"/>
    <p className="mt-3 flex items-start gap-2 text-sm text-ink-soft"><AppIcon functie="slot" vorm="kaal" maat="sm"/><span>{t("pro.CommunicatieOverzicht.afgeschermd")}</span></p>
    <div className="mt-3 divide-y divide-border">
      {gezinnen.map((g) => <div key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
        <div className="min-w-0"><p className="text-sm font-semibold">{g.gezin}</p><p className="mt-0.5 text-sm text-ink-soft">{t("pro.CommunicatieOverzicht.nietBeschikbaar")}</p></div>
        {onOpen ? <Button variant="ghost" className="h-auto min-h-10 px-0 py-1 text-brand" onClick={() => onOpen(g.id)}><MetChevron>{t("pro.CommunicatieOverzicht.bekijkSignalen")}</MetChevron></Button> : null}
      </div>)}
    </div>
    <Button variant="outline" className="mt-3 h-auto min-h-11 whitespace-normal" onClick={() => setInformatie(true)}><AppIcon functie="slot" vorm="kaal" maat="sm"/>{t("pro.CommunicatieOverzicht.toestemming")}</Button>
    <Sheet open={informatie} onOpenChange={setInformatie}>
      <SheetContent side="bottom" className="pro-cockpit left-1/2 max-h-[85dvh] w-full max-w-lg -translate-x-1/2 overflow-y-auto bg-background">
        <SheetHeader><SheetTitle>{t("pro.CommunicatieOverzicht.toestemming")}</SheetTitle><SheetDescription>{t("pro.CommunicatieOverzicht.sheetUitleg")}</SheetDescription></SheetHeader>
        <div className="mt-4 space-y-3 text-sm">
          <p>{t("pro.CommunicatieOverzicht.uitleg1")}</p>
          <p>{t("pro.CommunicatieOverzicht.uitleg2")}</p>
          <p>{t("pro.CommunicatieOverzicht.uitleg3")}</p>
          <p>{t("pro.CommunicatieOverzicht.uitleg4")}</p>
          <p className="border-t border-border pt-3 text-ink-soft">{t("pro.CommunicatieOverzicht.nogNietAanvragen")}</p>
        </div>
      </SheetContent>
    </Sheet>
  </section>;
}
