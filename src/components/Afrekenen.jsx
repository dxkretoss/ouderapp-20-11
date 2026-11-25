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
import { deelBetaalverzoek, reageerOpVerrekening, startVerrekening, useKostenPaar, useVerrekenInstellingen } from "@/lib/kosten-store";
import { geldigeIban } from "@/lib/vaste-lasten-store";
import { berekenSaldo, betaalOvergang, veiligeBetaallink, verrekeningStatus } from "@/lib/verrekening";
const euro = (n) => n.toLocaleString(taalLocale(), { style: "currency", currency: "EUR" });
/**
 * Afrekenen van het eigen gezin (manage-expenses). Eén afrekening per set verrekenbare uitgaven; de server
 * bepaalt bedrag en richting. Alleen de ontvanger deelt een betaallink en/of zijn rekeninggegevens; een
 * melding van de betaler is geen bewijs: pas "Ontvangen" van de ontvanger verrekent de uitgaven.
 */
export function Afrekenen({ onTerug, onBerekening, startVerzoek = false }) {
    const { t } = useTranslation();
    const naam = (wie) => (wie === "ik" ? t("common.jij") : t("components.Afrekenen.andereOuder"));
    const { historie } = useVerrekenInstellingen();
    const paar = useKostenPaar();
    const saldo = berekenSaldo(paar.kosten, paar.budgetten);
    const [id, setId] = useState(null);
    const [optie, setOptie] = useState(startVerzoek ? "verzoek" : null);
    const [link, setLink] = useState("");
    const [controle, setControle] = useState(false);
    const [bezig, setBezig] = useState(false);
    const v = historie.find((h) => h.id === id) ?? historie.find((h) => !["ontvangst-bevestigd", "afgerond"].includes(h.status) && h.kostIds?.length);
    const [bedragTekst, setBedragTekst] = useState(bewerkGeld(v?.bedrag ?? Math.abs(saldo.netto)));
    const [omschrijving, setOmschrijving] = useState(v?.omschrijving || t("components.Afrekenen.standaardOmschrijving"));
    const [rekeninghouder, setRekeninghouder] = useState(v?.rekeninghouder ?? "");
    const [iban, setIban] = useState(v?.iban ?? "");
    const ikOntvang = (v?.aan ?? (saldo.netto >= 0 ? "ik" : "ander")) === "ik";
    const bedrag = v?.bedrag ?? Math.abs(saldo.netto);
    // Openen is geen betaling; het record ontstaat pas bij een expliciete actie.
    const start = async () => {
        const bestaand = v ?? await startVerrekening();
        if (bestaand)
            setId(bestaand.id);
        return bestaand;
    };
    const reactie = async (actie) => {
        if (bezig)
            return;
        setBezig(true);
        const bron = await start();
        if (bron && betaalOvergang(bron, "ik", actie) && await reageerOpVerrekening(bron.id, actie))
            bevestig(actie === "aangegeven" ? t("components.Afrekenen.melding.aangegeven") : actie === "ontvangen" ? t("components.Afrekenen.melding.ontvangen") : t("components.Afrekenen.melding.afgerond"));
        else if (bron)
            meldFout(t("components.Afrekenen.melding.fout"));
        setBezig(false);
    };
    const deel = async (velden, melding) => {
        if (bezig)
            return;
        setBezig(true);
        const bron = await start();
        const gelukt = bron ? await deelBetaalverzoek(bron.id, { omschrijving, ...velden }) : false;
        setBezig(false);
        if (!bron && bedrag < 0.01)
            meldFout(t("components.Afrekenen.nietsOpen"));
        if (gelukt)
            bevestig(melding);
    };
    const kanVerzoek = ikOntvang && (!v || v.status === "nog-te-betalen" || v.status === "betaalverzoek-gedeeld");
    return <AfrekenInhoud v={v} bedrag={bedrag} naam={naam} ikOntvang={ikOntvang} optie={optie} setOptie={setOptie} onTerug={onTerug} onBerekening={onBerekening}>
    {optie === "verzoek" ? <section className="mt-3 space-y-3 rounded-[22px] border border-white/85 bg-white/60 px-4 py-4">
      <h2 className="font-display text-lg font-bold">{t("components.Afrekenen.betaalverzoek")}</h2>
      <GeldInvoer label={t("components.Afrekenen.bedragVerzoek")} value={bedragTekst} onChange={setBedragTekst}/>
      {leesGeld(bedragTekst) !== bedrag ? <p className="text-sm text-accent-warm">{t("components.Afrekenen.gebruikBedrag")}</p> : null}
      <label className="block text-sm font-semibold">{t("components.Afrekenen.omschrijving")}<input aria-label={t("components.Afrekenen.omschrijvingLabel")} value={omschrijving} disabled={!kanVerzoek} onChange={(e) => setOmschrijving(e.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm"/></label>
      <p className="text-xs text-ink-soft">{t("components.Afrekenen.gekoppeld")}</p>
      <p className="text-sm text-ink-soft">{t("components.Afrekenen.controleerDienst")}</p>
      {v?.betaalverzoek ? <><p className="break-all text-xs text-ink-soft">{v.betaalverzoek}</p><Button variant="outline" asChild><a href={v.betaalverzoek} target="_blank" rel="noopener noreferrer">{t("components.Afrekenen.linkOpenen")} <AppIcon functie="link" maat="sm" vorm="kaal"/></a></Button></> : null}
      {kanVerzoek ? <>
        <label className="block text-sm font-semibold">{t("components.Afrekenen.linkControleren")}<input type="url" aria-label={t("components.Afrekenen.betaallink")} value={link} onChange={(e) => { setLink(e.target.value); setControle(false); }} placeholder="https://tikkie.me/pay/…" className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm"/></label>
        {link ? veiligeBetaallink(link) ? <><p className="text-xs text-ink-soft">{t("components.Afrekenen.bestemming", { host: new URL(link).hostname })}</p><Button variant="outline" asChild><a href={veiligeBetaallink(link) ?? undefined} target="_blank" rel="noopener noreferrer">{t("components.Afrekenen.linkControlerenKnop")} <AppIcon functie="link" maat="sm" vorm="kaal"/></a></Button></> : <p role="alert" className="text-sm text-accent-warm">{t("components.Afrekenen.onveilig")}</p> : null}
        <p className="text-xs text-ink-soft">{t("components.Afrekenen.voorbeeldSessie")}</p>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={controle} onChange={(e) => setControle(e.target.checked)} className="mt-1"/>{t("components.Afrekenen.gecontroleerd")}</label>
        <Button disabled={!veiligeBetaallink(link) || !controle || bezig || !omschrijving.trim() || leesGeld(bedragTekst) !== bedrag} onClick={() => deel({ link }, t("components.Afrekenen.melding.verzoekOpgeslagen"))}>{t("components.Afrekenen.verzoekToevoegen")}</Button>
      </> : !v?.betaalverzoek && !v?.iban ? <p className="text-sm text-ink-soft">{t("components.Afrekenen.nogGeenVerzoek")}</p> : null}
      {!ikOntvang ? <>
        <p className="text-xs text-ink-soft">{t("components.Afrekenen.jijBetaalt")}</p>
        {!v?.betaalverzoek && !v?.iban && (!v || v.status === "nog-te-betalen") ? (v ? <p role="status" className="text-sm text-ink-soft">{t("components.Afrekenen.verzoekGevraagd")}</p> : <Button variant="outline" disabled={bezig || bedrag < 0.01} onClick={async () => { if (bezig)
            return; setBezig(true); const bron = await start(); setBezig(false); if (bron)
            bevestig(t("components.Afrekenen.melding.verzoekGevraagd")); }}>{t("components.Afrekenen.vraagVerzoek")}</Button>) : null}
      </> : null}
      <Button variant="outline" onClick={() => setOptie("bank")}>{t("components.Afrekenen.bankoverschrijving")}</Button>
    </section> : null}
    {optie === "bank" ? <section className="mt-3 space-y-3 rounded-[22px] border border-white/85 bg-white/60 px-4 py-4">
      <h2 className="font-display text-lg font-bold">{t("components.Afrekenen.bankoverschrijving")}</h2>
      {kanVerzoek ? <>
        <p className="text-sm text-ink-soft">{t("components.Afrekenen.bank.vraagIban")}</p>
        <p className="text-xs text-ink-soft">{t("components.Afrekenen.bank.opslag")}</p>
        <label className="block text-sm font-semibold">{t("components.Afrekenen.bank.naamHouder")}<input value={rekeninghouder} onChange={(e) => setRekeninghouder(e.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm"/></label>
        <label className="block text-sm font-semibold">{t("components.Afrekenen.bank.iban")}<input value={iban} onChange={(e) => setIban(e.target.value)} autoComplete="off" className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm"/></label>
        {iban && !geldigeIban(iban) ? <p role="alert" className="text-sm text-accent-warm">{t("components.Afrekenen.bank.ibanOngeldig")}</p> : null}
        <p className="text-xs text-ink-soft">{t("components.Afrekenen.bank.tijdelijk")}</p>
        <Button disabled={bezig || !geldigeIban(iban) || !rekeninghouder.trim()} onClick={() => deel({ iban, rekeninghouder }, t("components.Afrekenen.melding.bankGedeeld"))}>{t("components.Afrekenen.bank.delen")}</Button>
      </> : v?.iban ? <>
        <p className="text-sm text-ink-soft">{t("components.Afrekenen.bank.gedeeldDoorAnder")}</p>
        {v.rekeninghouder ? <Kopieer label={t("components.Afrekenen.bank.houder")} waarde={v.rekeninghouder}/> : null}
        <Kopieer label={t("components.Afrekenen.bank.iban")} waarde={v.iban}/>
        {v.kenmerk ? <Kopieer label={t("components.Afrekenen.bank.kenmerk")} waarde={v.kenmerk}/> : null}
        <Kopieer label={t("components.Afrekenen.bank.omschrijving")} waarde={`${v.omschrijving || t("components.Afrekenen.standaardOmschrijving")} ${v.kenmerk}`.trim()}/>
      </> : <p className="text-sm text-ink-soft">{t("components.Afrekenen.bank.nogNiet")}</p>}
    </section> : null}
    {optie === "betaald" || v?.status === "wacht-op-ontvanger" ? <section className="mt-3 space-y-3 rounded-[22px] border border-white/85 bg-white/60 px-4 py-4">
      <p className="text-sm text-ink-soft">{t("components.Afrekenen.geenBewijs")}</p>
      {!ikOntvang && (!v || v.status === "nog-te-betalen" || v.status === "betaalverzoek-gedeeld") ? <Button disabled={bezig} onClick={() => reactie("aangegeven")}>{t("components.Afrekenen.ikHebBetaald", { bedrag: euro(bedrag) })}</Button> : null}
      {ikOntvang && (!v || ["nog-te-betalen", "betaalverzoek-gedeeld", "wacht-op-ontvanger"].includes(v.status)) ? <Button disabled={bezig} onClick={() => reactie("ontvangen")}>{t("components.Afrekenen.ikHebOntvangen")}</Button> : null}
      {v?.status === "wacht-op-ontvanger" && !ikOntvang ? <p className="text-sm text-ink-soft">{t("components.Afrekenen.wachtOpBevestiging", { naam: naam(v.aan) })}</p> : null}
    </section> : null}
    {v?.status === "ontvangst-bevestigd" && ikOntvang ? <Button className="mt-4 min-h-12 w-full rounded-full" disabled={bezig} onClick={() => reactie("afronden")}>{t("components.Afrekenen.afronden")}</Button> : null}
    {v?.gebeurtenissen?.length ? <section className="mt-4 rounded-[22px] border border-white/85 bg-white/60 px-4 py-3.5"><h2 className="text-sm font-black">{t("components.Afrekenen.geschiedenis")}</h2>{v.gebeurtenissen.map((g, i) => <p key={i} className="mt-1 text-xs text-ink-soft">{verrekeningStatus(g.status)} · {naam(g.door)} · {new Date(g.moment).toLocaleDateString(taalLocale())}</p>)}</section> : null}
  </AfrekenInhoud>;
}
function AfrekenInhoud({ v, bedrag, naam, ikOntvang, optie, setOptie, onTerug, onBerekening, children }) {
    const { t } = useTranslation();
    const ontvanger = v?.aan ?? (ikOntvang ? "ik" : "ander");
    const klaar = v?.status === "afgerond" || v?.status === "ontvangst-bevestigd";
    return <AppShell><div className="flex items-center gap-3"><TerugKnop onClick={onTerug}/><h1 className="lora text-[30px] leading-tight">{t("components.Afrekenen.titel")}</h1></div>
    {/* Bedrag en richting in één duidelijke kaart */}
    <section className="mt-5 rounded-[24px] border border-[#C9D6C3] bg-[#E9EFE3] px-5 py-5">
      <p className="text-[12px] font-black uppercase tracking-[0.1em] text-[#3F5747]">{ontvanger === "ik" ? t("components.Afrekenen.anderBetaaltJou") : t("components.Afrekenen.jijBetaaltAnder")}</p>
      <p className="mt-1 font-display text-[40px] font-extrabold leading-tight tabular-nums text-ink">{euro(bedrag)}</p>
      <Badge toon={klaar ? "klaar" : "actie"} className="mt-2">{verrekeningStatus(v?.status ?? "nog-te-betalen")}</Badge>
      <div className="mt-4 space-y-2 rounded-[18px] bg-white/70 px-3.5 py-1.5">
        <Kopieer label={t("components.Afrekenen.bedrag")} waarde={taalLocale() === "nl-NL" ? bedrag.toFixed(2).replace(".", ",") : bedrag.toFixed(2)}/>
        {v?.iban && !ikOntvang ? <div className="border-t border-border"><Kopieer label={t("components.Afrekenen.bank.iban")} waarde={v.iban}/></div> : null}
      </div>
      <button type="button" onClick={onBerekening} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full border border-[#C9D6C3] bg-white/80 px-4 text-sm font-semibold text-[#2F4A3A]">{t("components.Afrekenen.bekijkBerekening")}<Chevron className="size-4"/></button>
    </section>
    {!v && bedrag < 0.01 ? <p role="status" className="mt-4 rounded-xl bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)] px-3 py-3 text-center text-sm text-ink-soft">{t("components.Afrekenen.nietsOpen")}</p> : null}
    {!klaar && bedrag > 0 ? <><h2 className="mt-6 px-1 text-[12px] font-black uppercase tracking-[0.1em] text-ink-soft">{t("components.Afrekenen.hoeBetalen")}</h2><div className="mt-2 divide-y divide-border overflow-hidden rounded-[22px] border border-white/85 bg-white/60">{[{ id: "verzoek", tekst: t("components.Afrekenen.optie.verzoek"), icoon: "betaalverzoek" }, { id: "bank", tekst: t("components.Afrekenen.bankoverschrijving"), icoon: "kosten" }, { id: "betaald", tekst: ikOntvang ? t("components.Afrekenen.optie.ontvangstBevestigen") : t("components.Afrekenen.optie.alBetaald"), icoon: "akkoord" }].map((o) => <Button variant="ghost" key={o.id} aria-expanded={optie === o.id} onClick={() => setOptie(o.id)} className={`h-auto min-h-[60px] w-full justify-start gap-3 whitespace-normal rounded-none px-4 text-left text-[15px] font-semibold ${optie === o.id ? "bg-brand-soft/70" : ""}`}><AppIcon functie={o.icoon} maat="sm"/><span className="min-w-0 flex-1">{o.tekst}</span><Chevron richting="omlaag" open={optie === o.id} className="size-4 text-brand"/></Button>)}</div></> : null}
    {children}
  </AppShell>;
}
function Kopieer({ label, waarde }) {
    const { t } = useTranslation();
    return <div className="flex min-h-11 items-center justify-between gap-2 text-sm"><span className="min-w-0 break-all"><span className="text-ink-soft">{label}: </span><b className="tabular-nums">{waarde}</b></span><Button variant="ghost" size="icon" className="size-11 shrink-0" aria-label={t("components.Afrekenen.kopieer.label", { label })} title={t("components.Afrekenen.kopieer.label", { label })} onClick={async () => { try {
        await navigator.clipboard.writeText(waarde);
        bevestig(t("components.Afrekenen.kopieer.gekopieerd", { label }));
    }
    catch {
        meldFout(t("components.Afrekenen.kopieer.fout"));
    } }}><AppIcon functie="kopieren" maat="sm"/></Button></div>;
}
