import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Compass, MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { laterHerinneren, morgenOverzicht, nietMeerTonen, nogTeRegelenDezeWeek, sindsLaatsteBezoek, suggesties, useSlimmeHulp, weekOverzicht, type WeekDag } from "@/lib/slimme-hulp";
import { useTaken } from "@/lib/taken-store";
import { useKring } from "@/lib/kring-store";
import { useVoorkeuren } from "@/lib/voorkeuren-store";
import { useAudit } from "@/lib/audit-store";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { uur } from "@/lib/tijd-tekst";

/** "Even vooruitkijken" op Home: hooguit 3 suggesties, uitleg per suggestie, wegdrukken; plus Deze week / Morgen. */
export function Vooruitkijken() {
  useSlimmeHulp(); useTaken(); useKring(); useAudit();
  const vk = useVoorkeuren();
  const [waarom, setWaarom] = useState<string | null>(null);
  const [week, setWeek] = useState(false);
  const [avond, setAvond] = useState(false);
  const [sinds, setSinds] = useState<ReturnType<typeof sindsLaatsteBezoek>>(null);
  const [laterId, setLaterId] = useState<string | null>(null);
  const [laterDag, setLaterDag] = useState("");
  const [, ververs] = useState(0);
  useEffect(() => { setAvond(new Date().getHours() >= 18); setSinds(sindsLaatsteBezoek()); }, []);
  useEffect(() => { const timer = window.setInterval(() => ververs((n) => n + 1), 30000); return () => window.clearInterval(timer); }, []);
  const herinner = (morgen: boolean) => {
    if (!laterId) return;
    const tijd = new Date();
    if (morgen) tijd.setDate(tijd.getDate() + 1);
    tijd.setHours(morgen ? 9 : 19, 0, 0, 0);
    if (tijd.getTime() <= Date.now()) tijd.setTime(Date.now() + 3600000);
    laterHerinneren(laterId, tijd.getTime()); setLaterId(null);
  };

  // Home 5.0: hooguit twee slimme suggesties; "Voor morgen" staat al in Komende dagen.
  const lijst = vk.slimSuggesties ? suggesties().slice(0, 1) : [];
  if (!lijst.length && !vk.weekVooruit && !sinds) return null;
  const morgen = morgenOverzicht();

  return (
    <section className="relative mt-7" aria-label="Vooruitblik">
      {sinds ? (
        <div className="mb-4 border-b border-border pb-3 text-xs text-ink-soft">
          <p className="font-semibold text-ink">Sinds je laatste bezoek</p>
          <ul className="mt-1 space-y-1">{sinds.regels.map((r) => <li key={r.id}><Link to={r.to} hash={r.hash} onClick={() => setSinds(null)} className="inline-flex min-h-11 items-center font-semibold text-brand">{r.tekst} →</Link></li>)}</ul>
          <div className="mt-1 flex gap-4">
            <button type="button" onClick={() => setSinds(null)} className="font-semibold text-ink-soft">Gezien</button>
          </div>
        </div>
      ) : null}

      {lijst.length ? (
        <>
          <h2 className="flex items-center gap-2 font-display text-lg font-bold"><Compass className="size-4 text-brand" strokeWidth={1.6} aria-hidden="true" /> Vooruitblik</h2>
          <ul className="mt-2 divide-y divide-border border-y border-border">
            {lijst.map((s) => (
              <li key={s.id} className="py-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{s.titel}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{s.tekst}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger aria-label="Meer opties" className="-mr-2 -mt-2 grid size-10 shrink-0 place-items-center rounded-full text-ink-soft"><MoreHorizontal className="size-4" /></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setWaarom(waarom === s.id ? null : s.id)}>Waarom zie ik dit?</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => { setLaterId(s.id); setLaterDag(""); }}>Later herinneren</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => nietMeerTonen(s.type)}>Dit soort niet meer tonen</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {waarom === s.id ? <p className="mt-2 rounded-md bg-muted px-3 py-2 text-[11px] leading-relaxed text-ink-soft">{s.waarom}</p> : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  {s.acties.slice(0, 1).map((a) => a.to ? (
                    <Link key={a.label} to={a.to} search={a.search as never} className="rounded-full border border-brand/40 px-3 py-1 text-xs font-semibold text-brand">{a.label}</Link>
                  ) : (
                    <button key={a.label} onClick={a.doe} className="rounded-full border border-brand/40 px-3 py-1 text-xs font-semibold text-brand">{a.label}</button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {vk.weekVooruit ? (
        <div className="mt-3">
          <button onClick={() => setWeek(!week)} aria-expanded={week} className="mt-1 text-xs font-semibold text-brand">{week ? "Deze week verbergen" : "Deze week bekijken →"}</button>
          {week ? (
            <div className="mt-2 space-y-3 border-l-2 border-border pl-3">
              {weekOverzicht().filter((d) => d.regels.length).map((d) => <DagBlok key={d.iso} titel={d.label} dag={d} />)}
              {nogTeRegelenDezeWeek() ? <p className="text-xs text-ink-soft">{nogTeRegelenDezeWeek()} {nogTeRegelenDezeWeek() === 1 ? "ding" : "dingen"} om deze week nog te regelen — zie hierboven.</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <Sheet open={laterId !== null} onOpenChange={(open) => { if (!open) setLaterId(null); }}>
        <SheetContent side="bottom" className="mx-auto max-w-lg">
          <SheetHeader><SheetTitle>Wanneer wil je dit weer zien?</SheetTitle><SheetDescription>Het punt komt dan terug, zolang het nog openstaat.</SheetDescription></SheetHeader>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => herinner(false)}>Vanavond</Button>
            <Button variant="outline" onClick={() => herinner(true)}>Morgen</Button>
          </div>
          <label className="mt-4 block text-sm font-semibold">Andere dag<input type="datetime-local" value={laterDag} onChange={(e) => setLaterDag(e.target.value)} className="mt-2 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm" /></label>
          <Button className="mt-3 w-full" disabled={!laterDag || !Number.isFinite(new Date(laterDag).getTime()) || new Date(laterDag).getTime() <= Date.now()} onClick={() => { if (!laterId) return; laterHerinneren(laterId, new Date(laterDag).getTime()); setLaterId(null); }}>Bewaren</Button>
        </SheetContent>
      </Sheet>
    </section>
  );
}

function DagBlok({ titel, dag }: { titel: string; dag: WeekDag }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">{titel}</p>
      <ul className="mt-1 space-y-1">
        {dag.regels.map((r, i) => (
          <li key={i}><Link to={r.naar} search={(r.dag ? { dag: r.dag } : undefined) as never} className="block text-sm"><span className="font-semibold">{r.tijd && r.tijd !== "Hele dag" ? `${uur(r.tijd)} · ` : ""}{r.tekst}</span>{r.sub ? <span className="block text-xs text-ink-soft">{r.sub}</span> : null}</Link></li>
        ))}
      </ul>
    </div>
  );
}
