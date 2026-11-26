import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@/lib/server-fn";
import { Clock, Heart, Mic, PenLine, Smile, Square, RotateCcw, Shield, ArrowUp } from "lucide-react";
import { zetSpraakOm } from "@/lib/assistent.functions";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { momenten } from "@/lib/lastige-momenten";
import { AppShell, PageHeader } from "@/components/AppShell";
import { AppIcon } from "@/components/AppIcon";
import { CoPrivacy } from "@/components/CoPrivacy";
import { HulpKaart } from "@/components/Onveilig";
import { Button } from "@/components/ui/button";
import { useVakanties } from "@/lib/vakantie-store";
import { useTaken, taakWieTekst } from "@/lib/taken-store";
import { praatVerhaal } from "@/lib/verhaal.functions";
import { useActiviteiten } from "@/components/Activiteiten";
import { useAfspraken } from "@/lib/afspraken-store";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { actieInfo, bewaarGesprek, bewaardUit, bouwVerhaalContext, categorieLabel, contextCategorieen, kiesActies, toestemmingUit, verwijderBewaard, zetOudeVerhaalOver, zetToestemming, zorgSignaal, } from "@/lib/verhaal";
import { persoonlijkBron, usePersoonlijk } from "@/lib/persoonlijk-store";
import { useVoorkeuren } from "@/lib/voorkeuren-store";
import { Chevron, MetChevron } from "@/components/Tekens";
import { KNOP } from "@/lib/ui-stijl";
export const Route = createFileRoute("/verhaal")({
    head: () => ({
        meta: [
            { title: i18n.t("routes.verhaal.meta.titel") },
            { name: "description", content: i18n.t("routes.verhaal.meta.beschrijving") },
            { property: "og:title", content: i18n.t("routes.verhaal.meta.titel") },
            { property: "og:description", content: i18n.t("routes.verhaal.meta.ogBeschrijving") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    validateSearch: z.object({ moment: z.coerce.number().optional() }),
    component: Verhaal,
});
const modusItem = (id) => ({ id, get titel() { return i18n.t(`routes.verhaal.modus.${id}.titel`); }, get tekst() { return i18n.t(`routes.verhaal.modus.${id}.tekst`); } });
const modi = [modusItem("praten"), modusItem("overzicht"), modusItem("doen")];
function Verhaal() {
    const { t } = useTranslation();
    // De GEZIN-regel (naam + namen/leeftijden van de kinderen) bouwt de server zelf uit de sessie (co-assistant).
    const { moment: momentId } = Route.useSearch();
    const overMoment = momentId ? momenten.find((m) => m.id === momentId) : undefined;
    const vakanties = useVakanties();
    const { taken } = useTaken();
    const { voorstellen } = useActiviteiten();
    const afsprakenBron = useAfspraken();
    const [modus, setModus] = useState("praten");
    const vk = useVoorkeuren();
    const ps = usePersoonlijk();
    const psStatus = persoonlijkBron.useStatus();
    const toestemming = toestemmingUit(vk);
    const [vraagToestemming, setVraagToestemming] = useState(false);
    const [berichten, setBerichten] = useState([]);
    const bewaardGesprek = bewaardUit(ps);
    const heeftBewaard = bewaardGesprek.length > 0;
    const [bewaren, setBewaren] = useState(false);
    const [tekst, setTekst] = useState("");
    const [bezig, setBezig] = useState(false);
    const [fout, setFout] = useState(null);
    const [zorg, setZorg] = useState(false);
    const [stap, setStap] = useState(overMoment ? "gesprek" : "start");
    const einde = useRef(null);
    useEffect(() => { if (psStatus === "klaar")
        void zetOudeVerhaalOver(vk, ps); }, [psStatus]); // eslint-disable-line react-hooks/exhaustive-deps
    // Bewaren: privé in je account (alleen jij), na elke beurt bijgewerkt; uitzetten verwijdert het.
    useEffect(() => { if (bewaren && berichten.length)
        void bewaarGesprek(berichten); }, [bewaren, berichten]);
    useEffect(() => { einde.current?.scrollIntoView({ block: "nearest" }); }, [berichten.length, bezig]);
    const kiesToestemming = (v) => { zetToestemming(v); setVraagToestemming(false); };
    const kiesModus = (m) => { setModus(m); if (m !== "praten" && toestemming === null)
        setVraagToestemming(true); };
    // Met toestemming: alleen wat deze ouder in de app zelf mag zien (de stores komen al gefilterd van de server).
    const contextMag = toestemming === "ja";
    const context = contextMag
        ? bouwVerhaalContext({
            vakanties,
            voorstellen: voorstellen.map((v) => ({ titel: v.titel, status: v.status })),
            taken: taken.map((tk) => ({ tekst: tk.tekst, wie: tk.wie ? taakWieTekst(tk.wie) : "", klaar: tk.klaar, overdragenAan: tk.overdragenAan })),
            afspraken: afsprakenBron.filter((a) => a.status === "Actief").map((a) => ({ titel: a.titel, tekst: a.tekst })),
        }, contextCategorieen).slice(0, 6000)
        : "";
    const stuur = async (invoer = tekst) => {
        const inhoud = invoer.trim();
        if (!inhoud || bezig)
            return;
        if (zorgSignaal(inhoud))
            setZorg(true);
        const nieuw = [...berichten, { rol: "ouder", tekst: inhoud }];
        setBerichten(nieuw);
        setTekst("");
        setFout(null);
        setBezig(true);
        try {
            const r = await praatVerhaal({ data: { modus, context, berichten: nieuw.map(({ rol, tekst }) => ({ rol, tekst })) } });
            setBerichten((b) => [...b, { rol: "ai", tekst: r.antwoord, acties: kiesActies(r.acties, modus), concept: r.concept }]);
        }
        catch (e) {
            setFout(e instanceof Error ? e.message : t("routes.verhaal.fout.onbereikbaar"));
        }
        finally {
            setBezig(false);
        }
    };
    const nieuwGesprek = () => { setBerichten([]); setFout(null); setZorg(false); if (bewaren)
        verwijderBewaard(); setBewaren(false); };
    return (<AppShell>
      <PageHeader titel={overMoment ? t("routes.verhaal.titelMoment") : stap === "luister" ? t("routes.verhaal.titelLuister") : t("routes.verhaal.titel")} {...(stap === "luister" ? {} : { subtitel: t("routes.verhaal.subtitel") })} terug={overMoment ? "/lastige-momenten" : "/meer"}/>
      {stap === "start" && berichten.length === 0 && !overMoment ? (<CoStart heeftBewaard={heeftBewaard} onLuister={() => setStap("luister")} onVerder={() => { setBerichten(bewaardGesprek); setBewaren(true); setStap("gesprek"); }}/>) : stap === "luister" && berichten.length === 0 ? (<CoLuistert onKlaar={(zin) => { setStap("gesprek"); void stuur(zin); }}/>) : <>
      {overMoment ? (<Link to="/lastige-momenten" className="mt-3 flex items-center gap-3 rounded-[18px] border border-white/85 bg-white/60 px-4 py-2.5">
          <AppIcon functie="documenten" maat="sm" vorm="kaal"/>
          <span className="min-w-0"><span className="block text-xs text-ink-soft">{t("routes.verhaal.overDitMoment")}</span><span className="block text-[15px] font-black">{overMoment.nl.vraag}</span></span>
        </Link>) : null}
      <CoPrivacy />

      <div role="tablist" aria-label={t("routes.verhaal.modusLabel")} className="mt-4 grid grid-cols-3 gap-1 rounded-full bg-[color-mix(in_oklab,var(--foreground)_6%,transparent)] p-1">
        {modi.map((m) => (<button key={m.id} role="tab" aria-selected={modus === m.id} onClick={() => kiesModus(m.id)} className={`min-h-10 rounded-full px-2 text-[13px] font-semibold leading-tight transition ${modus === m.id ? "bg-card text-brand shadow-sm" : "text-ink-soft"}`}>{m.titel}</button>))}
      </div>
      <p className="mt-2 px-2 text-center text-xs text-ink-soft">{modi.find((m) => m.id === modus)?.tekst}</p>


      {vraagToestemming ? (<div className="mt-3 rounded-[22px] border border-white/85 bg-white/60 p-4 text-sm">
          <p className="font-semibold">{t("routes.verhaal.toestemming.vraag")}</p>
          <p className="mt-1 text-ink-soft">{t("routes.verhaal.toestemming.uitleg")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => kiesToestemming("ja")}>{t("routes.verhaal.toestemming.ja")}</Button>
            <Button size="sm" variant="outline" onClick={() => kiesToestemming("nee")}>{t("routes.verhaal.toestemming.nee")}</Button>
          </div>
        </div>) : (<div className="mt-3 flex items-center gap-3 rounded-2xl border border-white/85 bg-white/50 py-1.5 pl-3.5 pr-1.5 text-xs text-ink-soft">
          <Shield aria-hidden="true" className="size-4 shrink-0 text-brand"/>
          <span className="min-w-0 flex-1 leading-snug">
            {toestemming === "ja"
                    ? t("routes.verhaal.toestemming.neemtMee", { lijst: contextCategorieen.map((c) => categorieLabel[c]).join(", ") })
                    : t("routes.verhaal.toestemming.geen")}
          </span>
          <button className="min-h-9 shrink-0 rounded-full border border-border bg-card px-3.5 text-xs font-semibold text-brand" onClick={() => kiesToestemming(toestemming === "ja" ? "nee" : "ja")}>
            {toestemming === "ja" ? t("routes.verhaal.toestemming.intrekken") : t("routes.verhaal.toestemming.toestaan")}
          </button>
        </div>)}

      <div className="mt-4 space-y-3" aria-live="polite">
        {berichten.length === 0 && heeftBewaard ? (<div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-ink-soft">{t("routes.verhaal.bewaard.heeft")}</span>
            <Button size="sm" variant="outline" onClick={() => { setBerichten(bewaardGesprek); setBewaren(true); }}>{t("routes.verhaal.bewaard.verder")}</Button>
            <Button size="sm" variant="ghost" onClick={() => void verwijderBewaard()}>{t("common.verwijderen")}</Button>
          </div>) : null}
        {berichten.map((b, i) => (<div key={i} className={b.rol === "ouder" ? "flex justify-end" : ""}>
            {b.rol === "ouder" ? (<p className="max-w-[85%] whitespace-pre-wrap rounded-[18px_18px_6px_18px] bg-[#DCE6D2] px-3.5 py-2.5 text-[15px] text-[#2F4A3A]">{b.tekst}</p>) : (<div className="max-w-[92%] text-[15px] text-ink">
                <div className="flex items-start gap-2.5"><span className="mt-1 grid size-8 shrink-0 place-items-center rounded-full border border-[#C9D6C3] bg-[#E9EFE3] text-xs font-black text-[#3F5747]" aria-hidden>Co</span><p className="whitespace-pre-wrap rounded-[18px_18px_18px_6px] border border-white/85 bg-white/70 px-3.5 py-2.5 leading-relaxed">{b.tekst}</p></div>
                {b.concept?.trim() ? <BerichtConcept concept={b.concept} ander={t("routes.verhaal.deAndereOuder")}/> : null}
                {b.acties?.length ? (<div className="mt-2 flex flex-wrap gap-2">
                    {b.acties.map((a) => {
                            const info = actieInfo[a];
                            if (a === "bericht")
                                return b.concept?.trim() ? null : <Button key={a} variant="outline" size="sm" onClick={() => stuur(t("routes.verhaal.vraag.bericht"))}>{info.label}</Button>;
                            if (info.to)
                                return <Link key={a} to={info.to} className="inline-flex min-h-9 items-center rounded-full border border-border px-3.5 text-xs font-semibold">{info.label}</Link>;
                            return <Button key={a} variant="outline" size="sm" onClick={() => stuur(a === "praten" ? t("routes.verhaal.vraag.verderPraten") : t("routes.verhaal.vraag.niets"))}>{info.label}</Button>;
                        })}
                  </div>) : null}
              </div>)}
          </div>))}
        {bezig ? (<div className="flex items-center gap-2.5" role="status"><span className="grid size-8 shrink-0 place-items-center rounded-full border border-[#C9D6C3] bg-[#E9EFE3] text-xs font-black text-[#3F5747]" aria-hidden>Co</span><span className="inline-flex items-center gap-1 rounded-[18px_18px_18px_6px] border border-white/85 bg-white/70 px-4 py-3"><span className="sr-only">{t("routes.verhaal.bezig")}</span>{[0, 1, 2].map((i) => <span key={i} aria-hidden className="size-1.5 animate-bounce rounded-full bg-ink-soft/60 motion-reduce:animate-none" style={{ animationDelay: `${i * 150}ms` }}/>)}</span></div>) : null}
        {fout ? <div className="text-sm"><p>{fout}</p><Button size="sm" variant="outline" className="mt-2" onClick={() => { const laatst = berichten.at(-1); if (laatst?.rol === "ouder") {
            setBerichten(berichten.slice(0, -1));
            void stuur(laatst.tekst);
        } }}>{t("routes.verhaal.opnieuwProberen")}</Button></div> : null}
        {zorg ? <div><p className="mb-2 text-sm text-ink">{t("routes.verhaal.zorg")}</p><HulpKaart /></div> : null}
        {berichten.some((b) => b.rol === "ai") && !bezig ? (<button onClick={() => stuur(t("routes.verhaal.vraag.bericht"))} className="flex w-full items-center gap-3 rounded-[20px] border border-white/85 bg-white/60 px-4 py-3 text-left">
            <AppIcon functie="berichten" maat="sm" vorm="kaal"/>
            <span className="min-w-0 flex-1"><span className="block text-[15px] font-black">{t("routes.verhaal.berichtOpstellen", { ander: t("routes.verhaal.deAndereOuder") })}</span><span className="block text-xs text-ink-soft">{t("routes.verhaal.berichtOpstellenUitleg")}</span></span>
          </button>) : null}
        <div ref={einde}/>
      </div>

      <form className="mt-4 rounded-[22px] border border-border bg-card shadow-sm transition focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15" onSubmit={(e) => { e.preventDefault(); void stuur(); }}>
        <label className="sr-only" htmlFor="verhaal-invoer">{t("routes.verhaal.invoerLabel")}</label>
        <textarea id="verhaal-invoer" value={tekst} onChange={(e) => setTekst(e.target.value)} rows={2} maxLength={3000} placeholder={modus === "praten" ? t("routes.verhaal.placeholder.praten") : modus === "overzicht" ? t("routes.verhaal.placeholder.overzicht") : t("routes.verhaal.placeholder.doen")} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void stuur();
        } }} className="block max-h-40 min-h-[52px] w-full resize-none bg-transparent px-4 pt-3 text-[15px] text-ink outline-none placeholder:text-ink-soft/70"/>
        <div className="flex items-center justify-between gap-3 px-3 pb-2.5 pt-1">
          <label className="flex min-h-10 cursor-pointer items-center gap-2 pl-1 text-xs text-ink-soft">
            <input type="checkbox" checked={bewaren} onChange={(e) => { setBewaren(e.target.checked); if (!e.target.checked)
            void verwijderBewaard(); }} className="size-4 accent-[var(--brand)]"/>
            {t("routes.verhaal.bewaren")}
          </label>
          <button type="submit" disabled={!tekst.trim() || bezig} aria-label={t("common.versturen")} className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-primary-foreground shadow-sm transition disabled:bg-[color-mix(in_oklab,var(--foreground)_10%,transparent)] disabled:text-ink-soft disabled:shadow-none"><ArrowUp className="size-5" strokeWidth={2.2}/></button>
        </div>
      </form>
      </>}
      {berichten.length ? <button onClick={() => { nieuwGesprek(); setStap("start"); }} className="mt-3 min-h-11 w-full rounded-full border border-border bg-card px-5 text-sm font-semibold text-ink-soft">{t("routes.verhaal.nieuwGesprek")}</button> : null}
      <p className="mt-4 text-[11px] text-ink-soft">{t("routes.verhaal.privacyVoet")}</p>
    </AppShell>);
}
/** Conceptbericht uit het gesprek met Co: hier aan te passen, verstuurd wordt het pas in Berichten, door de ouder zelf. */
function BerichtConcept({ concept, ander }) {
    const { t } = useTranslation();
    const [tekst, setTekst] = useState(concept);
    return (<div className="mt-3 rounded-[20px] border-2 border-[#A9BCA8] bg-white/80 p-3.5">
      <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[#3F5747]">{t("routes.verhaal.concept.kop", { ander })}</p>
      <textarea value={tekst} onChange={(e) => setTekst(e.target.value)} rows={Math.min(8, Math.max(3, Math.ceil(tekst.length / 42)))} aria-label={t("routes.verhaal.concept.label", { ander })} className="mt-2 w-full resize-none rounded-2xl border border-[#E2D8CB] bg-card px-3 py-2.5 text-[15px] leading-relaxed outline-none"/>
      <div className="mt-2 flex flex-col gap-2">
        <Link to="/berichten" search={{ concept: tekst.trim() }} className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-brand px-4 text-sm font-black text-primary-foreground">{t("routes.verhaal.concept.verder")}</Link>
        {tekst !== concept ? <button onClick={() => setTekst(concept)} className="min-h-11 w-full rounded-full border border-border bg-card px-4 text-sm font-bold text-ink-soft">{t("routes.verhaal.concept.terug")}</button> : null}
      </div>
      <p className="mt-2 text-xs text-ink-soft">{t("routes.verhaal.concept.uitleg")}</p>
    </div>);
}
/** Teksten: routes.verhaal.start.<id> en routes.verhaal.lastig.<start>. */
const STARTS = [
    { id: "praten", Icoon: Smile, tegel: "#DCE3D3" },
    { id: "bericht", Icoon: PenLine, tegel: "#E6DFD3", naar: "/berichten" },
];
const LASTIG = [
    { start: "stoppen", tegel: "#C9D8C3", inkt: "#2F4A3A", uit: true,
        icoon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><circle cx="12" cy="12" r="2.6"/><circle cx="12" cy="12" r="6.2" opacity=".65"/><circle cx="12" cy="12" r="9.8" opacity=".35"/></svg> },
    { start: "komt", tegel: "#EFE1C9", inkt: "#6E5014", icoon: <Clock className="size-5" strokeWidth={2.2} aria-hidden/> },
    { start: "na", tegel: "#EBD9CC", inkt: "#6E3A24", icoon: <Heart className="size-5" strokeWidth={2.2} aria-hidden/> },
];
/** Sparren met Co, startscherm (stijl A6). */
function CoStart({ heeftBewaard, onLuister, onVerder }) {
    const { t } = useTranslation();
    const rij = "flex w-full items-center gap-3 px-3.5 py-3 text-left";
    return (<div>
      <div className="mt-4 rounded-[24px] border border-white/85 bg-white/60 p-4">
        <p className="text-[17px] font-black">{t("routes.verhaal.costart.kop")}</p>
        <div className="mt-3 flex items-center gap-2">
          <button onClick={onLuister} className="flex h-12 min-w-0 flex-1 items-center rounded-full bg-white px-4 text-left text-[15px] text-ink-soft">{t("routes.verhaal.placeholder.praten")}</button>
          <button onClick={onLuister} aria-label={t("routes.verhaal.inspreken")} className="grid size-12 shrink-0 place-items-center rounded-full bg-brand text-primary-foreground"><Mic className="size-5"/></button>
        </div>
      </div>
      {heeftBewaard ? <button onClick={onVerder} className="mt-3 min-h-11 w-full rounded-full border border-border bg-card px-5 text-sm font-extrabold text-brand">{t("routes.verhaal.costart.bewaard")}</button> : null}
      <h2 className="mt-5 px-1 text-[13px] font-black uppercase tracking-[0.08em] text-ink-soft">{t("routes.verhaal.costart.lastig")}</h2>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {LASTIG.map((l) => (<Link key={l.start} to="/lastige-momenten" search={{ start: l.start }} className={`flex min-w-0 flex-col gap-2 rounded-[20px] p-3 text-left ${l.uit ? "border-2 border-[#A9BCA8] [background:linear-gradient(135deg,rgba(220,230,210,.95),rgba(233,239,227,.9))]" : "border border-white/85 bg-white/60"}`}>
            <span className="grid size-9 place-items-center rounded-full" style={{ background: l.tegel, color: l.inkt }}>{l.icoon}</span>
            <span className="text-[14.5px] font-black leading-tight">{t(`routes.verhaal.lastig.${l.start}.titel`)}</span>
            <span className="text-[12.5px] leading-snug text-ink-soft">{t(`routes.verhaal.lastig.${l.start}.sub`)}</span>
          </Link>))}
      </div>
      <h2 className="mt-5 px-1 text-[13px] font-black uppercase tracking-[0.08em] text-ink-soft">{t("routes.verhaal.costart.ofBegin")}</h2>
      <div className="mt-2 divide-y divide-[#E9E1D5] rounded-[22px] border border-white/85 bg-white/60">
        {STARTS.map(({ id, Icoon, tegel, naar }) => {
            const titel = t(`routes.verhaal.start.${id}.titel`), sub = t(`routes.verhaal.start.${id}.sub`);
            const inhoud = <><span className="grid size-10 shrink-0 place-items-center rounded-[14px] text-[#3F5747]" style={{ background: tegel }}><Icoon className="size-5" aria-hidden/></span><span className="min-w-0 flex-1"><span className="block text-[16px] font-black">{titel}</span><span className="block text-sm text-ink-soft">{sub}</span></span><Chevron className="size-4 text-ink-soft"/></>;
            if (naar)
                return <Link key={id} to={naar} className={rij}>{inhoud}</Link>;
            return <button key={id} onClick={onLuister} className={rij}>{inhoud}</button>;
        })}
        <Link to="/lastige-momenten" search={{ start: "adem" }} className={rij}>
          <span className="grid size-10 shrink-0 place-items-center rounded-[14px] bg-[#E3ECDD]" aria-hidden><span className="size-3.5 rounded-full border-2 border-[#3F5747]"/></span>
          <span className="min-w-0 flex-1"><span className="block text-[16px] font-black">{t("routes.verhaal.costart.adem")}</span><span className="block text-sm text-ink-soft">{t("routes.verhaal.costart.ademSub")}</span></span>
          <Chevron className="size-4 text-ink-soft"/>
        </Link>
      </div>
      <Link to="/lastige-momenten" className="mt-3 flex min-h-11 w-full items-center justify-center rounded-full border border-border bg-card px-5 text-[14.5px] font-black text-[#3F5747]"><MetChevron>{t("routes.verhaal.costart.alleTips")}</MetChevron></Link>
      <div className="mt-4"><CoPrivacy /></div>
    </div>);
}
const ONDERWERPEN = ["wilNietMee", "scherpBericht", "teLaat", "nieuwePartner", "heelBoos", "huisStil"];
/** Even met Co: inspreken (of typen), de tekst eerst zelf zien en aanpassen, dan pas naar Co. */
function CoLuistert({ onKlaar }) {
    const { t } = useTranslation();
    const spraakFn = useServerFn(zetSpraakOm);
    const [tekst, setTekst] = useState("");
    const [status, setStatus] = useState("");
    const [fout, setFout] = useState("");
    const rec = useRef(null);
    const start = async () => {
        setFout("");
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const r = new MediaRecorder(stream);
            const delen = [];
            r.ondataavailable = (e) => { if (e.data.size)
                delen.push(e.data); };
            r.onstop = async () => {
                stream.getTracks().forEach((tr) => tr.stop());
                setStatus("omzetten");
                try {
                    const type = (r.mimeType || "audio/webm").replace(/^video\//, "audio/");
                    const buf = new Uint8Array(await new Blob(delen, { type }).arrayBuffer());
                    let bin = "";
                    buf.forEach((b) => (bin += String.fromCharCode(b)));
                    const { tekst: gehoord } = await spraakFn({ data: { audio: btoa(bin), type } });
                    if (!gehoord)
                        setFout(i18n.t("routes.verhaal.luister.nietsVerstaan"));
                    setTekst((v) => [v, gehoord].filter(Boolean).join(" "));
                }
                catch (e) {
                    setFout(e instanceof Error ? e.message : i18n.t("routes.verhaal.luister.omzettenMislukt"));
                }
                finally {
                    setStatus("");
                }
            };
            rec.current = r;
            r.start();
            setStatus("opnemen");
        }
        catch {
            setFout(i18n.t("routes.verhaal.luister.geenMicrofoon"));
        }
    };
    const stop = () => rec.current?.stop();
    const luistert = status === "opnemen";
    return (<div className="flex min-h-[60vh] flex-col">
      <p className="lora mt-6 text-center text-[26px] leading-snug">{luistert ? t("routes.verhaal.luister.bezig") : t("routes.verhaal.luister.kop")}</p>
      {!luistert && !tekst ? <p className="mx-auto mt-2 max-w-xs text-center text-[15px] text-ink-soft">{t("routes.verhaal.luister.intro")}</p> : null}
      <div className="mt-6 flex flex-col items-center gap-3">
        <button onClick={luistert ? stop : start} disabled={status === "omzetten"} aria-label={luistert ? t("routes.verhaal.luister.stop") : t("routes.verhaal.luister.start")} className="grid size-[120px] place-items-center rounded-full bg-brand text-primary-foreground disabled:opacity-60" style={{ boxShadow: luistert ? "0 0 0 14px rgba(169,188,168,.35), 0 0 0 28px rgba(169,188,168,.18)" : "0 0 0 10px rgba(169,188,168,.3)" }}>
          {luistert ? <Square className="size-9"/> : <Mic className="size-10"/>}
        </button>
        {luistert ? <div className="flex h-10 items-center gap-1" aria-hidden>{[14, 26, 18, 34, 22, 38, 16, 30, 20, 36, 24, 14, 28, 18].map((h, i) => <span key={i} className="w-1 animate-pulse rounded-full bg-[#4F6B58]" style={{ height: h, animationDelay: `${i * 90}ms` }}/>)}</div>
            : <p className="text-sm font-black text-[#3F5747]">{status === "omzetten" ? t("routes.verhaal.luister.omzetten") : t("routes.verhaal.luister.klaarVoorJe")}</p>}
      </div>
      {fout ? <p className="mt-3 text-center text-sm text-ink-soft">{fout}</p> : null}
      {tekst || luistert ? (<textarea value={tekst} onChange={(e) => setTekst(e.target.value)} rows={4} aria-label={t("routes.verhaal.luister.tekstLabel")} placeholder={t("routes.verhaal.luister.tekstPlaceholder")} className="mt-5 w-full resize-none rounded-2xl border border-white/85 bg-card px-4 py-3 text-[16px] leading-relaxed outline-none"/>) : (<div className="mt-6">
          <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-ink-soft">{t("routes.verhaal.luister.ofHierover")}</p>
          <div className="mt-2 flex flex-wrap gap-2">{ONDERWERPEN.map((id) => <button key={id} onClick={() => onKlaar(t(`routes.verhaal.onderwerp.${id}.zin`))} className="h-10 rounded-full border border-white/85 bg-white/70 px-4 text-sm font-extrabold">{t(`routes.verhaal.onderwerp.${id}.kort`)}</button>)}</div>
        </div>)}
      <div className="mt-auto pt-6">
        {tekst.trim() ? (<div className="flex flex-col gap-1.5">
            <button onClick={() => onKlaar(tekst.trim())} className={`w-full py-3 text-center leading-snug ${KNOP}`}>{t("routes.verhaal.luister.klaar")}</button>
            <button onClick={() => setTekst("")} className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full text-sm font-semibold text-ink-soft transition hover:text-ink"><RotateCcw aria-hidden="true" className="size-4"/>{t("routes.verhaal.luister.opnieuw")}</button>
          </div>) : !luistert ? (<form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); const v = new FormData(e.currentTarget).get("t")?.trim(); if (v)
            onKlaar(v); }}>
            <input name="t" placeholder={t("routes.verhaal.placeholder.praten")} aria-label={t("routes.verhaal.luister.typLabel")} className="h-12 min-w-0 flex-1 rounded-2xl border border-white/85 bg-card px-4 text-[15px] outline-none"/>
            <button type="button" onClick={start} aria-label={t("routes.verhaal.inspreken")} className="grid size-12 shrink-0 place-items-center rounded-full bg-brand text-primary-foreground"><Mic className="size-5"/></button>
          </form>) : null}
      </div>
    </div>);
}
