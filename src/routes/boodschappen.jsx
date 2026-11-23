import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import i18n, { taalLocale } from "@/i18n";
import { z } from "zod";
import { AppShell, Card } from "@/components/AppShell";
import { KostenTabs } from "@/components/KostenTabs";
import { useLijst } from "@/components/KleineLijst";
import { useBudgetten } from "@/lib/budget-store";
import { bevestigdBudget, gekoppeldBudget } from "@/lib/budget-weergave";
import { useKosten } from "@/lib/kosten-store";
import { useStart } from "@/lib/start-store";
import { Button } from "@/components/ui/button";
import { AppIcon } from "@/components/AppIcon";
import { Chevron, Kruis, Vinkje } from "@/components/Tekens";
import { bevestig } from "@/lib/feedback";
import { kindbank, kleurVanKind } from "@/lib/demo-data";
import { useOnthouden } from "@/lib/onthouden";
import { Zichtbaar } from "@/components/Zichtbaar";
import { useNavigate } from "@tanstack/react-router";
// Eigen gezin: eigen lijst (geen voorbeelddata), met plusje en toevoegformulier.
function BoodschappenWrap() {
    const st = useStart();
    if (st.eigen)
        return <EigenBoodschappen />;
    return <Boodschappen />;
}
function EigenBoodschappen() {
    const { t } = useTranslation();
    const st = useStart();
    const nav = useNavigate();
    const data = useLijst([], "nog-nodig-eigen");
    const zoek = Route.useSearch();
    const [nieuw, setNieuw] = useState(!!zoek.item);
    const [tekst, setTekst] = useState(zoek.item ?? "");
    const [alGekocht, setAlGekocht] = useState(false);
    const [kind, setKind] = useState(zoek.kind && st.kinderen.some((k) => k.naam === zoek.kind) ? zoek.kind : st.kinderen[0]?.naam ?? "");
    const open = data.lijst.filter((i) => !i.klaar);
    const klaar = data.lijst.filter((i) => i.klaar);
    const [vraag, setVraag] = useState(null);
    const vraagItem = data.lijst.find((i) => i.id === vraag && i.klaar);
    const inKosten = (x) => st.kosten.some((k) => k.omschrijving.trim().toLowerCase() === x.trim().toLowerCase());
    const rij = (i) => (<li key={i.id} className="flex items-center gap-3 px-3 py-3">
      <button onClick={() => { data.toggle(i.id); setVraag(i.klaar ? null : i.id); }} aria-pressed={i.klaar} aria-label={i.klaar ? t("routes.boodschappen.markeerNodig") : t("routes.boodschappen.markeerGekocht")} className={`relative grid size-6 shrink-0 place-items-center rounded-full border after:absolute after:-inset-2 after:content-[''] ${i.klaar ? "border-brand bg-brand text-primary-foreground" : "border-ink-soft/40"}`}>{i.klaar ? <Vinkje className="size-3.5"/> : null}</button>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm ${i.klaar ? "text-ink-soft line-through" : "font-semibold"}`}>{i.tekst}</span>
        <span className="block text-xs text-ink-soft">{i.kind}</span>
        {i.deadline ? <span className="block text-xs text-ink-soft">{t("routes.boodschappen.voorDeadline", { datum: i.deadline })}</span> : null}
      </span>
      {!i.klaar ? <Link to="/kosten" search={{ budget: "nieuw", benodigdheid: i.tekst, kind: i.kind }} className="text-xs font-semibold text-brand">{t("routes.boodschappen.budgetVoorstellen")}</Link> : null}
    </li>);
    return (<AppShell>
      <div className="flex items-center justify-between">
        <h1 className="lora text-[32px] leading-tight">{t("routes.boodschappen.titel")}</h1>
        <button type="button" aria-label={t("routes.boodschappen.toevoegenLabel")} onClick={() => setNieuw(!nieuw)} className="grid size-12 place-items-center rounded-full bg-brand text-2xl font-black text-primary-foreground shadow-[0_4px_14px_rgba(63,87,71,.25)]"><Plus aria-hidden="true" strokeWidth={2.25} className="size-5"/></button>
      </div>
      <KostenTabs actief="nognodig"/>
      <p className="mt-2.5 px-1 text-[13px] text-ink-soft">{t("routes.boodschappen.pasNaGekocht")}</p>
      {nieuw ? (<Card className="mt-4 space-y-2">
          <input value={tekst} onChange={(e) => setTekst(e.target.value)} placeholder={t("routes.boodschappen.placeholder")} aria-label={t("routes.boodschappen.watNodig")} className={`w-full ${veld}`}/>
          {st.kinderen.length ? (<select value={kind} onChange={(e) => setKind(e.target.value)} aria-label={t("routes.boodschappen.voorWieLabel")} className={`w-full ${veld}`}>
              {st.kinderen.map((k) => <option key={k.id} value={k.naam}>{k.naam}</option>)}
            </select>) : null}
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={alGekocht} onChange={(e) => setAlGekocht(e.target.checked)}/>{t("routes.boodschappen.alGekocht")}</label>
          <button onClick={() => { if (tekst.trim()) {
            const id = data.voegToe(tekst.trim(), "Nodig", kind, alGekocht);
            if (alGekocht)
                setVraag(id);
            setAlGekocht(false);
            setTekst("");
            setNieuw(false);
        } }} disabled={!tekst.trim()} className="min-h-11 w-full rounded-full bg-brand text-sm font-semibold text-primary-foreground disabled:opacity-40">{t("common.toevoegen")}</button>
        </Card>) : null}
      {vraagItem ? <div className="mt-4 border-y border-border py-3"><p className="text-sm font-semibold">{inKosten(vraagItem.tekst) ? t("routes.boodschappen.staatAlBijKosten", { tekst: vraagItem.tekst }) : t("routes.boodschappen.ookToevoegen")}</p><div className="mt-2 flex flex-wrap items-center gap-3">{!inKosten(vraagItem.tekst) ? <Link to="/kosten" search={{ uitgave: vraagItem.tekst, kind: vraagItem.kind }} className="text-sm font-semibold text-brand">{t("routes.boodschappen.toevoegenAanKosten")}</Link> : null}<Button variant="ghost" size="sm" onClick={() => setVraag(null)}>{t("routes.boodschappen.alleenGekocht")}</Button></div></div> : null}
      {!data.lijst.length && !nieuw ? (<div className="mt-10 flex flex-col items-center text-center">
          <p className="font-display text-lg font-bold">{t("routes.boodschappen.leeg.titel")}</p>
          <p className="mt-1 max-w-xs text-sm text-ink-soft">{t("routes.boodschappen.leeg.tekst")}</p>
          <button onClick={() => setNieuw(true)} className="mt-5 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-primary-foreground">{t("routes.boodschappen.leeg.eerste")}</button>
          <button onClick={() => nav({ to: "/meer" })} className="mt-3 min-h-11 text-sm font-semibold text-ink-soft">{t("routes.boodschappen.leeg.terugMenu")}</button>
        </div>) : null}
      {open.length ? <ul className="mt-4 divide-y divide-border rounded-md border border-border bg-card">{open.map(rij)}</ul> : null}
      {klaar.length ? (<>
          <h2 className="mt-5 text-[11px] font-bold uppercase tracking-wide text-ink-soft">{t("routes.boodschappen.gekocht")}</h2>
          <ul className="mt-2 divide-y divide-border rounded-md border border-border bg-card">{klaar.map(rij)}</ul>
        </>) : null}
    </AppShell>);
}
export const Route = createFileRoute("/boodschappen")({
    head: () => ({
        meta: [
            { title: i18n.t("routes.boodschappen.meta.titel") },
            { name: "description", content: i18n.t("routes.boodschappen.meta.beschrijving") },
            { property: "og:title", content: i18n.t("routes.boodschappen.meta.titel") },
            { property: "og:description", content: i18n.t("routes.boodschappen.meta.beschrijving") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    validateSearch: z.object({ item: z.string().max(120).optional(), kind: z.string().max(40).optional() }),
    component: BoodschappenWrap,
});
const veld = "rounded-md border border-border bg-background px-3 py-2 text-sm";
function Boodschappen() {
    const { t } = useTranslation();
    // Dezelfde lijst en statussen als voorheen onder Taken (verplaatst, niet gekopieerd).
    // Voorbeelditems houden hun Nederlandse bron in "tekst" (maatherkenning) en tonen via "sleutel" de vertaling.
    const data = useLijst([
        { tekst: "Regenlaarzen", sleutel: "regenlaarzen", wie: "Nodig", kind: "Noah", klaar: false },
        { tekst: "Fietshelm", sleutel: "fietshelm", wie: "Nodig", kind: "Emma", klaar: false, koper: "Joris" },
        { tekst: "Neusspray (apotheek)", sleutel: "neusspray", wie: "Boodschap", kind: "Emma", klaar: false },
        { tekst: "Gymtas", sleutel: "gymtas", wie: "Nodig", kind: "Emma", klaar: true },
    ], "nog-nodig-demo");
    const tekstVan = (i) => (i.sleutel ? t(`routes.boodschappen.demo.${i.sleutel}`) : i.tekst);
    const kosten = useKosten();
    const budgetten = useBudgetten();
    const [koppelItem, setKoppelItem] = useState(null);
    const zoek = Route.useSearch();
    const [nieuw, setNieuw] = useState(!!zoek.item);
    const [tekst, setTekst] = useState(zoek.item ?? "");
    const [alGekocht, setAlGekocht] = useState(false);
    const [wie, setWie] = useState("Nodig");
    const [kind, setKind] = useState(zoek.kind ?? "Emma");
    const [gekochtOpen, setGekochtOpen] = useState(false);
    const [vraag, setVraag] = useState(null);
    const open = data.lijst.filter((i) => !i.klaar);
    const gekocht = data.lijst.filter((i) => i.klaar);
    const inKosten = (x) => kosten.some((k) => k.omschrijving.trim().toLowerCase() === x.trim().toLowerCase());
    const vink = (id, klaar) => {
        data.toggle(id);
        setVraag(klaar ? null : id);
        const item = data.lijst.find((x) => x.id === id);
        if (!klaar && item)
            bevestig(t("routes.boodschappen.gekocht"), { uitleg: tekstVan(item), ongedaan: () => { data.toggle(id); setVraag(null); } });
    };
    const vraagItem = data.lijst.find((i) => i.id === vraag && i.klaar);
    const [voor, setVoor] = useOnthouden("nognodig-voor", "samen", ["samen", "Emma", "Noah"]);
    const [snel, setSnel] = useState("");
    const [openItem, setOpenItem] = useState(null);
    const hoortBij = (i) => voor === "samen" || i.kind === voor || i.kind === "Allebei";
    const zichtbaarOpen = open.filter(hoortBij);
    const zichtbaarGekocht = gekocht.filter(hoortBij);
    const [snelKind, setSnelKind] = useState("");
    const gekozenKind = snelKind || (voor === "samen" ? "" : voor);
    const snelToevoegen = () => {
        const invoer = snel.trim();
        if (!invoer || !gekozenKind)
            return;
        const netjes = invoer.charAt(0).toUpperCase() + invoer.slice(1);
        const id = data.voegToe(netjes, "Nodig", gekozenKind);
        setSnel("");
        setSnelKind("");
        bevestig(t("routes.boodschappen.opDeLijst"), { uitleg: `${netjes} · ${gekozenKind === "Allebei" ? t("routes.boodschappen.emmaEnNoah") : gekozenKind}`, ongedaan: () => data.verwijder(id) });
    };
    const eur = (n) => n.toLocaleString(taalLocale(), { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
    const kindBol = (k) => <span key={k} aria-label={k} className="grid size-5 shrink-0 place-items-center rounded-full text-[10.5px] font-black text-white" style={{ background: kleurVanKind(k) }}>{k[0]}</span>;
    const rij = (i) => {
        const budget = gekoppeldBudget(i.budgetId, budgetten);
        const maat = i.klaar ? null : maatKort(i.tekst, i.kind);
        const isOpen = openItem === i.id;
        const kinderenVan = (i.kind === "Allebei" ? ["Emma", "Noah"] : i.kind === "Emma" || i.kind === "Noah" ? [i.kind] : []);
        const regel = [
            i.wie === "Boodschap" ? t("routes.boodschappen.soort.boodschap") : null,
            i.koper ? (i.koper === "Sanne" ? t("routes.boodschappen.regel.jijKoopt") : t("routes.boodschappen.regel.koopt", { naam: i.koper })) : null,
            i.klaar ? (inKosten(tekstVan(i)) ? t("routes.boodschappen.regel.bijUitgaven") : null) : budget ? t("routes.boodschappen.regel.budget", { bedrag: eur(budget.max) }) : t("routes.boodschappen.regel.geenBudget"),
            i.deadline ? t("routes.boodschappen.regel.voor", { datum: i.deadline }) : null,
        ].filter(Boolean).join(" · ");
        return (<li key={i.id} className="px-3 py-3.5">
        <div className="flex items-start gap-3">
          <button onClick={() => vink(i.id, i.klaar)} aria-pressed={i.klaar} aria-label={i.klaar ? t("routes.boodschappen.markeerNodig") : t("routes.boodschappen.markeerGekocht")} className={`relative mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 after:absolute after:-inset-2 after:content-[''] ${i.klaar ? "border-brand bg-brand text-primary-foreground" : "border-[#A9A097]"}`}>{i.klaar ? <Vinkje className="size-3.5"/> : null}</button>
          <button onClick={() => setOpenItem(isOpen ? null : i.id)} aria-expanded={isOpen} className="min-w-0 flex-1 text-left">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className={`text-[15.5px] ${i.klaar ? "text-ink-soft line-through" : "font-black"}`}>{tekstVan(i)}</span>
              {kinderenVan.map(kindBol)}
            </span>
            <span className="mt-0.5 block text-[13px] text-ink-soft">
              {maat ? <span className="font-bold text-[#6E5014]">{maat}{regel ? " · " : ""}</span> : null}{regel ? regel.charAt(0).toUpperCase() + regel.slice(1) : null}
            </span>
          </button>
          {!i.klaar && !i.koper && !isOpen
                ? <button onClick={() => data.zetKoper(i.id, "Sanne")} className="inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-full border-[1.5px] border-brand px-3 text-[13px] font-black text-[#3F5747]">{t("routes.boodschappen.ikKoop")}</button>
                : !i.klaar ? <Chevron className={`mt-1 size-4 text-ink-soft ${isOpen ? "rotate-90" : ""}`}/> : null}
        </div>
        {isOpen && !i.klaar ? (<div className="ml-9 mt-2.5 rounded-[14px] bg-white px-3 py-2.5">
            <p className="text-[12.5px] font-extrabold text-ink-soft">{t("routes.boodschappen.budget")}</p>
            {budget ? (<Link to="/kosten" search={{ budget: i.budgetId }} className="mt-1.5 inline-flex h-9 items-center rounded-full border border-[#E6DED2] px-3.5 text-[13px] font-black">{t("routes.boodschappen.bekijkBudget")}</Link>) : (<div className="mt-1.5 flex gap-2">
                <Link to="/kosten" search={{ budget: "nieuw", benodigdheid: tekstVan(i), kind: i.kind, bronItem: String(i.id) }} className="inline-flex h-9 flex-1 items-center justify-center whitespace-nowrap rounded-full bg-brand px-3 text-[13px] font-black text-primary-foreground">{t("routes.boodschappen.voorstellen")}</Link>
                <button onClick={() => setKoppelItem(koppelItem === i.id ? null : i.id)} aria-expanded={koppelItem === i.id} className="inline-flex h-9 flex-1 items-center justify-center whitespace-nowrap rounded-full border border-[#E6DED2] px-3 text-[13px] font-black">{t("routes.boodschappen.afgesprokenBedrag")}</button>
              </div>)}
            {koppelItem === i.id ? <label className="mt-2 block text-xs text-ink-soft">{t("routes.boodschappen.kiesBedrag")}<select aria-label={t("routes.boodschappen.koppelLabel", { tekst: tekstVan(i) })} defaultValue="" onChange={(e) => { if (e.target.value) {
                data.koppelBudget(i.id, e.target.value);
                setKoppelItem(null);
            } }} className={`mt-1 w-full ${veld}`}><option value="">{t("routes.boodschappen.kiesBudget")}</option>{budgetten.filter((b) => bevestigdBudget(b) && (b.kind === i.kind || b.kind === "Emma & Noah" || b.kind === "Beide")).map((b) => <option key={b.id} value={b.id}>{b.wat} · {b.max.toLocaleString(taalLocale(), { style: "currency", currency: "EUR" })}</option>)}</select></label> : null}
            {!i.koper ? <button onClick={() => data.zetKoper(i.id, "Sanne")} className="mt-2 block min-h-9 text-[13px] font-extrabold text-[#3F5747]">{t("routes.boodschappen.ikKoop")}</button> : null}
            {i.koper === "Sanne" ? <button onClick={() => data.zetKoper(i.id, undefined)} className="mt-2 block min-h-9 text-[13px] font-semibold text-ink-soft">{t("routes.boodschappen.tochNiet")}</button> : null}
          </div>) : null}
      </li>);
    };
    return (<AppShell>
      <div className="flex items-center justify-between">
        <h1 className="lora text-[32px] leading-tight">{t("routes.boodschappen.titel")}</h1>
        <button type="button" aria-label={t("routes.boodschappen.toevoegenLabel")} onClick={() => setNieuw(!nieuw)} className="grid size-10 place-items-center rounded-full bg-brand text-2xl leading-none text-primary-foreground"><Plus aria-hidden="true" strokeWidth={2.25} className="size-5"/></button>
      </div>
      <KostenTabs actief="nognodig"/>
      <Zichtbaar voor="samen" className="mt-2.5"/>

      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => setVoor("samen")} aria-pressed={voor === "samen"} className={`h-9 rounded-full px-4 text-sm font-extrabold ${voor === "samen" ? "bg-brand text-primary-foreground" : "border border-white/95 bg-white/75"}`}>{t("routes.boodschappen.samen")}</button>
        {["Emma", "Noah"].map((k) => (<button key={k} onClick={() => setVoor(k)} aria-pressed={voor === k} className={`flex h-9 items-center gap-1.5 rounded-full pl-1 pr-3.5 text-sm font-black ${voor === k ? "border-2 border-brand bg-white" : "bg-white/60"}`}>
            <span className="grid size-7 place-items-center rounded-full text-xs font-black text-white" style={{ background: kleurVanKind(k) }}>{k[0]}</span>{k}
          </button>))}
      </div>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); snelToevoegen(); }}>
        <input value={snel} onChange={(e) => setSnel(e.target.value)} placeholder={t("routes.boodschappen.watNodig")} aria-label={t("routes.boodschappen.watNodig")} className="h-11 min-w-0 flex-1 rounded-full border border-[#E6DED2] bg-white px-4 text-[15px] outline-none"/>
        <button type="submit" disabled={!snel.trim() || !gekozenKind} className="h-11 shrink-0 rounded-full bg-brand px-4 text-sm font-black text-primary-foreground disabled:opacity-40">{t("common.toevoegen")}</button>
      </form>
      {snel.trim() ? (<div className="mt-2 flex flex-wrap items-center gap-2 px-1">
          <span className="text-[13px] font-bold text-ink-soft">{t("routes.boodschappen.voorWie")}</span>
          {["Emma", "Noah", "Allebei"].map((k) => (<button key={k} type="button" onClick={() => setSnelKind(k)} aria-pressed={gekozenKind === k} className={`h-8 rounded-full px-3 text-[13px] font-extrabold ${gekozenKind === k ? "bg-brand text-primary-foreground" : "border border-[#E6DED2] bg-white"}`}>{k === "Allebei" ? t("common.allebei") : k}</button>))}
        </div>) : null}
      {snel.trim() && gekozenKind && gekozenKind !== "Allebei" && maatHint(snel, gekozenKind) ? (<p className="mt-1.5 flex items-center gap-1 px-1 text-[12.5px] font-bold text-[#6E5014]"><AppIcon functie="maten" maat="sm" vorm="kaal"/>{maatHint(snel, gekozenKind)}</p>) : null}

      {nieuw ? (<Card className="mt-4 space-y-2">
          <input value={tekst} onChange={(e) => setTekst(e.target.value)} placeholder={t("routes.boodschappen.placeholder")} aria-label={t("routes.boodschappen.watNodig")} className={`w-full ${veld}`}/>
          <div className="flex gap-2">
            <select value={wie} onChange={(e) => setWie(e.target.value)} aria-label={t("routes.boodschappen.soortLabel")} className={`flex-1 ${veld}`}><option value="Nodig">{t("routes.boodschappen.soort.nodig")}</option><option value="Boodschap">{t("routes.boodschappen.soort.boodschap")}</option></select>
            <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label={t("routes.boodschappen.voorWieLabel")} className={`flex-1 ${veld}`}><option>Emma</option><option>Noah</option><option value="Allebei">{t("common.allebei")}</option></select>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={alGekocht} onChange={(e) => setAlGekocht(e.target.checked)}/>{t("routes.boodschappen.alGekocht")}</label>
          <button onClick={() => { if (tekst.trim()) {
            const id = data.voegToe(tekst.trim(), wie, kind, alGekocht);
            if (alGekocht)
                setVraag(id);
            setAlGekocht(false);
            setTekst("");
            setNieuw(false);
        } }} disabled={!tekst.trim()} className="min-h-11 w-full rounded-full bg-brand text-sm font-semibold text-primary-foreground disabled:opacity-40">{t("common.toevoegen")}</button>
        </Card>) : null}

      {vraagItem ? (<Card className="mt-4">
          <div className="flex items-start gap-2">
            <p className="flex-1 text-sm font-semibold">{inKosten(tekstVan(vraagItem)) ? t("routes.boodschappen.staatAlBijKosten", { tekst: tekstVan(vraagItem) }) : t("routes.boodschappen.ookToevoegen")}</p>
            <button onClick={() => setVraag(null)} aria-label={t("common.sluiten")} className="knop-kruis -mr-2 -mt-2 size-11"><Kruis className="size-5"/></button>
          </div>
          {inKosten(tekstVan(vraagItem)) ? null : (<>
              <p className="mt-1 text-sm text-ink-soft">{t("routes.boodschappen.bedragOfBon")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to="/kosten" search={{ uitgave: tekstVan(vraagItem), kind: vraagItem.kind }} className="inline-flex min-h-11 items-center rounded-full bg-brand px-4 text-sm font-semibold text-primary-foreground">{t("routes.boodschappen.toevoegenAanKosten")}</Link>
                <button onClick={() => setVraag(null)} className="min-h-11 px-2 text-sm font-semibold text-ink-soft">{t("routes.boodschappen.neeAlleenGekocht")}</button>
              </div>
            </>)}
        </Card>) : null}

      <section className="mt-5">
        <h2 className="px-1 text-[13px] font-black uppercase tracking-[0.08em] text-ink-soft">{t("routes.boodschappen.opDeLijstKop")}{zichtbaarOpen.length ? <span className="ml-1.5 text-xs">· {zichtbaarOpen.length}</span> : null}</h2>
        {zichtbaarOpen.length ? <ul className="mt-2 divide-y divide-[#E9E1D5] rounded-[22px] border border-white/85 bg-white/60">{zichtbaarOpen.map(rij)}</ul> : <p className="mt-2 px-1 text-sm text-ink-soft">{t("routes.boodschappen.nietsNodig")}</p>}
      </section>

      {zichtbaarGekocht.length ? (<section className="mt-4 rounded-[22px] border border-white/85 bg-white/60">
          <button onClick={() => setGekochtOpen(!gekochtOpen)} aria-expanded={gekochtOpen} className="flex min-h-12 w-full items-center px-4 py-3 text-left">
            <span className="flex-1 text-[15.5px] font-black">{t("routes.boodschappen.gekocht")}<span className="ml-1.5 text-xs text-ink-soft">· {zichtbaarGekocht.length}</span></span>
            <Chevron richting="omlaag" open={gekochtOpen} className="size-4 text-ink-soft"/>
          </button>
          {gekochtOpen ? <ul className="divide-y divide-[#E9E1D5] border-t border-[#E9E1D5]">{zichtbaarGekocht.map(rij)}</ul> : null}
        </section>) : null}
      <p className="mt-3 px-2 text-center text-xs text-ink-soft">{t("routes.boodschappen.afgevinkt")}</p>
    </AppShell>);
}
/** Korte maat voor in de lijst: "maat 30" of "kledingmaat 122". */
function maatKort(tekst, kind) {
    const m = maatInfo(tekst, kind);
    return m ? i18n.t(`routes.boodschappen.maat.kort.${m.soort}`, { maat: m.maat }) : null;
}
/** "Noah heeft maat 30": alleen bij herkenbare woorden, uit de maten van het kind. Nooit verzonnen. */
function maatHint(tekst, kind) {
    const m = maatInfo(tekst, kind);
    return m ? i18n.t(`routes.boodschappen.maat.hint.${m.soort}`, { kind, maat: m.maat }) : null;
}
/** Herkent Nederlandse én Engelse woorden; voorbeelditems houden hun Nederlandse bron in "tekst". */
function maatInfo(tekst, kind) {
    const id = kind === "Emma" ? "emma" : kind === "Noah" ? "noah" : null;
    const m = id ? kindbank[id]?.maten : undefined;
    if (!id || !m)
        return null;
    const t = tekst.toLowerCase();
    if (/maat\s*\d|size\s*\d/.test(t))
        return null;
    if (/laars|laarzen|schoen|sneaker|slipper|sandaal|boots|wellies|shoe|trainer|sandal/.test(t) && m.schoen)
        return { soort: "schoen", maat: m.schoen };
    if (/jas|broek|shirt|trui|pyjama|jurk|kleding|vest|legging|rok|jacket|coat|trousers|jumper|sweater|dress|clothes|cardigan|skirt|jeans/.test(t) && m.kleding)
        return { soort: "kleding", maat: m.kleding };
    return null;
}
