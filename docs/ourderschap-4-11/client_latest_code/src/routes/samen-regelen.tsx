import { useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { Button } from "@/components/ui/button";
import { Badge, FilterBalk } from "@/components/ui-kit";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { z } from "zod";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { CalendarPlus, Moon, Repeat2, SlidersHorizontal, Wallet } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useZorg, stuurHerinnering } from "@/lib/zorg-store";
import { useAfspraken } from "@/lib/afspraken-store";
import { stuurBudgetHerinnering, useBudgetten } from "@/lib/budget-store";
import { useVakanties } from "@/lib/vakantie-store";
import { useStart } from "@/lib/start-store";
import { ContextToevoegen } from "@/components/ContextToevoegen";
import { afgerond, isOpen, statusTekst, verzamelVoorstellen, wachtOpJou, type OpenVoorstel } from "@/lib/openstaande-voorstellen";
import { magHerinnering } from "@/lib/herinneringen";
import { useVoorkeuren } from "@/lib/voorkeuren-store";
import { bevestig } from "@/lib/feedback";

export const Route = createFileRoute("/samen-regelen")({
  head: () => ({
    meta: [
      { title: "Samen regelen — Ouderschap & Co" },
      { name: "description", content: "Ruilen, voorstellen en praktische afspraken samen afstemmen." },
      { property: "og:title", content: "Samen regelen — Ouderschap & Co" },
      { property: "og:description", content: "Alles wat jullie samen willen afstemmen, op één plek." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: z.object({ voor: z.string().optional() }),
  component: SamenRegelen,
});

const icoon: Record<OpenVoorstel["bron"], string> = { zorg: "voorstel", afspraak: "afspraak", budget: "kosten", vakantie: "vakantie", kost: "kosten", aanwezigheid: "afspraak" };
const vandaagIso = () => new Date().toISOString().slice(0, 10);

function SamenRegelen() {
  const router = useRouter();
  const zorg = useZorg();
  const afspraken = useAfspraken();
  const budgetten = useBudgetten();
  const vakanties = useVakanties();
  const vk = useVoorkeuren();
  const st = useStart();
  const [keuzeOpen, setKeuzeOpen] = useState(false);
  const [informatie, setInformatie] = useState(false);
  const [filter, setFilter] = useState<"wacht" | "reactie" | "afgerond" | "alle">("wacht");
  const gaZorg = (type: "ruil" | "nachtje" | "regeling") => {
    if (st.eigen) { setInformatie(true); return; }
    router.navigate({ to: "/zorgregeling", search: { actie: type === "regeling" ? "regeling" : "wijziging", type, bron: "samen-regelen" } });
  };
  const nieuweAfspraak = () => {
    if (st.eigen) { setInformatie(true); return; }
    router.navigate({ to: "/afspraken", search: { nieuw: "afspraak", bron: "samen-regelen" } });
  };

  // Eén afgeleid overzicht over de bestaande bronnen; geen eigen opslag.
  const alle = st.eigen ? [] : verzamelVoorstellen({ zorg: zorg.voorstellen, afspraken, budgetten, vakanties }, vandaagIso());
  const opJou = wachtOpJou(alle);
  const mijn = alle.filter((v) => !v.aanJou);
  const mijnGefilterd = mijn.filter((v) =>
    filter === "alle" ? true
    : filter === "afgerond" ? !isOpen(v)
    : filter === "reactie" ? v.status === "tegenvoorstel-ontvangen" || v.status === "meer-tijd-gevraagd"
    : v.status === "wacht-op-reactie" || v.status === "reactiedatum-verstreken");

  const herinner = (v: OpenVoorstel) => {
    const ok = v.bron === "zorg" ? stuurHerinnering(v.bronId) : v.bron === "budget" ? stuurBudgetHerinnering(v.bronId, "Sanne") : false;
    if (ok) bevestig("Herinnering verstuurd. De ander kan reageren wanneer daar gelegenheid voor is.");
  };
  const herinneringMogelijk = (v: OpenVoorstel): boolean => {
    if (v.bron === "zorg") {
      const bron = zorg.voorstellen.find((x) => x.id === v.bronId);
      return !!bron && magHerinnering({ verstuurd: bron.herinneringen ?? [], reactieDatum: bron.reactieDatum, gepauzeerd: vk.herinneringenGepauzeerd }).mag;
    }
    if (v.bron === "budget") {
      const bron = budgetten.find((x) => x.id === v.bronId);
      return !!bron && magHerinnering({ verstuurd: bron.stappen.filter((s) => s.wat === "Herinnering verstuurd").map((s) => s.moment), reactieDatum: bron.reactieDatum, gepauzeerd: vk.herinneringenGepauzeerd }).mag;
    }
    return false;
  };

  const rij = (v: OpenVoorstel) => (
    <li key={v.sleutel} className="py-3">
      <Link to={v.naar as never} className="flex items-start gap-3">
        <AppIcon functie={icoon[v.bron]} maat="sm" vorm="kaal" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">{v.titel}</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">{v.omschrijving}</span>
          <span className="mt-1 block"><Badge toon={v.aanJou && isOpen(v) ? "actie" : "neutraal"}>{statusTekst[v.status]}</Badge></span>
          {v.reactieDatum && isOpen(v) ? (
            <span className="mt-1 block text-xs text-ink-soft">
              {v.status === "reactiedatum-verstreken"
                ? `De gewenste reactiedatum (${v.reactieDatum}) is voorbij. Er is nog geen reactie ontvangen — er is niets automatisch veranderd.`
                : `De andere ouder ontvangt graag uiterlijk ${v.reactieDatum} een reactie. Dit is een verzoek, geen harde grens.`}
            </span>
          ) : null}
        </span>
        <span aria-hidden className="text-ink-soft">→</span>
      </Link>
      {!v.aanJou && isOpen(v) ? (
        <span className="mt-1.5 flex flex-wrap items-center gap-3 pl-8">
          {herinneringMogelijk(v) ? <button onClick={() => herinner(v)} className="min-h-11 text-xs font-semibold text-brand">Herinnering sturen</button> : null}
          <Link to="/verhaal" className="min-h-11 text-xs font-semibold text-ink-soft">Even sparren met Co?</Link>
        </span>
      ) : null}
    </li>
  );

  const keuzes = [
    { titel: "Dag ruilen", uitleg: "Kies de zorgdag of dagen die je anders wilt verdelen.", icoon: Repeat2, functie: "wissel", onKies: () => gaZorg("ruil") },
    { titel: "Extra overnachting", uitleg: "Stel een extra overnachting op een gekozen datum voor.", icoon: Moon, functie: "slapen", onKies: () => gaZorg("nachtje") },
    { titel: "Zorgverdeling wijzigen", uitleg: "Doe een voorstel voor jullie bestaande vaste verdeling.", icoon: SlidersHorizontal, functie: "zorgregeling", onKies: () => gaZorg("regeling") },
  ];

  return <AppShell>
    <PageHeader titel="Samen regelen" subtitel="Alles wat jullie samen willen afstemmen, op één plek." actie={<ContextToevoegen titel="Wat wil je samen regelen?" acties={[...keuzes,
      { titel: "Nieuwe afspraak", uitleg: "Leg samen een praktische afspraak vast.", icoon: CalendarPlus, functie: "afspraak", onKies: nieuweAfspraak },
      { titel: "Budgetvoorstel", uitleg: "Stem een toekomstige uitgave af.", icoon: Wallet, functie: "kosten", onKies: () => router.navigate({ to: "/kosten", search: { budget: "nieuw" } }) },
    ]} />} />
    <section className="mt-5">
      <h2 className="font-display text-lg font-semibold">Iets regelen</h2>
      <div className="mt-2 divide-y divide-border border-y border-border">
        <Button variant="ghost" onClick={() => setKeuzeOpen(true)} className="h-auto min-h-16 w-full justify-start gap-3 whitespace-normal rounded-none px-0 py-3 text-left hover:bg-transparent"><AppIcon functie="voorstel" maat="sm" vorm="kaal" /><span className="min-w-0 flex-1"><span className="block font-semibold">Nieuw voorstel</span><span className="mt-1 block text-xs font-normal text-ink-soft">Een dag ruilen, extra overnachting of zorgverdeling wijzigen.</span></span><span aria-hidden>→</span></Button>
        <Button variant="ghost" onClick={nieuweAfspraak} className="h-auto min-h-16 w-full justify-start gap-3 whitespace-normal rounded-none px-0 py-3 text-left hover:bg-transparent"><AppIcon functie="afspraak" maat="sm" vorm="kaal" /><span className="min-w-0 flex-1"><span className="block font-semibold">Nieuwe afspraak</span><span className="mt-1 block text-xs font-normal text-ink-soft">Een praktische afspraak met de andere ouder vastleggen.</span></span><span aria-hidden>→</span></Button>
      </div>
    </section>
    <div className="hidden"><ContextToevoegen titel="Nieuw voorstel" acties={keuzes} open={keuzeOpen} onOpenChange={setKeuzeOpen} /></div>

    <section className="mt-6">
      <h2 className="font-display text-lg font-semibold">Wacht op jouw reactie</h2>
      {opJou.length ? <ul className="mt-2 divide-y divide-border border-y border-border">{opJou.map(rij)}</ul> : <p className="mt-2 text-sm text-ink-soft">Er wachten geen voorstellen op jouw reactie.</p>}
    </section>

    <section className="mt-6">
      <h2 className="font-display text-lg font-semibold">Mijn voorstellen</h2>
      <FilterBalk opties={[{ id: "wacht", label: "Wacht op reactie" }, { id: "reactie", label: "Reactie ontvangen" }, { id: "afgerond", label: "Afgerond" }, { id: "alle", label: "Alle" }] as const} waarde={filter} onChange={setFilter} />
      {mijnGefilterd.length ? <ul className="mt-2 divide-y divide-border border-y border-border">{mijnGefilterd.map(rij)}</ul> : (
        <p className="mt-2 text-sm text-ink-soft">{filter === "afgerond" ? "Er zijn nog geen afgeronde voorstellen." : filter === "reactie" ? "Er zijn geen nieuwe reacties op jouw voorstellen." : "Er wachten geen voorstellen op de andere ouder."}</p>
      )}
      <p className="mt-2 text-xs text-ink-soft">Geen reactie betekent nooit automatisch akkoord. Ingetrokken en afgewezen voorstellen blijven zichtbaar in de geschiedenis.</p>
    </section>

    <Sheet open={informatie} onOpenChange={setInformatie}><SheetContent side="bottom" className="left-1/2 w-full max-w-md -translate-x-1/2 rounded-t-2xl bg-background"><SheetHeader><SheetTitle>Samen afstemmen</SheetTitle><SheetDescription>Gezamenlijke voorstellen en afspraken zijn beschikbaar zodra de andere ouder echt gekoppeld is. Je eigen gezinsgegevens en verdeling blijven behouden.</SheetDescription></SheetHeader><Button variant="outline" className="mt-4" asChild><Link to="/zorgregeling">Bekijk je bestaande verdeling</Link></Button></SheetContent></Sheet>
  </AppShell>;
}
