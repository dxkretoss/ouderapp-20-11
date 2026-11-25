import { createFileRoute, Link } from "@tanstack/react-router";
import { useGezin } from "@/lib/gezin";
import { z } from "zod";
import { Annoyed, BellOff, Bookmark, BookmarkCheck, Check, Clock, Frown, Heart, ImageIcon, Meh, Repeat, Smile } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import i18n, { taalLocale, tLijst } from "@/i18n";
import { AppShell, BackButton, TerugKnop } from "@/components/AppShell";
import { useStart } from "@/lib/start-store";
import { leeftijdGroep, zegPerKind } from "@/lib/lastige-momenten-kind";
import { Zichtbaar } from "@/components/Zichtbaar";
import { AppIcon } from "@/components/AppIcon";
import { gevoelens, metKind, momenten, onderwerpKleur, onderwerpen, zoekMomenten } from "@/lib/lastige-momenten";
import { Chevron, Kruis, MetChevron, MetVinkje } from "@/components/Tekens";
import { persoonlijkBron, persoonlijkState, usePersoonlijk, vanSoort, verwijderPersoonlijk, voegPersoonlijkToe } from "@/lib/persoonlijk-store";
import { useVoorkeuren, zetVoorkeur } from "@/lib/voorkeuren-store";
import { laadWeergave } from "@/components/Laden";
/*
 * Lastige momenten (stijl A6). Vaste tekst uit src/lib/lastige-momenten.ts, geen AI op deze pagina.
 * Mijn houvast (zinnen en bewaarde momenten) en de wissel-log staan privé op de server (manage-personal):
 * alleen voor jou, nooit gedeeld. "Schrijf het van je af" wordt nergens bewaard. Kleine keuzes
 * (hulp bij elke wissel, berichtenpauze) zijn voorkeuren van je account.
 */
export const Route = createFileRoute("/lastige-momenten")({
    head: () => ({
        meta: [
            { title: i18n.t("common.metaTitel", { titel: i18n.t("routes.lastigeMomenten.meta.titel") }) },
            { name: "description", content: i18n.t("routes.lastigeMomenten.meta.beschrijving") },
        ],
    }),
    validateSearch: z.object({ start: z.enum(["adem", "stoppen", "komt", "na", "pauze", "maand", "gesprek", "fijn", "houvast", "afschrijven"]).optional() }),
    component: LastigeMomenten,
});
/** Oude, alleen-lokale gegevens (vóór de serveropslag): één keer overzetten en dan van dit apparaat wissen. */
const OUD_HOUVAST = "lastige-momenten-houvast-v1";
const OUD_LOG = "lastige-momenten-log-v1";
const OUD_HULP = "lastige-momenten-wisselhulp-v1";
const OUD_PAUZE = "berichten-pauze-tot-v1";
let overgezet = false;
async function zetOudeGegevensOver() {
    if (overgezet || typeof window === "undefined")
        return;
    overgezet = true;
    try {
        const h = JSON.parse(localStorage.getItem(OUD_HOUVAST) ?? "null");
        const log = JSON.parse(localStorage.getItem(OUD_LOG) ?? "null");
        const hulp = localStorage.getItem(OUD_HULP);
        const pauze = localStorage.getItem(OUD_PAUZE);
        const nu = persoonlijkState();
        const zinnen = new Set(vanSoort(nu, "houvast_zin").map((x) => x.data.tekst));
        const momentjes = new Set(vanSoort(nu, "houvast_moment").map((x) => x.data.moment));
        const logs = new Set(vanSoort(nu, "wissel_log").map((x) => `${x.data.datum}|${x.data.gevoel}`));
        let gelukt = true;
        const doe = async (soort, data) => { if (!(await voegPersoonlijkToe(soort, data)))
            gelukt = false; };
        for (const z of (Array.isArray(h?.zinnen) ? h.zinnen : []).filter((z) => typeof z === "string" && z.trim() && !zinnen.has(z.trim())).slice(0, 50))
            await doe("houvast_zin", { tekst: z.trim().slice(0, 500) });
        for (const id of (Array.isArray(h?.bewaard) ? h.bewaard : []).filter((x) => Number.isInteger(x) && !momentjes.has(x)).slice(0, 100))
            await doe("houvast_moment", { moment: id });
        for (const l of (Array.isArray(log) ? log : []).slice(-60))
            if (l && typeof l.datum === "string" && typeof l.gevoel === "string" && !logs.has(`${l.datum.slice(0, 10)}|${l.gevoel}`))
                await doe("wissel_log", { datum: l.datum.slice(0, 10), gevoel: l.gevoel, hielp: Array.isArray(l.hielp) ? l.hielp : [] });
        if (hulp === "1")
            zetVoorkeur("wisselHulp", true);
        if (pauze && Date.parse(pauze) > Date.now())
            zetVoorkeur("berichtenPauzeTot", new Date(pauze).toISOString());
        // Alleen wissen als alles op de server staat; anders de volgende keer opnieuw proberen.
        if (gelukt)
            [OUD_HOUVAST, OUD_LOG, OUD_HULP, OUD_PAUZE].forEach((k) => localStorage.removeItem(k));
        else
            overgezet = false;
    }
    catch { /* geen (geldige) oude gegevens */ }
}
/** Mijn houvast uit de privé-opslag: { bewaard: [moment-id], zinnen: [tekst], zinItems: [item] }. */
function houvastUit(s) {
    const zinItems = vanSoort(s, "houvast_zin");
    return { bewaard: vanSoort(s, "houvast_moment").map((x) => x.data.moment), zinnen: zinItems.map((x) => x.data.tekst), zinItems };
}
const voegZin = (tekst) => { const z = tekst.trim().slice(0, 500); if (z)
    void voegPersoonlijkToe("houvast_zin", { tekst: z }); };
