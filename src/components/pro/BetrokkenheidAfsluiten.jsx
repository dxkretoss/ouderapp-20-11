import { useState } from "react";
import { useTranslation } from "react-i18next";
import { taalLocale } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { datumKort, doelStatusLabel, duurBetrokkenheid, trekToegangIn, vandaagIso } from "@/lib/pro-journaal-store";
const veld = "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
const datum = (iso) => new Date(iso).toLocaleDateString(taalLocale(), { day: "numeric", month: "long", year: "numeric" });
/** Redenwaarden blijven Nederlands (logica: "Anders"); weergave via vertaling. */
const redenen = [["Begeleiding afgerond", "afgerond"], ["Ouders gaan zelfstandig verder", "zelfstandig"], ["Overdracht naar een andere professional", "overdracht"], ["Op verzoek van ouders", "verzoek"], ["Anders", "anders"]];
export function BetrokkenheidAfsluiten({ professional, gezin, doelen, onSluit, onBeeindig }) {
    const { t } = useTranslation();
    const redenLabel = (w) => { const r = redenen.find(([v]) => v === w); return r ? t(`pro.BetrokkenheidAfsluiten.reden.${r[1]}`) : w; };
    const [eind, setEind] = useState(vandaagIso);
    const [reden, setReden] = useState("");
    const [bereikt, setBereikt] = useState("");
    const [waarom, setWaarom] = useState("");
    const [anders, setAnders] = useState("");
    const [vervolg, setVervolg] = useState("");
    const [samenvatting, setSamenvatting] = useState(null);
    const [gecontroleerd, setGecontroleerd] = useState(false);
    const [fout, setFout] = useState("");
    const duur = duurBetrokkenheid(professional.start, eind);
    const geldig = duurBetrokkenheid(eind, vandaagIso()) !== undefined && (!professional.start || duur !== undefined);
    const kan = geldig && reden.trim() && bereikt.trim() && waarom && (waarom !== "Anders" || anders.trim());
    const controleren = () => {
        setSamenvatting([
            `${gezin} · ${professional.naam}`,
            duur !== undefined
                ? t("pro.BetrokkenheidAfsluiten.sam.periodeMetDuur", { start: professional.start ? datum(professional.start) : t("pro.BetrokkenheidAfsluiten.sam.geenStart"), eind: datum(eind), count: duur })
                : t("pro.BetrokkenheidAfsluiten.sam.periode", { start: professional.start ? datum(professional.start) : t("pro.BetrokkenheidAfsluiten.sam.geenStart"), eind: datum(eind) }),
            `${t("pro.BetrokkenheidAfsluiten.sam.reden")}\n${reden.trim()}`,
            `${t("pro.BetrokkenheidAfsluiten.sam.bereikt")}\n${bereikt.trim()}`,
            `${t("pro.BetrokkenheidAfsluiten.sam.waarom")}\n${waarom === "Anders" ? anders.trim() : redenLabel(waarom)}`,
            ...(vervolg.trim() ? [`${t("pro.BetrokkenheidAfsluiten.sam.vervolg")}\n${vervolg.trim()}`] : []),
            ...(doelen.length ? [`${t("pro.BetrokkenheidAfsluiten.sam.doelen")}\n${doelen.map((d) => `- ${d.tekst} · ${doelStatusLabel(d.status)}`).join("\n")}`] : []),
        ].join("\n\n"));
        setGecontroleerd(false);
    };
    const opslaan = () => {
        if (!samenvatting?.trim() || !gecontroleerd || !geldig)
            return;
        try {
            trekToegangIn(professional.id, { eind, samenvatting });
            onBeeindig();
        }
        catch {
            setFout(t("pro.BetrokkenheidAfsluiten.fout"));
        }
    };
    return <Sheet open onOpenChange={(open) => { if (!open)
        onSluit(); }}>
    <SheetContent side="bottom" className="pro-cockpit left-1/2 max-h-[90dvh] w-full max-w-xl -translate-x-1/2 overflow-y-auto rounded-t-2xl bg-background p-5">
      <SheetHeader className="pr-8 text-left"><SheetTitle className="font-display text-xl">{t("pro.BetrokkenheidAfsluiten.titel")}</SheetTitle><SheetDescription>{gezin} · {professional.naam}</SheetDescription></SheetHeader>
      <p className="mt-3 text-xs text-ink-soft">{t("pro.BetrokkenheidAfsluiten.intern")}</p>
      {samenvatting === null ? <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); if (kan)
            controleren(); }}>
        <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-ink-soft">{t("pro.BetrokkenheidAfsluiten.startdatum")}</dt><dd>{professional.start ? datum(professional.start) : t("pro.BetrokkenheidAfsluiten.nietVastgelegd")}</dd></div><div><dt className="text-xs text-ink-soft">{t("pro.BetrokkenheidAfsluiten.duur")}</dt><dd aria-live="polite">{duur === undefined ? t("pro.BetrokkenheidAfsluiten.nietTeBerekenen") : t("pro.BetrokkenheidAfsluiten.dagen", { count: duur })}</dd></div></dl>
        <label className="block text-sm font-semibold">{t("pro.BetrokkenheidAfsluiten.einddatum")}<input type="date" required min={professional.start || undefined} max={vandaagIso()} value={eind} onChange={(e) => setEind(e.target.value)} className={veld}/></label>
        {!geldig && <p role="alert" className="text-sm text-ink-soft">{t("pro.BetrokkenheidAfsluiten.kiesEinddatum")}</p>}
        <label className="block text-sm font-semibold">{t("pro.BetrokkenheidAfsluiten.vraagReden")}<textarea required rows={2} value={reden} onChange={(e) => setReden(e.target.value)} className={veld}/></label>
        <label className="block text-sm font-semibold">{t("pro.BetrokkenheidAfsluiten.vraagBereikt")}<textarea required rows={2} value={bereikt} onChange={(e) => setBereikt(e.target.value)} className={veld}/></label>
        <label className="block text-sm font-semibold">{t("pro.BetrokkenheidAfsluiten.vraagWaarom")}<select required value={waarom} onChange={(e) => setWaarom(e.target.value)} className={veld}><option value="">{t("pro.BetrokkenheidAfsluiten.kiesReden")}</option>{redenen.map(([r, k]) => <option key={r} value={r}>{t(`pro.BetrokkenheidAfsluiten.reden.${k}`)}</option>)}</select></label>
        {waarom === "Anders" && <label className="block text-sm font-semibold">{t("pro.BetrokkenheidAfsluiten.andereReden")}<input required value={anders} onChange={(e) => setAnders(e.target.value)} className={veld}/></label>}
        <label className="block text-sm font-semibold">{t("pro.BetrokkenheidAfsluiten.vraagVervolg")}<textarea rows={2} value={vervolg} onChange={(e) => setVervolg(e.target.value)} className={veld}/></label>
        <div className="flex flex-wrap gap-2"><Button type="submit" disabled={!kan}>{t("pro.BetrokkenheidAfsluiten.controleren")}</Button><Button type="button" variant="ghost" onClick={onSluit}>{t("common.annuleren")}</Button></div>
      </form> : <div className="mt-4 space-y-3">
        <label className="block text-sm font-semibold">{t("pro.BetrokkenheidAfsluiten.afsluitsamenvatting")}<textarea rows={12} value={samenvatting} onChange={(e) => { setSamenvatting(e.target.value); setGecontroleerd(false); }} className={veld}/></label>
        <p className="text-xs text-ink-soft">{t("pro.BetrokkenheidAfsluiten.gevolgen")}</p>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={gecontroleerd} onChange={(e) => setGecontroleerd(e.target.checked)} className="mt-1"/>{t("pro.BetrokkenheidAfsluiten.bevestig")}</label>
        {fout && <p role="alert">{fout}</p>}
        <div className="flex flex-wrap gap-2"><Button disabled={!gecontroleerd || !samenvatting.trim()} onClick={opslaan}>{t("pro.BetrokkenheidAfsluiten.definitief")}</Button><Button variant="outline" onClick={() => setSamenvatting(null)}>{t("pro.BetrokkenheidAfsluiten.aanpassen")}</Button><Button variant="ghost" onClick={onSluit}>{t("common.annuleren")}</Button></div>
      </div>}
    </SheetContent>
  </Sheet>;
}
export function InterneAfsluiting({ professional }) {
    const { t } = useTranslation();
    if (!professional.afsluiting)
        return null;
    return <details className="mt-3 border-t border-border pt-3"><summary className="cursor-pointer text-sm font-semibold">{t("pro.BetrokkenheidAfsluiten.afsluitsamenvatting")} · {datumKort(professional.afsluiting.eind)}</summary><p className="mt-2 text-xs text-ink-soft">{professional.naam} · {t("pro.BetrokkenheidAfsluiten.internNietGedeeld")}</p><p className="mt-2 whitespace-pre-wrap text-sm">{professional.afsluiting.samenvatting}</p></details>;
}
