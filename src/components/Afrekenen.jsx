import { useState } from "react";
import { useTranslation } from "react-i18next";
import { taalLocale } from "@/i18n";
import { AppShell, TerugKnop } from "@/components/AppShell";
import { Chevron, MetChevron } from "@/components/Tekens";
import { AppIcon } from "@/components/AppIcon";
import { Button } from "@/components/ui/button";
import { GeldInvoer } from "@/components/GeldInvoer";
import { bewerkGeld, leesGeld } from "@/lib/geld-invoer";
import { Badge } from "@/components/ui-kit";
import { bevestig, meldFout } from "@/lib/feedback";
import { deelBetaalverzoek, reageerOpVerrekening, startVerrekening, useKosten, useVerrekenInstellingen } from "@/lib/kosten-store";
import { berekenSaldo, veiligeBetaallink, verrekeningStatus } from "@/lib/verrekening";
const euro = (n) => n.toLocaleString(taalLocale(), { style: "currency", currency: "EUR" });
const naam = (id) => id === "sanne" ? "Sanne" : "Joris";
/** Example family only: no bank credentials or simulated other-parent consent. */
export function Afrekenen({ periode, onTerug, onBerekening, startVerzoek = false }) {
    const { t } = useTranslation();
    const { historie } = useVerrekenInstellingen();
    const saldo = berekenSaldo(useKosten());
    const [id, setId] = useState(null);
    const [optie, setOptie] = useState(startVerzoek ? "verzoek" : null);
    const [link, setLink] = useState("");
    const [controle, setControle] = useState(false);
    const [bezig, setBezig] = useState(false);
    const [bedragTekst, setBedragTekst] = useState(bewerkGeld(Math.abs(saldo.netto)));
    const [omschrijving, setOmschrijving] = useState(t("components.Afrekenen.standaardOmschrijving"));
    const [rekeninghouder, setRekeninghouder] = useState("");
    const [iban, setIban] = useState("");
    const [kenmerk, setKenmerk] = useState("");
    // Opening a screen is not a payment, and creating the existing record needs an explicit action.
    const v = historie.find((h) => h.id === id) ?? historie.find((h) => h.status !== "afgerond" && h.kostIds?.length);
    const ikOntvang = (v?.aan ?? (saldo.netto >= 0 ? "sanne" : "joris")) === "sanne";
    const start = () => {
        const bestaand = v ?? startVerrekening(periode);
        if (bestaand)
            setId(bestaand.id);
        return bestaand;
    };
    const reactie = (actie) => {
        if (bezig)
            return;
        setBezig(true);
        const bron = start();
        if (bron && reageerOpVerrekening(bron.id, "sanne", actie))
            bevestig(actie === "aangegeven" ? t("components.Afrekenen.melding.aangegeven") : actie === "ontvangen" ? t("components.Afrekenen.melding.ontvangen") : t("components.Afrekenen.melding.afgerond"));
        else
            meldFout(t("components.Afrekenen.melding.fout"));
        setBezig(false);
    };
    return <AfrekenInhoud v={v} optie={optie} setOptie={setOptie} onTerug={onTerug} onBerekening={onBerekening}>
    {optie === "verzoek" ? <section className="mt-4 space-y-3 border-t border-border pt-4">
      <h2 className="font-display text-lg font-bold">{t("components.Afrekenen.betaalverzoek")}</h2>
      <GeldInvoer label={t("components.Afrekenen.bedragVerzoek")} value={bedragTekst} onChange={setBedragTekst}/>
      {leesGeld(bedragTekst) !== (v?.bedrag ?? Math.abs(saldo.netto)) ? <p className="text-sm text-accent-warm">{t("components.Afrekenen.gebruikBedrag")}</p> : null}
      <label className="block text-sm font-semibold">{t("components.Afrekenen.omschrijving")}<input aria-label={t("components.Afrekenen.omschrijvingLabel")} value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm"/></label>
      <p className="text-xs text-ink-soft">{t("components.Afrekenen.gekoppeld")}</p>
      <p className="text-sm text-ink-soft">{t("components.Afrekenen.controleerDienst")}</p>
      {v?.betaalverzoek ? <><p className="break-all text-xs text-ink-soft">{v.betaalverzoek}</p><Button variant="outline" asChild><a href={v.betaalverzoek} target="_blank" rel="noopener noreferrer">{t("components.Afrekenen.linkOpenen")} <AppIcon functie="link" maat="sm" vorm="kaal"/></a></Button></> : null}
      <label className="block text-sm font-semibold">{t("components.Afrekenen.linkControleren")}<input type="url" aria-label={t("components.Afrekenen.betaallink")} value={link} onChange={(e) => { setLink(e.target.value); setControle(false); }} placeholder="https://tikkie.me/pay/…" className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm"/></label>
      {link ? veiligeBetaallink(link) ? <><p className="text-xs text-ink-soft">{t("components.Afrekenen.bestemming", { host: new URL(link).hostname })}</p><Button variant="outline" asChild><a href={veiligeBetaallink(link) ?? undefined} target="_blank" rel="noopener noreferrer">{t("components.Afrekenen.linkControlerenKnop")} <AppIcon functie="link" maat="sm" vorm="kaal"/></a></Button></> : <p role="alert" className="text-sm text-accent-warm">{t("components.Afrekenen.onveilig")}</p> : null}
      {ikOntvang && (!v || v.status === "nog-te-betalen" || v.status === "betaalverzoek-gedeeld") ? <>
        <p className="text-xs text-ink-soft">{t("components.Afrekenen.voorbeeldSessie")}</p>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={controle} onChange={(e) => setControle(e.target.checked)} className="mt-1"/>{t("components.Afrekenen.gecontroleerd")}</label>
        <Button disabled={!veiligeBetaallink(link) || !controle || bezig || !omschrijving.trim() || leesGeld(bedragTekst) !== (v?.bedrag ?? Math.abs(saldo.netto))} onClick={() => { const bron = start(); if (bron && deelBetaalverzoek(bron.id, "sanne", link, omschrijving))
                bevestig(t("components.Afrekenen.melding.verzoekOpgeslagen"));
            else
                meldFout(t("components.Afrekenen.melding.linkFout")); }}>{t("components.Afrekenen.verzoekToevoegen")}</Button>
      </> : !v?.betaalverzoek ? <p className="text-sm text-ink-soft">{t("components.Afrekenen.nogGeenVerzoek")}</p> : null}
      {!ikOntvang ? <p className="text-xs text-ink-soft">{t("components.Afrekenen.jijBetaalt")}</p> : null}
      <Button variant="outline" onClick={() => setOptie("bank")}>{t("components.Afrekenen.bankoverschrijving")}</Button>
    </section> : null}
    {optie === "bank" ? <section className="mt-4 space-y-3 border-t border-border pt-4">
      <h2 className="font-display text-lg font-bold">{t("components.Afrekenen.bankoverschrijving")}</h2>
      <p className="text-sm text-ink-soft">{t("components.Afrekenen.bank.vraagIban")}</p>
      <p className="text-xs text-ink-soft">{t("components.Afrekenen.bank.geenOpslag")}</p>
      <label className="block text-sm font-semibold">{t("components.Afrekenen.bank.naamHouder")}<input value={rekeninghouder} onChange={(e) => setRekeninghouder(e.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm"/></label>
      <label className="block text-sm font-semibold">{t("components.Afrekenen.bank.iban")}<input value={iban} onChange={(e) => setIban(e.target.value)} autoComplete="off" className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm"/></label>
      <label className="block text-sm font-semibold">{t("components.Afrekenen.bank.kenmerk")}<input value={kenmerk} onChange={(e) => setKenmerk(e.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm"/></label>
      <p className="text-xs text-ink-soft">{t("components.Afrekenen.bank.tijdelijk")}</p>
      {rekeninghouder ? <Kopieer label={t("components.Afrekenen.bank.houder")} waarde={rekeninghouder}/> : null}
      {iban ? <Kopieer label={t("components.Afrekenen.bank.iban")} waarde={iban}/> : null}
      {kenmerk ? <Kopieer label={t("components.Afrekenen.bank.kenmerk")} waarde={kenmerk}/> : null}
      {v ? <Kopieer label={t("components.Afrekenen.bank.omschrijving")} waarde={`Ouderschap & Co ${v.id}`}/> : <Button variant="outline" onClick={start}>{t("components.Afrekenen.bank.voorbereiden")}</Button>}
    </section> : null}
    {optie === "betaald" || v?.status === "wacht-op-ontvanger" ? <section className="mt-4 space-y-3 border-t border-border pt-4">
      <p className="text-sm text-ink-soft">{t("components.Afrekenen.geenBewijs")}</p>
      {!ikOntvang && (!v || v.status === "nog-te-betalen" || v.status === "betaalverzoek-gedeeld") ? <Button disabled={bezig} onClick={() => reactie("aangegeven")}>{t("components.Afrekenen.ikHebBetaald", { bedrag: euro(v?.bedrag ?? Math.abs(saldo.netto)) })}</Button> : null}
      {ikOntvang && (!v || ["nog-te-betalen", "betaalverzoek-gedeeld", "wacht-op-ontvanger"].includes(v.status)) ? <Button disabled={bezig} onClick={() => reactie("ontvangen")}>{t("components.Afrekenen.ikHebOntvangen")}</Button> : null}
      {v?.status === "wacht-op-ontvanger" ? <p className="text-sm text-ink-soft">{t("components.Afrekenen.wachtOpBevestiging", { naam: naam(v.aan) })}</p> : null}
    </section> : null}
    {v?.status === "ontvangst-bevestigd" ? <Button className="mt-4" onClick={() => reactie("afronden")}>{t("components.Afrekenen.afronden")}</Button> : null}
    {v?.gebeurtenissen?.length ? <section className="mt-5 border-t border-border pt-3"><h2 className="text-sm font-semibold">{t("components.Afrekenen.geschiedenis")}</h2>{v.gebeurtenissen.map((g, i) => <p key={i} className="mt-1 text-xs text-ink-soft">{verrekeningStatus(g.status)} · {naam(g.door)} · {new Date(g.moment).toLocaleDateString(taalLocale())}</p>)}</section> : null}
  </AfrekenInhoud>;
}
function AfrekenInhoud({ v, optie, setOptie, onTerug, onBerekening, children }) {
    const { t } = useTranslation();
    const saldo = berekenSaldo(useKosten());
    const bedrag = v?.bedrag ?? Math.abs(saldo.netto);
    const ontvanger = v?.aan ?? (saldo.netto >= 0 ? "sanne" : "joris");
    const betaler = v?.van ?? (saldo.netto >= 0 ? "joris" : "sanne");
    const klaar = v?.status === "afgerond" || v?.status === "ontvangst-bevestigd";
    return <AppShell><div className="flex items-center gap-3"><TerugKnop onClick={onTerug}/><h1 className="lora text-[30px] leading-tight">{t("components.Afrekenen.titel")}</h1></div>
    <section className="mt-5 border-y border-border py-4"><p className="font-display text-3xl font-extrabold tabular-nums">{euro(bedrag)}</p><p className="mt-1 text-sm">{t("components.Afrekenen.betaaltAan", { betaler: naam(betaler), ontvanger: naam(ontvanger) })}</p><Badge toon={klaar ? "klaar" : "actie"} className="mt-2">{verrekeningStatus(v?.status ?? "nog-te-betalen")}</Badge><div><Button variant="link" onClick={onBerekening} className="min-h-11 px-0"><MetChevron>{t("components.Afrekenen.bekijkBerekening")}</MetChevron></Button></div><Kopieer label={t("components.Afrekenen.bedrag")} waarde={taalLocale() === "nl-NL" ? bedrag.toFixed(2).replace(".", ",") : bedrag.toFixed(2)}/><Kopieer label={t("components.Afrekenen.ontvanger")} waarde={naam(ontvanger)}/></section>
    {!klaar && bedrag > 0 ? <div className="mt-4 divide-y divide-border border-y border-border">{[{ id: "verzoek", tekst: t("components.Afrekenen.optie.verzoek"), icoon: "betaalverzoek" }, { id: "bank", tekst: t("components.Afrekenen.bankoverschrijving"), icoon: "kosten" }, { id: "betaald", tekst: t("components.Afrekenen.optie.alBetaald"), icoon: "akkoord" }].map((o) => <Button variant="ghost" key={o.id} aria-expanded={optie === o.id} onClick={() => setOptie(o.id)} className="h-auto min-h-14 w-full justify-start gap-3 whitespace-normal rounded-none px-0 text-left"><AppIcon functie={o.icoon} maat="sm"/><span className="flex-1">{o.tekst}</span><Chevron className="size-4 text-brand"/></Button>)}</div> : null}
    {children}
  </AppShell>;
}
function Kopieer({ label, waarde }) {
    const { t } = useTranslation();
    return <div className="flex items-center justify-between gap-2 text-sm"><span className="min-w-0 break-all"><span className="text-ink-soft">{label}: </span>{waarde}</span><Button variant="ghost" size="icon" className="size-11 shrink-0" aria-label={t("components.Afrekenen.kopieer.label", { label })} title={t("components.Afrekenen.kopieer.label", { label })} onClick={async () => { try {
        await navigator.clipboard.writeText(waarde);
        bevestig(t("components.Afrekenen.kopieer.gekopieerd", { label }));
    }
    catch {
        meldFout(t("components.Afrekenen.kopieer.fout"));
    } }}><AppIcon functie="kopieren" maat="sm"/></Button></div>;
}
