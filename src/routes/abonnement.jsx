import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import i18n, { taalLocale } from "@/i18n";
import { Check } from "lucide-react";
import { AppShell, BackButton } from "@/components/AppShell";
import { AppIcon } from "@/components/AppIcon";
import { Chevron } from "@/components/Tekens";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { abonnementen, bewaarPlan, euro, inbegrepen, useAbonnement, voordelen, zetAbonnement } from "@/lib/abonnement";
export const Route = createFileRoute("/abonnement")({
    head: () => ({
        meta: [
            { title: i18n.t("routes.abonnement.meta.titel") },
            { name: "description", content: i18n.t("routes.abonnement.meta.beschrijving") },
            { property: "og:title", content: i18n.t("routes.abonnement.meta.titel") },
            { property: "og:description", content: i18n.t("routes.abonnement.meta.ogBeschrijving") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: AbonnementPagina,
});
const datum = (s) => new Date(s).toLocaleDateString(taalLocale(), { day: "numeric", month: "long", year: "numeric" });
function AbonnementPagina() {
    const { t } = useTranslation();
    const ab = useAbonnement();
    const plan = abonnementen.find((a) => a.id === ab.planId) ?? abonnementen[0];
    const [beheren, setBeheren] = useState(false);
    const [stap, setStap] = useState("");
    const sluit = () => setStap("");
    const [keuze, setKeuze] = useState("jaar");
    const [uitleg, setUitleg] = useState(null);
    const [allesZien, setAllesZien] = useState(false);
    const kopen = ab.status !== "actief";
    const gekozen = abonnementen.find((a) => a.id === keuze) ?? plan;
    const perMaand = (a) => euro(a.periode === "jaar" ? Math.round(a.prijsCent / 12) : a.prijsCent);
    const winkel = "App Store";
    const periodeTekst = (p) => t(`routes.abonnement.periode.${p}`);
    const lijst = inbegrepen();
    return (<AppShell>
      <div className="flex items-center gap-3">
        <BackButton terug="/instellingen"/>
        <h1 className="lora min-w-0 flex-1 text-[32px] leading-tight">{t("routes.abonnement.titel")}</h1>
      </div>

      {kopen ? (<>
          <p className="lora mt-4 text-[26px] leading-tight text-[#2F4A3A]">{ab.status === "proef" ? t("routes.abonnement.kopen.kopProef") : t("routes.abonnement.kopen.kopTerug")}</p>
          <p className="mt-1.5 text-[15px] leading-snug text-ink-soft">
            {ab.status === "proef" ? t("routes.abonnement.kopen.introProef")
                : ab.status === "bewaren" ? t("routes.abonnement.kopen.introBewaren")
                    : ab.status === "opgezegd" ? t("routes.abonnement.kopen.introOpgezegd", { datum: datum(ab.verlengdatum) })
                        : t("routes.abonnement.kopen.introVerwijder")}
          </p>

          <ul className="mt-4 grid grid-cols-2 gap-2">
            {voordelen.map((v) => (<li key={v.id} className="rounded-[18px] border border-white/85 bg-white/60 p-3">
                <AppIcon functie={v.functie} maat="md"/>
                <p className="mt-2 text-[14.5px] font-black leading-tight">{v.titel}</p>
                <p className="mt-0.5 text-xs leading-snug text-ink-soft">{v.tekst}</p>
              </li>))}
          </ul>

          <div className="mt-3 flex items-center gap-3 rounded-[18px] border border-[#C9D6C3] bg-[#E9EFE3] px-3.5 py-3">
            <span className="flex shrink-0"><span className="grid size-8 place-items-center rounded-full border-2 border-white bg-brand text-sm font-black text-primary-foreground">S</span><span className="-ml-2 grid size-8 place-items-center rounded-full border-2 border-white bg-[#6F7F68] text-sm font-black text-white">J</span></span>
            <p className="text-[13.5px] leading-snug text-[#2F4A3A]"><Trans i18nKey="routes.abonnement.kopen.eenGezin" components={{ b: <b/> }}/></p>
          </div>

          <div className="mt-4 space-y-2" role="radiogroup" aria-label={t("routes.abonnement.kopen.kiesLabel")}>
            {[...abonnementen].sort((x) => (x.periode === "jaar" ? -1 : 1)).map((a) => {
                const aan = keuze === a.id;
                return (<button key={a.id} role="radio" aria-checked={aan} onClick={() => setKeuze(a.id)} className={`relative flex w-full items-center gap-3 rounded-[20px] px-4 py-3.5 text-left ${aan ? "border-2 border-brand bg-white" : "border border-white/85 bg-white/60"}`}>
                  <span className={`grid size-5 shrink-0 place-items-center rounded-full border-2 ${aan ? "border-brand" : "border-[#A9A097]"}`}>{aan ? <span className="size-2.5 rounded-full bg-brand"/> : null}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15.5px] font-black">{a.naam}</span>
                    <span className="block text-xs text-ink-soft">{a.periode === "jaar" ? t("routes.abonnement.prijs.jaar", { jaar: euro(a.prijsCent), maand: perMaand(a) }) : t("routes.abonnement.prijs.maand", { maand: euro(a.prijsCent) })}</span>
                  </span>
                  {a.periode === "jaar" ? <span className="shrink-0 rounded-full bg-brand px-2.5 py-1 text-[11.5px] font-black text-primary-foreground">{t("routes.abonnement.kopen.voordeligst")}</span> : null}
                </button>);
            })}
          </div>

          <button onClick={() => { if (ab.status === "proef")
            setUitleg(t("routes.abonnement.kopen.betalingStraks", { winkel }));
        else
            zetAbonnement({ status: "actief", planId: keuze }); }} className="mt-4 h-[54px] w-full rounded-full bg-brand text-base font-black text-primary-foreground shadow-[0_6px_18px_rgba(63,87,71,.25)]">
            {ab.status === "proef" ? t("routes.abonnement.kopen.probeer", { dagen: gekozen.proefDagen }) : t("routes.abonnement.kopen.hervatten")}
          </button>
          <p className="mt-2 text-center text-xs leading-snug text-ink-soft">{ab.status === "proef" ? t("routes.abonnement.kopen.daarna", { prijs: euro(gekozen.prijsCent), periode: periodeTekst(gekozen.periode) }) : ""}{t("routes.abonnement.opzeggenAltijd", { winkel })}</p>
          {uitleg ? <p role="status" className="mt-3 rounded-[16px] bg-white/70 px-3.5 py-2.5 text-center text-sm">{uitleg}</p> : null}
          <div className="mt-3 flex justify-center gap-5 text-xs font-extrabold text-[#3F5747]">
            <button onClick={() => setUitleg(t("routes.abonnement.herstellenUitleg", { winkel }))}>{t("routes.abonnement.herstellen")}</button>
            <Link to="/juridisch">{t("routes.abonnement.voorwaarden")}</Link>
          </div>
          {ab.status === "proef" ? <button onClick={() => zetAbonnement({ status: "actief" })} className="mx-auto mt-6 block text-[11px] text-ink-soft underline">{t("routes.abonnement.kopen.voorbeeldActief")}</button> : null}
        </>) : (<>
          <section className="mt-4 rounded-[22px] border-2 border-[#A9BCA8] p-4 [background:linear-gradient(135deg,rgba(220,230,210,.95),rgba(233,239,227,.9))]">
            <p className="flex items-center gap-2"><span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-black text-primary-foreground">{t("routes.abonnement.actief.badge")}</span><span className="text-[13px] text-ink-soft">{plan.naam}</span></p>
            <p className="mt-2 text-[26px] font-black leading-none">{euro(plan.prijsCent)} <span className="text-[15px] font-bold text-ink-soft">{t("routes.abonnement.actief.perPeriode", { periode: periodeTekst(plan.periode) })}</span></p>
            <p className="mt-1.5 text-sm">{t("routes.abonnement.actief.verlengt", { datum: datum(ab.verlengdatum) })}</p>
            <p className="mt-1 text-[13px] text-ink-soft">{t("routes.abonnement.actief.betaaldVia", { winkel })}</p>
          </section>
          <div className="mt-2.5 flex items-center gap-3 rounded-[22px] border border-white/85 bg-white/60 px-4 py-3">
            <span className="flex shrink-0"><span className="grid size-8 place-items-center rounded-full border-2 border-white bg-brand text-sm font-black text-primary-foreground">S</span><span className="-ml-2 grid size-8 place-items-center rounded-full border-2 border-white bg-[#6F7F68] text-sm font-black text-white">J</span></span>
            <span><span className="block text-[15px] font-black">{t("routes.abonnement.actief.jijBetaalt")}</span><span className="block text-xs text-ink-soft">{t("routes.abonnement.actief.jorisGebruikt")}</span></span>
          </div>
          <button onClick={() => setBeheren((b) => !b)} aria-expanded={beheren} className="mt-4 h-12 w-full rounded-full bg-brand text-[15px] font-black text-primary-foreground">{t("routes.abonnement.actief.beheren", { winkel })}</button>
          {beheren ? (<div className="mt-3 space-y-2">
              <p className="rounded-[16px] bg-white/70 px-3.5 py-2.5 text-center text-sm">{t("routes.abonnement.actief.beherenUitleg", { winkel })}</p>
              {abonnementen.map((a) => (<button key={a.id} onClick={() => zetAbonnement({ planId: a.id, status: "actief" })} className={`flex w-full items-center justify-between rounded-[18px] p-3 text-left text-sm ${ab.planId === a.id ? "border-2 border-brand bg-white" : "border border-white/85 bg-white/60"}`}>
                  <span className="font-black">{a.naam}</span><span className="font-bold">{euro(a.prijsCent)} / {periodeTekst(a.periode)}</span>
                </button>))}
            </div>) : null}
          <button onClick={() => setUitleg(t("routes.abonnement.herstellenUitleg", { winkel }))} className="mx-auto mt-2.5 block text-sm font-extrabold text-[#3F5747]">{t("routes.abonnement.herstellen")}</button>
          {uitleg ? <p role="status" className="mt-2 rounded-[16px] bg-white/70 px-3.5 py-2.5 text-center text-sm">{uitleg}</p> : null}
          <p className="mt-3 px-2 text-center text-xs leading-snug text-ink-soft">{t("routes.abonnement.actief.opzeggenUitleg", { winkel })}</p>

          <h2 className="mt-6 px-1 text-[13px] font-black uppercase tracking-[0.08em] text-ink-soft">{t("routes.abonnement.actief.watZitErin")}</h2>
          <ul className="mt-2 divide-y divide-[#E9E1D5] rounded-[22px] border border-white/85 bg-white/60 px-4">
            {(allesZien ? lijst : lijst.slice(0, 4)).map((i) => <li key={i} className="flex items-center gap-2.5 py-2.5 text-[14.5px]"><Check className="size-4 shrink-0 text-brand" strokeWidth={2.2}/>{i}</li>)}
            {lijst.length > 4 ? <li><button onClick={() => setAllesZien(!allesZien)} className="flex w-full items-center py-2.5 text-sm font-extrabold text-[#3F5747]"><span className="flex-1 text-left">{allesZien ? t("common.minder") : t("routes.abonnement.actief.allesBekijken")}</span><Chevron richting="omlaag" open={allesZien} className="size-4"/></button></li> : null}
          </ul>

          <div className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs font-extrabold text-ink-soft">
            <button onClick={() => setStap("opzeggen")}>{t("routes.abonnement.actief.opzeggenGegevens")}</button>
            <Link to="/juridisch">{t("routes.abonnement.voorwaarden")}</Link>
            <button onClick={() => setStap("verwijderen")}>{t("routes.abonnement.actief.accountVerwijderen")}</button>
          </div>
          <button onClick={() => zetAbonnement({ status: "proef" })} className="mx-auto mt-4 block text-[11px] text-ink-soft underline">{t("routes.abonnement.actief.voorbeeldNieuw")}</button>
        </>)}

      <Sheet open={!!stap} onOpenChange={(o) => !o && sluit()}>
        <SheetContent side="bottom" className="left-1/2 max-h-[90dvh] w-full max-w-md -translate-x-1/2 overflow-y-auto rounded-t-2xl bg-background px-5 pb-8">
          {stap === "opzeggen" ? (<>
              <SheetHeader className="text-left"><SheetTitle className="font-display text-xl font-medium">{t("routes.abonnement.opzeggen.titel")}</SheetTitle>
                <SheetDescription>{t("routes.abonnement.opzeggen.beschrijving", { datum: datum(ab.verlengdatum) })}</SheetDescription></SheetHeader>
              <div className="mt-4 grid gap-2">
                <button onClick={sluit} className="rounded-full bg-brand py-2.5 text-sm font-semibold text-primary-foreground">{t("routes.abonnement.opzeggen.behouden")}</button>
                <button onClick={() => setStap("keuze")} className="rounded-full border border-border py-2.5 text-sm font-semibold">{t("routes.abonnement.opzeggen.doorgaan")}</button>
              </div>
            </>) : stap === "keuze" ? (<>
              <SheetHeader className="text-left"><SheetTitle className="font-display text-xl font-medium">{t("routes.abonnement.keuze.titel")}</SheetTitle>
                <SheetDescription>{t("routes.abonnement.keuze.beschrijving")}</SheetDescription></SheetHeader>
              <div className="mt-4 grid gap-2 text-left">
                <button onClick={() => { zetAbonnement({ status: "opgezegd" }); sluit(); }} className="rounded-2xl border border-border p-3 text-left text-sm"><span className="block font-semibold">{t("routes.abonnement.keuze.alleenOpzeggen")}</span><span className="text-xs text-ink-soft">{t("routes.abonnement.keuze.alleenOpzeggenUitleg")}</span></button>
                <button onClick={() => setStap("bewaren")} className="rounded-2xl border border-border p-3 text-left text-sm"><span className="block font-semibold">{t("routes.abonnement.keuze.bewaren", { prijs: euro(bewaarPlan.prijsCent) })}</span><span className="text-xs text-ink-soft">{t("routes.abonnement.keuze.bewarenUitleg")}</span></button>
                <button onClick={() => setStap("verwijderen")} className="rounded-2xl border border-border p-3 text-left text-sm"><span className="block font-semibold">{t("routes.abonnement.keuze.verwijderen")}</span><span className="text-xs text-ink-soft">{t("routes.abonnement.keuze.verwijderenUitleg")}</span></button>
              </div>
            </>) : stap === "bewaren" ? (<>
              <SheetHeader className="text-left"><SheetTitle className="font-display text-xl font-medium">{t("routes.abonnement.bewaren.titel")}</SheetTitle>
                <SheetDescription>{t("routes.abonnement.bewaren.beschrijving", { prijs: euro(bewaarPlan.prijsCent) })}</SheetDescription></SheetHeader>
              <div className="mt-4 space-y-3 text-sm">
                <Lijst titel={t("routes.abonnement.bewaren.blijftBewaard")} items={bewaarPlan.blijftBewaard}/>
                <Lijst titel={t("routes.abonnement.bewaren.blijftBeschikbaar")} items={bewaarPlan.blijftBeschikbaar}/>
                <Lijst titel={t("routes.abonnement.bewaren.gaatUit")} items={bewaarPlan.gaatUit}/>
                <p><Trans i18nKey="routes.abonnement.bewaren.hoeLang" values={{ maanden: bewaarPlan.bewaartermijnMaanden }} components={{ b: <span className="font-semibold"/> }}/></p>
                <p><Trans i18nKey="routes.abonnement.bewaren.terugkomen" components={{ b: <span className="font-semibold"/> }}/></p>
                <p><Trans i18nKey="routes.abonnement.bewaren.tochVerwijderen" components={{ b: <span className="font-semibold"/> }}/></p>
              </div>
              <button onClick={() => { zetAbonnement({ status: "bewaren" }); sluit(); }} className="mt-4 w-full min-h-12 rounded-full bg-brand py-2.5 text-sm font-semibold text-primary-foreground">{t("routes.abonnement.bewaren.kies")}</button>
              <button onClick={() => setStap("keuze")} className="mt-2 w-full py-2 text-sm font-semibold text-ink-soft">{t("common.terug")}</button>
            </>) : stap === "verwijderen" ? (<>
              <SheetHeader className="text-left"><SheetTitle className="font-display text-xl font-medium">{t("routes.abonnement.verwijderen.titel")}</SheetTitle>
                <SheetDescription>{t("routes.abonnement.verwijderen.beschrijving")}</SheetDescription></SheetHeader>
              <div className="mt-3 space-y-2 text-sm text-ink-soft">
                <p>{t("routes.abonnement.verwijderen.uitleg")}</p>
                <p>{t("routes.abonnement.verwijderen.tip")}</p>
              </div>
              <div className="mt-4 grid gap-2">
                <Link to="/exporteren" className="rounded-full border border-border py-2.5 text-center text-sm font-semibold text-brand">{t("routes.abonnement.verwijderen.exporteren")}</Link>
                <button onClick={() => { zetAbonnement({ status: "verwijderaanvraag" }); sluit(); }} className="rounded-full bg-brand py-2.5 text-sm font-semibold text-primary-foreground">{t("routes.abonnement.verwijderen.aanvragen")}</button>
                <button onClick={sluit} className="py-2 text-sm font-semibold text-ink-soft">{t("common.annuleren")}</button>
              </div>
            </>) : null}
        </SheetContent>
      </Sheet>
    </AppShell>);
}
function Lijst({ titel, items }) {
    return (<div>
      <p className="font-semibold">{titel}</p>
      <ul className="mt-1 space-y-0.5 text-ink-soft">{items.map((i) => <li key={i}>· {i}</li>)}</ul>
    </div>);
}
