import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import i18n, { taalLocale } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useStart } from "@/lib/start-store";
import { AppShell } from "@/components/AppShell";
import { MeerSectie } from "@/components/MeerLijst";
import { AppIcon } from "@/components/AppIcon";
import { Chevron } from "@/components/Tekens";
import { ProfielBeeld } from "@/components/ProfielBeeld";
import { AfmeldenRij } from "@/components/Afmelden";
import { leesEvaluaties, evaluatieNodig } from "@/lib/evaluatie-store";
export const Route = createFileRoute("/meer")({
    validateSearch: z.object({ hulp: z.boolean().optional() }),
    head: () => ({
        meta: [
            { title: i18n.t("routes.meer.meta.titel") },
            { name: "description", content: i18n.t("routes.meer.meta.beschrijving") },
            { property: "og:title", content: i18n.t("routes.meer.meta.titel") },
            { property: "og:description", content: i18n.t("routes.meer.meta.ogBeschrijving") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: Meer,
});
/** Menu-onderdeel; titel en tekst worden pas bij het lezen vertaald. */
const item = (to, icoon, id, tekstId = id) => ({
    to,
    icoon,
    get titel() { return i18n.t(`routes.meer.items.${id}.titel`); },
    get tekst() { return i18n.t(`routes.meer.items.${tekstId}.tekst`); },
});
const dagelijks = [
    item("/agenda", "agenda", "agenda"),
    item("/taken", "taken", "taken"),
    item("/spullen", "doos", "spullen"),
    item("/momentjes", "momentjes", "momentjes"),
];
const gezin = [
    item("/kinderen", "kinderen", "kinderen"),
    item("/verbonden-personen", "link", "verbondenPersonen"),
    item("/documenten", "documenten", "documenten"),
];
const voorJeKind = [
    item("/kind-tips", "kindtips", "kindTips"),
    item("/verhaal", "co", "co"),
];
const samenOuders = [
    item("/extra-ondersteuning", "rust", "extraHoudvast"),
    item("/evaluatie", "geschiedenis", "evaluatie"),
    item("/ondersteuning", "ondersteuning", "begeleiding"),
];
const ondersteuning = [...voorJeKind, ...samenOuders];
const account = [
    item("/instellingen", "instellingen", "instellingen"),
    item("/meer?hulp=true", "hulp", "hulp"),
    item("/juridische-hulp", "juridisch", "voorwaarden"),
];
/** Shortcut defaults keep their original order and destinations, whatever the category order is. */
const snelStandaard = [
    dagelijks[1], // Taken
    item("/boodschappen", "boodschappen", "nogNodig", "nogNodigStandaard"),
    dagelijks[2], // Spullen
    dagelijks[3], // Momentjes
    gezin[2], // Documenten
    item("/kind-tips", "kindtips", "kindTips", "kindTipsKort"),
].filter((v) => Boolean(v));
/** Extra zoekwoorden per onderdeel, zodat synoniemen ook raken (Nederlands én Engels, zodat zoeken in beide talen werkt). */
const zoekwoorden = {
    "/kinderen": "kind profiel school gezondheid noodkaart child children profile health emergency card",
    "/verbonden-personen": "verbonden personen ouder koppelen ontkoppelen uitnodiging kring opa oma oppas verzorger connected people parent link disconnect invitation circle grandparent babysitter carer",
    "/taken": "taak regelen wie task tasks to-do who",
    "/boodschappen": "nodig lijstje kopen boodschap needed list buy shopping",
    "/spullen": "mee overdracht spul belongings things handover packing",
    "/momentjes": "foto moment leuk photo moments",
    "/documenten": "document paspoort papieren documents passport papers",
    "/agenda": "regeling verdeling week schema vakantie feestdagen bijzondere dagen calendar schedule arrangement holiday holidays special days",
    "/activiteiten": "ruilen voorstel afspreken reacties herinneringen swap proposal agree reactions reminders",
    "/planning": "vakantie feestdagen bijzondere dagen holiday holidays bank holidays special days",
    "/ondersteuning": "begeleiding professional hulpverlener support counsellor guidance",
    "/extra-ondersteuning": "extra houvast extra hulp afspraken beslissingen terugkijken overzicht extra support help agreements decisions look back overview",
    "/juridische-hulp": "juridisch privacy voorwaarden gezag legal terms conditions parental authority",
    "/instellingen": "instellingen profiel meldingen privacy toegang account settings profile notifications access",
    "/rondleiding": "rondleiding uitleg start tour explanation",
    "/welkom": "hulp contact opnieuw beginnen introductie help start again introduction",
    "/meer?hulp=true": "hulp rondleiding uitleg contact opnieuw beginnen introductie help tour explanation start again introduction",
};
// Recent gebruikt: alleen op dit apparaat, per gebruiker (localStorage).
const RECENT_SLEUTEL = "onzeapp-meer-recent";
function leesRecent() {
    try {
        const r = JSON.parse(localStorage.getItem(RECENT_SLEUTEL) ?? "[]");
        return Array.isArray(r) ? r.filter((x) => typeof x?.to === "string") : [];
    }
    catch {
        return [];
    }
}
export function registreerMeerBezoek(to) {
    try {
        const rest = leesRecent().filter((x) => x.to !== to);
        localStorage.setItem(RECENT_SLEUTEL, JSON.stringify([{ to, at: Date.now() }, ...rest].slice(0, 6)));
    }
    catch {
        /* opslag niet beschikbaar: geen recent-lijst */
    }
}
const SCROLL_SLEUTEL = "onzeapp-meer-scroll";
function Meer() {
    const { t } = useTranslation();
    const zoekRoute = Route.useSearch();
    const [hulpOpen, setHulpOpen] = useState(!!zoekRoute.hulp);
    const [personenOpen, setPersonenOpen] = useState(false);
    const [introBevestigen, setIntroBevestigen] = useState(false);
    useEffect(() => { if (zoekRoute.hulp)
        setHulpOpen(true); }, [zoekRoute.hulp]);
    // Eigen gezin: voorbeeldvoorstellen tellen niet mee.
    const startState = useStart();
    const eigen = startState.eigen;
    // Geen voorbeeldtellingen: een aangemeld account is altijd het eigen gezin.
    const aantallen = {};
    const profielen = startState.kinderen;
    const gezinItems = gezin.map((i) => i.to === "/kinderen" && profielen.length === 1 ? { ...i, titel: t("routes.meer.kind") } : i);
    const alle = [...dagelijks, ...gezinItems, ...ondersteuning, ...account];
    const [zoek, setZoek] = useState("");
    const [evaluatieTekst, setEvaluatieTekst] = useState(() => t("routes.meer.items.evaluatie.tekst"));
    useEffect(() => {
        const l = leesEvaluaties();
        if (!l.length) {
            setEvaluatieTekst(t("routes.meer.items.evaluatie.tekst"));
            return;
        }
        if (evaluatieNodig(l)) {
            setEvaluatieTekst(t("routes.meer.evaluatieKlaar"));
            return;
        }
        const volgende = new Date(new Date(l[0].datum).getTime() + 182 * 864e5);
        setEvaluatieTekst(t("routes.meer.evaluatieVolgende", { datum: volgende.toLocaleDateString(taalLocale(), { month: "long", year: "numeric" }) }));
    }, []);
    const [recent, setRecent] = useState([]);
    useEffect(() => setRecent(leesRecent().filter((r) => r.to !== "/samen-regelen").map((r) => r.to === "/zorgregeling" || r.to === "/planning" ? { ...r, to: "/agenda" } : r.to === "/rondleiding" || r.to === "/welkom" ? { ...r, to: "/meer?hulp=true" } : r)), []);
    // Scrollpositie bewaren bij terugkeer naar Meer.
    const hersteld = useRef(false);
    useEffect(() => {
        if (hersteld.current)
            return;
        hersteld.current = true;
        const y = Number(sessionStorage.getItem(SCROLL_SLEUTEL) ?? 0);
        if (y > 0)
            window.scrollTo(0, y);
        const bewaar = () => sessionStorage.setItem(SCROLL_SLEUTEL, String(window.scrollY));
        window.addEventListener("scroll", bewaar, { passive: true });
        return () => window.removeEventListener("scroll", bewaar);
    }, []);
    const q = zoek.trim().toLowerCase();
    const resultaten = q
        ? alle.filter((i) => `${i.titel} ${i.tekst} ${zoekwoorden[i.to] ?? ""}`.toLowerCase().includes(q))
        : [];
    // Snel naar: vast de zes dingen die ouders het vaakst nodig hebben (Agenda, Berichten en Kosten staan al in de onderbalk).
    const metAantal = (i) => ({ ...i, aantal: aantallen[i.to] ?? 0 });
    const acties = alle.filter((i) => (aantallen[i.to] ?? 0) > 0).sort((x, y) => (aantallen[y.to] ?? 0) - (aantallen[x.to] ?? 0));
    const snel = [
        { to: "/taken", icoon: "taken", titel: t("routes.meer.items.taken.titel"), tekst: t("routes.meer.snel.taken") },
        { to: "/overdracht", icoon: "overdracht", titel: t("routes.meer.snel.overdrachtTitel"), tekst: t("routes.meer.snel.overdracht") },
        { to: "/boodschappen", icoon: "boodschappen", titel: t("routes.meer.items.nogNodig.titel"), tekst: t("routes.meer.snel.nogNodig") },
        { to: "/spullen", icoon: "doos", titel: t("routes.meer.items.spullen.titel"), tekst: t("routes.meer.snel.spullen") },
        { to: "/verhaal", icoon: "co", titel: t("routes.meer.items.co.titel"), tekst: t("routes.meer.items.co.tekst") },
        { to: "/kind-tips", icoon: "kindtips", titel: t("routes.meer.items.kindTips.titel"), tekst: t("routes.meer.snel.kindTips") },
    ].map(metAantal);
    const overigeActies = acties.filter((i) => i.to !== "/agenda" && i.to !== "/kinderen" && !snel.some((x) => x.to === i.to));
    const gebruikersnaam = startState.naam.trim() || t("common.jij");
    const initiaal = gebruikersnaam.charAt(0).toUpperCase();
    return (<AppShell>
      <div className="flex items-center gap-3">
        <h1 className="lora min-w-0 flex-1 text-[32px] leading-tight">{t("routes.meer.titel")}</h1>
        <Link to="/instellingen" aria-label={t("routes.meer.profielVan", { naam: gebruikersnaam })} onClick={() => registreerMeerBezoek("/instellingen")} className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-soft font-display text-base font-bold text-brand transition-transform active:scale-95">
          {startState.eigen && startState.beeld ? <ProfielBeeld beeld={startState.beeld} naam={gebruikersnaam} maat={44}/> : initiaal}
        </Link>
      </div>

      <label className="mt-4 flex h-11 items-center gap-2 rounded-full border border-[#E6DED2] bg-white px-4"><AppIcon functie="zoeken" maat="sm" vorm="kaal"/><input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder={t("routes.meer.zoek")} aria-label={t("routes.meer.zoek")} className="min-w-0 flex-1 bg-transparent text-[15px] outline-none"/></label>

      {q ? null : <>
      {/* Snel naar: zes ronde pictogrammen */}
      <section className="mt-4" aria-label={t("routes.meer.snelNaar")}>
        <h2 className="px-1 text-[13px] font-black uppercase tracking-[0.08em] text-ink-soft">{t("routes.meer.snelNaar")}</h2>
        <div className="mt-2 grid grid-cols-3 gap-x-2 gap-y-3 rounded-[22px] border border-white/85 bg-white/60 px-2 py-3.5">
          {snel.map((item) => (<Link key={item.to} to={item.to} onClick={() => registreerMeerBezoek(item.to)} className="group flex flex-col items-center gap-2 rounded-2xl py-1 transition-transform active:scale-95">
              <span className="relative transition-transform group-hover:scale-105">
                <AppIcon functie={item.icoon} maat="lg"/>
                {item.aantal ? <span aria-hidden="true" className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-brand text-[11px] font-black text-primary-foreground">{item.aantal}</span> : null}
              </span>
              <span className="text-center text-[12.5px] font-extrabold leading-tight text-ink">{item.to === "/kind-tips" ? t("routes.meer.snel.kindTipsKort") : item.titel}</span>
              {item.aantal ? <span className="sr-only">{t("routes.meer.wachtOpJou", { n: item.aantal })}</span> : null}
            </Link>))}
        </div>
        {overigeActies.length > 0 ? (<p className="mt-4 text-center text-xs text-ink-soft">
            {t("routes.meer.nogWachten", { count: overigeActies.length })}{overigeActies.map((i, n) => (<span key={i.to}>{n > 0 ? ", " : ""}<Link to={i.to} onClick={() => registreerMeerBezoek(i.to)} className="font-semibold text-brand underline-offset-2 hover:underline">{i.titel}</Link></span>))}
          </p>) : null}
      </section>
      </>}

      {/* Alle overige onderdelen */}
      <section className="mt-2">
        {q ? <><MeerSectie titel={t("routes.meer.gevonden")} klein compact onBezoek={registreerMeerBezoek} items={resultaten.map(metAantal)}/>{!resultaten.length ? <p className="mt-2 text-sm text-ink-soft">{t("routes.meer.nietsGevonden")}</p> : null}{/persoon|contact|familie|verzorger|person|people|family|carer/.test(q) ? <Button variant="link" className="min-h-11 px-0" onClick={() => setPersonenOpen(true)}>{t("routes.meer.personenBekijken")}</Button> : null}</> : <>
          <MeerSectie titel={t("routes.meer.sectie.dagelijks")} klein compact onBezoek={registreerMeerBezoek} items={dagelijks.map(metAantal)}/>
          <MeerSectie titel={t("routes.meer.sectie.gezin")} klein compact onBezoek={registreerMeerBezoek} items={[...gezinItems.map(metAantal), { to: "#personen", icoon: "contact", titel: t("routes.meer.personen.titel"), tekst: t("routes.meer.personen.tekst"), onKies: () => setPersonenOpen(true) }]}/>
          {[{ id: "voorJeKind", titel: t("routes.meer.sectie.voorJeKind"), items: voorJeKind }, { id: "samenOuders", titel: t("routes.meer.sectie.samenOuders"), items: samenOuders.map((i) => i.to === "/evaluatie" ? { ...i, tekst: evaluatieTekst } : i) }, { id: "account", titel: t("routes.meer.sectie.account"), items: account }].map((c) => <MeerSectie key={c.id} titel={c.titel} klein compact onBezoek={registreerMeerBezoek} items={c.items.map(metAantal)}/>)}
        </>}
      </section>
      <AfmeldenRij className="mt-6"/>
      <Sheet open={personenOpen} onOpenChange={setPersonenOpen}><SheetContent side="bottom" className="left-1/2 max-h-[90vh] w-full max-w-md -translate-x-1/2 overflow-y-auto rounded-t-2xl bg-background px-5 pb-8"><SheetHeader className="pr-8 text-left"><SheetTitle>{t("routes.meer.personen.titel")}</SheetTitle><SheetDescription>{t("routes.meer.personen.uitleg")}</SheetDescription></SheetHeader><div className="mt-3 divide-y divide-border">{profielen.map((k) => <Button asChild key={k.id} variant="ghost" className="min-h-11 w-full justify-between"><Link to={eigen ? "/kinderen/$kindId" : "/kring/$kindId"} params={{ kindId: k.id }}>{k.naam}<Chevron className="size-4 text-ink-soft"/></Link></Button>)}</div></SheetContent></Sheet>
      <Sheet open={hulpOpen} onOpenChange={(o) => { setHulpOpen(o); setIntroBevestigen(false); }}>
        <SheetContent side="bottom" className="left-1/2 max-h-[90vh] w-full max-w-md -translate-x-1/2 overflow-y-auto rounded-t-[28px] bg-background px-5 pb-8">
          <SheetHeader className="pr-10 text-left">
            <SheetTitle className="lora text-[28px] font-normal leading-tight">{t("routes.meer.items.hulp.titel")}</SheetTitle>
            <SheetDescription className="text-[15px] text-ink-soft">{t("routes.meer.hulp.uitleg")}</SheetDescription>
          </SheetHeader>
          <Link to="/rondleiding" className="mt-4 flex items-center gap-3 rounded-[22px] border-2 border-[#A9BCA8] px-4 py-3.5 [background:linear-gradient(135deg,rgba(220,230,210,.95),rgba(233,239,227,.9))]">
            <AppIcon functie="hulp"/>
            <span className="min-w-0 flex-1"><span className="block text-[16px] font-black text-[#2F4A3A]">{t("routes.meer.hulp.rondleiding")}</span><span className="block text-[13.5px] leading-snug text-[#3F5747]">{t("routes.meer.hulp.rondleidingUitleg")}</span></span>
            <Chevron className="size-4 text-[#3F5747]"/>
          </Link>
          <p className="mt-5 px-1 text-[13px] font-black uppercase tracking-[0.08em] text-ink-soft">{t("routes.meer.hulp.faq")}</p>
          <div className="mt-2 divide-y divide-[#E9E1D5] rounded-[22px] border border-white/85 bg-white/60 px-4">
            {[
            [t("routes.meer.hulp.vraag1.v"), t("routes.meer.hulp.vraag1.a")],
            [t("routes.meer.hulp.vraag2.v"), t("routes.meer.hulp.vraag2.a")],
        ].map(([v, a]) => (<details key={v} className="group py-3">
                <summary className="flex cursor-pointer list-none items-start gap-2 text-[15px] font-black"><span className="flex-1">{v}</span><Chevron className="mt-0.5 size-4 text-ink-soft group-open:rotate-90"/></summary>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{a}</p>
              </details>))}
          </div>
          <p className="mt-5 px-1 text-[13px] font-black uppercase tracking-[0.08em] text-ink-soft">{t("routes.meer.hulp.verder")}</p>
          <nav className="mt-2 divide-y divide-[#E9E1D5] rounded-[22px] border border-white/85 bg-white/60 px-3.5">
            {[
            ["/ondersteuning", "ondersteuning", t("routes.meer.items.begeleiding.titel"), t("routes.meer.hulp.begeleiding")],
            ["/juridische-hulp", "juridisch", t("routes.meer.hulp.juridischTitel"), t("routes.meer.hulp.juridisch")],
        ].map(([to, icoon, titel, tekst]) => (<Link key={to} to={to} className="flex min-h-14 items-center gap-3 py-2.5">
                <AppIcon functie={icoon} maat="sm"/>
                <span className="min-w-0 flex-1"><span className="block text-[15px] font-black">{titel}</span><span className="block text-[13px] text-ink-soft">{tekst}</span></span>
                <Chevron className="size-4 text-ink-soft"/>
              </Link>))}
          </nav>
          {introBevestigen ? (<div className="mt-4 rounded-[22px] border border-white/85 bg-white/60 p-4">
              <p className="text-[15px] font-black">{t("routes.meer.hulp.introVraag")}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">{t("routes.meer.hulp.introUitleg")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => setIntroBevestigen(false)} className="h-11 rounded-full border border-[#C9D6C3] bg-white px-4 text-sm font-black">{t("common.terug")}</button>
                <Link to="/welkom" className="inline-flex h-11 items-center rounded-full bg-brand px-4 text-sm font-black text-primary-foreground">{t("routes.meer.hulp.introOpen")}</Link>
              </div>
            </div>) : (<button onClick={() => setIntroBevestigen(true)} className="mx-auto mt-4 block min-h-10 text-sm font-extrabold text-brand">{t("routes.meer.hulp.introKnop")}</button>)}
        </SheetContent>
      </Sheet>
    </AppShell>);
}
