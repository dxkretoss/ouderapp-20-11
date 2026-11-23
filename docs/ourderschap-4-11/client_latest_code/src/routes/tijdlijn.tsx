import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FilterBalk } from "@/components/ui-kit";
import { AppShell, Card, PageHeader } from "@/components/AppShell";
import { AppIcon } from "@/components/AppIcon";
import { eventKop, useAudit, type AuditEvent } from "@/lib/audit-store";
import { geschiedenisDatum as nlDatum, useAfspraken } from "@/lib/afspraken-store";
import { magAudit } from "@/lib/export-rechten";

export const Route = createFileRoute("/tijdlijn")({
  head: () => ({
    meta: [
      { title: "Tijdlijn — Ouderschap & Co" },
      { name: "description", content: "Een feitelijk, chronologisch overzicht van wat er in de app is veranderd." },
      { property: "og:title", content: "Tijdlijn — Ouderschap & Co" },
      { property: "og:description", content: "Wat er is veranderd, op volgorde, neutraal en overzichtelijk." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Tijdlijn,
});

/**
 * Alleen een WEERGAVE: leest de bestaande wijzigingsgeschiedenis (audit) en de geschiedenis van Onze afspraken.
 * Maakt zelf geen gebeurtenissen. Exportlog is accountbeveiliging en staat hier niet in.
 */
type Regel = { key: string; wanneer: Date; heeftTijd: boolean; cat: string; icoon: string; kop: string; titel: string; detail?: string | undefined };

const auditCat: Record<string, [string, string] | undefined> = {
  afspraak: ["Agenda", "agenda"], schema: ["Verdeling", "zorgregeling"], besluit: ["Beslissing", "beslissing"],
  kosten: ["Kosten", "kosten"], taak: ["Taak", "taken"], spul: ["Spul", "doos"],
};
const ouder = { type: "ouder", id: "sanne" } as const;
function vanAudit(g: AuditEvent): Regel | null {
  const c = g.soort === "dossier" ? (g.itemId.startsWith("gezondheid-") ? ["Gezondheid", "medisch"] as [string, string] : undefined) : auditCat[g.soort];
  if (!c || !magAudit(ouder, g.soort)) return null;
  const w = g.wijzigingen[0];
  return { key: g.eventId, wanneer: new Date(g.moment), heeftTijd: true, cat: c[0], icoon: c[1], kop: eventKop(g), titel: g.itemNaam, detail: w && g.wijzigingen.length === 1 ? `${w.oud} → ${w.nieuw}` : undefined };
}

function Tijdlijn() {
  const audit = useAudit();
  const afspraken = useAfspraken();
  const regels: Regel[] = [
    ...audit.map(vanAudit).filter((r): r is Regel => !!r),
    ...afspraken.flatMap((a) => a.geschiedenis.map((g, n) => {
      const d = nlDatum(g.datum);
      return d ? { key: `${a.id}-${n}-${g.datum}`, wanneer: d, heeftTijd: false, cat: "Afspraken", icoon: "afspraak", kop: g.tekst, titel: a.titel } : null;
    }).filter((r): r is Regel => !!r)),
  ].sort((a, b) => b.wanneer.getTime() - a.wanneer.getTime());
  const cats = ["Alles", ...["Afspraken", "Agenda", "Verdeling", "Beslissing", "Kosten", "Taak", "Spul", "Gezondheid"].filter((c) => regels.some((r) => r.cat === c))];
  const [cat, setCat] = useState("Alles");
  const zicht = regels.filter((r) => cat === "Alles" || r.cat === cat);
  return (
    <AppShell>
      <PageHeader titel="Tijdlijn" subtitel="Feitelijk overzicht van wat er is veranderd." />
      <FilterBalk className="mt-5" opties={cats} waarde={cat} onChange={setCat} />
      <ol className="mt-4 space-y-3 border-l-2 border-brand-soft pl-4">
        {zicht.map((r) => (
          <li key={r.key}>
            <Card className="flex items-center gap-3">
              <AppIcon functie={r.icoon} maat="md" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{r.titel}</p>
                <p className="text-xs">{r.kop}{r.detail ? ` · ${r.detail}` : ""}</p>
                <p className="text-xs text-ink-soft">
                  {r.wanneer.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}
                  {r.heeftTijd ? ` · ${r.wanneer.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })} uur` : ""} · {r.cat}
                </p>
              </div>
            </Card>
          </li>
        ))}
        {zicht.length === 0 && <p className="text-sm text-ink-soft">Nog niets vastgelegd.</p>}
      </ol>
    </AppShell>
  );
}
