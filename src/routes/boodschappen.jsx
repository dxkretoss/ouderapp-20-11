import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import i18n, { taalLocale } from "@/i18n";
import { z } from "zod";
import { AppShell, Card } from "@/components/AppShell";
import { KostenTabs } from "@/components/KostenTabs";
import { useBudgetten } from "@/lib/budget-store";
import { bevestigdBudget, gekoppeldBudget } from "@/lib/budget-weergave";
import { useKosten } from "@/lib/kosten-store";
import { laadNogNodig, useNogNodig } from "@/lib/nog-nodig-store";
import { LaadFout } from "@/components/Laden";
import { useStart } from "@/lib/start-store";
import { AppIcon } from "@/components/AppIcon";
import { Chevron, Kruis, Vinkje } from "@/components/Tekens";
import { bevestig } from "@/lib/feedback";
import { useOnthouden } from "@/lib/onthouden";
import { useGezin } from "@/lib/gezin";
import { DeelLabel, DelenKeuze, deelCheck, VerwijderDialoog } from "@/components/DelenKeuze";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { VELD } from "@/lib/ui-stijl";
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
    component: Boodschappen,
});
const veld = `${VELD}`;
/**
 * Nog nodig van het eigen gezin: één gedeelde lijst (manage-still-needed) voor beide ouders.
 * Afvinken markeert alleen "gekocht"; kosten en budgetten ontstaan alleen via de bestaande flows bij Uitgaven.
 */
