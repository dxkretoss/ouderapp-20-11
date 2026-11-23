import { useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useServerFn } from "@/lib/server-fn";
import { Link } from "@tanstack/react-router";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "./ui/sheet";
import { Button } from "./ui/button";
import { CoBadge } from "./CoBadge";
import { CoPrivacy } from "./CoPrivacy";
import { HulpKaart } from "./Onveilig";
import { praatVerhaal } from "@/lib/verhaal.functions";
import { coachBericht } from "@/lib/coach.functions";
import { gesprekken, afspraken } from "@/lib/demo-data";
import { useAfspraken } from "@/lib/afspraken-store";
import { useVakanties } from "@/lib/vakantie-store";
import { bouwVerhaalContext, zorgSignaal } from "@/lib/verhaal";
import { conceptBruikbaar, meedenkKeuzes, overnameKeuze, voorbeeldContext } from "@/lib/meedenken";
/** De keuzes blijven Nederlandse ids (logica); alleen het label wordt vertaald. */
const keuzeSleutel = { "Even ventileren": "ventileren", "Gesprek begrijpen": "begrijpen", "Reactie opstellen": "reactie", "Wat is afgesproken?": "afgesproken" };
export function EvenMeedenken({ gesprekId, eigen, huidigConcept, onOvernemen, alsKnop = false }) {
    const { t } = useTranslation();
    const keuzeLabel = (k) => t(`components.EvenMeedenken.keuze.${keuzeSleutel[k]}`);
    const praat = useServerFn(praatVerhaal);
    const coach = useServerFn(coachBericht);
    const afspraakBron = useAfspraken();
    const vakanties = useVakanties();
    const [open, setOpen] = useState(false);
    const [keuze, setKeuze] = useState(null);
    const [toestemming, setToestemming] = useState(null);
    const [gegevens, setGegevens] = useState(false);
    const [invoer, setInvoer] = useState("");
    const [sessie, setSessie] = useState([]);
    const [concept, setConcept] = useState("");
    const [origineel, setOrigineel] = useState("");
    const [vervangen, setVervangen] = useState(false);
    const [bezig, setBezig] = useState(false);
    const [fout, setFout] = useState("");
    const [zorg, setZorg] = useState(false);
    const [variant, setVariant] = useState(0);
    const verzoek = useRef(0);
    const slot = useRef(false);
    const voorbeeld = gesprekken.find((g) => g.id === gesprekId);
    const context = voorbeeldContext(voorbeeld?.berichten ?? [], toestemming === true, eigen);
    const sluit = () => {
        verzoek.current++;
        slot.current = false;
        setBezig(false);
        setOpen(false);
        setSessie([]);
        setConcept("");
        setInvoer("");
        setToestemming(null);
        setGegevens(false);
        setKeuze(null);
        setFout("");
        setZorg(false);
        setVervangen(false);
    };
    const stuur = async (tekst = invoer, andereVariant = false) => {
        const t = tekst.trim();
        if (!t || slot.current || eigen)
            return;
        slot.current = true;
        const nummer = ++verzoek.current;
        const nieuw = andereVariant ? sessie : [...sessie, { rol: "ouder", tekst: t }];
        if (!andereVariant) {
            setSessie(nieuw);
            setInvoer("");
        }
        setBezig(true);
        setFout("");
        setConcept("");
        setVervangen(false);
        if (zorgSignaal(t))
            setZorg(true);
        try {
            if (keuze === "Reactie opstellen") {
                const v = andereVariant ? variant + 1 : 0;
                setVariant(v);
                setOrigineel(t);
                const r = await coach({ data: { tekst: t, stijl: andereVariant ? "Neutraler" : "Rustiger", variant: v, context } });
                if (nummer !== verzoek.current)
                    return;
                if (r.niveau === "dreigend")
                    setZorg(true);
                const passend = conceptBruikbaar(r.voorstel) ? r.voorstel : r.niveau === "geen" && !r.nieuweDetails?.length && conceptBruikbaar(t) ? t : "";
                setConcept(passend);
                setSessie((s) => [...s, { rol: "ai", tekst: passend ? t("components.EvenMeedenken.hierIsConcept") : t("components.EvenMeedenken.geenConcept") }]);
            }
            else {
                const feiten = gegevens ? bouwVerhaalContext({ vakanties, voorstellen: afspraakBron.filter((a) => a.voorstel).map((a) => ({ titel: a.titel, status: `voorstel, nog geen akkoord: ${a.voorstel?.tekst ?? a.tekst}` })), taken: [], afspraken: afspraakBron.filter((a) => a.status === "Actief" && !a.veiligheid && !a.bron).map((a) => ({ titel: a.titel, tekst: a.tekst })) }, ["vakanties", "voorstellen", "afspraken"]) + "\nVOORBEELDAGENDA (gepland is geen akkoord over aanwezigheid):\n" + afspraken.map((a) => `${a.titel}: ${a.datumLabel}, ${a.tijd} uur; aanwezigheid onbekend`).join("\n") : "";
                const r = await praat({ data: { modus: keuze === "Gesprek begrijpen" || keuze === "Wat is afgesproken?" ? "overzicht" : "praten", context: ["Alle gegevens zijn fictief. Bepaal geen verborgen intenties. Noem concrete vragen en onduidelijkheden; geef geen ongevraagde oplossingen bij ventileren.", context.length ? "Geselecteerd voorbeeldgesprek:\n" + context.map((b) => `${b.van === "ik" ? "Ik" : "Andere ouder"}: ${b.tekst}`).join("\n") : "Geen toestemming voor gespreksberichten.", feiten].join("\n\n").slice(0, 6000), berichten: nieuw.slice(-12).map(({ rol, tekst }) => ({ rol, tekst })) } });
                if (nummer !== verzoek.current)
                    return;
                setSessie((s) => [...s, { rol: "ai", tekst: r.antwoord }]);
            }
        }
        catch (e) {
            if (nummer === verzoek.current) {
                setFout(e instanceof Error ? e.message : t("components.EvenMeedenken.nietBereikbaar"));
                setInvoer(t);
            }
        }
        finally {
            if (nummer === verzoek.current) {
                slot.current = false;
                setBezig(false);
            }
        }
    };
    const overnemen = (bevestigd = false) => {
        const tekst = overnameKeuze(huidigConcept, concept, bevestigd);
        if (tekst === null) {
            setVervangen(true);
            return;
        }
        onOvernemen(tekst);
        sluit();
    };
    return <>
    {alsKnop
            ? <button type="button" onClick={() => setOpen(true)} aria-label={t("components.EvenMeedenken.sparren")} className="grid size-10 shrink-0 place-items-center rounded-full border border-[#C9D6C3] bg-[#E9EFE3] text-[13px] font-black text-[#3F5747]">Co</button>
            : <Button variant="link" className="mt-2 min-h-11 p-0 text-sm" onClick={() => setOpen(true)}><CoBadge maat="sm"/>{t("components.EvenMeedenken.sparrenVraag")}</Button>}
    <Sheet open={open} onOpenChange={(v) => { if (!v)
        sluit(); }}>
      <SheetContent side="bottom" className="flex h-[92dvh] max-h-[900px] flex-col rounded-t-lg border-ai-reply bg-ai-space p-4 text-ai-ink sm:inset-x-auto sm:left-1/2 sm:w-full sm:max-w-xl sm:-translate-x-1/2">
        <SheetHeader className="shrink-0 pr-10 text-left">
          <SheetTitle className="flex items-center gap-2 text-ai-ink"><CoBadge maat="sm"/>{t("components.EvenMeedenken.sparrenVraag")}</SheetTitle>
          <SheetDescription className="text-ai-soft">{t("components.EvenMeedenken.beschrijving")}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1">
          <div className="rounded-md bg-background px-3 text-foreground"><CoPrivacy /></div>
          <p className="text-xs text-ai-soft">{t("components.EvenMeedenken.priveHulp")}</p>
          {eigen ? <p className="text-sm">{t("components.EvenMeedenken.eigenNietBeschikbaar")}</p> : <>
            {!keuze ? <div><p className="mb-2 text-sm text-ai-soft">{t("components.EvenMeedenken.intro")}</p><p className="mb-2 font-semibold">{t("components.EvenMeedenken.waarmee")}</p><div className="grid grid-cols-2 gap-2">{meedenkKeuzes.map((k) => <Button key={k} variant="ghost" className="h-auto min-h-11 whitespace-normal border border-ai-soft/40 bg-ai-reply text-ai-ink hover:bg-ai-soft hover:text-ai-space" onClick={() => { setKeuze(k); setConcept(""); }}>{keuzeLabel(k)}</Button>)}</div></div> : <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{keuzeLabel(keuze)}</span><Button variant="ghost" size="sm" className="text-ai-soft hover:text-ai-space" onClick={() => { setKeuze(null); setConcept(""); }}>{t("components.EvenMeedenken.andereKeuze")}</Button></div>}
            {toestemming === null ? <div className="space-y-2 border-y border-ai-soft/30 py-3"><p className="font-semibold">{t("components.EvenMeedenken.magIk")}</p><p className="text-sm text-ai-soft">{t("components.EvenMeedenken.maxZes")}</p><details className="text-sm"><summary className="cursor-pointer">{t("components.EvenMeedenken.bekijkGeselecteerd")}</summary>{voorbeeld?.berichten.slice(-6).map((b) => <p key={b.id} className="mt-2">{b.van === "sanne" ? t("common.jij") : t("components.EvenMeedenken.andereOuder")}: {b.tekst}</p>)}</details><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setToestemming(true)}>{t("components.EvenMeedenken.jaGebruik")}</Button><Button variant="ghost" className="text-ai-ink hover:text-ai-space" onClick={() => setToestemming(false)}>{t("components.EvenMeedenken.neeZonder")}</Button></div></div> : <div className="flex items-start justify-between gap-2 text-xs text-ai-soft"><span>{toestemming ? t("components.EvenMeedenken.geselecteerd", { count: context.length }) : t("components.EvenMeedenken.geenMeegenomen")}</span><Button variant="ghost" size="sm" className="h-auto p-0 text-ai-soft hover:bg-transparent hover:text-ai-ink" onClick={() => { verzoek.current++; slot.current = false; setBezig(false); setToestemming(null); setSessie([]); setConcept(""); }}>{t("common.wijzigen")}</Button></div>}
            {keuze === "Wat is afgesproken?" ? <label className="flex items-start gap-2 text-sm text-ai-soft"><input type="checkbox" checked={gegevens} onChange={(e) => { setGegevens(e.target.checked); setSessie([]); setConcept(""); }} className="mt-1"/>{t("components.EvenMeedenken.gebruikFictief")}</label> : null}
            <div role="log" aria-live="polite" className="space-y-3">{sessie.map((b, i) => <div key={i} className={b.rol === "ouder" ? "ml-8 rounded-md bg-ai-ink px-3 py-2 text-ai-space" : "mr-4 rounded-md bg-ai-reply px-3 py-2 text-ai-ink"}><p className="mb-1 text-xs font-semibold">{b.rol === "ouder" ? t("components.EvenMeedenken.jijAanCo") : "Co"}</p><p className="whitespace-pre-wrap break-words text-sm">{b.tekst}</p></div>)}</div>
            {bezig ? <p role="status" className="text-sm text-ai-soft">{t("components.EvenMeedenken.nadenken")}</p> : null}
            {fout ? <p role="alert" className="text-sm">{t("components.EvenMeedenken.fout", { fout })}</p> : null}
            {concept ? <div className="space-y-3 border-t border-ai-soft/30 pt-3"><p className="text-xs font-semibold">{t("components.EvenMeedenken.conceptKop")}</p><p className="whitespace-pre-wrap rounded-md bg-ai-ink p-3 text-sm text-ai-space">{concept}</p><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => overnemen()}>{t("components.EvenMeedenken.gebruikAntwoord")}</Button><Button variant="ghost" disabled={bezig} className="text-ai-ink hover:text-ai-space" onClick={() => void stuur(origineel, true)}>{t("common.anderVoorstel")}</Button><Button variant="ghost" className="text-ai-ink hover:text-ai-space" onClick={() => { setConcept(""); setInvoer(origineel); }}>{t("components.EvenMeedenken.terugMijnTekst")}</Button></div>{vervangen ? <div role="alert" className="space-y-2"><p className="text-sm">{t("components.EvenMeedenken.alTekst")}</p><p className="text-sm text-ai-soft">{huidigConcept}</p><Button variant="secondary" onClick={() => overnemen(true)}>{t("components.EvenMeedenken.jaVervang")}</Button><Button variant="ghost" className="text-ai-ink hover:text-ai-space" onClick={() => setVervangen(false)}>{t("components.EvenMeedenken.behouden")}</Button></div> : null}</div> : null}
            {gegevens && keuze === "Wat is afgesproken?" ? <div className="flex flex-wrap gap-3 text-xs text-ai-soft"><Link to="/afspraken" onClick={sluit} className="underline">{t("components.EvenMeedenken.bekijkAfspraken")}</Link><Link to="/agenda" onClick={sluit} className="underline">{t("components.EvenMeedenken.bekijkAgenda")}</Link><Link to="/planning" onClick={sluit} className="underline">{t("components.EvenMeedenken.bekijkVakantie")}</Link></div> : null}
          </>}
          {zorg || zorgSignaal(invoer) ? <div className="rounded-md bg-card p-3 text-ink"><p className="mb-2 text-sm"><Trans i18nKey="components.EvenMeedenken.crisis" components={{ link: <a href="tel:08000113" className="underline"/> }}/></p><HulpKaart /></div> : null}
        </div>
        {!eigen ? <form className="shrink-0 space-y-2 border-t border-ai-soft/30 pt-3" onSubmit={(e) => { e.preventDefault(); void stuur(); }}><label htmlFor="meedenken-invoer" className="text-sm font-semibold">{t("components.EvenMeedenken.jouwBericht")}</label><textarea id="meedenken-invoer" rows={2} maxLength={3000} value={invoer} onChange={(e) => setInvoer(e.target.value)} placeholder={keuze === "Reactie opstellen" ? t("components.EvenMeedenken.placeholderReactie") : t("components.EvenMeedenken.placeholder")} className="w-full resize-none rounded-md bg-ai-ink p-3 text-base text-ai-space outline-none focus-visible:ring-2 focus-visible:ring-ai-soft"/><div className="flex items-center justify-between gap-2"><Button variant="ghost" className="min-h-11 text-ai-ink hover:text-ai-space" onClick={sluit}>{t("components.EvenMeedenken.terugGesprek")}</Button><Button type="submit" variant="secondary" className="min-h-11" disabled={!invoer.trim() || bezig}>{t("components.EvenMeedenken.vraagCo")}</Button></div><p className="text-xs text-ai-soft">{t("components.EvenMeedenken.alleenFictief")}</p></form> : <Button variant="secondary" className="min-h-11" onClick={sluit}>{t("components.EvenMeedenken.terugGesprek")}</Button>}
      </SheetContent>
    </Sheet>
  </>;
}
