import { useState, type ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { AppIcon } from "@/components/AppIcon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui-kit";
import { bevestig, meldFout } from "@/lib/feedback";
import { deelBetaalverzoek, reageerOpVerrekening, startVerrekening, useKosten, useVerrekenInstellingen } from "@/lib/kosten-store";
import { berekenSaldo, veiligeBetaallink, verrekeningStatus, type Verrekening } from "@/lib/verrekening";

const euro = (n: number) => n.toLocaleString("nl-NL", { style: "currency", currency: "EUR" });
const naam = (id: string) => id === "sanne" ? "Sanne" : "Joris";

/** Example family only: no bank credentials or simulated other-parent consent. */
export function Afrekenen({ periode, onTerug, onBerekening }: { periode: "maand" | "jaar"; onTerug: () => void; onBerekening: () => void }) {
  const { historie } = useVerrekenInstellingen();
  const saldo = berekenSaldo(useKosten());
  const [id, setId] = useState<string | null>(null);
  const [optie, setOptie] = useState<"verzoek" | "bank" | "betaald" | null>(null);
  const [link, setLink] = useState("");
  const [controle, setControle] = useState(false);
  const [bezig, setBezig] = useState(false);
  // Opening a screen is not a payment, and creating the existing record needs an explicit action.
  const v = historie.find((h) => h.id === id) ?? historie.find((h) => h.status !== "afgerond" && h.kostIds?.length);
  const ikOntvang = (v?.aan ?? (saldo.netto >= 0 ? "sanne" : "joris")) === "sanne";
  const start = () => {
    const bestaand = v ?? startVerrekening(periode);
    if (bestaand) setId(bestaand.id);
    return bestaand;
  };
  const reactie = (actie: "aangegeven" | "ontvangen" | "afronden") => {
    if (bezig) return;
    setBezig(true);
    const bron = start();
    if (bron && reageerOpVerrekening(bron.id, "sanne", actie)) bevestig(actie === "aangegeven" ? "Betaling aangegeven. Wacht op ontvangstbevestiging." : actie === "ontvangen" ? "Ontvangst bevestigd." : "Afrekening afgerond.");
    else meldFout("Deze actie kon niet worden opgeslagen. Controleer de huidige status.");
    setBezig(false);
  };
  return <AfrekenInhoud v={v} optie={optie} setOptie={setOptie} onTerug={onTerug} onBerekening={onBerekening}>
    {optie === "verzoek" ? <section className="mt-4 space-y-3 border-t border-border pt-4">
      <h2 className="font-display text-lg font-bold">Betalen via betaalverzoek</h2>
      <p className="text-sm text-ink-soft">Controleer bij de betaalverzoekdienst de ontvanger en het bedrag. Een geopende link betekent niet dat er is betaald.</p>
      {v?.betaalverzoek ? <Button variant="outline" asChild><a href={v.betaalverzoek} target="_blank" rel="noopener noreferrer">Open betaalverzoek <AppIcon functie="link" maat="sm" vorm="kaal" /></a></Button> : null}
      {ikOntvang && (!v || v.status === "nog-te-betalen" || v.status === "betaalverzoek-gedeeld") ? <>
        <p className="text-xs text-ink-soft">Voorbeeldgezin: de link blijft alleen tijdens deze sessie beschikbaar. Dit deelt niets met een echt ouderaccount.</p>
        <label className="block text-sm font-semibold">Bestaande betaalverzoeklink<input type="url" value={link} onChange={(e) => { setLink(e.target.value); setControle(false); }} placeholder="https://tikkie.me/pay/…" className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm" /></label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={controle} onChange={(e) => setControle(e.target.checked)} className="mt-1" />Ik heb gecontroleerd dat deze link bij het getoonde bedrag, de ontvanger en deze afrekening hoort.</label>
        <Button disabled={!veiligeBetaallink(link) || !controle || bezig} onClick={() => { const bron = start(); if (bron && deelBetaalverzoek(bron.id, "sanne", link)) bevestig("Betaalverzoek opgeslagen in het voorbeeldgezin."); else meldFout("De link kon niet worden opgeslagen."); }}>Betaalverzoek toevoegen</Button>
      </> : !v?.betaalverzoek ? <p className="text-sm text-ink-soft">De ontvangende ouder heeft nog geen betaalverzoek toegevoegd.</p> : null}
    </section> : null}
    {optie === "bank" ? <section className="mt-4 space-y-3 border-t border-border pt-4">
      <h2 className="font-display text-lg font-bold">Bankoverschrijving</h2>
      <p className="text-sm text-ink-soft">Vraag het IBAN en de tenaamstelling rechtstreeks aan de ontvangende ouder. Bankgegevens delen in de app kan zodra beide ouders veilig gekoppeld zijn.</p>
      <p className="text-xs text-ink-soft">Er worden hier geen bankgegevens opgeslagen. Bevestig een daadwerkelijke betaling altijd bij je eigen bank.</p>
      {v ? <Kopieer label="Betalingsomschrijving" waarde={`Ouderschap & Co ${v.id}`} /> : <Button variant="outline" onClick={start}>Betalingsomschrijving voorbereiden</Button>}
    </section> : null}
    {optie === "betaald" || v?.status === "wacht-op-ontvanger" ? <section className="mt-4 space-y-3 border-t border-border pt-4">
      <p className="text-sm text-ink-soft">Een melding van de betaler is geen bewijs van ontvangst. Alleen de ontvangende ouder bevestigt dat het geld is ontvangen.</p>
      {!ikOntvang && (!v || v.status === "nog-te-betalen" || v.status === "betaalverzoek-gedeeld") ? <Button disabled={bezig} onClick={() => reactie("aangegeven")}>Ik heb {euro(v?.bedrag ?? Math.abs(saldo.netto))} betaald</Button> : null}
      {ikOntvang && (!v || ["nog-te-betalen", "betaalverzoek-gedeeld", "wacht-op-ontvanger"].includes(v.status)) ? <Button disabled={bezig} onClick={() => reactie("ontvangen")}>Ik heb het bedrag ontvangen</Button> : null}
      {v?.status === "wacht-op-ontvanger" ? <p className="text-sm text-ink-soft">Wacht op bevestiging van {naam(v.aan)}.</p> : null}
    </section> : null}
    {v?.status === "ontvangst-bevestigd" ? <Button className="mt-4" onClick={() => reactie("afronden")}>Afrekening afronden</Button> : null}
    {v?.gebeurtenissen?.length ? <section className="mt-5 border-t border-border pt-3"><h2 className="text-sm font-semibold">Geschiedenis</h2>{v.gebeurtenissen.map((g, i) => <p key={i} className="mt-1 text-xs text-ink-soft">{verrekeningStatus(g.status)} · {naam(g.door)} · {new Date(g.moment).toLocaleDateString("nl-NL")}</p>)}</section> : null}
  </AfrekenInhoud>;
}

function AfrekenInhoud({ v, optie, setOptie, onTerug, onBerekening, children }: { v: Verrekening | undefined; optie: "verzoek" | "bank" | "betaald" | null; setOptie: (v: "verzoek" | "bank" | "betaald") => void; onTerug: () => void; onBerekening: () => void; children: ReactNode }) {
  const saldo = berekenSaldo(useKosten());
  const bedrag = v?.bedrag ?? Math.abs(saldo.netto);
  const ontvanger = v?.aan ?? (saldo.netto >= 0 ? "sanne" : "joris");
  const betaler = v?.van ?? (saldo.netto >= 0 ? "joris" : "sanne");
  const klaar = v?.status === "afgerond" || v?.status === "ontvangst-bevestigd";
  return <AppShell><div className="flex items-center gap-3"><Button variant="outline" size="icon" className="knop-kruis size-11" aria-label="Terug" onClick={onTerug}>‹</Button><h1 className="font-display text-2xl font-extrabold">Afrekenen</h1></div>
    <section className="mt-5 border-y border-border py-4"><p className="font-display text-3xl font-extrabold tabular-nums">{euro(bedrag)}</p><p className="mt-1 text-sm">{naam(betaler)} betaalt aan {naam(ontvanger)}</p><Badge toon={klaar ? "klaar" : "actie"} className="mt-2">{verrekeningStatus(v?.status ?? "nog-te-betalen")}</Badge><div><Button variant="link" onClick={onBerekening} className="min-h-11 px-0">Bekijk berekening ›</Button></div><Kopieer label="Bedrag" waarde={bedrag.toFixed(2).replace(".", ",")} /><Kopieer label="Ontvanger" waarde={naam(ontvanger)} /></section>
    {!klaar && bedrag > 0 ? <div className="mt-4 divide-y divide-border border-y border-border">{([{ id: "verzoek", tekst: "Betalen via betaalverzoek", icoon: "betaalverzoek" }, { id: "bank", tekst: "Bankoverschrijving", icoon: "kosten" }, { id: "betaald", tekst: "Ik heb al betaald", icoon: "akkoord" }] as const).map((o) => <Button variant="ghost" key={o.id} aria-expanded={optie === o.id} onClick={() => setOptie(o.id)} className="h-auto min-h-14 w-full justify-start gap-3 whitespace-normal rounded-none px-0 text-left"><AppIcon functie={o.icoon} maat="sm" /><span className="flex-1">{o.tekst}</span><span className="text-brand" aria-hidden>›</span></Button>)}</div> : null}
    {children}
  </AppShell>;
}
function Kopieer({ label, waarde }: { label: string; waarde: string }) {
  return <div className="flex items-center justify-between gap-2 text-sm"><span className="min-w-0 break-all"><span className="text-ink-soft">{label}: </span>{waarde}</span><Button variant="ghost" size="sm" aria-label={`${label} kopiëren`} onClick={async () => { try { await navigator.clipboard.writeText(waarde); bevestig(`${label} gekopieerd.`); } catch { meldFout("Kopiëren lukt nu niet. Je kunt de gegevens selecteren en kopiëren."); } }}>Kopieer</Button></div>;
}