function Boodschappen() {
    const { t } = useTranslation();
    const st = useStart();
    const kinderen = st.kinderen;
    const data = useNogNodig();
    const tekstVan = (i) => i.tekst;
    const kosten = useKosten();
    const budgetten = useBudgetten();
    const [koppelItem, setKoppelItem] = useState(null);
    const zoek = Route.useSearch();
    // Kindkeuzes: ieder kind en (bij meer dan één) "Allebei"; waarde = id of "alle".
    const kindOpties = [...kinderen.map((k) => ({ waarde: k.id, label: k.naam, ids: [k.id] })), ...(kinderen.length > 1 ? [{ waarde: "alle", label: kinderen.length === 2 ? t("common.allebei") : i18n.t("components.KostenTabs.kind.alleKinderen"), ids: kinderen.map((k) => k.id) }] : [])];
    const idsVan = (waarde) => kindOpties.find((k) => k.waarde === waarde)?.ids ?? [];
    const zoekKind = zoek.kind ? kinderen.find((k) => k.naam === zoek.kind)?.id ?? (zoek.kind === "Allebei" ? "alle" : "") : "";
    const [nieuw, setNieuw] = useState(!!zoek.item);
    const [tekst, setTekst] = useState(zoek.item ?? "");
    const [alGekocht, setAlGekocht] = useState(false);
    const [wie, setWie] = useState("Nodig");
    const [kind, setKind] = useState(zoekKind || kindOpties[0]?.waarde || "");
    const [gekochtOpen, setGekochtOpen] = useState(false);
    const [vraag, setVraag] = useState(null);
    const g = useGezin();
    // Nieuw item = standaard "Alleen jij"; delen is een bewuste keuze (per kind de juiste andere ouder).
    const [gedeeld, setGedeeld] = useState(false);
    const [anderKeuze, setAnderKeuze] = useState("");
    const [bewerk, setBewerk] = useState(null);
    const open = data.lijst.filter((i) => !i.klaar);
    const gekocht = data.lijst.filter((i) => i.klaar);
    const inKosten = (x) => kosten.some((k) => k.omschrijving.trim().toLowerCase() === x.trim().toLowerCase());
    const vink = async (id, klaar) => {
        const item = data.lijst.find((x) => x.id === id);
        setVraag(klaar ? null : id);
        if (!(await data.toggle(id))) {
            setVraag(null);
            return;
        }
        if (!klaar && item)
            bevestig(t("routes.boodschappen.gekocht"), { uitleg: tekstVan(item), ongedaan: () => { data.toggle(id); setVraag(null); } });
    };
    const vraagItem = data.lijst.find((i) => i.id === vraag && i.klaar);
    const [voor, setVoor] = useOnthouden("nognodig-voor", "samen", ["samen", ...kinderen.map((k) => k.id)]);
    const [snel, setSnel] = useState("");
    const [openItem, setOpenItem] = useState(null);
    const hoortBij = (i) => voor === "samen" || !kinderen.some((k) => k.id === voor) || i.kindIds.includes(voor);
    const zichtbaarOpen = open.filter(hoortBij);
    const zichtbaarGekocht = gekocht.filter(hoortBij);
    const [snelKind, setSnelKind] = useState("");
    const gekozenKind = snelKind || (voor === "samen" ? (kinderen.length === 1 ? kinderen[0].id : "") : voor);
    const snelToevoegen = async () => {
        const invoer = snel.trim();
        if (!invoer || !gekozenKind)
            return;
        const delen = deelCheck(g, idsVan(gekozenKind), gedeeld, anderKeuze);
        if (!delen.ok)
            return;
        const netjes = invoer.charAt(0).toUpperCase() + invoer.slice(1);
        setSnel("");
        setSnelKind("");
        const id = await data.voegToe(netjes, "Nodig", idsVan(gekozenKind), false, undefined, delen);
        if (id)
            bevestig(t("routes.boodschappen.opDeLijst"), { uitleg: `${netjes} · ${kindOpties.find((k) => k.waarde === gekozenKind)?.label ?? ""}`, ongedaan: () => data.verwijder(id) });
    };
    const eur = (n) => n.toLocaleString(taalLocale(), { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
    const kindBol = (k) => <span key={k.id} aria-label={k.naam} className="grid size-5 shrink-0 place-items-center rounded-full text-[10.5px] font-black text-white" style={{ background: k.kleur }}>{k.naam[0]}</span>;
    /** Naam voor links naar Uitgaven/budget (één kind of "Allebei"). */
    const kindNaamVan = (i) => (i.kindIds.length === 1 ? kinderen.find((k) => k.id === i.kindIds[0])?.naam : i.kindIds.length > 1 ? "Allebei" : undefined);
    const rij = (i) => {
        const budget = gekoppeldBudget(i.budgetId, budgetten);
        const voorstel = !budget && i.budgetId ? budgetten.find((b) => b.id === i.budgetId && (b.status === "wacht" || b.status === "tegenvoorstel")) : null;
        const kinderenVan = i.kindIds.map((id) => kinderen.find((k) => k.id === id)).filter(Boolean);
        const maat = i.klaar || kinderenVan.length !== 1 ? null : maatKort(i.tekst, kinderenVan[0]);
        const isOpen = openItem === i.id;
        const regel = [
            i.wie === "Boodschap" ? t("routes.boodschappen.soort.boodschap") : null,
            i.koper ? (i.koper === "ik" ? t("routes.boodschappen.regel.jijKoopt") : t("routes.boodschappen.regel.koopt", { naam: t("common.deAndereOuder") })) : null,
            i.klaar ? (inKosten(tekstVan(i)) ? t("routes.boodschappen.regel.bijUitgaven") : null) : budget ? t("routes.boodschappen.regel.budget", { bedrag: eur(budget.max) }) : voorstel ? t("routes.boodschappen.regel.budgetWacht", { bedrag: eur(voorstel.stappen.at(-1)?.bedrag ?? voorstel.max) }) : t("routes.boodschappen.regel.geenBudget"),
            i.deadline ? t("routes.boodschappen.regel.voor", { datum: i.deadline }) : null,
        ].filter(Boolean).join(" · ");
        return (<li key={i.id} className="px-3 py-3.5">
        <div className="flex items-start gap-3">
          <button onClick={() => vink(i.id, i.klaar)} aria-pressed={i.klaar} aria-label={i.klaar ? t("routes.boodschappen.markeerNodig") : t("routes.boodschappen.markeerGekocht")} className={`relative mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 after:absolute after:-inset-2 after:content-[''] ${i.klaar ? "border-brand bg-brand text-primary-foreground" : "border-[#A9A097]"}`}>{i.klaar ? <Vinkje className="size-3.5"/> : null}</button>
          <button onClick={() => setOpenItem(isOpen ? null : i.id)} aria-expanded={isOpen} className="min-w-0 flex-1 text-left">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className={`text-[15.5px] ${i.klaar ? "text-ink-soft line-through" : "font-black"}`}>{tekstVan(i)}</span>
              {kinderenVan.map(kindBol)}
              {g.gekoppeld ? <DeelLabel gedeeld={!i.vanMij || i.gedeeld}/> : null}
            </span>
            <span className="mt-0.5 block text-[13px] text-ink-soft">
              {maat ? <span className="font-bold text-[#6E5014]">{maat}{regel ? " · " : ""}</span> : null}{regel ? regel.charAt(0).toUpperCase() + regel.slice(1) : null}
            </span>
          </button>
          {i.klaar ? <button onClick={() => setOpenItem(isOpen ? null : i.id)} aria-label={t("routes.boodschappen.meer")} className="-my-2 grid size-10 shrink-0 place-items-center"><Chevron className={`size-4 text-ink-soft ${isOpen ? "rotate-90" : ""}`}/></button> : null}
          {!i.klaar && !i.koper && !isOpen
                ? <button onClick={() => data.zetKoper(i.id, "ik")} className="inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full border-[1.5px] border-brand px-3 text-[13px] font-black text-[#3F5747]">{t("routes.boodschappen.ikKoop")}</button>
                : !i.klaar ? <Chevron className={`mt-1 size-4 shrink-0 text-ink-soft ${isOpen ? "rotate-90" : ""}`}/> : null}
        </div>
        {isOpen && !i.klaar ? (<div className="ml-9 mt-2.5 rounded-[14px] bg-white px-3 py-2.5">
            <p className="text-[12.5px] font-extrabold text-ink-soft">{t("routes.boodschappen.budget")}</p>
            {budget || voorstel ? (<Link to="/kosten" search={{ budget: i.budgetId }} className="mt-1.5 inline-flex min-h-10 items-center rounded-full border border-[#E6DED2] px-3.5 text-[13px] font-black">{t("routes.boodschappen.bekijkBudget")}</Link>) : (<div className="mt-1.5 grid grid-cols-2 gap-2">
                <Link to="/kosten" search={{ budget: "nieuw", benodigdheid: tekstVan(i), kind: kindNaamVan(i), bronItem: String(i.id) }} className="inline-flex min-h-10 items-center justify-center rounded-full bg-brand px-3 text-center text-[13px] font-black leading-tight text-primary-foreground">{t("routes.boodschappen.voorstellen")}</Link>
                <button onClick={() => setKoppelItem(koppelItem === i.id ? null : i.id)} aria-expanded={koppelItem === i.id} className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#E6DED2] px-3 text-center text-[13px] font-black leading-tight">{t("routes.boodschappen.afgesprokenBedrag")}</button>
              </div>)}
            {koppelItem === i.id ? <label className="mt-2 block text-xs text-ink-soft">{t("routes.boodschappen.kiesBedrag")}<select aria-label={t("routes.boodschappen.koppelLabel", { tekst: tekstVan(i) })} defaultValue="" onChange={(e) => { if (e.target.value) {
                data.koppelBudget(i.id, e.target.value);
                setKoppelItem(null);
            } }} className={`mt-1 w-full ${veld}`}><option value="">{t("routes.boodschappen.kiesBudget")}</option>{budgetten.filter((b) => bevestigdBudget(b) && (!b.kindIds.length || i.kindIds.every((id) => b.kindIds.includes(id)))).map((b) => <option key={b.id} value={b.id}>{b.wat} · {b.max.toLocaleString(taalLocale(), { style: "currency", currency: "EUR" })}</option>)}</select></label> : null}
            {!i.koper ? <button onClick={() => data.zetKoper(i.id, "ik")} className="mt-1 block min-h-10 text-[13px] font-extrabold text-[#3F5747]">{t("routes.boodschappen.ikKoop")}</button> : null}
            {i.koper === "ik" ? <button onClick={() => data.zetKoper(i.id, undefined)} className="mt-1 block min-h-10 text-[13px] font-semibold text-ink-soft">{t("routes.boodschappen.tochNiet")}</button> : null}
          </div>) : null}
        {isOpen ? (<div className="ml-9 mt-2 flex flex-wrap items-center gap-x-4">
            <button onClick={() => setBewerk(i)} className="min-h-10 text-[13px] font-extrabold text-[#3F5747]">{t("common.bewerken")}</button>
          </div>) : null}
      </li>);
    };
    const snelHint = snel.trim() && gekozenKind && gekozenKind !== "alle" ? maatHint(snel, kinderen.find((k) => k.id === gekozenKind)) : null;
    return (<AppShell>
      <div className="flex items-center justify-between gap-3">
        <h1 className="lora min-w-0 text-[32px] leading-tight">{t("routes.boodschappen.titel")}</h1>
        <button type="button" aria-label={t("routes.boodschappen.toevoegenLabel")} onClick={() => setNieuw(!nieuw)} className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-2xl leading-none text-primary-foreground"><Plus aria-hidden="true" strokeWidth={2.25} className="size-5"/></button>
      </div>
      <KostenTabs actief="nognodig"/>

      {kinderen.length > 1 ? <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => setVoor("samen")} aria-pressed={voor === "samen"} className={`h-9 rounded-full px-4 text-sm font-extrabold ${voor === "samen" ? "bg-brand text-primary-foreground" : "border border-white/95 bg-white/75"}`}>{t("routes.boodschappen.samen")}</button>
        {kinderen.map((k) => (<button key={k.id} onClick={() => setVoor(k.id)} aria-pressed={voor === k.id} className={`flex h-9 items-center gap-1.5 rounded-full pl-1 pr-3.5 text-sm font-black ${voor === k.id ? "border-2 border-brand bg-white" : "bg-white/60"}`}>
            <span className="grid size-7 place-items-center rounded-full text-xs font-black text-white" style={{ background: k.kleur }}>{k.naam[0]}</span>{k.naam}
          </button>))}
      </div> : null}
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); snelToevoegen(); }}>
        <input value={snel} onChange={(e) => setSnel(e.target.value)} placeholder={t("routes.boodschappen.watNodig")} aria-label={t("routes.boodschappen.watNodig")} className="h-11 min-w-0 flex-1 rounded-2xl border border-[#E6DED2] bg-card px-4 text-[15px] outline-none"/>
        <button type="submit" disabled={!snel.trim() || !gekozenKind} className="h-11 shrink-0 rounded-full bg-brand px-4 text-sm font-black text-primary-foreground disabled:opacity-40">{t("common.toevoegen")}</button>
      </form>
      {snel.trim() && kindOpties.length > 1 ? (<div className="mt-2 flex flex-wrap items-center gap-2 px-1">
          <span className="text-[13px] font-bold text-ink-soft">{t("routes.boodschappen.voorWie")}</span>
          {kindOpties.map((k) => (<button key={k.waarde} type="button" onClick={() => setSnelKind(k.waarde)} aria-pressed={gekozenKind === k.waarde} className={`h-9 rounded-full px-3.5 text-[13px] font-extrabold ${gekozenKind === k.waarde ? "bg-brand text-primary-foreground" : "border border-[#E6DED2] bg-white"}`}>{k.label}</button>))}
        </div>) : null}
      {snel.trim() && gekozenKind ? <DelenKeuze className="mt-2 px-1" kindIds={idsVan(gekozenKind)} gedeeld={gedeeld} onGedeeld={setGedeeld} anderId={anderKeuze} onAnderId={setAnderKeuze}/> : null}
      {snelHint ? (<p className="mt-1.5 flex items-center gap-1 px-1 text-[12.5px] font-bold text-[#6E5014]"><AppIcon functie="maten" maat="sm" vorm="kaal"/>{snelHint}</p>) : null}

      {nieuw ? (<Card className="mt-4 space-y-2">
          <input value={tekst} onChange={(e) => setTekst(e.target.value)} placeholder={t("routes.boodschappen.placeholder")} aria-label={t("routes.boodschappen.watNodig")} className={`w-full ${veld}`}/>
          <div className="flex gap-2">
            <select value={wie} onChange={(e) => setWie(e.target.value)} aria-label={t("routes.boodschappen.soortLabel")} className={`min-w-0 flex-1 ${veld}`}><option value="Nodig">{t("routes.boodschappen.soort.nodig")}</option><option value="Boodschap">{t("routes.boodschappen.soort.boodschap")}</option></select>
            {kindOpties.length ? <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label={t("routes.boodschappen.voorWieLabel")} className={`min-w-0 flex-1 ${veld}`}>{kindOpties.map((k) => <option key={k.waarde} value={k.waarde}>{k.label}</option>)}</select> : null}
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={alGekocht} onChange={(e) => setAlGekocht(e.target.checked)}/>{t("routes.boodschappen.alGekocht")}</label>
          <DelenKeuze kindIds={idsVan(kind || kindOpties[0]?.waarde)} gedeeld={gedeeld} onGedeeld={setGedeeld} anderId={anderKeuze} onAnderId={setAnderKeuze}/>
          <button onClick={async () => { if (tekst.trim()) {
            const ids = idsVan(kind || kindOpties[0]?.waarde);
            const delen = deelCheck(g, ids, gedeeld, anderKeuze);
            if (!delen.ok)
                return;
            const klaar = alGekocht;
            const invoer = tekst.trim();
            setAlGekocht(false);
            setTekst("");
            setNieuw(false);
            const id = await data.voegToe(invoer, wie, ids, klaar, undefined, delen);
            if (id)
                bevestig(t("routes.boodschappen.opDeLijst"), { uitleg: invoer });
            if (id && klaar)
                setVraag(id);
        } }} disabled={!tekst.trim() || !deelCheck(g, idsVan(kind || kindOpties[0]?.waarde), gedeeld, anderKeuze).ok} className="min-h-11 w-full rounded-full bg-brand text-sm font-semibold text-primary-foreground disabled:opacity-40">{t("common.toevoegen")}</button>
        </Card>) : null}

      {vraagItem ? (<Card className="mt-4">
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 text-sm font-semibold">{inKosten(tekstVan(vraagItem)) ? t("routes.boodschappen.staatAlBijKosten", { tekst: tekstVan(vraagItem) }) : t("routes.boodschappen.ookToevoegen")}</p>
            <button onClick={() => setVraag(null)} aria-label={t("common.sluiten")} className="knop-kruis -mr-2 -mt-2 size-11"><Kruis className="size-5"/></button>
          </div>
          {inKosten(tekstVan(vraagItem)) ? null : (<>
              <p className="mt-1 text-sm text-ink-soft">{t("routes.boodschappen.bedragOfBon")}</p>
              <div className="mt-3 flex flex-col gap-2">
                <Link to="/kosten" search={{ uitgave: tekstVan(vraagItem), kind: kindNaamVan(vraagItem) }} className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-brand px-4 text-sm font-semibold text-primary-foreground">{t("routes.boodschappen.toevoegenAanKosten")}</Link>
                <button onClick={() => setVraag(null)} className="min-h-11 w-full rounded-full border border-border bg-card px-4 text-sm font-semibold text-ink-soft">{t("routes.boodschappen.neeAlleenGekocht")}</button>
              </div>
            </>)}
        </Card>) : null}

      <section className="mt-5">
        <h2 className="px-1 text-[13px] font-black uppercase tracking-[0.08em] text-ink-soft">{t("routes.boodschappen.opDeLijstKop")}{zichtbaarOpen.length ? <span className="ml-1.5 text-xs">· {zichtbaarOpen.length}</span> : null}</h2>
        {zichtbaarOpen.length ? <ul className="mt-2 divide-y divide-[#E9E1D5] rounded-[22px] border border-white/85 bg-white/60">{zichtbaarOpen.map(rij)}</ul> : data.fout ? <LaadFout onOpnieuw={laadNogNodig}/> : <p className="mt-2 rounded-xl bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)] px-3 py-3 text-center text-sm text-ink-soft">{data.geladen ? t("routes.boodschappen.nietsNodig") : t("routes.boodschappen.laden")}</p>}
      </section>

      {zichtbaarGekocht.length ? (<section className="mt-4 rounded-[22px] border border-white/85 bg-white/60">
          <button onClick={() => setGekochtOpen(!gekochtOpen)} aria-expanded={gekochtOpen} className="flex min-h-12 w-full items-center px-4 py-3 text-left">
            <span className="min-w-0 flex-1 text-[15.5px] font-black">{t("routes.boodschappen.gekocht")}<span className="ml-1.5 text-xs text-ink-soft">· {zichtbaarGekocht.length}</span></span>
            <Chevron richting="omlaag" open={gekochtOpen} className="size-4 shrink-0 text-ink-soft"/>
          </button>
          {gekochtOpen ? <ul className="divide-y divide-[#E9E1D5] border-t border-[#E9E1D5]">{zichtbaarGekocht.map(rij)}</ul> : null}
        </section>) : null}
      <p className="mt-3 px-2 text-center text-xs text-ink-soft">{t("routes.boodschappen.afgevinkt")}</p>
      <ItemBewerken item={bewerk} kindOpties={kindOpties} onSluit={() => setBewerk(null)} data={data}/>
    </AppShell>);
}
/** Een item wijzigen (naam, soort, kind, datum, "Alleen jij" / "Gedeeld") of verwijderen. */
function ItemBewerken({ item, kindOpties, onSluit, data }) {
    const { t } = useTranslation();
    const g = useGezin();
    const [voor, setVoor] = useState(null);
    const [tekst, setTekst] = useState("");
    const [wie, setWie] = useState("Nodig");
    const [kind, setKind] = useState("");
    const [deadline, setDeadline] = useState("");
    const [gedeeld, setGedeeld] = useState(false);
    const [ander, setAnder] = useState("");
    const [bezig, setBezig] = useState(false);
    const [weg, setWeg] = useState(false);
    const waardeVan = (ids) => kindOpties.find((k) => k.ids.length === ids.length && k.ids.every((x) => ids.includes(x)))?.waarde ?? "";
    // Velden vullen zodra een (ander) item geopend wordt.
    if (item && voor !== item.id) {
        setVoor(item.id);
        setTekst(item.tekst);
        setWie(item.wie === "Boodschap" ? "Boodschap" : "Nodig");
        setKind(waardeVan(item.kindIds));
        setDeadline(/^\d{4}-\d{2}-\d{2}$/.test(item.deadline ?? "") ? item.deadline : "");
        setGedeeld(!!item.gedeeld);
        setAnder(item.anderId ?? "");
        setWeg(false);
    }
    const ids = kindOpties.find((k) => k.waarde === kind)?.ids ?? item?.kindIds ?? [];
    const eigen = !!item?.vanMij;
    const delen = deelCheck(g, ids, gedeeld, ander);
    const geldig = !!tekst.trim() && (!eigen || delen.ok) && !bezig;
    const opslaan = async () => {
        if (!item || !geldig)
            return;
        setBezig(true);
        // Een oude vrije-tekstdatum blijft staan zolang er geen nieuwe datum gekozen is.
        const datumGewijzigd = deadline ? deadline !== item.deadline : !!item.deadline && /^\d{4}-\d{2}-\d{2}$/.test(item.deadline);
        const gelukt = await data.wijzig(item.id, { tekst: tekst.trim(), wie, ...(datumGewijzigd ? { deadline } : {}), ...(eigen ? { kindIds: ids, gedeeld: delen.gedeeld, anderId: delen.anderId } : {}) });
        setBezig(false);
        if (gelukt) {
            bevestig(t("routes.boodschappen.bewerk.opgeslagen"));
            onSluit();
        }
    };
    const verwijder = async () => {
        if (!item)
            return;
        setWeg(false);
        onSluit();
        if (await data.verwijder(item.id))
            bevestig(t("routes.boodschappen.bewerk.verwijderd"), { uitleg: item.tekst });
    };
    return (<Sheet open={!!item} onOpenChange={(o) => !o && onSluit()}>
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto">
        {item ? (<>
            <SheetHeader className="text-left">
              <SheetTitle className="lora text-[24px] leading-tight">{t("routes.boodschappen.bewerk.titel")}</SheetTitle>
              <SheetDescription>{item.tekst}</SheetDescription>
            </SheetHeader>
            <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); opslaan(); }}>
              <input value={tekst} maxLength={200} onChange={(e) => setTekst(e.target.value)} aria-label={t("routes.boodschappen.watNodig")} className={`w-full ${veld}`}/>
              <div className="flex gap-2">
                <select value={wie} onChange={(e) => setWie(e.target.value)} aria-label={t("routes.boodschappen.soortLabel")} className={`min-w-0 flex-1 ${veld}`}><option value="Nodig">{t("routes.boodschappen.soort.nodig")}</option><option value="Boodschap">{t("routes.boodschappen.soort.boodschap")}</option></select>
                {eigen && kindOpties.length ? <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label={t("routes.boodschappen.voorWieLabel")} className={`min-w-0 flex-1 ${veld}`}>{kind === "" ? <option value="">{t("routes.boodschappen.bewerk.huidige")}</option> : null}{kindOpties.map((k) => <option key={k.waarde} value={k.waarde}>{k.label}</option>)}</select> : null}
              </div>
              <label className="block text-xs font-semibold">{t("routes.boodschappen.bewerk.voorDatum")}<input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={`mt-1 w-full font-normal ${veld}`}/></label>
              {eigen ? <DelenKeuze kindIds={ids} gedeeld={gedeeld} onGedeeld={setGedeeld} anderId={ander} onAnderId={setAnder}/> : <DeelLabel gedeeld/>}
              <div className="voet-vast-sheet6 space-y-2">
                <button type="submit" disabled={!geldig} className="min-h-11 w-full rounded-full bg-brand text-sm font-semibold text-primary-foreground disabled:opacity-40">{t("common.opslaan")}</button>
                <button type="button" onClick={() => setWeg(true)} className="min-h-11 w-full text-sm font-semibold text-ink-soft">{t("common.verwijderen")}</button>
              </div>
            </form>
          </>) : null}
      </SheetContent>
      <VerwijderDialoog open={weg} onOpenChange={setWeg} titel={t("routes.boodschappen.bewerk.verwijderTitel")} tekst={item?.gedeeld || !item?.vanMij ? t("routes.boodschappen.bewerk.verwijderTekstGedeeld") : t("routes.boodschappen.bewerk.verwijderTekst")} onBevestig={verwijder}/>
    </Sheet>);
}
/** Korte maat voor in de lijst: "maat 30" of "kledingmaat 122". */
function maatKort(tekst, kind) {
    const m = maatInfo(tekst, kind);
    return m ? i18n.t(`routes.boodschappen.maat.kort.${m.soort}`, { maat: m.maat }) : null;
}
/** "Noah heeft maat 30": alleen bij herkenbare woorden, uit de maten in het kindprofiel. Nooit verzonnen. */
function maatHint(tekst, kind) {
    const m = maatInfo(tekst, kind);
    return m ? i18n.t(`routes.boodschappen.maat.hint.${m.soort}`, { kind: kind.naam, maat: m.maat }) : null;
}
/** Herkent Nederlandse én Engelse woorden; maten komen uit het eigen kindprofiel (praktisch). */
function maatInfo(tekst, kind) {
    const p = kind?.profiel?.praktisch ?? {};
    const m = { schoen: p.schoenmaat, kleding: p.kledingmaat };
    if (!kind || (!m.schoen && !m.kleding))
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
