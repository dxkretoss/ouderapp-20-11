import { useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { AppIcon } from "@/components/AppIcon";
import { Chevron } from "@/components/Tekens";
import { Badge, FilterBalk } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
/**
 * Visual structure only. No parent content, AI metadata or derived pattern enters this
 * component until protected, consented sources exist. Every category shows "Nog niet beschikbaar".
 */
const categorie = (id) => ({
    id,
    get titel() { return i18n.t(`pro.CommunicatiePatronen.categorie.${id}.titel`); },
    get vervolg() { return i18n.t(`pro.CommunicatiePatronen.categorie.${id}.vervolg`); },
});
export const patroonCategorieen = ["overdracht", "zorgregeling", "kosten", "druk", "kind"].map(categorie);
const telsoorten = ["berichten", "vermeldingen", "onderwerpen", "gebeurtenissen"];
const metingen = ["volume", "voorstellen", "knelpunten", "afstemming", "co"];
const perioden = ["7 dagen", "30 dagen", "90 dagen"];
const periodeSleutel = { "7 dagen": "dagen7", "30 dagen": "dagen30", "90 dagen": "dagen90" };
export function CommunicatiePatronen() {
    const { t } = useTranslation();
    const [periode, setPeriode] = useState("30 dagen");
    const [open, setOpen] = useState(null);
    const [toestemming, setToestemming] = useState(false);
    const periodeTekst = t(`pro.CommunicatiePatronen.periode.${periodeSleutel[periode]}`);
    return <section className="border-b border-border py-4" aria-label={t("pro.CommunicatiePatronen.titel")}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-display text-lg">{t("pro.CommunicatiePatronen.titel")}</h3>
      <Badge>{t("common.nogNietBeschikbaar")}</Badge>
    </div>
    <FilterBalk doorlopen opties={perioden.map((p) => ({ id: p, label: t(`pro.CommunicatiePatronen.periode.${periodeSleutel[p]}`) }))} waarde={periode} onChange={setPeriode} className="mt-2"/>
    <p className="mt-3 text-sm text-ink-soft">{t("pro.CommunicatiePatronen.intro")}</p>
    <dl className="mt-3 divide-y divide-border border-y border-border">
      {metingen.map((m) => <div key={m} className="py-3"><dt className="text-sm font-semibold">{t(`pro.CommunicatiePatronen.meting.${m}.titel`)}</dt><dd className="mt-1 text-sm text-ink-soft">{t(`pro.CommunicatiePatronen.meting.${m}.uitleg`)} <span className="block">{t("pro.CommunicatiePatronen.nogNietBeschikbaarPeriode", { periode: periodeTekst })}</span></dd></div>)}
    </dl>
    <h4 className="mt-4 font-display font-semibold">{t("pro.CommunicatiePatronen.aandachtspunten")}</h4>
    <p className="mt-1 text-sm text-ink-soft">{t("pro.CommunicatiePatronen.aandachtspuntenUitleg")}</p>
    <h4 className="mt-4 font-display font-semibold">{t("pro.CommunicatiePatronen.patronen")}</h4>
    <p className="mt-3 flex items-start gap-2 text-sm text-ink-soft"><AppIcon functie="slot" vorm="kaal" maat="sm"/><span>{t("pro.CommunicatiePatronen.onvoldoendeGeenToestemming")}</span></p>
    <div className="mt-3 divide-y divide-border">
      {patroonCategorieen.map((c) => <Button variant="ghost" key={c.id} onClick={() => setOpen(c)} className="flex h-auto min-h-11 w-full items-center justify-between gap-2 whitespace-normal px-0 py-3 text-left">
        <span className="min-w-0"><span className="block text-sm font-semibold">{c.titel}</span><span className="mt-0.5 block text-sm text-ink-soft">{t("pro.CommunicatiePatronen.nogNietBeschikbaarPeriode", { periode: periodeTekst })}</span></span>
        <Chevron className="size-4 text-ink-soft"/>
      </Button>)}
    </div>
    <Button variant="outline" className="mt-3 h-auto min-h-11 whitespace-normal" onClick={() => setToestemming(true)}><AppIcon functie="slot" vorm="kaal" maat="sm"/>{t("pro.CommunicatiePatronen.aiAnalyse")}</Button>

    <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
      <SheetContent side="bottom" className="pro-cockpit left-1/2 max-h-[85dvh] w-full max-w-lg -translate-x-1/2 overflow-y-auto bg-background">
        <SheetHeader><SheetTitle>{open?.titel}</SheetTitle><SheetDescription>{t("pro.CommunicatiePatronen.periodeNietBeschikbaar", { periode: periodeTekst })}</SheetDescription></SheetHeader>
        <div className="mt-4 space-y-3 text-sm">
          <p>{t("pro.CommunicatiePatronen.onvoldoende")}</p>
          <dl className="divide-y divide-border border-y border-border">
            {telsoorten.map((s) => <div key={s} className="flex justify-between py-2"><dt>{t(`pro.CommunicatiePatronen.telsoort.${s}`)}</dt><dd className="text-ink-soft">{t("pro.CommunicatiePatronen.onbekend")}</dd></div>)}
          </dl>
          <p className="text-ink-soft">{t("pro.CommunicatiePatronen.apartGehouden")}</p>
          <p><span className="font-semibold">{t("pro.CommunicatiePatronen.vervolgstap")}</span> {open?.vervolg} <span className="text-ink-soft">{t("pro.CommunicatiePatronen.suggestie")}</span></p>
          <p className="border-t border-border pt-3 text-ink-soft">{t("pro.CommunicatiePatronen.bronnenLater")}</p>
        </div>
      </SheetContent>
    </Sheet>

    <Sheet open={toestemming} onOpenChange={setToestemming}>
      <SheetContent side="bottom" className="pro-cockpit left-1/2 max-h-[85dvh] w-full max-w-lg -translate-x-1/2 overflow-y-auto bg-background">
        <SheetHeader><SheetTitle>{t("pro.CommunicatiePatronen.aiAnalyse")}</SheetTitle><SheetDescription>{t("pro.CommunicatiePatronen.aiKeuze")}</SheetDescription></SheetHeader>
        <div className="mt-4 space-y-3 text-sm">
          <p>{t("pro.CommunicatiePatronen.ai1")}</p>
          <p>{t("pro.CommunicatiePatronen.ai2")}</p>
          <p>{t("pro.CommunicatiePatronen.ai3")}</p>
          <p className="border-t border-border pt-3 text-ink-soft">{t("pro.CommunicatiePatronen.aiNogNiet")}</p>
        </div>
      </SheetContent>
    </Sheet>
  </section>;
}
