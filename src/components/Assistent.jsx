import i18n from "@/i18n";
import { useTranslation } from "react-i18next";
import { useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@/lib/server-fn";
import { Mic, Search, Square, Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { vraagAssistent, zetSpraakOm } from "@/lib/assistent.functions";
import { gezinState } from "@/lib/gezin";
import { startState } from "@/lib/start-store";
import { afsprakenState } from "@/lib/afspraken-store";
import { vakantieLijst } from "@/lib/vakantie-store";
import { kringState, regelStatus } from "@/lib/kring-store";
import { takenState } from "@/lib/taken-store";
import { useRegio, vakantiesVoor, regioLabel } from "@/lib/schoolvakanties";
import { Chevron } from "@/components/Tekens";
const NS = "components.Assistent";
/**
 * Pagina's voor "Direct gevonden" en de voorbeeldvragen per pagina. Zoekwoorden zijn Nederlands én Engels,
 * zodat zoeken in beide talen werkt; het label komt uit de vertalingen.
 */
const paginas = [
    { id: "agenda", to: "/agenda", woorden: "agenda afspraak kalender week calendar appointment diary" },
    { id: "kosten", to: "/kosten", woorden: "kosten geld betalen bedrag verrekenen uitgave bon costs expenses money pay amount settle receipt" },
    { id: "berichten", to: "/berichten", woorden: "berichten bericht chat messages message" },
    { id: "verdeling", to: "/zorgregeling", woorden: "verdeling week zorgregeling schema wissel omgang schedule split handover custody parenting" },
    { id: "overdracht", to: "/overdracht", woorden: "overdracht spullen mee tas handover things bag pack" },
    { id: "taken", to: "/taken", woorden: "taken taak deadline regelen tasks task todo" },
    { id: "nogNodig", to: "/boodschappen", woorden: "nog nodig lijstje boodschappen nodig kopen gekocht winkel shopping list needed buy bought shop" },
    { id: "spullen", to: "/spullen", woorden: "spullen mee knuffel tas paklijst vergeten items things cuddly toy bag packing list forgotten" },
    { id: "documenten", to: "/documenten", woorden: "documenten document pdf plan rapport documents report" },
    { id: "vakanties", to: "/planning", woorden: "vakantie vakanties feestdag kerst zomer reis holiday holidays vacation christmas summer trip" },
    { id: "momenten", to: "/momentjes", woorden: "momentjes foto moment moments photo" },
    { id: "kinderen", to: "/kinderen", woorden: "kinderen emma noah noodkaart school verzekering kring oma opa oppas children emergency card insurance circle grandma grandpa grandmother grandfather babysitter" },
    { id: "instellingen", to: "/instellingen", woorden: "instellingen thema donker meldingen settings theme dark notifications language taal" },
    { id: "begeleiding", to: "/ondersteuning", woorden: "begeleiding begeleider ondersteuning professional mediator gezinscoach support counsellor family coach" },
];
const paginaLabel = (id) => i18n.t(`${NS}.pagina.${id}`);
/** Herken de pagina aan zijn titel, in het Nederlands of in de huidige taal. */
const paginaVan = (titel) => {
    const t = titel?.trim().toLowerCase();
    if (!t)
        return undefined;
    return paginas.find((p) => [i18n.t(`${NS}.pagina.${p.id}`, { lng: "nl" }), paginaLabel(p.id)].some((l) => l.toLowerCase() === t))?.id;
};
const lijst = (sleutel) => { const v = i18n.t(sleutel, { returnObjects: true }); return Array.isArray(v) ? v : []; };
/** Bouwt de context alleen uit gegevens die de ingelogde ouder in de app zelf ook ziet (geen notities van professionals of privénotities). */
function bouwContext(regio, pagina) {
    const k = kringState();
    const g = gezinState();
    const agenda = Array.isArray(startState().agenda) ? startState().agenda : [];
    return [
        pagina ? `De ouder stelt de vraag vanaf de pagina "${pagina}"; gebruik dat als context bij onduidelijke vragen.` : "",
        `Ingelogde ouder: ${g.ik?.naam || "onbekend"} (de andere ouder heet in de app 'de andere ouder').`,
        `Kinderen: ${g.kinderen.map((c) => `${c.naam} (id ${c.id})`).join(", ") || "nog niet ingevuld"}.`,
        "Agenda:", ...agenda.slice(0, 40).map((a) => `- ${a.titel ?? ""} · ${a.datum ?? ""} · ${a.tijd ?? ""}`),
        "Halen/brengen:", ...k.momenten.map((m) => `- ${m.titel} ${m.dag} ${m.tijd} (${m.plek}) voor ${m.kindIds.join(" & ")}: ${regelStatus(m.id)?.tekst ?? "nog niemand gekoppeld"}`),
        `Schoolvakanties (${regioLabel[regio]}):`, ...vakantiesVoor(regio).map((v) => `- ${v.naam}: ${v.van} t/m ${v.tot}`),
        "Vakantieverdeling:", ...vakantieLijst().map((v) => `- ${v.naam} (${v.periode}): ${v.ouder} · ${v.status}`),
    ].join("\n");
}
/** Knoplabel per intent (id's uit het intent-register); onbekende intent → "Openen". */
const knopIds = ["wissel_ruil", "extra_nacht", "tijd_wisselmoment", "afspraak_toevoegen", "afspraak_wijzigen", "afspraak_maken", "document_zoeken", "kring_toevoegen", "ziek", "vakantie", "taak_toevoegen", "momentje", "kosten", "bericht"];
const knopLabel = (actie) => (knopIds.includes(actie) ? i18n.t(`${NS}.knop.${actie}`) : i18n.t(`${NS}.openen`));
/** Voorbeeldvragen per pagina (alleen deze pagina's hebben eigen voorbeelden). */
const tipPaginas = ["agenda", "kosten", "berichten", "vakanties", "documenten", "verdeling"];
export function Assistent({ pagina } = {}) {
    const { t } = useTranslation();
    const paginaId = paginaVan(pagina);
    const tips = paginaId && tipPaginas.includes(paginaId) ? lijst(`${NS}.tips.${paginaId}`) : lijst(`${NS}.voorbeelden`);
    const router = useRouter();
    const regio = useRegio();
    const vraagFn = useServerFn(vraagAssistent);
    const spraakFn = useServerFn(zetSpraakOm);
    const [open, setOpen] = useState(false);
    const [vraag, setVraag] = useState("");
    const [bezig, setBezig] = useState("");
    const [fout, setFout] = useState("");
    const [uitSpraak, setUitSpraak] = useState(false);
    const [antwoord, setAntwoord] = useState(null);
    const rec = useRef(null);
    const invoer = useRef(null);
    const stel = async (v = vraag) => {
        if (!v.trim())
            return;
        setBezig("denken");
        setFout("");
        setAntwoord(null);
        try {
            setAntwoord(await vraagFn({ data: { vraag: v.trim(), context: bouwContext(regio, pagina) } }));
        }
        catch (e) {
            setFout(e instanceof Error ? e.message : t(`${NS}.fout.algemeen`));
        }
        finally {
            setBezig("");
        }
    };
    const startOpname = async () => {
        setFout("");
        setAntwoord(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const r = new MediaRecorder(stream);
            const delen = [];
            r.ondataavailable = (e) => e.data.size && delen.push(e.data);
            r.onstop = async () => {
                stream.getTracks().forEach((t) => t.stop());
                setBezig("omzetten");
                try {
                    const type = (r.mimeType || "audio/webm").replace(/^video\//, "audio/");
                    const buf = new Uint8Array(await new Blob(delen, { type }).arrayBuffer());
                    let bin = "";
                    buf.forEach((b) => (bin += String.fromCharCode(b)));
                    const { tekst } = await spraakFn({ data: { audio: btoa(bin), type } });
                    if (!tekst)
                        setFout(t(`${NS}.fout.nietsVerstaan`));
                    // Herkende tekst direct zichtbaar en bewerkbaar in het tekstveld; nooit automatisch verwerken.
                    setVraag(tekst);
                    setUitSpraak(!!tekst);
                    setTimeout(() => invoer.current?.focus(), 0);
                }
                catch (e) {
                    setFout(e instanceof Error ? e.message : t(`${NS}.fout.spraak`));
                }
                finally {
                    setBezig("");
                }
            };
            rec.current = r;
            r.start();
            setBezig("opnemen");
        }
        catch {
            setFout(t(`${NS}.fout.microfoon`));
        }
    };
    const openFlow = (a) => {
        setOpen(false);
        const kind = a.kind || undefined;
        switch (a.actie) {
            case "wissel_ruil": return router.navigate({ to: "/zorgregeling", search: { actie: "wijziging", bron: "assistent" } });
            case "extra_nacht": return router.navigate({ to: "/zorgregeling", search: { actie: "wijziging", bron: "assistent" } });
            case "tijd_wisselmoment": return router.navigate({ to: "/veranderd", search: { situatie: "halen", ...(kind ? { kind } : {}) } });
            case "ziek": return router.navigate({ to: "/veranderd", search: { situatie: "ziek", ...(kind ? { kind } : {}) } });
            case "afspraak_toevoegen": return router.navigate({ to: "/agenda", search: { nieuw: true, titel: a.titel || undefined, datum: a.datum || undefined, tijd: a.tijd || undefined, herhaling: a.herhaling !== "geen" ? a.herhaling : undefined, kind: a.kind || undefined } });
            case "afspraak_wijzigen": return router.navigate({ to: "/agenda" });
            case "afspraak_maken": return router.navigate({ to: "/afspraken", search: { nieuw: "voorstel", bron: "assistent" } });
            case "document_zoeken": return router.navigate({ to: "/documenten" });
            case "kring_toevoegen": return router.navigate({ to: "/kring/$kindId", params: { kindId: a.kind || gezinState().kinderen[0]?.id || "" }, search: { toevoegen: true, ...(a.rol ? { rol: a.rol } : {}) } });
            case "vakantie": return router.navigate({ to: "/planning", search: { toevoegen: "vakantie" } });
            case "taak_toevoegen": return router.navigate({ to: "/taken" });
            case "momentje": return router.navigate({ to: "/momentjes" });
            case "kosten": return router.navigate({ to: "/kosten" });
            case "bericht": return router.navigate({ to: "/berichten" });
            default: return;
        }
    };
    const aanpassen = () => { setAntwoord(null); setTimeout(() => invoer.current?.focus(), 0); };
    return (<>
      <button onClick={() => setOpen(true)} aria-label={t(`${NS}.open`)} className="grid size-9 place-items-center rounded-full border border-border text-ink-soft">
        <Search className="size-4" strokeWidth={1.8}/>
      </button>
      <Sheet open={open} onOpenChange={(o) => { if (!o && rec.current?.state === "recording")
        rec.current.stop(); setOpen(o); }}>
        <SheetContent side="bottom" className="left-1/2 max-h-[90dvh] w-full max-w-md -translate-x-1/2 overflow-y-auto rounded-t-2xl bg-background px-5 pb-8">
          <SheetHeader className="pr-8 text-left">
            <SheetTitle className="font-display text-xl font-medium">{t(`${NS}.titel`)}</SheetTitle>
            <SheetDescription className="text-xs">{t(`${NS}.uitleg`)}</SheetDescription>
          </SheetHeader>

          <form className="mt-4 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); setUitSpraak(false); stel(); }}>
            <textarea ref={invoer} rows={2} value={vraag} onChange={(e) => setVraag(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        setUitSpraak(false);
        stel();
    } }} placeholder={t(`${NS}.placeholder`)} aria-label={t(`${NS}.jeVraag`)} className="min-w-0 flex-1 resize-none rounded-2xl border border-border bg-card px-3 py-2.5 text-sm outline-none"/>
            {bezig === "opnemen" ? (<button type="button" onClick={() => rec.current?.stop()} aria-label={t(`${NS}.opnameStoppen`)} className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-warm text-primary-foreground"><Square className="size-4"/></button>) : (<button type="button" onClick={startOpname} disabled={!!bezig} aria-label={t(`${NS}.inspreken`)} className="grid size-10 shrink-0 place-items-center rounded-full border border-brand/40 text-brand disabled:opacity-40"><Mic className="size-4"/></button>)}
          </form>
          {bezig === "opnemen" ? <p role="status" className="mt-2 flex items-center gap-2 text-xs font-semibold text-accent-warm"><span className="size-2 animate-pulse rounded-full bg-accent-warm"/> {t(`${NS}.luisteren`)}</p> : null}
          {!bezig && !antwoord ? <button type="button" onClick={() => { setOpen(false); router.navigate({ to: "/lastige-momenten" }); }} className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-white/85 bg-[#E9EFE3] px-3.5 py-2.5 text-left"><span aria-hidden className="text-[#3F5747]">◎</span><span className="min-w-0 flex-1"><span className="block text-sm font-extrabold">{t(`${NS}.lastig.titel`)}</span><span className="block text-xs text-ink-soft">{t(`${NS}.lastig.tekst`)}</span></span><Chevron className="size-4 text-ink-soft"/></button> : null}
          {bezig === "omzetten" ? <p role="status" className="mt-2 text-xs text-ink-soft">{t(`${NS}.omzetten`)}</p> : null}
          {!antwoord && !bezig ? <DirectGevonden zoek={vraag} kies={(d) => { setOpen(false); router.navigate({ to: d.to, search: d.search, ...(d.hash ? { hash: d.hash } : {}) }); }}/> : null}
          {uitSpraak && vraag && !bezig ? (<div className="mt-3 rounded-md border border-border bg-card p-3 text-sm">
              <p className="text-xs text-ink-soft">{t(`${NS}.verstaan`)}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button onClick={() => { setVraag(""); setUitSpraak(false); invoer.current?.focus(); }} className="rounded-full border border-border py-2 text-sm font-semibold text-ink-soft">{t(`${NS}.wissen`)}</button>
                <button onClick={() => { setUitSpraak(false); stel(); }} className="rounded-full bg-brand py-2 text-sm font-semibold text-primary-foreground">{t(`${NS}.jaVerder`)}</button>
              </div>
            </div>) : null}

          {bezig === "denken" ? <p role="status" className="mt-4 flex items-center gap-2 text-sm text-ink-soft"><Loader2 className="size-4 animate-spin"/> {t(`${NS}.evenKijken`)}</p> : null}
          {fout ? <p role="alert" className="mt-3 rounded-md bg-secondary px-3 py-2 text-xs text-ink">{fout}</p> : null}

          {antwoord ? (<div className="mt-4 rounded-md border border-border bg-card p-4">
              {antwoord.actie !== "geen" && antwoord.actie !== "verduidelijk" ? <p className="mb-1 font-display text-base">{t(`${NS}.ditRegelen`)}</p> : null}
              <p className="text-sm leading-relaxed">{antwoord.antwoord}</p>
              {antwoord.actie === "verduidelijk" && antwoord.opties.length ? (<div className="mt-3 flex flex-wrap gap-2">
                  {antwoord.opties.map((o) => <button key={o} onClick={() => { const nv = `${vraag.trim()} — ${o}`; setVraag(nv); stel(nv); }} className="rounded-full border border-brand/40 px-3 py-1.5 text-xs font-semibold text-brand">{o}</button>)}
                </div>) : null}
              {antwoord.actie !== "geen" && antwoord.actie !== "verduidelijk" ? (<>
                  {antwoord.samenvatting.length ? (<dl className="mt-3 divide-y divide-border border-y border-border text-sm">
                      {antwoord.samenvatting.map((s) => <div key={s.label} className="flex justify-between gap-3 py-2"><dt className="text-ink-soft">{s.label}</dt><dd className="text-right font-semibold">{s.waarde}</dd></div>)}
                    </dl>) : null}
                  <p className="mt-3 text-[11px] text-ink-soft">{t(`${NS}.nogNietsVeranderd`)}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button onClick={aanpassen} className="min-h-11 rounded-full border border-border bg-card px-4 text-sm font-semibold text-ink-soft">{t(`${NS}.aanpassen`)}</button>
                    <button onClick={() => openFlow(antwoord)} className="rounded-full bg-brand py-2.5 text-sm font-semibold text-primary-foreground">{knopLabel(antwoord.actie)}</button>
                  </div>
                </>) : null}
            </div>) : null}

          {!antwoord && !bezig && !vraag ? (<div className="mt-4 flex flex-wrap gap-2">
              {tips.map((v) => <button key={v} onClick={() => { setVraag(v); stel(v); }} className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-ink-soft">{v}</button>)}
            </div>) : null}
        </SheetContent>
      </Sheet>
    </>);
}
function DirectGevonden({ zoek, kies }) {
    const { t } = useTranslation();
    const q = zoek.trim().toLowerCase();
    if (q.length < 2)
        return null;
    // Stopwoorden in het Nederlands en Engels.
    const stop = new Set(["wat", "wie", "waar", "wanneer", "hoe", "een", "het", "de", "van", "voor", "bij", "met", "ik", "wil", "is", "zijn", "op", "en", "naar", "mijn", "staat", "kan",
        "what", "who", "where", "when", "how", "the", "an", "of", "for", "at", "with", "want", "are", "on", "and", "to", "my", "can", "do", "does", "in"]);
    const woorden = q.split(/[^a-zà-ÿ0-9]+/).filter((w) => w.length >= 2 && !stop.has(w));
    if (!woorden.length)
        return null;
    const pas = (t) => { const l = t.toLowerCase(); return woorden.some((w) => l.includes(w) || l.split(/\s+/).some((x) => x.startsWith(w))); };
    const res = [
        ...paginas.filter((p) => pas(p.woorden) || pas(paginaLabel(p.id))).map((p) => ({ label: paginaLabel(p.id), soort: t(`${NS}.soort.pagina`), to: p.to })),
        ...afspraken.filter((a) => pas(a.titel) || pas(a.locatie)).map((a) => ({ label: a.titel, soort: t(`${NS}.soort.afspraak`, { datum: a.datumLabel }), to: "/agenda", hash: `item-${a.id}` })),
        ...afsprakenState().filter((a) => a.status !== "Niet doorgegaan" && (pas(a.titel) || pas(a.onderwerp) || pas(a.kind) || pas(a.tekst))).map((a) => ({ label: a.titel, soort: t(`${NS}.soort.gemaakt`, { onderwerp: a.onderwerp }), to: "/afspraken" })),
        ...documenten.filter((d) => pas(d.naam) || pas(d.categorie)).map((d) => ({ label: d.naam, soort: t(`${NS}.soort.document`), to: "/documenten", hash: `item-${d.id}` })),
        ...takenState().taken.filter((x) => pas(x.tekst)).map((x) => ({ label: x.tekst, soort: x.klaar ? t(`${NS}.soort.taakAf`) : t(`${NS}.soort.taak`), to: "/taken", hash: `item-${x.id}` })),
        ...kringState().personen.filter((p) => !p.ingetrokken && (pas(p.naam) || pas(p.rol))).map((p) => ({ label: p.naam, soort: t(`${NS}.soort.kring`, { rol: p.rol }), to: "/kinderen" })),
    ].slice(0, 6);
    if (!res.length)
        return null;
    return (<div className="mt-3">
      <p className="text-xs font-semibold text-ink-soft">{t(`${NS}.directGevonden`)}</p>
      <ul className="mt-1 space-y-1">
        {res.map((r, i) => (<li key={i}><button type="button" onClick={() => kies(r)} className="w-full rounded-2xl px-2 py-1.5 text-left text-sm hover:bg-muted">{r.label}<span className="block text-[11px] text-ink-soft">{r.soort}</span></button></li>))}
      </ul>
      <p className="mt-1 text-[11px] text-ink-soft">{t(`${NS}.enter`)}</p>
    </div>);
}
