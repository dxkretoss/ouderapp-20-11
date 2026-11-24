import { vindDeadline } from "@/lib/deadline";
import { bevestig } from "@/lib/feedback";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { pauzeAdvies, pauzeRegel } from "@/lib/communicatiedruk";
import { AppShell, TerugKnop } from "@/components/AppShell";
import { Kruis, MetChevron } from "@/components/Tekens";
import { useBerichten, usePeilBerichten, maakGesprek, verstuurBericht, probeerOpnieuw, wisselVastgezet, dempGesprek, isGedempt, dagLabel } from "@/lib/berichten-store";
import { useGezin } from "@/lib/gezin";
import { useServerFn } from "@/lib/server-fn";
import { coachBericht, toonBericht, alGereageerd } from "@/lib/coach.functions";
import { vatGesprekSamen } from "@/lib/samenvatting.functions";
import { HulpKaart } from "@/components/Onveilig";
import { Plus, Mail, Search, Moon, ChevronRight, Pin, PinOff, Bell, BellOff, MoreHorizontal, Info, SendHorizontal, Check } from "lucide-react";
import { useVoorkeuren, zetVoorkeur } from "@/lib/voorkeuren-store";
import { EmailGesprek } from "@/components/EmailGesprek";
import { EvenMeedenken } from "@/components/EvenMeedenken";
import { useEmailKoppeling } from "@/lib/email-koppeling-store";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { NuAfstemmenKaart, NuAfstemmenStart } from "@/components/NuAfstemmen";
import { openNuAfstemmen, useNuAfstemmen } from "@/lib/nu-afstemmen-store";
import { useStart } from "@/lib/start-store";
import { AppIcon, Pictogram } from "@/components/AppIcon";
import { z } from "zod";
import { Communicatiemeter, FijnGecommuniceerd } from "@/components/Communicatiemeter";
import { signaalUitBeoordeling, signaalVraagtHerformulering, verdientBevestiging } from "@/lib/communicatiemeter";
import { bevatBelediging } from "@/lib/belediging";
import { analyseVoor, moetWaarschuwen, toonAfwijking } from "@/lib/deescalatie";
import { Button } from "@/components/ui/button";
import { heeftHerformulering } from "@/lib/coach-vergelijking";
import { maakCoachCache } from "@/lib/coach-cache";
import { CommunicatieSuggestie } from "@/components/CommunicatieSuggestie";
import { voegChatAfspraakToe } from "@/lib/chat-afspraken";
import { agendaVanBericht, herkenPraktisch, mogelijkeOnveiligheid, mogelijkVerwijt } from "@/lib/communicatie-suggesties";
import { Trans, useTranslation } from "react-i18next";
import i18n from "@/i18n";
export const Route = createFileRoute("/berichten")({
    validateSearch: z.object({ concept: z.string().optional(), gesprek: z.string().optional() }),
    head: () => ({
        meta: [
            { title: i18n.t("common.metaTitel", { titel: i18n.t("routes.berichten.meta.titel") }) },
            {
                name: "description",
                content: i18n.t("routes.berichten.meta.beschrijving"),
            },
            { property: "og:title", content: i18n.t("common.metaTitel", { titel: i18n.t("routes.berichten.meta.titel") }) },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
            {
                property: "og:description",
                content: i18n.t("routes.berichten.meta.ogBeschrijving"),
            },
        ],
    }),
    component: BerichtenPagina,
});
function BerichtenPagina() {
    const { t } = useTranslation();
    const context = Route.useSearch();
    const [actief, setActief] = useState(context.gesprek ?? null);
    const [nieuwOpen, setNieuwOpen] = useState(false);
    const [naam, setNaam] = useState("");
    const [berichtOpen, setBerichtOpen] = useState(false);
    const [concept, setConcept] = useState("");
    useEffect(() => { if (context.concept) {
        setConcept(context.concept);
        setBerichtOpen(true);
    } }, [context.concept]);
    const { koppeling, berichten: mails } = useEmailKoppeling();
    const startSt = useStart();
    const bs = useBerichten();
    const gezin = useGezin();
    // Elke 25 s verversen (en het open gesprek) zolang Berichten open staat, plus bij terugkeren naar het venster.
    usePeilBerichten(actief && actief !== "__email" ? actief : null);
    /** Berichten uitwisselen kan pas met een gekoppelde andere ouder; tot dan zijn onderwerpen voorbereide concepten. */
    const verbonden = gezin.gekoppeld || bs.coOuders.length > 0;
    const start = async () => {
        const n = naam.trim();
        if (!n)
            return;
        const eid = await maakGesprek({ titel: n });
        if (!eid)
            return;
        setNaam("");
        setNieuwOpen(false);
        setActief(eid);
    };
    const vk = useVoorkeuren();
    const [rustOpen, setRustOpen] = useState(false);
    const [zoekOpen, setZoekOpen] = useState(false);
    const [zoek, setZoek] = useState("");
    const zoekActief = zoekOpen && zoek.trim().length > 0;
    const q = zoek.trim().toLowerCase();
    const voorbereid = bs.gesprekken.filter((g) => g.concept);
    const lijst = bs.gesprekken
        .filter((g) => !g.concept)
        .map((g) => {
        if (!zoekActief)
            return { g, treffer: null };
        if (g.onderwerp.toLowerCase().includes(q) || g.laatsteTijd.toLowerCase().includes(q))
            return { g, treffer: null };
        const b = g.berichten.find((x) => x.tekst.toLowerCase().includes(q) || x.tijd.toLowerCase().includes(q));
        return b ? { g, treffer: `${b.tijd} · ${b.tekst}` } : null;
    })
        .filter((x) => !!x);
    const [naOpen, setNaOpen] = useState(false);
    const nuAfstemmen = useNuAfstemmen();
    if (!actief) {
        return (<AppShell>
        <div className="flex items-center gap-2.5">
          <h1 className="lora flex-1 text-[32px] leading-tight">{t("routes.berichten.meta.titel")}</h1>
          <button onClick={() => setZoekOpen((o) => !o)} aria-label={t("routes.berichten.zoekenLabel")} aria-pressed={zoekOpen} className="grid size-10 shrink-0 place-items-center rounded-full border border-white/90 bg-white/60 text-[#3F5747]">
            <Search className="size-[18px]" strokeWidth={2}/>
          </button>
          {verbonden ? <button onClick={() => setBerichtOpen(true)} aria-label={t("routes.berichten.nieuwBericht")} className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-primary-foreground">
            <Plus className="size-5" strokeWidth={2}/>
          </button> : null}
        </div>
        {verbonden ? <NieuwBericht open={berichtOpen} voorinvul={context.concept} gesprekken={lijst.map((x) => x.g)} onSluit={() => setBerichtOpen(false)} onStart={(gid, tekst) => { setBerichtOpen(false); setConcept(tekst); setActief(gid); }}/> : null}
        <NuAfstemmenStart open={naOpen} onSluit={() => setNaOpen(false)}/>
        <RustSheet open={rustOpen} onSluit={() => setRustOpen(false)}/>
        {zoekOpen ? (<input autoFocus value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder={t("routes.berichten.zoekPlaceholder")} aria-label={t("routes.berichten.zoekenLabel")} className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"/>) : null}
        {startSt.eigen || zoekActief ? null : (<button onClick={() => setNaOpen(true)} className="mt-4 flex w-full items-center gap-3 rounded-[22px] border border-white/85 bg-white/60 px-4 py-3.5 text-left">
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-black text-[#2F4A3A]">{t("routes.berichten.vandaagRegelen")}</span>
              <span className="block text-xs text-ink-soft">{t("routes.berichten.vandaagUitleg")}</span>
            </span>
            <ChevronRight className="size-4 text-ink-soft" strokeWidth={1.8}/>
          </button>)}
        {!startSt.eigen && openNuAfstemmen(nuAfstemmen).map((n) => <NuAfstemmenKaart key={n.id} n={n}/>)}

        <div className="mt-3 space-y-2.5">
          {koppeling ? (<button onClick={() => setActief("__email")} className="flex w-full items-center gap-3 rounded-md border border-border bg-card p-3 text-left">
              <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"><Mail className="size-5" strokeWidth={1.8}/></div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t("components.EmailGesprek.titel")}</p>
                <p className="truncate text-xs text-ink-soft">{t("components.EmailGesprek.viaEmailNaam", { naam: mails[mails.length - 1]?.tekst ?? t("routes.berichten.nogGeenBerichten") })}</p>
              </div>
            </button>) : null}
          {!verbonden && !koppeling ? (<section className="rounded-lg border border-border bg-card p-4">
              <p className="font-display text-lg font-bold">{t("routes.berichten.eigen.titel")}</p>
              <p className="mt-1 text-sm text-ink-soft">{startSt.uitgenodigd ? t("routes.berichten.eigen.uitgenodigd") : t("routes.berichten.eigen.nietUitgenodigd")} {t("routes.berichten.eigen.alvast")}</p>
              {!startSt.uitgenodigd ? <Link to="/solo" className="mt-3 inline-flex min-h-[44px] items-center rounded-xl bg-brand px-4 text-sm font-semibold text-primary-foreground">{t("routes.berichten.uitnodigen")}</Link> : null}
            </section>) : null}
          {voorbereid.map((o) => (<button key={o.id} onClick={() => setActief(o.id)} className="flex w-full items-center gap-3 rounded-md border border-border p-3 text-left">
              <AppIcon functie="berichten" maat="sm"/>
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{o.onderwerp}</p><p className="truncate text-xs text-ink-soft">{t("routes.berichten.voorbereid")}</p></div>
            </button>))}
          {verbonden && bs.status === "laden" && !lijst.length ? <p className="py-6 text-center text-sm text-ink-soft">{t("common.laden")}</p> : null}
          {verbonden && bs.status !== "laden" && !zoekActief && !lijst.length && !voorbereid.length ? (<section className="rounded-lg border border-border bg-card p-4">
              <p className="font-display text-lg font-bold">{t("routes.berichten.leeg.titel")}</p>
              <p className="mt-1 text-sm text-ink-soft">{t("routes.berichten.leeg.tekst")}</p>
            </section>) : null}
          {zoekActief && !lijst.length ? <p className="py-6 text-center text-sm text-ink-soft">{t("routes.berichten.geenGevonden", { zoek: zoek.trim() })}</p> : null}
          {lijst.map(({ g, treffer }) => {
                const vast = g.vastgezet;
                const stil = isGedempt(g);
                return (<button key={g.id} onClick={() => setActief(g.id)} className="flex w-full items-center gap-3 rounded-[22px] border border-white/85 bg-white/60 px-3.5 py-3 text-left">
                <div className="grid size-[42px] shrink-0 place-items-center rounded-[14px] bg-brand-soft text-lg">
                  <Pictogram waarde={g.icoon} maat="md" vorm="kaal"/>
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`flex items-center gap-1.5 text-[15.5px] ${g.ongelezen > 0 ? "font-black text-ink" : "font-extrabold"}`}>
                    {vast ? <Pin aria-label={t("routes.berichten.vastgezet")} className="size-3 shrink-0 text-ink-soft" strokeWidth={1.8}/> : null}
                    <span className="truncate">{g.onderwerp}</span>
                    {stil ? <BellOff aria-label={t("routes.berichten.gedempt")} className="size-3 shrink-0 text-ink-soft" strokeWidth={1.8}/> : null}
                  </p>
                  <p className={`truncate text-[13px] ${g.ongelezen > 0 ? "font-bold text-ink" : "text-ink-soft"}`}>{treffer ?? (g.laatste || t("routes.berichten.nogGeenBerichten"))}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-xs text-ink-soft">{g.laatsteTijd}</span>
                  {g.ongelezen > 0 ? <span className="grid h-[22px] min-w-[22px] place-items-center rounded-full bg-brand px-1.5 text-xs font-black text-primary-foreground" aria-label={t("routes.berichten.ongelezen", { count: g.ongelezen })}>{g.ongelezen}</span> : null}
                </div>
            </button>);
            })}
        </div>

        <button onClick={() => setRustOpen(true)} className="mt-4 flex w-full items-center gap-2 px-1 text-left">
          <Moon className="size-[17px] shrink-0 text-ink-soft" strokeWidth={2}/>
          <span className="flex-1 text-[13px] text-ink-soft">{vk.rustmodus ? t("routes.berichten.rust.aan", { van: vk.rustVan, tot: vk.rustTot }) : t("routes.berichten.rust.uit")}</span>
          <span className="text-[13px] font-extrabold text-[#3F5747]">{vk.rustmodus ? t("routes.berichten.rust.aanpassen") : t("routes.berichten.rust.instellen")}</span>
        </button>
        {!verbonden ? <div className="mt-4 rounded-md border border-border p-4">
          <p className="text-sm font-semibold">{t("routes.berichten.onderwerpVoorbereiden")}</p>
          <p className="mt-1 text-xs text-ink-soft">
            {t("routes.berichten.onderwerpVoorbeelden")}
          </p>
          {nieuwOpen ? (<form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); void start(); }}>
              <input autoFocus value={naam} onChange={(e) => setNaam(e.target.value)} maxLength={120} placeholder={t("routes.berichten.naamOnderwerp")} className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2.5 text-sm"/>
              <button type="submit" disabled={!naam.trim()} className="rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50">
                {t("routes.berichten.startKnop")}
              </button>
            </form>) : (<button onClick={() => setNieuwOpen(true)} className="mt-3 w-full rounded-md border border-white/70 bg-white/70 py-2.5 text-sm font-semibold text-brand">
              {t("routes.berichten.plusOnderwerp")}
            </button>)}
        </div> : null}
      </AppShell>);
    }
    if (actief === "__email")
        return <EmailGesprek onTerug={() => setActief(null)}/>;
    return <Gesprek id={actief} concept={concept} onTerug={() => { setActief(null); setConcept(""); }}/>;
}
/** Nieuw bericht: kiest de gekoppelde andere ouder + onderwerp/kind; het bericht komt eerst in het schrijfvak om na te lezen. */
function NieuwBericht({ open, voorinvul, gesprekken, onSluit, onStart }) {
    const { t } = useTranslation();
    const { kinderen } = useGezin();
    const { coOuders } = useBerichten();
    const [ontvanger, setOntvanger] = useState("");
    const [onderwerp, setOnderwerp] = useState("nieuw");
    const [nieuwNaam, setNieuwNaam] = useState("");
    const [kind, setKind] = useState("alle");
    const [tekst, setTekst] = useState("");
    const [bezig, setBezig] = useState(false);
    useEffect(() => { if (voorinvul) {
        setTekst(voorinvul);
        setNieuwNaam(t("routes.berichten.nieuw.gaatNietDoor"));
    } }, [voorinvul]);
    // Alleen ontvangers met toegang tot Berichten: de gekoppelde andere ouder(s). Professionals hebben geen toegang tot berichten tussen ouders.
    const ontvangers = coOuders.map((c) => ({ id: c.id, label: t("routes.berichten.nieuw.andereOuder", { naam: c.name || t("common.deAndereOuder") }) }));
    const aan = ontvanger || ontvangers[0]?.id || "";
    const kan = tekst.trim() && (onderwerp !== "nieuw" || nieuwNaam.trim()) && !bezig;
    const kindNaam = (id) => kinderen.find((k) => k.id === id)?.naam ?? "";
    const start = async () => {
        let gid = onderwerp;
        if (onderwerp === "nieuw") {
            setBezig(true);
            const titel = kind === "alle" || !kindNaam(kind) ? nieuwNaam.trim() : `${nieuwNaam.trim()} · ${kindNaam(kind)}`;
            gid = await maakGesprek({ titel, kindId: kind === "alle" ? undefined : kind });
            setBezig(false);
            if (!gid)
                return;
        }
        onStart(gid, tekst.trim(), aan);
        setTekst("");
        setNieuwNaam("");
        setOnderwerp("nieuw");
    };
    const veld = "mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm";
    return (<Sheet open={open} onOpenChange={(o) => !o && onSluit()}>
      <SheetContent side="bottom" className="left-1/2 max-h-[90vh] w-full max-w-md -translate-x-1/2 overflow-y-auto rounded-t-2xl bg-background px-5 pb-8">
        <SheetHeader className="text-left">
          <SheetTitle className="font-display text-xl font-medium">{t("routes.berichten.nieuwBericht")}</SheetTitle>
          <SheetDescription className="text-xs text-ink-soft">{t("routes.berichten.nieuw.alleenToegang")}</SheetDescription>
        </SheetHeader>
        <div className="mt-3 space-y-3 text-sm">
          <label className="block"><span className="text-xs font-semibold text-ink-soft">{t("routes.berichten.nieuw.aan")}</span>
            <select value={aan} onChange={(e) => setOntvanger(e.target.value)} className={veld}>{ontvangers.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
          </label>
          <label className="block"><span className="text-xs font-semibold text-ink-soft">{t("routes.berichten.onderwerp")}</span>
            <select value={onderwerp} onChange={(e) => setOnderwerp(e.target.value)} className={veld}>
              <option value="nieuw">{t("routes.berichten.nieuw.nieuwOnderwerp")}</option>
              {gesprekken.filter((g) => !g.anderId || g.anderId === aan).map((g) => <option key={g.id} value={g.id}>{g.onderwerp}</option>)}
            </select>
          </label>
          {onderwerp === "nieuw" ? (<>
              <label className="block"><span className="text-xs font-semibold text-ink-soft">{t("routes.berichten.naamOnderwerp")}</span>
                <input value={nieuwNaam} onChange={(e) => setNieuwNaam(e.target.value)} maxLength={100} placeholder={t("routes.berichten.nieuw.placeholderNaam")} className={veld}/>
              </label>
              {kinderen.length ? <label className="block"><span className="text-xs font-semibold text-ink-soft">{t("routes.berichten.nieuw.over")}</span>
                <select value={kind} onChange={(e) => setKind(e.target.value)} className={veld}><option value="alle">{kinderen.length > 1 ? kinderen.map((k) => k.naam).join(" & ") : kinderen[0].naam}</option>{kinderen.length > 1 ? kinderen.map((k) => <option key={k.id} value={k.id}>{k.naam}</option>) : null}</select>
              </label> : null}
            </>) : null}
          <label className="block"><span className="text-xs font-semibold text-ink-soft">{t("routes.berichten.nieuw.bericht")}</span>
            <textarea value={tekst} onChange={(e) => setTekst(e.target.value)} rows={4} maxLength={4000} className={`${veld} resize-none`} placeholder={t("routes.berichten.nieuw.schrijf")}/>
          </label>
          {tekst.trim() && onderwerp === "nieuw" && !nieuwNaam.trim() ? <p className="text-[12.5px] font-semibold text-[#2F4A3A]">{t("routes.berichten.nieuw.geefNaam")}</p> : null}
          <button disabled={!kan} onClick={() => void start()} className="h-12 w-full rounded-full bg-brand text-[15px] font-black text-primary-foreground disabled:opacity-40">{t("routes.berichten.nieuw.bekijk")}</button>
          <p className="text-center text-xs text-ink-soft">{t("routes.berichten.nieuw.nietsVerstuurd")}</p>
        </div>
      </SheetContent>
    </Sheet>);
}
const stijlen = ["Rustiger", "Korter", "Neutraler", "Duidelijker", "Meer kindgericht"];
/** Stijlen blijven Nederlandse ids voor de schrijfcoach; alleen het label wordt vertaald. */
const stijlSleutel = { "Rustiger": "rustiger", "Korter": "korter", "Neutraler": "neutraler", "Duidelijker": "duidelijker", "Meer kindgericht": "kindgericht" };
function Gesprek({ id, concept = "", onTerug }) {
    const { t } = useTranslation();
    const bs = useBerichten();
    const startSt = useStart();
    const gesprek = bs.gesprekken.find((g) => g.id === id) ?? { id, onderwerp: t("routes.berichten.onderwerp"), icoon: "berichten", concept: true, kanVersturen: false };
    /** Versturen kan alleen met een gekoppelde andere ouder; anders blijft dit een concept (voorbereid onderwerp). */
    const eigen = gesprek.kanVersturen ? null : { naam: gesprek.onderwerp, uitgenodigd: startSt.uitgenodigd, concept: gesprek.concept };
    // Per feedback: "de andere ouder" in plaats van steeds de naam te herhalen.
    const ander = t("routes.berichten.voorstel.deAndereOuder");
    const anderKlein = t("common.deAndereOuder");
    const coach = useServerFn(coachBericht);
    const toonFn = useServerFn(toonBericht);
    const vatSamen = useServerFn(vatGesprekSamen);
    const [samenvatting, setSamenvatting] = useState(null);
    const [vatBezig, setVatBezig] = useState(false);
    const berichten = bs.berichten[id] ?? [];
    const [tekst, setTekst] = useState(concept);
    const conceptSleutel = `onzeapp-concept-${id}`;
    const [conceptGeladen, setConceptGeladen] = useState(false);
    const [conceptHersteld, setConceptHersteld] = useState(false);
    useEffect(() => {
        if (!concept) {
            try {
                const c = localStorage.getItem(conceptSleutel);
                if (c) {
                    setTekst(c);
                    setConceptHersteld(true);
                }
            }
            catch { /* geen opslag */ }
        }
        setConceptGeladen(true);
    }, [conceptSleutel]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (!conceptGeladen)
            return;
        try {
            if (tekst.trim())
                localStorage.setItem(conceptSleutel, tekst);
            else
                localStorage.removeItem(conceptSleutel);
        }
        catch { /* geen opslag */ }
    }, [tekst, conceptGeladen, conceptSleutel]);
    const [voorstel, setVoorstel] = useState(null);
    const [infoOpen, setInfoOpen] = useState(false);
    const [waarschuwing, setWaarschuwing] = useState(null);
    const [beledigingCheck, setBeledigingCheck] = useState(false);
    const [bezig, setBezig] = useState(false);
    const [fout, setFout] = useState(null);
    const [stijlOpen, setStijlOpen] = useState(false);
    const [actiesVoor, setActiesVoor] = useState(null);
    const [akkoordVoor, setAkkoordVoor] = useState(null);
    const [akkoordTekst, setAkkoordTekst] = useState("");
    const [akkoorden, setAkkoorden] = useState(() => akkoordGeheugen[id] ?? {});
    const geenAgenda = useRef(geenAgendaGeheugen);
    const geefAkkoord = (b) => {
        const label = vraagLabel(b.tekst, suggestieNamen) ?? b.tekst;
        const g = vraagGegevens(b.tekst, suggestieNamen, true);
        // De andere ouder vroeg het, jij geeft akkoord: dan staat het meteen als afgesproken in de agenda (geen tweede formulier).
        if (g.datum && g.tijd)
            voegChatAfspraakToe({ titel: g.titel ?? label, datum: g.datum, tijd: g.tijd, kind: g.kind ?? gezinsStart.kinderen.map((k) => k.naam).join(" & "), toelichting: t("routes.berichten.akkoord.toelichting", { tekst: b.tekst }) });
        else
            geenAgenda.current.add(b.id);
        const nieuw = { ...akkoorden, [b.id]: label };
        akkoordGeheugen[id] = nieuw;
        setAkkoorden(nieuw);
        if (akkoordTekst.trim())
            verstuur(akkoordTekst);
        setAkkoordVoor(null);
        setAkkoordTekst("");
        bevestig(g.datum && g.tijd ? t("routes.berichten.akkoord.inAgenda") : t("routes.berichten.akkoord.gegeven"), { uitleg: t("routes.berichten.akkoord.zietDit", { naam: ander }) });
    };
    const vkG = useVoorkeuren();
    const gezinsStart = useStart();
    const suggestieNamen = gezinsStart.kinderen.map((k) => k.naam);
    // Geen geverifieerde gezinsbron beschikbaar; voorbeeldplanning is geen bewijs van akkoord.
    const bevestigd = false;
    const [alGewaarschuwd, setAlGewaarschuwd] = useState(null);
    const analyse = useRef(null);
    const contextVoorCoach = berichten.slice(-6).map((b) => ({ van: b.van === "ik" ? "ik" : "ander", tekst: b.tekst.slice(0, 1200) }));
    const analyseSleutel = (inhoud) => JSON.stringify([inhoud, contextVoorCoach]);
    const huidigeSleutel = analyseSleutel(tekst);
    const actueleSleutel = useRef(huidigeSleutel);
    actueleSleutel.current = huidigeSleutel;
    const cache = useRef(maakCoachCache());
    const meterCache = useRef(maakCoachCache());
    const schrijfNummer = useRef(0);
    const [traag, setTraag] = useState(false);
    const laatsteStijl = useRef("Rustiger");
    useEffect(() => { if (!bezig) {
        setTraag(false);
        return;
    } const t = setTimeout(() => setTraag(true), 8000); return () => clearTimeout(t); }, [bezig]);
    useEffect(() => { if (!vkG.aiSchrijfhulp) {
        cache.current.wis();
        meterCache.current.wis();
        analyse.current = null;
        schrijfNummer.current++;
        setBezig(false);
        setVoorstel(null);
    } }, [vkG.aiSchrijfhulp]);
    useEffect(() => () => { schrijfNummer.current++; }, []);
    // Pauze bij snel heen-en-weer: kijkt naar het werkelijke patroon van beide kanten (configureerbare regel).
    // Het werkelijke patroon van beide kanten: tijdstippen van de berichten in dit gesprek.
    const tikken = berichten.filter((b) => !b.mislukt).map((b) => ({ van: b.van, ts: Date.parse(b.at) }));
    const [ruimte, setRuimte] = useState(false);
    const [pauzeTot, setPauzeTot] = useState(null);
    const [nu, setNu] = useState(Date.now());
    useEffect(() => {
        if (!pauzeTot)
            return;
        const t = setInterval(() => { setNu(Date.now()); if (Date.now() >= pauzeTot)
            setPauzeTot(null); }, 1000);
        return () => clearInterval(t);
    }, [pauzeTot]);
    // Communicatiemeter: na een schrijfpauze één check per ongewijzigde tekst, via de bestaande analysecache.
    const meterAan = vkG.rustigerCommuniceren && vkG.aiSchrijfhulp;
    const [meter, setMeter] = useState(null);
    const [meterBezig, setMeterBezig] = useState(false);
    const [fijn, setFijn] = useState(null);
    useEffect(() => {
        if (!meterAan || bezig || tekst.trim().length < 2) {
            setMeterBezig(false);
            return;
        }
        const sleutel = analyseSleutel(tekst);
        if (meter?.sleutel === sleutel)
            return;
        const bekend = analyseVoor(analyse.current, sleutel);
        if (bekend) {
            setMeter({ sleutel, resultaat: bekend });
            return;
        }
        let weg = false;
        const t = setTimeout(async () => {
            setMeterBezig(true);
            try {
                const t2 = await meterCache.current.vraag(sleutel, () => toonFn({ data: { tekst, context: contextVoorCoach } }));
                if (weg)
                    return;
                setMeter({ sleutel, resultaat: t2 });
            }
            catch {
                if (!weg)
                    setMeter({ sleutel, resultaat: null });
            }
            finally {
                if (!weg)
                    setMeterBezig(false);
            }
        }, 600);
        return () => { weg = true; clearTimeout(t); };
    }, [huidigeSleutel, meterAan, bezig]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { if (!fijn)
        return; const t = setTimeout(() => setFijn(null), 1800); return () => clearTimeout(t); }, [fijn]);
    const huidigSignaal = meter && tekst.trim() && meter.sleutel === analyseSleutel(tekst) ? signaalUitBeoordeling(meter.resultaat) : null;
    const huidigeBeoordeling = analyseVoor(analyse.current, huidigeSleutel) ?? (meter?.sleutel === huidigeSleutel ? meter.resultaat : null);
    const afstemmingNodig = huidigeBeoordeling?.afstemming === "overleg" || huidigeBeoordeling?.afstemming === "druk";
    const resterend = pauzeTot ? Math.max(0, pauzeTot - nu) : 0;
    const verstuur = (inhoud, negeerRuimte = false) => {
        if (!inhoud.trim() || pauzeTot || eigen)
            return;
        const nieuw = [...tikken, { van: "ik", ts: Date.now() }];
        const advies = pauzeAdvies(nieuw);
        if (advies === "pauze" && negeerRuimte) {
            setPauzeTot(Date.now() + pauzeRegel.pauzeMs);
            setNu(Date.now());
            return;
        }
        if (advies !== "geen" && !negeerRuimte) {
            setRuimte(true);
            return;
        }
        setRuimte(false);
        const beoordelingBijVerzenden = analyseVoor(analyse.current, analyseSleutel(inhoud)) ?? (meter?.sleutel === analyseSleutel(inhoud) ? meter.resultaat : null);
        const nieuwId = `n${berichten.length}-${Date.now()}`;
        void verstuurBericht(id, inhoud, beoordelingBijVerzenden?.niveau ?? "geen");
        // Pas ná het toevoegen, alleen voor de afzender, alleen bij betrouwbaar rustige/neutrale toon.
        setFijn(meterAan && verdientBevestiging(beoordelingBijVerzenden) ? nieuwId : null);
        schrijfNummer.current++;
        setBezig(false);
        setFout(null);
        setTekst("");
        setVoorstel(null);
        setWaarschuwing(null);
        setBeledigingCheck(false);
    };
    const probeerVersturen = () => {
        if (!tekst.trim())
            return;
        // Veiligheid gaat altijd voor: lokale dreigingscontrole, ook vóórdat de AI heeft geoordeeld.
        if (mogelijkeOnveiligheid(tekst)) {
            setAlGewaarschuwd(tekst);
            setWaarschuwing({ voorstel: "", methode: "geen", reactieNodig: true, veranderingen: [], openPunten: [], afwijking: false, niveau: "dreigend" });
            return;
        }
        // Duidelijke belediging: direct een lokale bevestiging, zonder op de AI te wachten.
        if (bevatBelediging(tekst) && tekst.trim() !== (alGewaarschuwd ?? "").trim()) {
            setAlGewaarschuwd(tekst);
            setBeledigingCheck(true);
            return;
        }
        const r = analyseVoor(analyse.current, huidigeSleutel) ?? (meter?.sleutel === huidigeSleutel ? meter.resultaat : null);
        // Alleen een bestaande beoordeling benutten. Verzenden wacht nooit op een AI-aanvraag.
        if (meterAan && r && moetWaarschuwen(r, tekst, alGewaarschuwd)) {
            setAlGewaarschuwd(tekst);
            setWaarschuwing({ voorstel: "", methode: "geen", reactieNodig: true, veranderingen: [], openPunten: [], afwijking: false, ...r });
            return;
        }
        verstuur(tekst);
    };
    const herschrijf = async (stijl, alsVoorstel = false, basis) => {
        const bron = basis ?? tekst;
        if (!bron.trim() || !vkG.aiSchrijfhulp)
            return;
        const origineel = bron, sleutel = analyseSleutel(bron);
        const nummer = ++schrijfNummer.current;
        laatsteStijl.current = stijl;
        setStijlOpen(false);
        setBeledigingCheck(false);
        setBezig(true);
        setFout(null);
        try {
            const r = await cache.current.vraag(JSON.stringify([sleutel, stijl, alsVoorstel]), () => coach({ data: { tekst: origineel, stijl, context: contextVoorCoach, alsVoorstel } }));
            if (nummer !== schrijfNummer.current || (actueleSleutel.current !== sleutel && !basis))
                return;
            // De AI beoordeelt het origineel: nooit als beoordeling van het voorstel bewaren.
            analyse.current = { sleutel, resultaat: r };
            setMeter({ sleutel, resultaat: r });
            // Een voorstel dat zelf nog een belediging bevat is geen bruikbaar voorstel: eerlijk melden, niets aanbieden.
            const onbruikbaar = bevatBelediging(r.voorstel);
            setVoorstel({ soort: "schrijven", origineel, tekst: onbruikbaar ? "" : r.voorstel, niveau: r.niveau, reactieNodig: true, veranderingen: onbruikbaar ? [] : r.veranderingen, afwijking: toonAfwijking(r.afwijking, bevestigd), nieuweDetails: r.nieuweDetails, zinvol: onbruikbaar ? false : r.zinvol });
        }
        catch (e) {
            if (nummer === schrijfNummer.current)
                setFout(e instanceof Error ? e.message : t("routes.berichten.foutAlgemeen"));
        }
        finally {
            if (nummer === schrijfNummer.current)
                setBezig(false);
        }
    };
    /** "Ander voorstel": vraag een variant met de volgende stijl, altijd vanuit de eigen oorspronkelijke tekst. */
    const anderVoorstel = (origineel) => {
        const volgende = stijlen[(stijlen.indexOf(laatsteStijl.current) + 1) % stijlen.length] ?? "Rustiger";
        void herschrijf(volgende, false, origineel);
    };
    /** Hulp bij antwoorden op een ontvangen bericht; gebruikt de bestaande schrijfcoach met gesprekscontext. */
    const helpAntwoorden = async (b, variant = 0) => {
        if (!vkG.aiSchrijfhulp)
            return;
        const nummer = ++schrijfNummer.current;
        const sleutel = actueleSleutel.current;
        setBezig(true);
        setFout(null);
        setActiesVoor(null);
        const i = berichten.findIndex((x) => x.id === b.id);
        const zet = (x) => ({ van: x.van === "ik" ? "ik" : "ander", tekst: x.tekst });
        const context = berichten.slice(Math.max(0, i - 8), i).map(zet);
        // Alleen wat er ná dit bericht kwam tot het volgende bericht van de ander: dat is jouw reactie hierop.
        const volgendeAnder = berichten.findIndex((x, j) => j > i && x.van !== "ik");
        const daarna = berichten.slice(i + 1, volgendeAnder === -1 ? i + 9 : Math.min(volgendeAnder, i + 9)).map(zet);
        const gedaan = alGereageerd(daarna);
        try {
            const r = await cache.current.vraag(JSON.stringify([b.tekst, "antwoord", context, daarna, variant]), () => coach({ data: { tekst: b.tekst, stijl: "antwoord", context, daarna, variant } }));
            if (nummer !== schrijfNummer.current || sleutel !== actueleSleutel.current)
                return;
            setVoorstel({ soort: "antwoord", bronId: b.id, variant, origineel: b.tekst, tekst: bevatBelediging(r.voorstel) || mogelijkeOnveiligheid(r.voorstel) ? "" : r.voorstel, niveau: r.niveau, reactieNodig: gedaan ? !!r.voorstel.trim() : r.reactieNodig, alGereageerd: gedaan, openPunten: r.openPunten, nieuweDetails: r.nieuweDetails });
        }
        catch (e) {
            if (nummer === schrijfNummer.current)
                setFout(e instanceof Error ? e.message : t("routes.berichten.foutAlgemeen"));
        }
        finally {
            if (nummer === schrijfNummer.current)
                setBezig(false);
        }
    };
    return (<AppShell>
      <div className="flex items-center gap-3">
        <TerugKnop onClick={onTerug}/>
        <div className="min-w-0 flex-1">
          <h1 className="lora text-[26px] leading-tight">{gesprek.onderwerp}</h1>
          <p className="text-xs text-ink-soft">{eigen ? (eigen.concept ? t("routes.berichten.gesprek.conceptNietGekoppeld") : t("routes.berichten.gesprek.nietMeerGekoppeld")) : t("routes.berichten.gesprek.jullieTweeen")}</p>
        </div>
        {eigen ? null : <GesprekOpties id={gesprek.id} onderwerp={gesprek.onderwerp} onSamenvatten={vkG.aiSchrijfhulp && berichten.length ? async () => { setVatBezig(true); setFout(null); try {
        setSamenvatting(await vatSamen({ data: { gesprekId: id } }));
    }
    catch (e) {
        setFout(e instanceof Error ? e.message : t("routes.berichten.foutAlgemeen"));
    }
    finally {
        setVatBezig(false);
    } } : undefined}/>}
      </div>

      {samenvatting ? (<div className="mt-3 rounded-[18px] border border-white/85 bg-white/70 p-3 text-sm">
          <div className="flex items-center justify-between"><p className="text-xs font-semibold text-ink-soft">{t("routes.berichten.samenvatting.titel")}</p><button onClick={() => setSamenvatting(null)} className="knop-kruis size-7 text-xs" aria-label={t("common.sluiten")}><Kruis className="size-3.5"/></button></div>
          <p className="mt-1 whitespace-pre-line text-ink">{samenvatting}</p>
        </div>) : vatBezig ? <p className="mt-3 text-center text-xs text-ink-soft">{t("routes.berichten.samenvatting.bezig")}</p> : null}

      <div className="mt-4 space-y-3">
        {berichten.map((b, i) => {
            const dag = dagLabel(b.at);
            const nieuweDag = i === 0 || dag !== dagLabel(berichten[i - 1].at);
            const vanMij = b.van === "ik";
            const vraag = !vanMij && !akkoorden[b.id] ? vraagLabel(b.tekst, suggestieNamen) : null;
            const laatsteVanAnder = b.id === berichten.filter((x) => x.van !== "ik").at(-1)?.id;
            return (<div key={b.id}>
              {nieuweDag ? <p className="mb-3 mt-1 text-center"><span className="rounded-full bg-white/60 px-2.5 py-1 text-[11.5px] font-extrabold text-ink-soft">{dag}</span></p> : null}
              <div className={`flex ${vanMij ? "justify-end" : "justify-start"}`}>
                <div className="min-w-0 max-w-[80%] break-words">
                  <button type="button" onClick={() => setActiesVoor(actiesVoor === b.id ? null : b.id)} aria-expanded={actiesVoor === b.id} aria-label={vanMij ? t("routes.berichten.bericht.vanJouLabel") : t("routes.berichten.bericht.vanAnderLabel", { naam: anderKlein })} className={`block w-full rounded-[20px] px-4 py-2.5 text-left text-[15px] leading-snug ${vanMij ? "rounded-br-md bg-brand text-primary-foreground" : "rounded-bl-md border border-white/95 bg-white/90 text-ink"}`}>{b.tekst}</button>
                  {vraag ? (<button type="button" onClick={() => setAkkoordVoor(b)} className="mt-1.5 flex w-full items-center gap-2.5 rounded-[16px] border border-[#C9D6C3] bg-[#E9EFE3] px-3 py-2 text-left">
                      <AppIcon functie="agenda" maat="sm" vorm="kaal"/>
                      <span className="min-w-0"><span className="block text-[13.5px] font-black text-[#2F4A3A]">{vraag}</span><span className="block text-xs text-ink-soft">{t("routes.berichten.bericht.inAgendaVraag")}</span></span>
                    </button>) : null}
                  <p className={`mt-1 text-[11.5px] text-ink-soft ${vanMij ? "text-right" : ""}`}>{vanMij ? (b.mislukt ? <>{t("routes.berichten.bericht.nietVerstuurd")} · <button type="button" onClick={() => void probeerOpnieuw(id, b)} className="font-semibold text-brand">{t("routes.berichten.opnieuw")}</button></> : b.wacht ? t("routes.berichten.bericht.versturen") : t("routes.berichten.bericht.verstuurd", { tijd: b.tijd })) : `${ander} · ${b.tijd}`}</p>
                  {!vanMij && mogelijkeOnveiligheid(b.tekst) ? <div className="mt-2 text-sm" role="note"><p className="text-ink">{t("routes.berichten.bericht.bedreigend")}</p><details className="mt-1 text-xs"><summary className="min-h-11 cursor-pointer text-brand">{t("routes.berichten.bericht.hulpOpties")}</summary><HulpKaart /></details></div> : !vanMij && mogelijkVerwijt(b.tekst) ? <p className="mt-1 text-xs text-ink-soft">{t("routes.berichten.bericht.rustigTijd")}</p> : null}
                  {actiesVoor === b.id ? (<div className="mt-1.5 overflow-hidden rounded-[16px] bg-white text-sm shadow-[0_8px_24px_rgba(60,50,40,.14)]">
                      {/* Elke keuze opent alleen de bestaande flow met de tekst vooraf ingevuld; de gebruiker vult aan en bevestigt. */}
                      {!vanMij && vkG.aiSchrijfhulp ? <button type="button" disabled={bezig} onClick={() => { setActiesVoor(null); void helpAntwoorden(b); }} className="flex w-full items-center gap-2.5 border-b border-[#F0EAE1] px-3.5 py-3 text-left font-extrabold"><AppIcon functie="co" maat="sm"/>{t("routes.berichten.bericht.helpReageren")}</button> : null}
                      {herkenPraktisch(b.tekst, suggestieNamen)?.zorg ? <Link to="/zorgregeling" search={{ actie: "wijziging", bron: "berichten", omschrijving: b.tekst }} className="flex items-center gap-2.5 border-b border-[#F0EAE1] px-3.5 py-3 font-extrabold"><AppIcon functie="wissel" maat="sm" vorm="kaal"/>{t("routes.berichten.bericht.wijzigingVoorstellen")}</Link>
                        : !vanMij ? <button type="button" onClick={() => { setActiesVoor(null); setAkkoordVoor(b); }} className="flex w-full items-center gap-2.5 border-b border-[#F0EAE1] px-3.5 py-3 text-left font-extrabold"><AppIcon functie="agenda" maat="sm" vorm="kaal"/>{t("routes.berichten.bericht.inAgenda")}</button>
                            : <Link to="/agenda" search={agendaVanBericht(b.tekst, suggestieNamen)} className="flex items-center gap-2.5 border-b border-[#F0EAE1] px-3.5 py-3 font-extrabold"><AppIcon functie="agenda" maat="sm" vorm="kaal"/>{t("routes.berichten.bericht.voorstelAgenda")}</Link>}
                      <Link to="/taken" search={{ taak: b.tekst, berichtId: b.id, gesprekId: id }} className="flex items-center gap-2.5 border-b border-[#F0EAE1] px-3.5 py-3 font-extrabold"><AppIcon functie="taken" maat="sm" vorm="kaal"/>{t("routes.berichten.bericht.taak")}</Link>
                      <Link to="/kosten" search={{ uitgave: b.tekst.slice(0, 200) }} className="flex items-center gap-2.5 border-b border-[#F0EAE1] px-3.5 py-3 font-extrabold"><AppIcon functie="kosten" maat="sm" vorm="kaal"/>{t("routes.berichten.bericht.kosten")}</Link>
                      <Link to="/afspraken" search={{ nieuw: "afspraak", bron: b.tekst }} className="flex items-center gap-2.5 border-b border-[#F0EAE1] px-3.5 py-3 font-extrabold"><AppIcon functie="afspraak" maat="sm" vorm="kaal"/>{t("routes.berichten.bericht.vastleggen")}</Link>
                      {vindDeadline(b.tekst) ? <Link to="/taken" search={{ taak: b.tekst.slice(0, 60), deadline: vindDeadline(b.tekst) }} className="flex items-center gap-2.5 px-3.5 py-3 font-extrabold"><AppIcon functie="tijd" maat="sm" vorm="kaal"/>{t("routes.berichten.bericht.deadline")}</Link> : null}
                    </div>) : null}
                  {laatsteVanAnder && vkG.aiSchrijfhulp && actiesVoor !== b.id && !akkoorden[b.id] ? (<button type="button" disabled={bezig} onClick={() => void helpAntwoorden(b)} className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-full border border-[#E6DED2] bg-white/75 pl-1 pr-3 text-[13px] font-extrabold text-[#2F4A3A] disabled:opacity-50">
                      <AppIcon functie="co" maat="sm"/>{bezig ? t("routes.berichten.evenKijken") : t("routes.berichten.bericht.helpReageren")}
                    </button>) : null}
                </div>
              </div>
              {akkoorden[b.id] ? (<div className="mt-2.5 flex justify-center">
                  <div className="flex max-w-[90%] items-center gap-2 rounded-[16px] border border-[#C9D6C3] bg-[#E9EFE3] px-3 py-2">
                    <Check className="size-4 shrink-0 text-[#3F5747]" strokeWidth={2.2}/>
                    <span><span className="block text-[13.5px] font-black text-[#2F4A3A]">{geenAgenda.current.has(b.id) ? t("routes.berichten.akkoord.jijGaf") : t("routes.berichten.akkoord.jijGafAgenda")}</span><span className="block text-xs text-ink-soft">{t("routes.berichten.akkoord.labelZiet", { label: akkoorden[b.id], naam: anderKlein })}</span>
                      {geenAgenda.current.has(b.id)
                        ? <Link to="/agenda" search={{ ...agendaVanBericht(b.tekst, suggestieNamen), ...vraagGegevens(b.tekst, suggestieNamen, true) }} className="mt-1 inline-block text-xs font-extrabold text-[#3F5747]"><MetChevron>{t("routes.berichten.akkoord.inAgendaPijl")}</MetChevron></Link>
                        : <Link to="/agenda" className="mt-1 inline-block text-xs font-extrabold text-[#3F5747]"><MetChevron>{t("routes.berichten.akkoord.bekijkAgenda")}</MetChevron></Link>}</span>
                  </div>
                </div>) : null}
            </div>);
        })}
      </div>

      <Sheet open={!!akkoordVoor} onOpenChange={(o) => { if (!o) {
        setAkkoordVoor(null);
        setAkkoordTekst("");
    } }}>
        <SheetContent side="bottom" className="left-1/2 w-full max-w-md -translate-x-1/2 rounded-t-[26px] bg-background px-5 pb-8">
          <SheetHeader className="text-left">
            <SheetTitle className="text-[13px] font-black uppercase tracking-[0.08em] text-ink-soft">{t("routes.berichten.bericht.inAgenda")}</SheetTitle>
            <SheetDescription className="sr-only">{t("routes.berichten.akkoord.sheetBeschrijving")}</SheetDescription>
          </SheetHeader>
          {akkoordVoor ? <>
            <div className="mt-2 flex items-center gap-3 rounded-[16px] bg-white px-3.5 py-3">
              <AppIcon functie="agenda" maat="sm" vorm="kaal"/>
              <span className="min-w-0"><span className="block text-[15.5px] font-black">{vraagLabel(akkoordVoor.tekst, suggestieNamen) ?? t("routes.berichten.akkoord.afspraakUitBericht")}</span><span className="block text-xs text-ink-soft">“{akkoordVoor.tekst}”</span></span>
            </div>
            <p className="mt-3 text-[14.5px]">{t("routes.berichten.akkoord.vroegDit", { naam: ander })}</p>
            <textarea value={akkoordTekst} onChange={(e) => setAkkoordTekst(e.target.value)} rows={2} aria-label={t("routes.berichten.akkoord.berichtErbij")} placeholder={t("routes.berichten.akkoord.berichtErbijPlaceholder")} className="mt-2 w-full resize-none rounded-[16px] border border-[#E6DED2] bg-white px-3.5 py-2.5 text-[15px] outline-none"/>
            <button onClick={() => geefAkkoord(akkoordVoor)} className="mt-3 h-12 w-full rounded-full bg-brand text-[15px] font-black text-primary-foreground">{t("routes.berichten.akkoord.gevenEnAgenda")}</button>
            <button onClick={() => { setAkkoordVoor(null); setAkkoordTekst(""); }} className="mt-2 h-12 w-full rounded-full border border-[#E6DED2] bg-white text-[15px] font-black text-[#2F4A3A]">{t("routes.berichten.akkoord.eerstBespreken")}</button>
            <p className="mt-2 text-center text-xs text-ink-soft">{t("routes.berichten.akkoord.zietInGesprek", { naam: ander })}</p>
          </> : null}
        </SheetContent>
      </Sheet>

      {waarschuwing && !voorstel ? (<div className={`mt-4 rounded-md border p-4 ${waarschuwing.niveau === "licht" ? "border-border bg-card" : "border-accent-warm bg-accent-warm/20"}`}>
          {waarschuwing.niveau === "geen" ? null : waarschuwing.niveau !== "dreigend" ? (<>
              <p className="font-semibold">{t("routes.berichten.waarschuwing.andersTitel")}</p>
              <p className="mt-1 text-sm text-ink-soft">{t("routes.berichten.waarschuwing.andersTekst")}</p>
            </>) : (<>
              <p className="font-semibold">{t("routes.berichten.waarschuwing.dreigendTitel")}</p>
              <p className="mt-1 text-sm text-ink-soft">{t("routes.berichten.waarschuwing.dreigendTekst")}</p>
            </>)}
          {waarschuwing.afwijking ? <div className={waarschuwing.niveau === "geen" ? "" : "mt-3"}><AfwijkingHint /></div> : null}
          <div className="mt-3 flex flex-col gap-2">
            {waarschuwing.niveau === "geen" ? null : <button onClick={() => herschrijf("Rustiger")} className="flex items-center justify-center gap-1.5 rounded-md bg-brand py-2.5 text-sm font-semibold text-primary-foreground"><AppIcon functie="slim" maat="sm" vorm="kaal"/>{t("routes.berichten.waarschuwing.bekijkVoorstel")}</button>}
            <div className="flex gap-2">
              <button onClick={() => verstuur(tekst)} className="flex-1 rounded-md border border-border py-2.5 text-sm font-semibold text-ink-soft">{t("routes.berichten.tochVersturen")}</button>
              <button onClick={() => setWaarschuwing(null)} className="flex-1 rounded-md border border-border py-2.5 text-sm font-semibold">{t("routes.berichten.terugNaarBericht")}</button>
            </div>
          </div>
          {waarschuwing.niveau === "dreigend" ? <div className="mt-3"><HulpKaart /></div> : null}
        </div>) : null}

      {beledigingCheck && !voorstel ? (<div className="mt-4 rounded-md border border-border bg-card p-4" role="alertdialog" aria-label={t("routes.berichten.belediging.label")}>
          <p className="font-semibold">{t("routes.berichten.belediging.titel")}</p>
          <p className="mt-1 text-sm text-ink-soft">{t("routes.berichten.belediging.tekst")}</p>
          <p className="mt-2 rounded-md bg-muted p-2.5 text-sm text-ink">{tekst}</p>
          <div className="mt-3 flex flex-col gap-2">
            <button onClick={() => herschrijf("Rustiger")} className="flex items-center justify-center gap-1.5 rounded-md bg-brand py-2.5 text-sm font-semibold text-primary-foreground"><AppIcon functie="slim" maat="sm" vorm="kaal"/>{t("routes.berichten.belediging.helpFormuleren")}</button>
            <button onClick={() => setBeledigingCheck(false)} className="rounded-md border border-border py-2.5 text-sm font-semibold">{t("routes.berichten.terugNaarBericht")}</button>
            <button onClick={() => verstuur(tekst)} className="py-1.5 text-xs text-ink-soft underline-offset-2 hover:underline">{t("routes.berichten.tochVersturen")}</button>
          </div>
        </div>) : null}

      {voorstel ? (<div className="mt-4 space-y-3 rounded-md border border-brand/20 bg-brand-soft p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="flex items-center gap-1.5 font-display text-base font-semibold"><AppIcon functie="slim" maat="sm" vorm="kaal"/>{t("routes.berichten.voorstel.titel")}</p>
            <button type="button" onClick={() => setInfoOpen((o) => !o)} aria-label={t("routes.berichten.voorstel.over")} className="text-ink-soft"><Info className="size-4"/></button>
          </div>
          <p className="text-xs text-ink-soft">{t("routes.berichten.voorstel.intro")}</p>
          {infoOpen ? (<p className="rounded-md bg-card p-2.5 text-[11px] text-ink-soft">
              <Trans i18nKey="routes.berichten.voorstel.methoden" components={{ b: <strong/> }}/>
            </p>) : null}
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">{voorstel.soort === "antwoord" ? t("routes.berichten.voorstel.ontvangen") : t("routes.berichten.voorstel.jouwTekst")}</p>
          <p className="-mt-2 text-sm text-ink-soft">{voorstel.origineel}</p>
          {voorstel.niveau === "dreigend" ? (<div className="space-y-2">
              <p className="text-sm text-ink">{voorstel.soort === "antwoord" ? t("routes.berichten.voorstel.dreigendOntvangen") : t("routes.berichten.voorstel.dreigendEigen")}</p>
              <HulpKaart />
            </div>) : null}
          {voorstel.alGereageerd ? (<p className="rounded-md bg-muted p-2.5 text-sm font-semibold text-ink">{voorstel.tekst.trim() ? t("routes.berichten.voorstel.alGereageerdAanvulling") : t("routes.berichten.voorstel.alGereageerdGeen")}</p>) : null}
          {voorstel.soort === "schrijven" && (!heeftHerformulering(voorstel.origineel, voorstel.tekst) || voorstel.zinvol === false) ? (<div className="space-y-3">
              <p className="text-sm font-semibold text-ink">{voorstel.nieuweDetails?.length ? t("routes.berichten.voorstel.geenPassend") : voorstel.niveau === "geen" && !afstemmingNodig ? t("routes.berichten.voorstel.alDuidelijk") : t("routes.berichten.voorstel.geenAndere")}</p>
              <p className="text-sm text-ink-soft">{voorstel.nieuweDetails?.length ? t("routes.berichten.voorstel.detailsUitleg") : t("routes.berichten.voorstel.geenAndereUitleg")}</p>
              {voorstel.afwijking ? <AfwijkingHint /> : null}
              <Button variant="outline" onClick={() => { setVoorstel(null); setWaarschuwing(null); }} className="h-auto w-full whitespace-normal py-2.5">{t("routes.berichten.voorstel.verder")}</Button>
            </div>) : voorstel.soort === "antwoord" && voorstel.alGereageerd && !voorstel.tekst.trim() ? (<button onClick={() => setVoorstel(null)} className="w-full rounded-md bg-brand py-2.5 text-sm font-semibold text-primary-foreground">{t("common.sluiten")}</button>) : voorstel.soort === "antwoord" && !voorstel.reactieNodig && !voorstel.toonToch ? (<div className="space-y-2">
              <p className="text-sm text-ink">{t("routes.berichten.voorstel.nietNodig")}</p>
              <div className="flex gap-2">
                <button onClick={() => setVoorstel(null)} className="flex-1 rounded-md bg-brand py-2.5 text-sm font-semibold text-primary-foreground">{t("routes.berichten.voorstel.latenRusten")}</button>
                {voorstel.tekst.trim() ? <button onClick={() => setVoorstel({ ...voorstel, toonToch: true })} className="flex-1 rounded-md border border-border bg-card py-2.5 text-sm font-semibold">{t("routes.berichten.voorstel.tochAntwoord")}</button> : null}
              </div>
            </div>) : voorstel.tekst.trim() ? (<>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-brand">{voorstel.soort === "antwoord" ? (voorstel.alGereageerd ? t("routes.berichten.voorstel.voorAanvulling") : t("routes.berichten.voorstel.voorAntwoord")) : t("routes.berichten.voorstel.voorgesteld")}</span>
                <textarea value={voorstel.tekst} onChange={(e) => setVoorstel({ ...voorstel, tekst: e.target.value })} rows={4} className="mt-1 w-full resize-none rounded-md border border-border bg-card p-2.5 text-sm text-ink outline-none"/>
              </label>
              {voorstel.veranderingen?.length ? (<div>
                  <p className="text-xs font-semibold text-ink-soft">{t("routes.berichten.voorstel.veranderd")}</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-ink-soft">{voorstel.veranderingen.slice(0, 3).map((v) => <li key={v}>{v}</li>)}</ul>
                </div>) : null}
              {voorstel.openPunten?.length ? (<div className="rounded-md bg-card p-2.5">
                  <p className="text-xs font-semibold text-ink">{t("routes.berichten.voorstel.nietBeantwoord")}</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-ink-soft">{voorstel.openPunten.map((v) => <li key={v}>{v}</li>)}</ul>
                  <p className="mt-1 text-[11px] text-ink-soft">{t("routes.berichten.voorstel.zelfAanvullen")}</p>
                </div>) : null}
              {voorstel.nieuweDetails?.length ? (<p className="rounded-md bg-card p-2.5 text-xs text-ink">{t("routes.berichten.voorstel.letOp", { details: voorstel.nieuweDetails.map((d) => `"${d}"`).join(", ") })}</p>) : null}
              {voorstel.afwijking ? <AfwijkingHint /> : null}
              <div className="flex flex-col gap-2">
                <Button onClick={() => {
                    const inhoud = voorstel.tekst;
                    setTekst(inhoud);
                    // Een al gecontroleerd en bewust overgenomen voorstel niet opnieuw laten herschrijven.
                    if (voorstel.soort === "schrijven" && analyseVoor(analyse.current, analyseSleutel(inhoud)) && !voorstel.nieuweDetails?.length) {
                        setAlGewaarschuwd(inhoud);
                    }
                    setVoorstel(null);
                    setWaarschuwing(null);
                }} className="h-auto min-h-11 w-full whitespace-normal py-2.5">{voorstel.soort === "antwoord" ? t("routes.berichten.voorstel.gebruikAntwoord") : t("routes.berichten.voorstel.gebruikVoorstel")}</Button>
                <div className="flex gap-2">
                  {voorstel.soort === "schrijven" ? <button disabled={bezig} onClick={() => anderVoorstel(voorstel.origineel)} className="flex-1 rounded-md border border-border bg-card py-2.5 text-sm font-semibold text-brand disabled:opacity-50">{bezig ? t("routes.berichten.evenKijken") : t("common.anderVoorstel")}</button> : null}
                  {voorstel.soort === "antwoord" ? <Button variant="outline" disabled={bezig} onClick={() => { const bron = berichten.find((b) => b.id === voorstel.bronId); if (bron)
                void helpAntwoorden(bron, Math.min(100, (voorstel.variant ?? 0) + 1)); }} className="h-auto min-h-11 flex-1 whitespace-normal">{t("common.anderVoorstel")}</Button> : null}
                  <button onClick={() => { if (voorstel.soort === "schrijven")
                setTekst(voorstel.origineel); setVoorstel(null); }} className="flex-1 rounded-md border border-border bg-card py-2.5 text-sm font-semibold text-ink-soft">{voorstel.soort === "antwoord" ? t("common.terug") : t("routes.berichten.voorstel.terugMijnTekst")}</button>
                </div>
              </div>
            </>) : (<button onClick={() => setVoorstel(null)} className="w-full rounded-md border border-border bg-card py-2.5 text-sm font-semibold">{t("common.sluiten")}</button>)}
          <p className="text-[11px] text-ink-soft">{t("routes.berichten.voorstel.nietsVanzelf", { wie: ander })}</p>
        </div>) : null}


      {ruimte && !pauzeTot ? (<div className="mt-4 rounded-md border border-border bg-card p-4">
          <p className="font-semibold">{t("routes.berichten.ruimte.titel")}</p>
          <p className="mt-1 text-sm text-ink-soft">{t("routes.berichten.ruimte.tekst")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => { setRuimte(false); }} className="rounded-md bg-brand px-4 py-2 text-xs font-semibold text-primary-foreground">{t("routes.berichten.ruimte.later")}</button>
            <button onClick={() => setRuimte(false)} className="rounded-md border border-border px-4 py-2 text-xs font-semibold">{t("routes.berichten.ruimte.nogEens")}</button>
            <button onClick={() => { setRuimte(false); setStijlOpen(true); }} className="rounded-md border border-border px-4 py-2 text-xs font-semibold text-brand">{t("routes.berichten.ruimte.rustiger")}</button>
            <button onClick={() => { setRuimte(false); verstuur(tekst, true); }} className="px-2 py-2 text-xs text-ink-soft">{t("routes.berichten.tochVersturen")}</button>
          </div>
        </div>) : null}

      {pauzeTot ? (<div className="mt-4 rounded-md border border-border bg-brand-soft p-4" role="status">
          <p className="font-semibold">{t("routes.berichten.pauze.titel")}</p>
          <p className="mt-1 text-sm text-ink-soft">{t("routes.berichten.pauze.tekst", { tijd: `${Math.floor(resterend / 60000)}:${String(Math.floor((resterend % 60000) / 1000)).padStart(2, "0")}` })}</p>
          <p className="mt-2 text-xs text-ink-soft">{t("routes.berichten.pauze.dringend")}</p>
          <div className="mt-2"><HulpKaart /></div>
        </div>) : null}

      <div className="relative mt-4 rounded-[26px] bg-white p-1.5 shadow-[0_6px_18px_rgba(60,50,40,.10)]">
        {fijn ? <FijnGecommuniceerd key={fijn}/> : null}
        <div className="flex items-end gap-2">
          {vkG.aiSchrijfhulp ? <EvenMeedenken alsKnop gesprekId={id} berichten={berichten} huidigConcept={tekst} onOvernemen={(t) => { schrijfNummer.current++; setBezig(false); setVoorstel(null); setWaarschuwing(null); setBeledigingCheck(false); setTekst(t); }}/> : null}
          <textarea aria-label={t("routes.berichten.schrijfLabel")} value={tekst} onChange={(e) => { schrijfNummer.current++; setBezig(false); setVoorstel(null); setWaarschuwing(null); setBeledigingCheck(false); setTekst(e.target.value); }} rows={Math.min(6, Math.max(1, tekst.split("\n").length + Math.floor(tekst.length / 34)))} placeholder={t("routes.berichten.schrijfPlaceholder")} className="min-h-10 min-w-0 flex-1 resize-none bg-transparent px-1.5 py-2 text-[15px] leading-snug outline-none placeholder:text-ink-soft/70"/>
          {eigen ? null : <button type="button" disabled={!tekst.trim() || !!pauzeTot} onClick={probeerVersturen} aria-label={t("common.versturen")} className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-primary-foreground disabled:opacity-40"><SendHorizontal className="size-[18px]" strokeWidth={2}/></button>}
        </div>
        <div className="px-2">
        {meterAan ? <Communicatiemeter signaal={huidigSignaal} bezig={meterBezig}/> : null}
        <CommunicatieSuggestie concept={tekst} berichten={berichten} namen={suggestieNamen} gesprekId={id} veiligheid={huidigeBeoordeling?.niveau === "dreigend" || huidigeBeoordeling?.afstemming === "druk" || waarschuwing?.niveau === "dreigend" || voorstel?.niveau === "dreigend" || mogelijkeOnveiligheid(tekst)} verwerkt={bezig || !!voorstel || stijlOpen || !!waarschuwing || ruimte || !!pauzeTot} onAanvullen={(t) => { schrijfNummer.current++; setTekst(t); }}/>
        {afstemmingNodig && !signaalVraagtHerformulering(huidigSignaal) && !voorstel ? <div className="mt-1 px-1 text-xs text-ink-soft"><p>{t("routes.berichten.afstemming.vraagt")}</p><Button variant="link" disabled={bezig} onClick={() => herschrijf("Duidelijker", true)} className="h-auto whitespace-normal p-0 text-xs"><MetChevron>{t("routes.berichten.afstemming.alsVoorstel")}</MetChevron></Button></div> : signaalVraagtHerformulering(huidigSignaal) && !voorstel ? <Button variant="link" disabled={bezig} onClick={() => herschrijf("Rustiger")} className="mt-1 h-auto px-1 text-xs text-accent-foreground">{t("routes.berichten.afstemming.andereFormulering")}</Button> : null}
        {stijlOpen ? (<div className="mt-2 flex flex-wrap gap-2">
            {stijlen.map((s) => (<button key={s} onClick={() => herschrijf(s)} className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-brand">{t(`routes.berichten.stijl.${stijlSleutel[s]}`)}</button>))}
          </div>) : null}
        {fout || traag ? <div className="mt-2 text-xs text-ink"><p>{fout ?? t("routes.berichten.traag")}</p><div className="mt-2 flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => { schrijfNummer.current++; cache.current.wis(); herschrijf(laatsteStijl.current, afstemmingNodig); }}>{t("routes.berichten.opnieuw")}</Button>{!eigen ? <Button size="sm" onClick={probeerVersturen}>{t("routes.berichten.gewoonVersturen")}</Button> : null}</div></div> : null}
        {conceptHersteld && tekst.trim() ? (<p className="mt-1 px-1 text-[11px] text-ink-soft">
            {t("routes.berichten.conceptBewaard")} <button type="button" onClick={() => { setTekst(""); setConceptHersteld(false); }} className="font-semibold text-brand">{t("routes.berichten.opnieuwBeginnen")}</button>
          </p>) : null}
        {(vkG.aiSchrijfhulp && tekst.trim()) || eigen ? (<div className="mt-1 flex items-center gap-2 pb-1">
            {vkG.aiSchrijfhulp && tekst.trim() ? <button disabled={bezig} onClick={() => setStijlOpen((o) => !o)} aria-expanded={stijlOpen} className="flex min-h-9 items-center gap-1.5 text-xs font-extrabold text-[#3F5747] disabled:opacity-50">
              <AppIcon functie="co" maat="sm"/>{bezig ? t("routes.berichten.evenKijken") : t("routes.berichten.helpFormuleren")}
            </button> : null}
            <span className="flex-1"/>
            {eigen ? <button disabled={!tekst.trim()} onClick={() => { setConceptHersteld(true); bevestig(t("routes.berichten.conceptBewaardToast"), { uitleg: t("routes.berichten.bewaardApparaat") }); }} className="rounded-full bg-brand px-4 py-2 text-sm font-black text-primary-foreground disabled:opacity-50">{t("routes.berichten.conceptBewaren")}</button> : null}
          </div>) : null}
        </div>
      </div>
      {eigen ? (<div className="mt-3 rounded-md border border-border bg-card p-3 text-sm">
          <p className="text-ink-soft">{t("routes.berichten.eigen.conceptApparaat")}</p>
          {!eigen.uitgenodigd ? <Link to="/solo" className="mt-2 inline-flex min-h-[44px] items-center font-semibold text-brand"><MetChevron>{t("routes.berichten.uitnodigenPijl")}</MetChevron></Link> : null}
        </div>) : null}
    </AppShell>);
}
/** Compact venster voor de bestaande rustmodus; geen omweg via Instellingen. */
/** Vastzetten en meldingen dempen: in het gesprek zelf, zodat het overzicht rustig blijft. */
function GesprekOpties({ id, onderwerp, onSamenvatten }) {
    const { t } = useTranslation();
    const { gesprekken } = useBerichten();
    const g = gesprekken.find((x) => x.id === id);
    const [open, setOpen] = useState(false);
    const vast = !!g?.vastgezet;
    const stil = isGedempt(g);
    return (<div className="relative ml-auto">
      <button onClick={() => setOpen(!open)} aria-label={t("routes.berichten.opties.label", { onderwerp })} aria-expanded={open} className="grid size-10 place-items-center rounded-full text-ink-soft">
        <MoreHorizontal className="size-5" strokeWidth={1.8}/>
      </button>
      {open ? (<div className="absolute right-0 top-11 z-10 w-60 rounded-xl border border-border bg-background p-1 text-sm">
          {onSamenvatten ? <button onClick={() => { setOpen(false); onSamenvatten(); }} className="flex w-full items-center gap-2 rounded px-3 py-2.5 text-left hover:bg-brand-soft"><AppIcon functie="co" maat="sm"/>{t("routes.berichten.opties.samenvatten")}</button> : null}
          <button onClick={() => { if (!wisselVastgezet(id))
            bevestig(t("routes.berichten.opties.maxDrie"), { uitleg: t("routes.berichten.opties.maakLos") }); setOpen(false); }} className="flex w-full items-center gap-2 rounded px-3 py-2.5 text-left hover:bg-brand-soft">
            {vast ? <PinOff className="size-4" strokeWidth={1.8}/> : <Pin className="size-4" strokeWidth={1.8}/>}{vast ? t("routes.berichten.opties.losmaken") : t("routes.berichten.opties.vastzetten")}
          </button>
          {stil ? (<button onClick={() => { dempGesprek(id, null); setOpen(false); }} className="flex w-full items-center gap-2 rounded px-3 py-2.5 text-left hover:bg-brand-soft"><Bell className="size-4" strokeWidth={1.8}/>{t("routes.berichten.opties.weerAan")}</button>) : [[8, t("routes.berichten.opties.achtUur")], [24, t("routes.berichten.opties.dag")], [168, t("routes.berichten.opties.week")]].map(([u, l]) => (<button key={u} onClick={() => { dempGesprek(id, u); setOpen(false); bevestig(t("routes.berichten.opties.gedemptVoor", { duur: l }), { uitleg: t("routes.berichten.opties.spoed") }); }} className="flex w-full items-center gap-2 rounded px-3 py-2.5 text-left hover:bg-brand-soft"><BellOff className="size-4" strokeWidth={1.8}/>{t("routes.berichten.opties.dempen", { duur: l })}</button>))}
        </div>) : null}
    </div>);
}
function RustSheet({ open, onSluit }) {
    const { t } = useTranslation();
    const vk = useVoorkeuren();
    const veld = "mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm";
    return (<Sheet open={open} onOpenChange={(o) => !o && onSluit()}>
      <SheetContent side="bottom" className="left-1/2 w-full max-w-md -translate-x-1/2 rounded-t-2xl bg-background px-5 pb-8">
        <SheetHeader className="text-left">
          <SheetTitle className="font-display text-xl font-medium">{t("routes.berichten.rust.titel")}</SheetTitle>
          <SheetDescription className="text-xs text-ink-soft">{t("routes.berichten.rust.beschrijving")}</SheetDescription>
        </SheetHeader>
        <label className="mt-4 flex items-center justify-between gap-3 text-sm font-semibold">
          {t("routes.berichten.rust.aanLabel")}
          <input type="checkbox" checked={vk.rustmodus} onChange={() => zetVoorkeur("rustmodus", !vk.rustmodus)} className="size-5 accent-[var(--brand)]"/>
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold text-ink-soft">{t("routes.berichten.rust.vanaf")}<input type="time" value={vk.rustVan} onChange={(e) => e.target.value && zetVoorkeur("rustVan", e.target.value)} className={veld}/></label>
          <label className="block text-xs font-semibold text-ink-soft">{t("routes.berichten.rust.tot")}<input type="time" value={vk.rustTot} onChange={(e) => e.target.value && zetVoorkeur("rustTot", e.target.value)} className={veld}/></label>
        </div>
        <button onClick={onSluit} className="mt-5 w-full rounded-md bg-brand py-3 text-sm font-semibold text-primary-foreground">{t("common.klaar")}</button>
      </SheetContent>
    </Sheet>);
}
/** Neutrale hint: blokkeert niets, geeft geen oordeel of juridisch advies. */
function AfwijkingHint() {
    const { t } = useTranslation();
    return (<div className="rounded-md border border-border bg-card p-3">
      <p className="text-sm text-ink">{t("routes.berichten.afwijking.tekst")}</p>
      <p className="mt-1 text-[11px] text-ink-soft">{t("routes.berichten.afwijking.uitleg")}</p>
      <Link to="/zorgregeling" search={{ actie: "wijziging", bron: "berichten" }} className="mt-2 inline-flex rounded-md border border-border px-3 py-2 text-xs font-semibold text-brand">{t("routes.berichten.afwijking.knop")}</Link>
    </div>);
}
/** Akkoorden die in deze sessie in een gesprek zijn gegeven (demo; echte opslag volgt bij gedeelde accounts). */
const akkoordGeheugen = {};
/** Akkoorden zonder herkenbare datum of tijd: die moet de ouder zelf nog in de agenda zetten. */
const geenAgendaGeheugen = new Set();
/** Herkenning op Nederlandse én Engelse woorden (de tekst van het bericht zelf). */
const DAG_WOORD = /\b(vandaag|morgen|overmorgen|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|today|tomorrow|day after tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/;
const WAT_WOORD = /\b(ophalen|brengen|wisselen|tandarts|huisarts|ouderavond|training|zwemles|voetbal|logeren|pick up|pick-up|collect|drop off|drop-off|swap|handover|dentist|doctor|gp|parents' evening|swimming|football|sleepover)\b/;
/** Engelse dagwoorden naar de Nederlandse ids voor de datumberekening. */
const DAG_EN = { today: "vandaag", tomorrow: "morgen", "day after tomorrow": "overmorgen", monday: "maandag", tuesday: "dinsdag", wednesday: "woensdag", thursday: "donderdag", friday: "vrijdag", saturday: "zaterdag", sunday: "zondag" };
/** Korte omschrijving van een vraag met dag en tijd, zoals "Morgen 15:00 · Emma ophalen". Alleen herkenning; nooit akkoord. */
function vraagLabel(tekst, namen) {
    const t = tekst.toLowerCase();
    if (mogelijkeOnveiligheid(t) || !/\?/.test(tekst))
        return null;
    const dag = DAG_WOORD.exec(t)?.[1];
    const tm = /\b([01]?\d|2[0-3])[:.]([0-5]\d)\b|\b([01]?\d|2[0-3])\s*uur\b/.exec(t);
    const wat = WAT_WOORD.exec(t)?.[1];
    if (!dag || !tm || !wat)
        return null;
    const tijd = `${String(tm[1] ?? tm[3]).padStart(2, "0")}:${tm[2] ?? "00"}`;
    const kind = namen.find((n) => new RegExp(`\\b${n}\\b`, "i").test(tekst));
    const dagNetjes = dag.charAt(0).toUpperCase() + dag.slice(1);
    return `${dagNetjes} ${tijd} · ${kind ? `${kind} ` : ""}${wat}`;
}
/** Titel, datum, tijd en kind uit een herkende vraag, om het agendaformulier alvast in te vullen. De ouder controleert en slaat zelf op. */
function vraagGegevens(tekst, namen, eigen) {
    const t = tekst.toLowerCase();
    const uit = {};
    const tm = /\b([01]?\d|2[0-3])[:.]([0-5]\d)\b|\b([01]?\d|2[0-3])\s*uur\b/.exec(t);
    if (tm)
        uit.tijd = `${String(tm[1] ?? tm[3]).padStart(2, "0")}:${tm[2] ?? "00"}`;
    const kind = namen.find((n) => new RegExp(`\\b${n}\\b`, "i").test(tekst));
    if (kind)
        uit.kind = kind;
    const wat = WAT_WOORD.exec(t)?.[1];
    if (wat)
        uit.titel = `${kind ? `${kind} ` : ""}${wat}`.replace(/^./, (c) => c.toUpperCase());
    // Zelfde "vandaag" als de agenda: echte datum bij een eigen gezin, de demodag in het voorbeeld.
    const basis = eigen ? new Date() : new Date("2025-03-12T12:00:00");
    const dagen = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
    const gevonden = DAG_WOORD.exec(t)?.[1];
    const dag = gevonden ? DAG_EN[gevonden] ?? gevonden : undefined;
    if (dag) {
        const d = new Date(basis);
        if (dag === "morgen")
            d.setDate(d.getDate() + 1);
        else if (dag === "overmorgen")
            d.setDate(d.getDate() + 2);
        else if (dag !== "vandaag") {
            const doel = dagen.indexOf(dag);
            let stap = (doel - d.getDay() + 7) % 7;
            if (stap === 0)
                stap = 7;
            d.setDate(d.getDate() + stap);
        }
        uit.datum = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    return uit;
}
