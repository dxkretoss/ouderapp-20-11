import { useState } from "react";
import { geldigeIban, koppelRekening, potSaldo, stortInPotje, useVasteLasten, voegLastToe } from "@/lib/vaste-lasten-store";

const euro = (n: number) => n.toLocaleString("nl-NL", { style: "currency", currency: "EUR" });
const veld = "rounded-md border border-border bg-background px-3 py-2 text-sm";

export function VasteLasten() {
  const { lasten, potjes } = useVasteLasten();
  const [open, setOpen] = useState(false);
  const [wat, setWat] = useState("");
  const [bedrag, setBedrag] = useState("");
  const [kind, setKind] = useState("Emma");
  const [storting, setStorting] = useState<string | null>(null);
  const [stortBedrag, setStortBedrag] = useState("");
  const [rekOpen, setRekOpen] = useState<string | null>(null);
  const [rekNaam, setRekNaam] = useState("");
  const [iban, setIban] = useState("");
  const totaal = lasten.reduce((s, l) => s + l.perMaand, 0);
  const jouwDeel = lasten.reduce((s, l) => s + (l.perMaand * l.pctSanne) / 100, 0);
  const [toon, setToon] = useState<"lasten" | "potjes" | null>(null);
  const p0 = potjes[0];
  const Rij = ({ id, titel, sub }: { id: "lasten" | "potjes"; titel: string; sub: string }) => (
    <button onClick={() => setToon(toon === id ? null : id)} aria-expanded={toon === id} className="flex min-h-14 w-full items-center gap-3 py-2.5 text-left">
      <span className="min-w-0 flex-1"><span className="block font-display text-sm font-bold">{titel}</span><span className="block truncate text-xs text-ink-soft">{sub}</span></span>
      <span aria-hidden className="text-ink-soft">{toon === id ? "–" : "›"}</span>
    </button>
  );

  return (
    <section className="mt-6 divide-y divide-border border-y border-border">
      <div>
      <Rij id="lasten" titel="Vaste lasten" sub={`${lasten.length} vaste kosten · samen ${euro(totaal)} per maand`} />
      {toon === "lasten" ? <div className="pb-3">
      <div className="flex justify-end">
        <button onClick={() => setOpen((o) => !o)} className="text-xs font-semibold text-brand">{open ? "Sluiten" : "+ Toevoegen"}</button>
      </div>
      {open ? (
        <form className="mt-2 grid gap-2" onSubmit={(e) => { e.preventDefault(); const b = Number(bedrag.replace(",", ".")); if (!wat.trim() || !(b > 0)) return; voegLastToe({ wat: wat.trim(), kind, perMaand: b, pctSanne: 50 }); setWat(""); setBedrag(""); setOpen(false); }}>
          <input className={veld} placeholder="Wat (bijv. contributie hockey)" value={wat} onChange={(e) => setWat(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <input className={veld} inputMode="decimal" placeholder="Per maand (€)" value={bedrag} onChange={(e) => setBedrag(e.target.value)} />
            <select className={veld} value={kind} onChange={(e) => setKind(e.target.value)}><option>Emma</option><option>Noah</option><option>Emma &amp; Noah</option></select>
          </div>
          <button className="rounded-md bg-brand py-2 text-sm font-semibold text-primary-foreground">Vaste last opslaan</button>
        </form>
      ) : null}
      <ul className="mt-2 divide-y divide-border">
        {lasten.map((l) => (
          <li key={l.id} className="flex items-center justify-between py-2.5 text-sm">
            <div><p className="font-semibold">{l.wat}</p><p className="text-xs text-ink-soft">{l.kind} · {l.pctSanne}/{100 - l.pctSanne}</p></div>
            <span className="font-semibold">{euro(l.perMaand)}<span className="text-xs font-normal text-ink-soft"> /mnd</span></span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-ink-soft">Samen {euro(totaal)} per maand · jouw deel {euro(jouwDeel)}</p>

      </div> : null}
      </div>
      <div>
      <Rij id="potjes" titel="Spaarpotjes" sub={p0 ? `${p0.naam} · ${euro(potSaldo(p0))}${p0.doel ? ` van ${euro(p0.doel)}` : ""}` : "Nog geen spaarpotjes"} />
      {toon === "potjes" ? <ul className="space-y-3 pb-3">
        {potjes.map((p) => {
          const saldo = potSaldo(p);
          return (
            <li key={p.id} className="rounded-md border border-border p-3">
              <div className="flex items-baseline justify-between"><p className="font-semibold">{p.naam}</p><p className="text-sm font-bold">{euro(saldo)}</p></div>
              {p.doel ? (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-brand" style={{ width: `${Math.min(100, (saldo / p.doel) * 100)}%` }} /></div>
              ) : null}
              <p className="mt-1 text-xs text-ink-soft">{p.doel ? `Doel ${euro(p.doel)} · ` : ""}{p.stortingen.length} stortingen</p>
              {p.rekening && rekOpen !== p.id ? (
                <p className="mt-1 text-xs text-ink-soft">Gekoppelde spaarrekening: <span className="font-semibold text-ink">{p.rekening.naam}</span> · {p.rekening.iban} <button onClick={() => koppelRekening(p.id, null)} className="ml-1 font-semibold text-brand">Ontkoppelen</button></p>
              ) : rekOpen === p.id ? (
                <form className="mt-2 grid gap-2" onSubmit={(e) => { e.preventDefault(); if (!rekNaam.trim() || !geldigeIban(iban)) return; koppelRekening(p.id, { naam: rekNaam.trim(), iban: iban.replace(/\s/g, "").toUpperCase() }); setRekOpen(null); setRekNaam(""); setIban(""); }}>
                  <input className={veld} placeholder="Naam rekening, bijv. Spaarrekening kinderen" value={rekNaam} onChange={(e) => setRekNaam(e.target.value)} />
                  <input className={veld} placeholder="IBAN, bijv. NL00 BANK 0123 4567 89" value={iban} onChange={(e) => setIban(e.target.value)} aria-invalid={!!iban && !geldigeIban(iban)} />
                  {iban && !geldigeIban(iban) ? <p className="text-xs text-ink-soft">Controleer het IBAN-nummer.</p> : null}
                  <p className="text-[11px] text-ink-soft">De app bewaart alleen de rekeninggegevens ter herinnering en verplaatst zelf geen geld.</p>
                  <div className="flex gap-2"><button className="flex-1 rounded-md bg-brand py-2 text-sm font-semibold text-primary-foreground">Rekening koppelen</button><button type="button" onClick={() => setRekOpen(null)} className="rounded-md border border-border px-3 text-sm font-semibold">Annuleren</button></div>
                </form>
              ) : (
                <button onClick={() => setRekOpen(p.id)} className="mt-1 block text-xs font-semibold text-brand">+ Spaarrekening koppelen</button>
              )}
              {storting === p.id ? (
                <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); const b = Number(stortBedrag.replace(",", ".")); if (!(b > 0)) return; stortInPotje(p.id, "Sanne", b); setStorting(null); setStortBedrag(""); }}>
                  <input className={`${veld} flex-1`} inputMode="decimal" placeholder="Bedrag (€)" value={stortBedrag} onChange={(e) => setStortBedrag(e.target.value)} />
                  <button className="rounded-md bg-brand px-3 text-sm font-semibold text-primary-foreground">Storten</button>
                </form>
              ) : (
                <button onClick={() => setStorting(p.id)} className="mt-2 text-xs font-semibold text-brand">+ Storting vastleggen</button>
              )}
            </li>
          );
        })}
      </ul> : null}
      </div>
    </section>
  );
}
