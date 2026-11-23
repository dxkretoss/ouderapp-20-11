import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Compass, MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { laterHerinneren, morgenOverzicht, nietMeerTonen, nogTeRegelenDezeWeek, sindsLaatsteBezoek, suggesties, useSlimmeHulp, weekOverzicht } from "@/lib/slimme-hulp";
import { useTaken } from "@/lib/taken-store";
import { useKring } from "@/lib/kring-store";
import { useVoorkeuren } from "@/lib/voorkeuren-store";
import { useAudit } from "@/lib/audit-store";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { uur } from "@/lib/tijd-tekst";
import { Chevron, Pijl } from "@/components/Tekens";
/** "Even vooruitkijken" op Home: hooguit 3 suggesties, uitleg per suggestie, wegdrukken; plus Deze week / Morgen. */
export function Vooruitkijken() {
    const { t } = useTranslation();
    useSlimmeHulp();
    useTaken();
    useKring();
    useAudit();
    const vk = useVoorkeuren();
    const [waarom, setWaarom] = useState(null);
    const [week, setWeek] = useState(false);
    const [avond, setAvond] = useState(false);
    const [sinds, setSinds] = useState(null);
    const [laterId, setLaterId] = useState(null);
    const [laterDag, setLaterDag] = useState("");
    const [, ververs] = useState(0);
    useEffect(() => { setAvond(new Date().getHours() >= 18); setSinds(sindsLaatsteBezoek()); }, []);
    useEffect(() => { const timer = window.setInterval(() => ververs((n) => n + 1), 30000); return () => window.clearInterval(timer); }, []);
    const herinner = (morgen) => {
        if (!laterId)
            return;
        const tijd = new Date();
        if (morgen)
            tijd.setDate(tijd.getDate() + 1);
        tijd.setHours(morgen ? 9 : 19, 0, 0, 0);
        if (tijd.getTime() <= Date.now())
            tijd.setTime(Date.now() + 3600000);
        laterHerinneren(laterId, tijd.getTime());
        setLaterId(null);
    };
    // Home 5.0: hooguit twee slimme suggesties; "Voor morgen" staat al in Komende dagen.
    const lijst = vk.slimSuggesties ? suggesties().slice(0, 1) : [];
    if (!lijst.length && !vk.weekVooruit && !sinds)
        return null;
    const morgen = morgenOverzicht();
    return (<section className="relative mt-7" aria-label={t("components.Vooruitkijken.vooruitblik")}>
      {sinds ? (<div className="mb-4 border-b border-border pb-3 text-xs text-ink-soft">
          <p className="font-semibold text-ink">{t("components.Vooruitkijken.sinds")}</p>
          <ul className="mt-1 space-y-1">{sinds.regels.map((r) => <li key={r.id}><Link to={r.to} hash={r.hash} onClick={() => setSinds(null)} className="inline-flex min-h-11 items-center gap-1 font-semibold text-brand">{r.tekst}<Pijl className="size-4"/></Link></li>)}</ul>
          <div className="mt-1 flex gap-4">
            <button type="button" onClick={() => setSinds(null)} className="font-semibold text-ink-soft">{t("components.Vooruitkijken.gezien")}</button>
          </div>
        </div>) : null}

      {lijst.length ? (<>
          <h2 className="flex items-center gap-2 font-display text-lg font-bold"><Compass className="size-4 text-brand" strokeWidth={1.6} aria-hidden="true"/> {t("components.Vooruitkijken.vooruitblik")}</h2>
          <ul className="mt-2 divide-y divide-border border-y border-border">
            {lijst.map((s) => (<li key={s.id} className="py-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{s.titel}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{s.tekst}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger aria-label={t("components.Vooruitkijken.meerOpties")} className="-mr-2 -mt-2 grid size-10 shrink-0 place-items-center rounded-full text-ink-soft"><MoreHorizontal className="size-4"/></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setWaarom(waarom === s.id ? null : s.id)}>{t("components.Vooruitkijken.waarom")}</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => { setLaterId(s.id); setLaterDag(""); }}>{t("components.Vooruitkijken.later")}</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => nietMeerTonen(s.type)}>{t("components.Vooruitkijken.nietMeer")}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {waarom === s.id ? <p className="mt-2 rounded-md bg-muted px-3 py-2 text-[11px] leading-relaxed text-ink-soft">{s.waarom}</p> : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  {s.acties.slice(0, 1).map((a) => a.to ? (<Link key={a.label} to={a.to} search={a.search} className="rounded-full border border-brand/40 px-3 py-1 text-xs font-semibold text-brand">{a.label}</Link>) : (<button key={a.label} onClick={a.doe} className="rounded-full border border-brand/40 px-3 py-1 text-xs font-semibold text-brand">{a.label}</button>))}
                </div>
              </li>))}
          </ul>
        </>) : null}

      {vk.weekVooruit ? (<div className="mt-3">
          <button onClick={() => setWeek(!week)} aria-expanded={week} className="mt-1 inline-flex min-h-10 items-center gap-0.5 text-xs font-semibold text-brand">{week ? t("components.Vooruitkijken.weekVerbergen") : t("components.Vooruitkijken.weekBekijken")}<Chevron richting="omlaag" open={week} className="size-4"/></button>
          {week ? (<div className="mt-2 space-y-3 border-l-2 border-border pl-3">
              {weekOverzicht().filter((d) => d.regels.length).map((d) => <DagBlok key={d.iso} titel={d.label} dag={d}/>)}
              {nogTeRegelenDezeWeek() ? <p className="text-xs text-ink-soft">{t("components.Vooruitkijken.nogTeRegelen", { count: nogTeRegelenDezeWeek() })}</p> : null}
            </div>) : null}
        </div>) : null}
      <Sheet open={laterId !== null} onOpenChange={(open) => { if (!open)
        setLaterId(null); }}>
        <SheetContent side="bottom">
          <SheetHeader><SheetTitle>{t("components.Vooruitkijken.wanneer")}</SheetTitle><SheetDescription>{t("components.Vooruitkijken.komtTerug")}</SheetDescription></SheetHeader>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => herinner(false)}>{t("components.Vooruitkijken.vanavond")}</Button>
            <Button variant="outline" onClick={() => herinner(true)}>{t("common.morgen")}</Button>
          </div>
          <label className="mt-4 block text-sm font-semibold">{t("components.Vooruitkijken.andereDag")}<input type="datetime-local" value={laterDag} onChange={(e) => setLaterDag(e.target.value)} className="mt-2 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"/></label>
          <Button className="mt-3 w-full" disabled={!laterDag || !Number.isFinite(new Date(laterDag).getTime()) || new Date(laterDag).getTime() <= Date.now()} onClick={() => { if (!laterId)
        return; laterHerinneren(laterId, new Date(laterDag).getTime()); setLaterId(null); }}>{t("components.Vooruitkijken.bewaren")}</Button>
        </SheetContent>
      </Sheet>
    </section>);
}
function DagBlok({ titel, dag }) {
    return (<div>
      <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">{titel}</p>
      <ul className="mt-1 space-y-1">
        {dag.regels.map((r, i) => (<li key={i}><Link to={r.naar} search={(r.dag ? { dag: r.dag } : undefined)} className="block text-sm"><span className="font-semibold">{r.tijd && !/^(hele dag|all day)$/i.test(r.tijd) ? `${uur(r.tijd)} · ` : ""}{r.tekst}</span>{r.sub ? <span className="block text-xs text-ink-soft">{r.sub}</span> : null}</Link></li>))}
      </ul>
    </div>);
}
