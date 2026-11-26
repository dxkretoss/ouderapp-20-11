import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { dienVoorstelIn, useZorg } from "@/lib/zorg-store";
import { startNuAfstemmen } from "@/lib/nu-afstemmen-store";
import { useWisselMomenten } from "@/lib/overdracht-store";
import { AppIcon } from "@/components/AppIcon";
import { MetChevron, Chevron } from "@/components/Tekens";
import { bevestig } from "@/lib/feedback";
/** Eén snelle actie bij een wisselmoment: stuurt een tijdvoorstel en een Nu-afstemmen-vraag; verandert de wissel nooit zelf. */
export function IkBenLater({ momentId, moment, rij }) {
    const { t } = useTranslation();
    const momenten = useWisselMomenten();
    const zorg = useZorg();
    const [open, setOpen] = useState(false);
    const [tijd, setTijd] = useState("");
    const m = moment ?? momenten.find((x) => x.id === momentId);
    if (!m || !m.tijd)
        return null;
    const wacht = zorg.voorstellen.find((v) => v.status === "open" && v.aanleiding === "moment" && v.moment?.datum === m.datum);
    const later = (min) => {
        const [uur, minuut] = m.tijd.split(":").map(Number);
        if (uur === undefined || minuut === undefined || !Number.isFinite(uur) || !Number.isFinite(minuut))
            return;
        const totaal = uur * 60 + minuut + min;
        if (totaal >= 1440)
            return;
        setTijd(`${String(Math.floor(totaal / 60)).padStart(2, "0")}:${String(totaal % 60).padStart(2, "0")}`);
    };
    const verstuur = () => {
        if (!tijd || tijd <= m.tijd || wacht)
            return;
        const tekst = t("components.IkBenLater.voorstelTekst", { dag: m.dag, plek: m.plek || "—", tijd, oud: m.tijd });
        dienVoorstelIn({ soort: "eenmalig", aanleiding: "moment", kinderen: m.kindIds, datums: [], tekst, datumLabel: `${m.dag} ${m.tijd}`, moment: { datum: m.datum, tijd, oud: m.tijd } });
        startNuAfstemmen({ categorie: "planning", kindIds: m.kindIds, titel: t("components.IkBenLater.nuTitel", { tijd }), toelichting: t("components.IkBenLater.nuToelichting", { tekst }), reactieGewenst: "zsm", oudeTijd: m.tijd, nieuweTijd: tijd });
        setOpen(false);
        bevestig(t("components.IkBenLater.verstuurd"), { uitleg: t("components.IkBenLater.wacht"), tril: true });
    };
    return <>
    {wacht ? <p role="status" className={rij ? "px-4 py-3 text-xs text-ink-soft" : "mt-2 text-xs text-ink-soft"}>{t("components.IkBenLater.tijdvoorstel", { tijd: m.tijd })} <Link to="/agenda" search={{ zorgVoorstel: wacht.id }} className="inline-flex min-h-10 items-center font-semibold text-brand"><MetChevron>{t("components.IkBenLater.bekijkVoorstel")}</MetChevron></Link></p> : rij ? <button type="button" className={rij} onClick={() => { setTijd(""); setOpen(true); }}><AppIcon functie="tijd" maat="sm"/><span className="min-w-0 flex-1 text-[15px] font-semibold">{t("components.IkBenLater.titel")}</span><Chevron className="size-4 shrink-0 text-ink-soft"/></button> : <Button variant="link" size="sm" className="h-auto min-h-11 px-0" onClick={() => { setTijd(""); setOpen(true); }}><AppIcon functie="tijd" maat="sm" vorm="kaal"/>{t("components.IkBenLater.titel")}</Button>}
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="bottom">
        <SheetHeader><SheetTitle>{t("components.IkBenLater.titel")}</SheetTitle><SheetDescription>{t("components.IkBenLater.afgesproken", { dag: m.dag, tijd: m.tijd, plek: m.plek || "—" })}</SheetDescription></SheetHeader>
        <fieldset className="mt-4"><legend className="text-sm font-semibold">{t("components.IkBenLater.hoeveel")}</legend><div className="mt-2 grid grid-cols-3 gap-2">{[10, 20, 30].map((min) => <Button key={min} variant="outline" className="min-h-11 w-full rounded-full" onClick={() => later(min)}>{t("components.IkBenLater.plusMin", { min })}</Button>)}</div></fieldset>
        <label className="mt-4 block text-sm font-semibold">{t("components.IkBenLater.aankomst")}<input type="time" value={tijd} onChange={(e) => setTijd(e.target.value)} className="mt-2 block w-full min-h-11 rounded-2xl border border-border bg-card px-3 py-2"/></label>
        <p className="mt-3 text-xs text-ink-soft">{t("components.IkBenLater.uitleg")}</p>
        <Button className="mt-4 min-h-12 w-full rounded-full" disabled={!tijd || tijd <= m.tijd || !!wacht} onClick={verstuur}>{t("components.IkBenLater.versturen")}</Button>
      </SheetContent>
    </Sheet>
  </>;
}