const GLAS = "rounded-[18px] border border-white/85 bg-white/60";
const HL = { background: "linear-gradient(135deg, rgba(220,230,210,.95), rgba(233,239,227,.9))" };
function LastigeMomenten() {
    const { t } = useTranslation();
    const st = useStart();
    const namen = st.kinderen.map((k) => k.naam);
    const kleur = st.kinderen[0]?.kleur ?? "#C77D8C";
    const jarenUit = (geb) => { if (!geb || !/^\d{4}-\d{2}-\d{2}/.test(geb))
        return null; const g = new Date(geb), n = new Date(); return n.getFullYear() - g.getFullYear() - (n < new Date(n.getFullYear(), g.getMonth(), g.getDate()) ? 1 : 0); };
    const kinderenInfo = st.kinderen.map((k) => ({ naam: k.naam, kleur: k.kleur ?? "#8A7E72", jaren: jarenUit(k.geboortedatum) }));
    const ouder = st.naam;
    const { start } = Route.useSearch();
    const [stapel, setStapel] = useState(start ? [{ s: "start" }, { s: start }] : [{ s: "start" }]);
    const scherm = stapel[stapel.length - 1];
    const ps = usePersoonlijk();
    const laadStatus = persoonlijkBron.useStatus();
    const houvast = useMemo(() => houvastUit(ps), [ps]);
    useEffect(() => { if (laadStatus === "klaar")
        void zetOudeGegevensOver(); }, [laadStatus]);
    const ga = (n) => { setStapel((s) => [...s, n]); if (typeof window !== "undefined")
        window.scrollTo({ top: 0 }); };
    const terug = () => setStapel((s) => (s.length > 1 ? s.slice(0, -1) : s));
    const bewaar = (id) => {
        const al = vanSoort(ps, "houvast_moment").find((x) => x.data.moment === id);
        if (al)
            void verwijderPersoonlijk(al.id);
        else
            void voegPersoonlijkToe("houvast_moment", { moment: id });
    };
    if (scherm.s === "adem")
        return <Ademen kleur={kleur} terug={terug}/>;
    return (<AppShell>
      <div className="flex items-center gap-3">
        {stapel.length > 1 ? <TerugKnop onClick={terug}/> : <BackButton terug="/verhaal"/>}
        <p className="min-w-0 flex-1 text-sm font-semibold text-ink-soft">{t("routes.lastigeMomenten.kop")}</p>
      </div>
      {scherm.s === "start" && <Start ouder={ouder} ga={ga} aantalHouvast={houvast.bewaard.length + houvast.zinnen.length}/>}
      {scherm.s === "alles" && <Alles ga={ga}/>}
      {scherm.s === "onderwerp" && <OnderwerpLijst i={scherm.i} ga={ga} bewaard={houvast.bewaard}/>}
      {scherm.s === "gevoel" && <GevoelLijst g={scherm.g} ga={ga}/>}
      {scherm.s === "moment" && <MomentPagina m={momenten.find((x) => x.id === scherm.id)} namen={namen} ga={ga} bewaard={houvast.bewaard.includes(scherm.id)} bewaar={() => bewaar(scherm.id)}/>}
      {scherm.s === "nu" && <SnelleTips m={momenten.find((x) => x.id === scherm.id)} namen={namen} kleur={kleur} kinderenInfo={kinderenInfo} ga={ga}/>}
      {scherm.s === "stoppen" && <EvenStoppen ga={ga} terug={terug}/>}
      {scherm.s === "houvast" && (laadWeergave(laadStatus, persoonlijkBron.ververs) ?? <MijnHouvast houvast={houvast} ga={ga}/>)}
      {scherm.s === "afschrijven" && <Afschrijven ga={ga}/>}
      {scherm.s === "komt" && <HetKomtEraan houvast={houvast} ga={ga}/>}
      {scherm.s === "na" && <HoeGingDeWissel ouder={ouder} log={vanSoort(ps, "wissel_log")} ga={ga}/>}
      {scherm.s === "pauze" && <EvenPauze terug={terug}/>}
      {scherm.s === "maand" && (laadWeergave(laadStatus, persoonlijkBron.ververs) ?? <JouwMaand houvast={houvast} log={vanSoort(ps, "wissel_log")}/>)}
      {scherm.s === "gesprek" && <GesprekVoorbereiden />}
      {scherm.s === "fijn" && <IetsFijns />}
      {scherm.s === "verder" && <MeerHulp ga={ga}/>}
    </AppShell>);
}
function Lora({ children, className = "" }) {
    return <h1 className={`lora leading-tight ${className}`}>{children}</h1>;
}
function Sectie({ children }) {
    return <p className="mt-6 mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-ink-soft">{children}</p>;
}
function AdemKnop({ maat = 56, onClick, label = true }) {
    const { t } = useTranslation();
    return (<button onClick={onClick} aria-label={t("routes.lastigeMomenten.adem.metMeMee")} className="flex shrink-0 flex-col items-center gap-1">
      <span className="grid place-items-center rounded-full" style={{ width: maat, height: maat, background: "radial-gradient(circle, #fff 0 30%, #E3ECDD 31% 55%, #C9D8C3 56% 100%)", boxShadow: "0 0 0 5px rgba(201,216,195,.45), 0 6px 16px rgba(63,87,71,.18)" }}>
        <svg width={maat * 0.46} height={maat * 0.46} viewBox="0 0 24 24" fill="none" stroke="#3F5747" strokeWidth="2.2" aria-hidden><circle cx="12" cy="12" r="2.6"/><circle cx="12" cy="12" r="6.2" opacity=".65"/><circle cx="12" cy="12" r="9.8" opacity=".35"/></svg>
      </span>
      {label ? <span className="text-[11.5px] font-extrabold text-[#3F5747]">{t("routes.lastigeMomenten.adem.label")}</span> : null}
    </button>);
}
function GrootKnop({ titel, sub, tegel, icoonKleur, uitgelicht = false, onClick, icoon }) {
    return (<button onClick={onClick} className={`flex w-full items-center gap-3.5 rounded-3xl p-3.5 text-left ${uitgelicht ? "border-2 border-[#A9BCA8]" : "border border-white/85 bg-white/60"}`} style={uitgelicht ? HL : undefined}>
      <span className="grid size-[52px] shrink-0 place-items-center rounded-2xl" style={{ background: tegel, color: icoonKleur }}>{icoon}</span>
      <span className="min-w-0 flex-1"><span className="block text-lg font-black">{titel}</span><span className="block text-sm leading-snug text-ink-soft">{sub}</span></span>
      <Chevron className="size-5 text-brand"/>
    </button>);
}
function Start({ ouder, ga, aantalHouvast }) {
    const { t } = useTranslation();
    const [zoek, setZoek] = useState("");
    const gevonden = useMemo(() => zoekMomenten(zoek), [zoek]);
    return (<div>
      <Lora className="mt-5 text-[27px]">{t("routes.lastigeMomenten.start.vraag", { ouder })}</Lora>
      <Zichtbaar voor="jij" className="mt-1"/>
      <label className="mt-3 flex items-center gap-2 rounded-full bg-white px-4 shadow-[0_4px_14px_rgba(60,50,40,.06)]">
        <AppIcon functie="co" maat="sm"/>
        <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder={t("routes.lastigeMomenten.start.zoekPlaceholder")} aria-label={t("routes.lastigeMomenten.start.zoekAria")} className="h-[50px] min-w-0 flex-1 bg-transparent text-[15px] font-semibold outline-none placeholder:text-ink-soft"/>
      </label>
      {zoek.trim().length >= 2 ? (<div className="mt-3 space-y-2">
          {gevonden.length ? gevonden.map((m) => (<button key={m.id} onClick={() => ga({ s: "nu", id: m.id })} className={`${GLAS} block w-full px-4 py-3 text-left text-[15px] font-bold`}>{m.tekst.vraag}</button>)) : <p className={`${GLAS} px-4 py-3 text-sm`}>{t("routes.lastigeMomenten.start.geenTips")} <Link to="/verhaal" className="font-bold text-brand">{t("routes.lastigeMomenten.co.praatMetCo")}</Link></p>}
        </div>) : null}
      <div className="mt-4 space-y-2.5">
        <GrootKnop titel={t("routes.lastigeMomenten.start.nu.titel")} sub={t("routes.lastigeMomenten.start.nu.sub")} tegel="#C9D8C3" icoonKleur="#2F4A3A" uitgelicht onClick={() => ga({ s: "stoppen" })} icoon={<svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><circle cx="12" cy="12" r="2.6"/><circle cx="12" cy="12" r="6.2" opacity=".65"/><circle cx="12" cy="12" r="9.8" opacity=".35"/></svg>}/>
        <GrootKnop titel={t("routes.lastigeMomenten.start.komt.titel")} sub={t("routes.lastigeMomenten.start.komt.sub")} tegel="#EFE1C9" icoonKleur="#6E5014" onClick={() => ga({ s: "komt" })} icoon={<Clock className="size-6" strokeWidth={2.2} aria-hidden/>}/>
        <GrootKnop titel={t("routes.lastigeMomenten.start.na.titel")} sub={t("routes.lastigeMomenten.start.na.sub")} tegel="#EBD9CC" icoonKleur="#6E3A24" onClick={() => ga({ s: "na" })} icoon={<Heart className="size-6" strokeWidth={2.2} aria-hidden/>}/>
      </div>
      <Sectie>{t("routes.lastigeMomenten.start.gevoel")}</Sectie>
      <div className="flex flex-wrap gap-2">
        {gevoelens.map((g) => (<button key={g.id} onClick={() => ga(g.id === "boos" ? { s: "stoppen" } : { s: "gevoel", g: g.id })} className={`${GLAS} h-10 rounded-full px-3.5 text-sm font-extrabold`}>{g.label}</button>))}
      </div>
      <button onClick={() => ga({ s: "houvast" })} className={`${GLAS} mt-4 flex w-full items-center gap-3 px-3.5 py-3 text-left`}>
        <span className="grid size-10 place-items-center rounded-xl bg-[#EFE7DC] text-[#3F5747]" aria-hidden><Bookmark className="size-5" strokeWidth={2}/></span>
        <span className="min-w-0 flex-1"><span className="block text-[15.5px] font-black">{t("routes.lastigeMomenten.houvast.titel")}</span><span className="block text-[13px] text-ink-soft">{t("routes.lastigeMomenten.start.houvastSub", { n: aantalHouvast })}</span></span>
        <Chevron className="size-4 text-ink-soft"/>
      </button>
      <div className="mt-3 flex flex-wrap justify-between gap-2 text-sm font-extrabold text-brand">
        <button onClick={() => ga({ s: "alles" })}>{t("routes.lastigeMomenten.start.alles")}</button>
        <button onClick={() => ga({ s: "verder" })}>{t("routes.lastigeMomenten.start.meerHulp")}</button>
        <Link to="/kind-tips">{t("routes.lastigeMomenten.start.kindTips")}</Link>
      </div>
      <Hulpregel />
    </div>);
}
function Alles({ ga }) {
    const { t } = useTranslation();
    return (<div>
      <h1 className="lora mt-4 text-[30px] leading-tight">{t("routes.lastigeMomenten.alles.titel")}</h1>
      <div className={`${GLAS} mt-4 px-3.5 py-1`}>
        {onderwerpen.map((o, i) => (<button key={o.sleutel} onClick={() => ga({ s: "onderwerp", i })} className="flex w-full items-center gap-3 border-b border-[#E9E1D5] py-2.5 text-left last:border-0">
            <span className="size-10 shrink-0 rounded-xl" style={{ background: onderwerpKleur[i][0] }} aria-hidden/>
            <span className="min-w-0 flex-1"><span className="block text-[15.5px] font-black">{o.titel}</span><span className="block truncate text-[13px] text-ink-soft">{o.sub}</span></span>
            <span className="text-[13.5px] font-extrabold text-ink-soft">{momenten.filter((m) => m.onderwerp === i).length}</span>
          </button>))}
      </div>
      <Hulpregel />
    </div>);
}
function OnderwerpLijst({ i, ga, bewaard }) {
    const { t } = useTranslation();
    const o = onderwerpen[i];
    const lijst = momenten.filter((m) => m.onderwerp === i);
    return (<div>
      <h1 className="lora mt-4 text-[30px] leading-tight">{o.titel}</h1>
      <p className="text-sm text-ink-soft">{t("routes.lastigeMomenten.onderwerp.aantal", { count: lijst.length, sub: o.sub })}</p>
      <div className={`${GLAS} mt-4 px-4 py-1`}>
        {lijst.map((m) => (<button key={m.id} onClick={() => ga({ s: "moment", id: m.id })} className="flex w-full items-center gap-2 border-b border-[#E9E1D5] py-3 text-left text-[15.5px] font-bold last:border-0">
            <span className="min-w-0 flex-1">{m.tekst.vraag}</span>{bewaard.includes(m.id) ? <span role="img" aria-label={t("routes.lastigeMomenten.onderwerp.bewaard")} className="text-[#3F5747]"><BookmarkCheck aria-hidden className="size-4" strokeWidth={2}/></span> : null}<Chevron className="size-4 text-ink-soft"/>
          </button>))}
      </div>
    </div>);
}
function GevoelLijst({ g, ga }) {
    const { t } = useTranslation();
    const naam = gevoelens.find((x) => x.id === g).label.toLowerCase();
    const lijst = momenten.filter((m) => m.gevoelens.includes(g));
    return (<div>
      <Lora className="mt-5 text-[25px]">{t("routes.lastigeMomenten.gevoel.titel", { naam })}</Lora>
      <p className="mt-1 text-sm text-ink-soft">{t("routes.lastigeMomenten.gevoel.sub")}</p>
      <div className="mt-4 space-y-2">
        {lijst.map((m) => <button key={m.id} onClick={() => ga({ s: "nu", id: m.id })} className={`${GLAS} block w-full px-4 py-3 text-left text-[15px] font-bold`}>{m.tekst.vraag}</button>)}
      </div>
    </div>);
}
function KindBlok({ tekst, klein = false }) {
    const { t } = useTranslation();
    return (<div className="mt-4 rounded-[22px] border border-white/85 p-4" style={{ background: "linear-gradient(135deg, rgba(243,225,228,.88), rgba(239,225,201,.82))" }}>
      <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#7A3B48]">{t("routes.lastigeMomenten.kindBlok")}</p>
      <p className={`lora mt-2 leading-snug text-[#4A2E33] ${klein ? "text-[17px]" : "text-[19px]"}`}>{tekst}</p>
    </div>);
}
function MomentPagina({ m, namen, ga, bewaard, bewaar }) {
    const { t } = useTranslation();
    const tk = m.tekst;
    const zus = momenten.filter((x) => x.onderwerp === m.onderwerp);
    const plek = zus.findIndex((x) => x.id === m.id);
    const volgende = zus[plek + 1];
    const [tegel, ink] = onderwerpKleur[m.onderwerp];
    return (<div className="pb-24">
      <p className="mt-4 flex items-center gap-2"><span className="rounded-full px-2.5 py-1 text-[13px] font-black" style={{ background: tegel, color: ink }}>{onderwerpen[m.onderwerp].titel}</span><span className="text-[13px] font-extrabold text-ink-soft">{t("routes.lastigeMomenten.moment.plek", { n: plek + 1, totaal: zus.length })}</span></p>
      <h1 className="mt-3 font-display text-[24px] font-black leading-tight">{tk.vraag}</h1>
      <p className="mt-3 border-l-[3px] border-[#A9BCA8] pl-3.5 text-base leading-relaxed">{tk.kort}</p>
      <Sectie>{t("routes.lastigeMomenten.moment.doen")}</Sectie>
      <ol className={`${GLAS} space-y-2 px-4 py-3`}>
        {tk.doen.map((d, i) => <li key={d} className="flex gap-3 text-[15px] leading-snug"><span className="grid size-[26px] shrink-0 place-items-center rounded-full bg-[#DCE3D3] text-[13px] font-black text-[#3F5747]">{i + 1}</span><span className="pt-0.5">{d}</span></li>)}
      </ol>
      <Sectie>{t("routes.lastigeMomenten.moment.zeg")}</Sectie>
      <div className="space-y-2">{tk.zeg.map((z) => <p key={z} className="rounded-[18px_18px_18px_6px] bg-[#DCE6D2] px-3.5 py-2.5 text-[15px] font-bold text-[#2F4A3A]">{z}</p>)}</div>
      {tk.liever.length ? <><Sectie>{t("routes.lastigeMomenten.moment.liever")}</Sectie><div className="space-y-1.5">{tk.liever.map((z) => <p key={z} className="flex gap-2 rounded-2xl bg-[rgba(234,219,199,.6)] px-3.5 py-2.5 text-[14.5px] text-[#5A4636]"><Kruis className="mt-[3px] size-4"/>{z}</p>)}</div></> : null}
      <KindBlok tekst={metKind(tk.kind, namen)}/>
      <div className="mt-3 rounded-[22px] border border-white/85 p-4" style={{ background: "linear-gradient(135deg, rgba(234,219,199,.85), rgba(243,237,227,.85))" }}>
        <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#7A5E44]">{t("routes.lastigeMomenten.moment.onthoud")}</p>
        <p className="mt-1.5 text-base font-extrabold leading-snug">{tk.onthoud}</p>
      </div>
      {volgende ? (<button onClick={() => ga({ s: "moment", id: volgende.id })} className={`${GLAS} mt-4 block w-full px-4 py-3 text-left`}>
          <span className="block text-xs font-extrabold uppercase tracking-[0.08em] text-ink-soft">{t("routes.lastigeMomenten.moment.volgende")}</span>
          <span className="mt-1 block text-[15px] font-black">{volgende.tekst.vraag}</span>
        </button>) : null}
      {tk.hulp ? <div className={`${GLAS} mt-4 px-4 py-3`}><p className="text-[15px] font-black">{t("routes.lastigeMomenten.moment.hulp")}</p><p className="text-[14.5px] leading-snug">{tk.hulp}</p></div> : null}
      <Hulpregel />
      <div className="fixed bottom-24 left-1/2 z-10 flex w-[calc(100%-28px)] max-w-[420px] -translate-x-1/2 items-center gap-3 rounded-[26px] bg-[rgba(251,248,242,.95)] px-3 py-2.5 shadow-[0_8px_24px_rgba(60,50,40,.14)]">
        <AdemKnop maat={48} onClick={() => ga({ s: "adem" })}/>
        <Link to="/verhaal" search={{ moment: m.id }} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-brand text-[15px] font-black text-primary-foreground"><AppIcon functie="co" maat="sm" className="mr-1.5"/>{t("routes.lastigeMomenten.co.denkMee")}</Link>
        <button onClick={bewaar} className="flex flex-col items-center gap-1" aria-pressed={bewaard}>
          <span className={`grid size-12 place-items-center rounded-full ${bewaard ? "bg-[#DCE6D2]" : "bg-[#EFE7DC]"} text-[#3F5747]`} aria-hidden>{bewaard ? <BookmarkCheck className="size-5" strokeWidth={2}/> : <Bookmark className="size-5" strokeWidth={2}/>}</span>
          <span className="text-[11.5px] font-extrabold text-[#3F5747]">{bewaard ? t("routes.lastigeMomenten.moment.bewaard") : t("routes.lastigeMomenten.moment.bewaar")}</span>
        </button>
      </div>
    </div>);
}
function SnelleTips({ m, namen, kleur, kinderenInfo, ga }) {
    const { t } = useTranslation();
    const tk = m.tekst;
    const perKind = zegPerKind[m.id];
    const [voor, setVoor] = useState(kinderenInfo.length > 1 ? "samen" : kinderenInfo[0]?.naam ?? "samen");
    const gekozen = kinderenInfo.find((k) => k.naam === voor);
    const zin = perKind ? (voor === "samen" || !gekozen ? perKind.samen : perKind[leeftijdGroep(gekozen.jaren)]) : tk.zeg[0];
    return (<div>
      <span className="mt-4 inline-block rounded-full bg-[#C9D8C3] px-3 py-1 text-[12.5px] font-black tracking-wide text-[#2F4A3A]">{t("routes.lastigeMomenten.nu.badge")}</span>
      <h1 className="mt-3 font-display text-[24px] font-black leading-tight">{tk.vraag}</h1>
      <div className={`${GLAS} mt-4 px-4 py-3.5`}>
        <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-ink-soft">{t("routes.lastigeMomenten.nu.doen")}</p>
        <p className="mt-1.5 text-[21px] font-black leading-snug">{tk.doen[0]}</p>
      </div>
      {zin ? (<div className="mt-3 rounded-[22px] border border-white/80 bg-[rgba(220,230,210,.9)] px-4 py-3.5">
          <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#3F5747]">{t("routes.lastigeMomenten.nu.zeggen")}</p>
          {perKind && kinderenInfo.length ? (<div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={t("routes.lastigeMomenten.nu.tegenWie")}>
              {kinderenInfo.length > 1 ? (<button onClick={() => setVoor("samen")} aria-pressed={voor === "samen"} className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-black ${voor === "samen" ? "border-2 border-[#4F6B58] bg-white" : "bg-white/60"}`}>
                  <span className="flex" aria-hidden>{kinderenInfo.slice(0, 3).map((k, i) => <span key={k.naam} className="size-3.5 rounded-full border border-white" style={{ background: k.kleur, marginLeft: i ? -5 : 0 }}/>)}</span>{t("routes.lastigeMomenten.nu.samen")}
                </button>) : null}
              {kinderenInfo.map((k) => (<button key={k.naam} onClick={() => setVoor(k.naam)} aria-pressed={voor === k.naam} className={`inline-flex h-8 items-center gap-1.5 rounded-full pl-1 pr-3 text-[13px] font-black ${voor === k.naam ? "border-2 bg-white" : "bg-white/60"}`} style={voor === k.naam ? { borderColor: k.kleur } : undefined}>
                  <span className="grid size-6 place-items-center rounded-full text-[11px] text-white" style={{ background: k.kleur }}>{k.naam.slice(0, 1)}</span>{k.naam}{k.jaren != null ? ` ${k.jaren}` : ""}
                </button>))}
            </div>) : null}
          <p className="mt-2.5 text-[20px] font-extrabold leading-snug text-[#2F4A3A]">{perKind ? `“${zin}”` : zin}</p>
        </div>) : null}
      <p className="mt-3 flex gap-2.5"><Heart aria-hidden className="mt-1 size-4 shrink-0" style={{ color: kleur, fill: kleur }}/><span className="lora text-[17px] leading-snug text-[#4A2E33]">{metKind(tk.kindKort, namen)}</span></p>
      <div className="mt-8 flex flex-col items-center gap-2">
        <AdemKnop maat={84} label={false} onClick={() => ga({ s: "adem" })}/>
        <span className="text-[15px] font-black text-[#3F5747]">{t("routes.lastigeMomenten.adem.metMeMee")}</span>
      </div>
      <div className="mt-8 flex justify-between text-[15px] font-black text-brand">
        <button onClick={() => ga({ s: "moment", id: m.id })}>{t("routes.lastigeMomenten.nu.meerTips")}</button>
        <Link to="/verhaal"><AppIcon functie="co" maat="sm" className="mr-1.5"/>{t("routes.lastigeMomenten.co.praatMetCo")}</Link>
      </div>
    </div>);
}
function EvenStoppen({ ga, terug }) {
    const { t } = useTranslation();
    return (<div>
      <h1 className="lora mt-4 text-[30px] leading-tight">{t("routes.lastigeMomenten.stoppen.titel")}</h1>
      <p className="mt-3 text-[17px] leading-relaxed"><Trans i18nKey="routes.lastigeMomenten.stoppen.intro" components={{ b: <b /> }}/></p>
      <div onClick={() => ga({ s: "adem" })} className="mt-5 flex w-full cursor-pointer items-center gap-4 rounded-[26px] border border-white/85 p-4 text-left" style={HL}>
        <AdemKnop maat={72} label={false} onClick={(e) => { e?.stopPropagation?.(); ga({ s: "adem" }); }}/>
        <span><span className="block text-lg font-black">{t("routes.lastigeMomenten.stoppen.ademTitel")}</span><span className="text-sm text-[#3F5747]">{t("routes.lastigeMomenten.stoppen.ademSub")}</span></span>
      </div>
      <Sectie>{t("routes.lastigeMomenten.stoppen.daarna")}</Sectie>
      <div className={`${GLAS} space-y-2 px-4 py-3 text-base leading-snug`}>
        <p>· {t("routes.lastigeMomenten.stoppen.tip1")}</p>
        <p>· {t("routes.lastigeMomenten.stoppen.tip2")}</p>
      </div>
      <div className="mt-6 space-y-2.5">
        <button onClick={() => ga({ s: "start" })} className="h-[54px] w-full rounded-full bg-brand text-base font-black text-primary-foreground">{t("routes.lastigeMomenten.stoppen.beter")}</button>
        <button onClick={() => ga({ s: "afschrijven" })} className={`${GLAS} h-[50px] w-full rounded-full text-[15px] font-black`}>{t("routes.lastigeMomenten.afschrijven.titel")}</button>
        <Link to="/verhaal" className={`${GLAS} flex h-[50px] w-full items-center justify-center rounded-full text-[15px] font-black`}>{t("routes.lastigeMomenten.co.vertellen")}</Link>
        <button onClick={terug} className="w-full py-2 text-sm font-bold text-ink-soft">{t("common.terug")}</button>
      </div>
    </div>);
}
function MijnHouvast({ houvast, ga }) {
    const { t } = useTranslation();
    const [nieuw, setNieuw] = useState("");
    const voegToe = () => { if (!nieuw.trim())
        return; voegZin(nieuw); setNieuw(""); };
    const kopieer = (z) => { try {
        void navigator.clipboard?.writeText(z);
    }
    catch { /* kopiëren niet beschikbaar */ } };
    return (<div>
      <h1 className="lora mt-4 text-[30px] leading-tight">{t("routes.lastigeMomenten.houvast.titel")}</h1>
      <p className="text-sm text-ink-soft">{t("routes.lastigeMomenten.houvast.prive")}</p>
      <Sectie>{t("routes.lastigeMomenten.houvast.zinnen")}</Sectie>
      <div className="space-y-2">
        {houvast.zinItems.map(({ id, data: { tekst: z } }) => (<div key={id} className="flex items-center gap-2 rounded-[18px_18px_18px_6px] bg-[#DCE6D2] px-3.5 py-2.5">
            <span className="min-w-0 flex-1 text-[15px] font-extrabold text-[#2F4A3A]">{z}</span>
            <button onClick={() => kopieer(z)} className="text-xs font-extrabold text-[#3F5747]">{t("routes.lastigeMomenten.houvast.kopieer")}</button>
            <button onClick={() => void verwijderPersoonlijk(id)} aria-label={t("routes.lastigeMomenten.houvast.verwijderAria")} className="grid size-10 shrink-0 place-items-center text-ink-soft"><Kruis className="size-4"/></button>
          </div>))}
        <div className="flex gap-2">
          <input value={nieuw} onChange={(e) => setNieuw(e.target.value)} maxLength={500} onKeyDown={(e) => { if (e.key === "Enter")
            voegToe(); }} placeholder={t("routes.lastigeMomenten.houvast.placeholder")} aria-label={t("routes.lastigeMomenten.houvast.nieuwAria")} className="h-12 min-w-0 flex-1 rounded-2xl border border-white/85 bg-white px-3.5 text-[15px] outline-none"/>
          <button onClick={voegToe} disabled={!nieuw.trim() || houvast.zinnen.length >= 50} className="h-12 rounded-full bg-brand px-4 text-sm font-black text-primary-foreground disabled:opacity-45">{t("routes.lastigeMomenten.houvast.toevoegen")}</button>
        </div>
      </div>
      <Sectie>{t("routes.lastigeMomenten.houvast.bewaard")}</Sectie>
      {houvast.bewaard.length ? (<div className={`${GLAS} px-4 py-1`}>
          {houvast.bewaard.map((id) => { const m = momenten.find((x) => x.id === id); return m ? <button key={id} onClick={() => ga({ s: "moment", id })} className="flex w-full items-center border-b border-[#E9E1D5] py-3 text-left text-[15px] font-bold last:border-0"><span className="flex-1">{m.tekst.vraag}</span><Chevron className="size-4 text-ink-soft"/></button> : null; })}
        </div>) : <p className="text-sm text-ink-soft"><Trans i18nKey="routes.lastigeMomenten.houvast.leeg" components={{ b: <b /> }}/></p>}
    </div>);
}
function Afschrijven({ ga }) {
    const { t } = useTranslation();
    const [tekst, setTekst] = useState("");
    const [weg, setWeg] = useState(false);
    const laatLos = () => { setWeg(true); setTimeout(() => { setTekst(""); setWeg(false); }, 2500); };
    return (<div>
      <h1 className="lora mt-4 text-[30px] leading-tight">{t("routes.lastigeMomenten.afschrijven.titel")}</h1>
      <p className="mt-3 flex gap-2 rounded-2xl bg-[rgba(220,230,210,.85)] px-3.5 py-2.5 text-sm font-extrabold text-[#2F4A3A]"><AppIcon functie="slot" maat="sm" vorm="kaal" className="shrink-0"/><span>{t("routes.lastigeMomenten.afschrijven.slot")}</span></p>
      <textarea value={tekst} onChange={(e) => setTekst(e.target.value)} aria-label={t("routes.lastigeMomenten.afschrijven.titel")} placeholder={t("routes.lastigeMomenten.afschrijven.placeholder")} className={`mt-4 min-h-[260px] w-full resize-none rounded-[6px_6px_22px_22px] border-0 px-4 text-base leading-8 shadow-[0_8px_24px_rgba(60,50,40,.1)] outline-none transition-opacity duration-[2500ms] ${weg ? "opacity-0" : "opacity-100"}`} style={{ background: "#FFFDF8", backgroundImage: "repeating-linear-gradient(180deg, transparent 0 31px, #EFE7DC 31px 32px)" }}/>
      <div className="mt-4 space-y-2.5">
        <button onClick={laatLos} disabled={!tekst.trim()} className="h-[54px] w-full rounded-full bg-brand text-base font-black text-primary-foreground disabled:opacity-45">{t("routes.lastigeMomenten.afschrijven.laatLos")}</button>
        <button onClick={() => ga({ s: "adem" })} className={`${GLAS} h-[50px] w-full rounded-full text-[15px] font-black`}>{t("routes.lastigeMomenten.adem.metMeMee")}</button>
      </div>
      <p className="mt-3 text-[13.5px] text-ink-soft">{t("routes.lastigeMomenten.afschrijven.uitleg")}</p>
    </div>);
}
function Ademen({ kleur, terug }) {
    const { t } = useTranslation();
    const [stand, setStand] = useState("kijken");
    const [bezig, setBezig] = useState(false);
    const [fase, setFase] = useState("uit");
    const [ronde, setRonde] = useState(0);
    const [klaar, setKlaar] = useState(false);
    const timer = useRef(null);
    useEffect(() => () => { if (timer.current)
        clearTimeout(timer.current); }, []);
    const tril = (patroon) => { try {
        navigator.vibrate?.(patroon);
    }
    catch { /* geen trilfunctie */ } };
    const stap = (f, r) => {
        if (r >= 5) {
            setBezig(false);
            setKlaar(true);
            setFase("uit");
            return;
        }
        setFase(f);
        if (stand === "voelen")
            tril(f === "in" ? [4000] : [150, 450, 150, 450, 150, 450, 150, 450, 150]);
        timer.current = setTimeout(() => (f === "in" ? stap("uit", r) : (setRonde(r + 1), stap("in", r + 1))), f === "in" ? 4000 : 6000);
    };
    const start = () => { setKlaar(false); setRonde(0); setBezig(true); stap("in", 0); };
    const stop = () => { if (timer.current)
        clearTimeout(timer.current); setBezig(false); setFase("uit"); };
    const groot = bezig && fase === "in";
    return (<div className="min-h-screen w-full px-5 pb-10 pt-8 text-ink" style={{ background: "linear-gradient(180deg, #D3E0CC 0%, #E9EFE3 50%, #F3EDE3 100%)" }}>
      <div className="mx-auto max-w-md">
        <div className="flex items-center justify-between">
          <span className="text-sm font-black tracking-[0.08em] text-[#4F6B58]">{t("routes.lastigeMomenten.ademen.kop")}</span>
          <button onClick={() => { stop(); terug(); }} className="grid size-11 place-items-center rounded-full border border-white/85 bg-white/60" aria-label={t("common.sluiten")}><Kruis className="size-5"/></button>
        </div>
        <div className="mt-5 flex gap-1 rounded-full bg-white/55 p-1" role="tablist" aria-label={t("routes.lastigeMomenten.ademen.tabsAria")}>
          {["kijken", "voelen", "kind"].map((s) => (<button key={s} role="tab" aria-selected={stand === s} onClick={() => { stop(); setStand(s); }} className={`h-10 flex-1 rounded-full text-sm ${stand === s ? "bg-white font-black text-brand" : "font-bold text-ink-soft"}`}>{t(`routes.lastigeMomenten.ademen.tab.${s}`)}</button>))}
        </div>
        <p className="mx-6 mt-5 text-center text-base leading-relaxed text-[#3F5747]">
          {t(`routes.lastigeMomenten.ademen.uitleg.${stand}`)}
        </p>
        <div className="relative mx-auto mt-6 grid size-[280px] place-items-center">
          {stand === "kind" ? (<Ballon kleur={kleur} groot={groot}/>) : (<>
              <span className="absolute inset-0 rounded-full bg-[rgba(169,188,168,.2)]" aria-hidden/>
              <span className="grid place-items-center rounded-full transition-all ease-in-out motion-reduce:transition-none" style={{ width: groot ? 260 : 150, height: groot ? 260 : 150, transitionDuration: groot ? "4s" : "6s", background: "radial-gradient(circle at 40% 35%, #fff, #E3ECDD 60%, #C9D8C3)", boxShadow: "0 10px 30px rgba(63,87,71,.18)" }}>
                <span className="text-xl font-black text-[#2F4A3A]" aria-live="polite">{klaar ? t("routes.lastigeMomenten.ademen.gedaan") : bezig ? (fase === "in" ? t("routes.lastigeMomenten.ademen.in") : t("routes.lastigeMomenten.ademen.uit")) : stand === "voelen" ? t("routes.lastigeMomenten.ademen.inZak") : t("routes.lastigeMomenten.ademen.klaarVraag")}</span>
              </span>
            </>)}
        </div>
        {stand === "kind" ? <p className="mt-2 text-center font-display text-[24px] font-black" aria-live="polite">{klaar ? t("routes.lastigeMomenten.ademen.ballon.goed") : bezig ? (fase === "in" ? t("routes.lastigeMomenten.ademen.ballon.in") : t("routes.lastigeMomenten.ademen.ballon.uit")) : t("routes.lastigeMomenten.ademen.ballon.klaar")}</p> : null}
        <div className="mt-6 flex justify-center gap-2" aria-label={t("routes.lastigeMomenten.ademen.ronde", { n: Math.min(ronde + 1, 5) })}>
          {[0, 1, 2, 3, 4].map((i) => <span key={i} className="size-2.5 rounded-full" style={{ background: i < ronde || klaar ? (stand === "kind" ? kleur : "#4F6B58") : stand === "kind" ? `${kleur}33` : "rgba(79,107,88,.22)" }}/>)}
        </div>
        <div className="mt-8 space-y-2.5">
          {klaar ? (<>
              <p className="text-center text-sm font-extrabold text-[#3F5747]">{t("routes.lastigeMomenten.ademen.vijfKeer")}</p>
              <p className="text-center text-lg font-black">{t("routes.lastigeMomenten.ademen.hoeGaatHet")}</p>
              <button onClick={() => terug()} className="h-[54px] w-full rounded-full bg-brand text-base font-black text-primary-foreground">{t("routes.lastigeMomenten.ademen.rustiger")}</button>
              <button onClick={start} className="h-[50px] w-full rounded-full border border-white/85 bg-white/60 text-[15px] font-black">{t("routes.lastigeMomenten.ademen.nogEens")}</button>
              <Link to="/verhaal" className="flex h-[48px] w-full items-center justify-center text-[15px] font-black text-brand"><AppIcon functie="co" maat="sm" className="mr-1.5"/>{t("routes.lastigeMomenten.co.vertellen")}</Link>
            </>) : bezig ? (<button onClick={stop} className="h-[52px] w-full rounded-full border border-white/85 bg-white/60 text-base font-black">{t("routes.lastigeMomenten.ademen.stop")}</button>) : (<button onClick={start} className="h-[54px] w-full rounded-full bg-brand text-base font-black text-primary-foreground">{t("routes.lastigeMomenten.ademen.start")}</button>)}
          <p className="text-center text-sm text-ink-soft">{t("routes.lastigeMomenten.ademen.terug")}</p>
        </div>
      </div>
    </div>);
}
function Hulpregel() {
    const { t } = useTranslation();
    return <p className="mt-6 text-[12.5px] leading-relaxed text-ink-soft">{t("routes.lastigeMomenten.hulpregel")}</p>;
}
/* ---------- Het komt eraan · Hoe ging de wissel · Even pauze · Jouw maand · Gesprek · Iets fijns ---------- */
function Kop({ titel, sub }) {
    return <div className="mt-4"><h1 className="lora text-[30px] leading-tight">{titel}</h1><p className="text-sm text-ink-soft">{sub}</p></div>;
}
function Rij({ aan, titel, sub, children, onClick }) {
    return (<div className="border-b border-[#E9E1D5] py-3 last:border-0">
      <button onClick={onClick} className="flex w-full items-start gap-3 text-left" aria-pressed={aan}>
        <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${aan ? "bg-[#4F6B58] text-white" : "border-2 border-[#B9AC9C] bg-white"}`}>{aan ? <Check aria-hidden className="size-4" strokeWidth={2.5}/> : null}</span>
        <span><span className="block text-[16px] font-black">{titel}</span><span className="block text-sm text-ink-soft">{sub}</span></span>
      </button>
      {children}
    </div>);
}
function HetKomtEraan({ houvast, ga }) {
    const { t } = useTranslation();
    const [zinGekozen, setZinGekozen] = useState(false);
    const [voorMezelf, setVoorMezelf] = useState(false);
    const vk = useVoorkeuren();
    const hulp = !!vk.wisselHulp;
    const zetHulp = (v) => zetVoorkeur("wisselHulp", !!v);
    const zin = houvast.zinnen[0];
    return (<div>
      <Kop titel={t("routes.lastigeMomenten.start.komt.titel")} sub={t("routes.lastigeMomenten.komt.sub")}/>
      <Link to="/overdracht" className="mt-4 block rounded-[22px] border border-white/85 px-4 py-3" style={{ background: "linear-gradient(135deg, rgba(239,225,201,.9), rgba(243,237,227,.85))" }}>
        <span className="block text-xs font-extrabold uppercase tracking-[0.1em] text-[#7A5E44]">{t("routes.lastigeMomenten.komt.volgende")}</span>
        <span className="block text-[18px] font-black">{t("routes.lastigeMomenten.komt.meeMet")}</span>
        <span className="block text-sm text-ink-soft"><MetChevron>{t("routes.lastigeMomenten.komt.meeMetSub")}</MetChevron></span>
      </Link>
      <h2 className="mt-5 font-display text-[19px] font-black">{t("routes.lastigeMomenten.komt.voorbereiden")}</h2>
      <div className={`${GLAS} mt-2 px-4`}>
        <Rij aan={zinGekozen} titel={t("routes.lastigeMomenten.komt.zinTitel")} sub={t("routes.lastigeMomenten.komt.zinSub")} onClick={() => setZinGekozen((v) => !v)}>
          {zinGekozen ? (zin
            ? <p className="ml-10 mt-2 rounded-[18px_18px_18px_6px] bg-[#DCE6D2] px-3.5 py-2.5 text-[15px] font-extrabold text-[#2F4A3A]">“{zin}”</p>
            : <p className="ml-10 mt-2 text-sm text-ink-soft">{t("routes.lastigeMomenten.komt.geenZin")} <button onClick={() => ga({ s: "houvast" })} className="font-extrabold text-brand">{t("routes.lastigeMomenten.komt.schrijfZin")}</button></p>) : null}
          {zinGekozen ? <div className="ml-10 mt-2 flex gap-4 text-sm font-extrabold text-brand"><button onClick={() => ga({ s: "houvast" })}>{t("routes.lastigeMomenten.komt.andereZin")}</button><Link to="/verhaal" className="inline-flex items-center"><AppIcon functie="co" maat="sm" className="mr-1.5"/>{t("routes.lastigeMomenten.co.oefen")}</Link></div> : null}
        </Rij>
        <Rij aan={false} titel={t("routes.lastigeMomenten.komt.paklijst")} sub={t("routes.lastigeMomenten.komt.paklijstSub")} onClick={() => undefined}>
          <Link to="/overdracht" className="ml-10 mt-1 inline-flex min-h-10 items-center text-sm font-extrabold text-brand"><MetChevron>{t("routes.lastigeMomenten.komt.paklijstOpen")}</MetChevron></Link>
        </Rij>
        <Rij aan={voorMezelf} titel={t("routes.lastigeMomenten.komt.voorJezelf")} sub={t("routes.lastigeMomenten.komt.voorJezelfSub")} onClick={() => setVoorMezelf((v) => !v)}/>
      </div>
      <label className={`${GLAS} mt-3 flex items-center gap-3 px-4 py-3`}>
        <span className="min-w-0 flex-1"><span className="block text-[16px] font-black">{t("routes.lastigeMomenten.komt.hulp")}</span><span className="block text-sm text-ink-soft">{t("routes.lastigeMomenten.komt.hulpSub")}</span></span>
        <input type="checkbox" checked={hulp} onChange={(e) => zetHulp(e.target.checked)} className="peer sr-only"/>
        <span aria-hidden className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${hulp ? "bg-[#4F6B58]" : "bg-[#D9CFC2]"}`}><span className={`absolute top-1 size-6 rounded-full bg-white transition-all ${hulp ? "left-7" : "left-1"}`}/></span>
      </label>
      <button onClick={() => ga({ s: "onderwerp", i: 0 })} className="mt-4 text-sm font-extrabold text-brand">{t("routes.lastigeMomenten.komt.tips")}</button>
    </div>);
}
/** Waarden blijven Nederlands (worden zo bewaard in de log); label via routes.lastigeMomenten.na.ging.<waarde>. */
const GING = [["Rustig", Smile], ["Ging wel", Meh], ["Lastig", Frown], ["Heftig", Annoyed]];
/** Waarden blijven Nederlands (log); label via routes.lastigeMomenten.na.hielp.<waarde>. */
const HIELP = ["Mijn zin", "Ademen", "Kort afscheid", "Knuffel mee", "Niets"];
const hielpLabel = (t, h) => (HIELP.includes(h) ? t(`routes.lastigeMomenten.na.hielp.${h}`) : h);
function HoeGingDeWissel({ ouder, log, ga }) {
    const { t } = useTranslation();
    const [ging, setGing] = useState(null);
    const [hielp, setHielp] = useState([]);
    const [onthoud, setOnthoud] = useState("");
    const [klaar, setKlaar] = useState(false);
    const [bezig, setBezig] = useState(false);
    const [gelogd, setGelogd] = useState(null);
    // De vorige wissel (vóór wat je nu bewaart): vastgezet bij het openen van dit scherm.
    const [vorige] = useState(() => log.at(-1));
    const zwaarVorige = !!vorige && (vorige.data.gevoel === "Lastig" || vorige.data.gevoel === "Heftig");
    const bewaar = async () => {
        if (bezig)
            return;
        setBezig(true);
        const d = new Date();
        const datum = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const metLog = ging && gelogd !== ging;
        const goed = await Promise.all([
            metLog ? voegPersoonlijkToe("wissel_log", { datum, gevoel: ging, hielp }) : true,
            onthoud.trim() ? voegPersoonlijkToe("houvast_zin", { tekst: onthoud.trim().slice(0, 500) }) : true,
        ]);
        setBezig(false);
        if (metLog && goed[0])
            setGelogd(ging);
        if (goed.every(Boolean)) {
            setKlaar(true);
            setOnthoud("");
        }
    };
    return (<div>
      <Kop titel={t("routes.lastigeMomenten.na.titel", { ouder })} sub={t("routes.lastigeMomenten.houvast.prive")}/>
      <div className="mt-4 grid grid-cols-4 gap-2">
        {GING.map(([naam, Gezicht]) => <button key={naam} onClick={() => setGing(naam)} aria-pressed={ging === naam} className={`flex flex-col items-center gap-1 rounded-[18px] py-3 text-sm font-extrabold ${ging === naam ? "border-2 border-[#A9BCA8] bg-[#E9EFE3] text-[#2F4A3A]" : "border border-white/85 bg-white/60"}`}><Gezicht className="size-7 text-[#3F5747]" aria-hidden/>{t(`routes.lastigeMomenten.na.ging.${naam}`)}</button>)}
      </div>
      {ging ? <CoNaWissel ging={ging} ga={ga}/> : null}
      {ging && (ging === "Lastig" || ging === "Heftig") && zwaarVorige ? <SchoolTip /> : null}
      <h2 className="mt-5 font-display text-[19px] font-black">{t("routes.lastigeMomenten.na.hielpVraag")}</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {HIELP.map((h) => { const aan = hielp.includes(h); return <button key={h} onClick={() => setHielp((l) => (aan ? l.filter((x) => x !== h) : [...l, h]))} aria-pressed={aan} className={`h-10 rounded-full px-4 text-sm font-extrabold ${aan ? "bg-[#4F6B58] text-white" : "border border-white/85 bg-white/70"}`}>{hielpLabel(t, h)}</button>; })}
      </div>
      <h2 className="mt-5 font-display text-[19px] font-black">{t("routes.lastigeMomenten.na.onthoudVraag")}</h2>
      <textarea value={onthoud} onChange={(e) => { setOnthoud(e.target.value); setKlaar(false); }} rows={3} maxLength={500} aria-label={t("routes.lastigeMomenten.na.onthoudAria")} className="mt-2 w-full resize-none rounded-[18px] border border-white/85 bg-white/80 px-4 py-3 text-[15px] outline-none"/>
      {klaar ? <p className="mt-3 rounded-2xl bg-[rgba(220,230,210,.85)] px-4 py-3 text-sm font-extrabold text-[#2F4A3A]">{t("routes.lastigeMomenten.na.bewaard")}</p> : null}
      <button onClick={() => void bewaar()} disabled={bezig || klaar || ((!ging || gelogd === ging) && !onthoud.trim())} className="mt-4 h-[54px] w-full rounded-full bg-brand text-base font-black text-primary-foreground disabled:opacity-45">{t("routes.lastigeMomenten.houvast.bewaarIn")}</button>
      <Link to="/verhaal" className={`${GLAS} mt-2.5 flex h-[50px] w-full items-center justify-center rounded-full text-[15px] font-black`}><AppIcon functie="co" maat="sm" className="mr-1.5"/>{t("routes.lastigeMomenten.co.vertellen")}</Link>
      <div className="mt-4 flex items-center gap-3"><AdemKnop maat={44} label={false} onClick={() => ga({ s: "adem" })}/><span className="text-sm text-ink-soft">{t("routes.lastigeMomenten.na.onrustig")}</span></div>
      <button onClick={() => ga({ s: "afschrijven" })} className="mt-3 text-sm font-extrabold text-brand">{t("routes.lastigeMomenten.afschrijven.titel")}</button>
    </div>);
}
function EvenPauze({ terug }) {
    const { t } = useTranslation();
    const opties = [[t("routes.lastigeMomenten.pauze.optie.uur"), 1], [t("routes.lastigeMomenten.pauze.optie.vanavond"), 0], [t("routes.lastigeMomenten.pauze.optie.ochtend"), -1]];
    const [keuze, setKeuze] = useState(-1);
    const tot = () => { const d = new Date(); if (keuze === 1)
        d.setHours(d.getHours() + 1);
    else if (keuze === 0)
        d.setHours(23, 0, 0, 0);
    else {
        if (d.getHours() >= 8)
            d.setDate(d.getDate() + 1);
        d.setHours(8, 0, 0, 0);
    } return d; };
    // Voorkeur van je account: Berichten toont de pauze en de badge blijft stil tot dit moment.
    const zet = () => { zetVoorkeur("berichtenPauzeTot", tot().toISOString()); terug(); };
    const label = tot().toLocaleString(taalLocale(), { weekday: "long", hour: "2-digit", minute: "2-digit" });
    return (<div>
      <Kop titel={t("routes.lastigeMomenten.pauze.titel")} sub={t("routes.lastigeMomenten.pauze.sub")}/>
      <div className={`${GLAS} mt-4 flex items-center gap-3 px-4 py-3`}>
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#DCE3D3] text-[#3F5747]" aria-hidden><BellOff className="size-6"/></span>
        <span><span className="block text-[16px] font-black">{t("routes.lastigeMomenten.pauze.tot", { tijd: label })}</span><span className="block text-sm text-ink-soft">{t("routes.lastigeMomenten.pauze.totSub")}</span></span>
      </div>
      <h2 className="mt-5 font-display text-[19px] font-black">{t("routes.lastigeMomenten.pauze.hoeLang")}</h2>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {opties.map(([naam, v]) => <button key={naam} onClick={() => setKeuze(v)} aria-pressed={keuze === v} className={`h-12 rounded-full text-[15px] font-black ${keuze === v ? "bg-[#4F6B58] text-white" : "border border-white/85 bg-white/70"}`}>{naam}</button>)}
      </div>
      <p className={`${GLAS} mt-4 px-4 py-3 text-sm leading-relaxed`}><Trans i18nKey="routes.lastigeMomenten.pauze.dringend" components={{ b: <b /> }}/></p>
      <p className="mt-3 text-sm text-ink-soft">{t("routes.lastigeMomenten.pauze.zichtbaar")}</p>
      <button onClick={zet} className="mt-6 h-[54px] w-full rounded-full bg-brand text-base font-black text-primary-foreground">{t("routes.lastigeMomenten.pauze.aanzetten")}</button>
    </div>);
}
function JouwMaand({ houvast, log: items }) {
    const { t } = useTranslation();
    const log = items.map((x) => x.data);
    const maand = new Date().toLocaleDateString(taalLocale(), { month: "long" });
    const dezeMaand = log.filter((l) => l.datum.slice(0, 7) === new Date().toISOString().slice(0, 7));
    const rustig = dezeMaand.filter((l) => l.gevoel === "Rustig" || l.gevoel === "Ging wel").length;
    const telling = new Map();
    dezeMaand.forEach((l) => l.hielp.filter((h) => h !== "Niets").forEach((h) => telling.set(h, (telling.get(h) ?? 0) + 1)));
    const vaakst = [...telling.entries()].sort((a, b) => b[1] - a[1])[0];
    return (<div>
      <Kop titel={t("routes.lastigeMomenten.maand.titel", { maand })} sub={t("routes.lastigeMomenten.maand.sub")}/>
      <p className="lora mt-4 text-[24px] leading-snug"><Trans i18nKey="routes.lastigeMomenten.maand.goed" components={{ br: <br /> }}/></p>
      <div className="mt-4 rounded-[22px] border border-white/85 px-4 py-3" style={{ background: "rgba(220,230,210,.75)" }}>
        <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[#3F5747]">{t("routes.lastigeMomenten.maand.wissels")}</p>
        {dezeMaand.length ? <>
          <div className="mt-2 flex flex-wrap gap-3">{dezeMaand.map((l, i) => <span key={i} className="flex flex-col items-center gap-1 text-xs font-bold"><span className={`grid size-10 place-items-center rounded-full text-white ${l.gevoel === "Rustig" || l.gevoel === "Ging wel" ? "bg-[#6F8F78]" : "bg-[#C9A88E]"}`}><Repeat aria-hidden className="size-4" strokeWidth={2.2}/></span>{new Date(l.datum).getDate()}</span>)}</div>
          <p className="mt-2 text-[15px] font-black">{t("routes.lastigeMomenten.maand.telling", { rustig, lastig: dezeMaand.length - rustig })}</p>
        </> : <p className="mt-1 text-sm text-ink-soft">{t("routes.lastigeMomenten.maand.leeg")}</p>}
      </div>
      {vaakst ? <div className={`${GLAS} mt-3 px-4 py-3`}><p className="text-xs font-extrabold uppercase tracking-[0.1em] text-ink-soft">{t("routes.lastigeMomenten.maand.vaakst")}</p><p className="text-[16px] font-black">{hielpLabel(t, vaakst[0])}</p>{vaakst[0] === "Mijn zin" && houvast.zinnen[0] ? <p className="text-sm text-ink-soft">“{houvast.zinnen[0]}”</p> : null}</div> : null}
    </div>);
}
function Vraag({ v, w, z, ph }) {
    return (<label className="block border-b border-[#E9E1D5] py-2.5 last:border-0"><span className="block text-sm font-extrabold text-ink-soft">{v}</span>
      <textarea value={w} onChange={(e) => z(e.target.value)} rows={2} aria-label={v} placeholder={ph} className="mt-1 w-full resize-none bg-transparent text-[16px] font-black outline-none placeholder:font-normal placeholder:text-ink-soft/70"/></label>);
}
function GesprekVoorbereiden() {
    const { t } = useTranslation();
    const [doel, setDoel] = useState("");
    const [punt, setPunt] = useState("");
    const [los, setLos] = useState("");
    const [bewaard, setBewaard] = useState(false);
    const spiek = [doel.trim(), punt.trim()].filter(Boolean).join(" ");
    return (<div>
      <Kop titel={t("routes.lastigeMomenten.gesprek.titel")} sub={t("routes.lastigeMomenten.gesprek.sub")}/>
      <h2 className="mt-4 font-display text-[19px] font-black">{t("routes.lastigeMomenten.gesprek.drieVragen")}</h2>
      <div className={`${GLAS} mt-2 px-4`}>
        <Vraag v={t("routes.lastigeMomenten.gesprek.doel.v")} w={doel} z={setDoel} ph={t("routes.lastigeMomenten.gesprek.doel.ph")}/>
        <Vraag v={t("routes.lastigeMomenten.gesprek.punt.v")} w={punt} z={setPunt} ph={t("routes.lastigeMomenten.gesprek.punt.ph")}/>
        <Vraag v={t("routes.lastigeMomenten.gesprek.los.v")} w={los} z={setLos} ph={t("routes.lastigeMomenten.gesprek.los.ph")}/>
      </div>
      {spiek ? <div className="mt-4 rounded-[22px] border-2 border-dashed border-[#D9CFC2] bg-white/70 px-4 py-3">
        <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[#7A5E44]">{t("routes.lastigeMomenten.gesprek.spiek")}</p>
        <p className="mt-1 text-[18px] font-black leading-snug">“{spiek}”</p>
        <p className="mt-1 text-sm text-ink-soft">{t("routes.lastigeMomenten.gesprek.spiekTip")}</p>
      </div> : null}
      <Link to="/verhaal" className="mt-4 flex h-[54px] w-full items-center justify-center rounded-full bg-brand text-base font-black text-primary-foreground"><AppIcon functie="co" maat="sm" className="mr-1.5"/>{t("routes.lastigeMomenten.co.samenOefenen")}</Link>
      <button disabled={!spiek || bewaard} onClick={async () => { if (await voegPersoonlijkToe("houvast_zin", { tekst: spiek.slice(0, 500) }))
            setBewaard(true); }} className={`${GLAS} mt-2.5 h-[50px] w-full rounded-full text-[15px] font-black disabled:opacity-45`}>{bewaard ? <MetVinkje>{t("routes.lastigeMomenten.houvast.bewaardIn")}</MetVinkje> : t("routes.lastigeMomenten.houvast.bewaarIn")}</button>
    </div>);
}
function IetsFijns() {
    const { t } = useTranslation();
    const begin = tLijst("routes.lastigeMomenten.fijn.begin");
    return (<div>
      <Kop titel={t("routes.lastigeMomenten.fijn.titel")} sub={t("routes.lastigeMomenten.gesprek.sub")}/>
      <p className="mt-3 text-sm text-ink-soft">{t("routes.lastigeMomenten.fijn.intro")}</p>
      <Link to="/momentjes" className="mt-4 flex flex-col items-center gap-1 rounded-[22px] border border-white/85 px-4 py-6 text-center" style={{ background: "linear-gradient(135deg, rgba(243,225,228,.88), rgba(239,225,201,.82))" }}>
        <ImageIcon className="size-7 text-[#7A3B48]" aria-hidden/><span className="text-[16px] font-black text-[#7A3B48]">{t("routes.lastigeMomenten.fijn.deel")}</span><span className="text-sm text-ink-soft">{t("routes.lastigeMomenten.fijn.deelSub")}</span>
      </Link>
      <h2 className="mt-5 font-display text-[19px] font-black">{t("routes.lastigeMomenten.fijn.beginZin")}</h2>
      <div className="mt-2 space-y-2">{begin.map((b) => <Link key={b} to="/berichten" className={`${GLAS} flex items-center px-4 py-3 text-[15px] font-black`}><span className="flex-1">{b}</span><Chevron className="size-4 text-ink-soft"/></Link>)}</div>
      <p className="mt-3 text-xs text-ink-soft">{t("routes.lastigeMomenten.fijn.voet")}</p>
    </div>);
}
function MeerHulp({ ga }) {
    const { t } = useTranslation();
    const items = ["komt", "na", "gesprek", "fijn", "pauze", "maand", "afschrijven"].map((s) => [t(`routes.lastigeMomenten.meerHulp.items.${s}.titel`), t(`routes.lastigeMomenten.meerHulp.items.${s}.sub`), { s }]);
    return (<div>
      <Kop titel={t("routes.lastigeMomenten.meerHulp.titel")} sub={t("routes.lastigeMomenten.meerHulp.sub")}/>
      <div className={`${GLAS} mt-4 px-4 py-1`}>{items.map(([titel, sub, sch]) => <button key={sch.s} onClick={() => ga(sch)} className="flex w-full items-center gap-3 border-b border-[#E9E1D5] py-3 text-left last:border-0"><span className="min-w-0 flex-1"><span className="block text-[16px] font-black">{titel}</span><span className="block text-sm text-ink-soft">{sub}</span></span><Chevron className="size-4 text-ink-soft"/></button>)}</div>
    </div>);
}
/** Ballon voor "Met je kind": blaast op bij inademen (4 s), loopt leeg bij uitademen (6 s). Kleur = kindkleur. */
function Ballon({ kleur, groot }) {
    return (<svg viewBox="0 0 200 280" width="200" height="280" aria-hidden style={{ overflow: "visible" }}>
      <defs>
        <radialGradient id="ballon-vulling" cx="38%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85"/>
          <stop offset="35%" stopColor={kleur} stopOpacity="0.45"/>
          <stop offset="100%" stopColor={kleur} stopOpacity="0.95"/>
        </radialGradient>
      </defs>
      <g style={{ transformOrigin: "100px 200px", transformBox: "view-box", transform: `scale(${groot ? 1 : 0.55})`, transition: `transform ${groot ? 4 : 6}s ease-in-out` }}>
        <path d="M100 8 C 45 8, 12 50, 12 98 C 12 145, 55 185, 94 196 L106 196 C 145 185, 188 145, 188 98 C 188 50, 155 8, 100 8 Z" fill="url(#ballon-vulling)" stroke={kleur} strokeWidth="3"/>
        <ellipse cx="62" cy="62" rx="14" ry="26" fill="#ffffff" opacity="0.7" transform="rotate(-25 62 62)"/>
        <path d="M91 196 L109 196 L104 204 L96 204 Z" fill={kleur}/>
      </g>
      <path d="M100 204 C 88 220, 112 234, 100 250 S 92 268, 102 280" fill="none" stroke="#A88B72" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>);
}
/** Per wissel-gevoel: steun ja/nee. Tekst (zin, sub) uit routes.lastigeMomenten.na.reactie.<waarde>. */
const NA_WISSEL = { Rustig: { steun: false }, "Ging wel": { steun: false }, Lastig: { steun: true }, Heftig: { steun: true } };
/** Reactie van Co direct na het kiezen hoe de wissel ging. Vaste, warme tekst; geen AI. */
function CoNaWissel({ ging, ga }) {
    const { t } = useTranslation();
    const r = NA_WISSEL[ging];
    if (!r)
        return null;
    return (<div className="mt-3 rounded-[22px] border border-white/85 px-4 py-3.5" style={{ background: r.steun ? "linear-gradient(135deg, rgba(220,230,210,.95), rgba(233,239,227,.9))" : "rgba(255,255,255,.7)" }} aria-live="polite">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border border-[#C9D6C3] bg-[#E9EFE3] text-xs font-black text-[#3F5747]" aria-hidden>Co</span>
        <div className="min-w-0 text-[#2F4A3A]"><p className="text-[16px] font-black">{t(`routes.lastigeMomenten.na.reactie.${ging}.zin`)}</p><p className="mt-0.5 text-[15px] leading-snug">{t(`routes.lastigeMomenten.na.reactie.${ging}.sub`)}</p></div>
      </div>
      {r.steun ? (<div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => ga({ s: "adem" })} className="h-10 rounded-full bg-brand px-4 text-sm font-black text-primary-foreground">{t("routes.lastigeMomenten.adem.metMeMee")}</button>
          <Link to="/verhaal" className="inline-flex h-10 items-center rounded-full border border-white/85 bg-white/80 px-4 text-sm font-black text-[#2F4A3A]">{t("routes.lastigeMomenten.co.vertellen")}</Link>
          {ging === "Heftig" ? <button onClick={() => ga({ s: "afschrijven" })} className="h-10 rounded-full border border-white/85 bg-white/80 px-4 text-sm font-black text-[#2F4A3A]">{t("routes.lastigeMomenten.afschrijven.titel")}</button> : null}
        </div>) : null}
      {ging === "Heftig" ? <p className="mt-3 text-[12.5px] text-[#3F5747]">{t("routes.lastigeMomenten.na.gevaar")}</p> : null}
    </div>);
}
/** Na twee zware wissels op rij: Co stelt voor de wissel via school te doen, als voorstel aan de andere ouder. */
function SchoolTip() {
    const { t } = useTranslation();
    const gezin = useGezin();
    const anderNaam = gezin.ander?.naam || t("common.deAndereOuder");
    const concept = t("routes.lastigeMomenten.schoolTip.concept", { naam: anderNaam });
    return (<div className="mt-3 rounded-[22px] border border-white/85 bg-white/70 px-4 py-3.5">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border border-[#C9D6C3] bg-[#E9EFE3] text-xs font-black text-[#3F5747]" aria-hidden>Co</span>
        <div className="min-w-0 text-[#2F4A3A]"><p className="text-[16px] font-black">{t("routes.lastigeMomenten.schoolTip.titel")}</p><p className="mt-0.5 text-[15px] leading-snug">{t("routes.lastigeMomenten.schoolTip.tekst")}</p></div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link to="/berichten" search={{ concept }} className="inline-flex h-10 items-center rounded-full bg-brand px-4 text-sm font-black text-primary-foreground">{t("routes.lastigeMomenten.schoolTip.bericht", { naam: anderNaam })}</Link>
        <Link to="/agenda" search={{ zorgActie: "wijziging" }} className="inline-flex h-10 items-center rounded-full border border-white/85 bg-white/80 px-4 text-sm font-black text-[#2F4A3A]">{t("routes.lastigeMomenten.schoolTip.voorstellen")}</Link>
      </div>
      <p className="mt-2 text-xs text-ink-soft">{t("routes.lastigeMomenten.schoolTip.voetnoot", { naam: anderNaam })}</p>
    </div>);
}
