import { uur } from "@/lib/tijd-tekst";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Bell, Check, Heart, Home, LogOut, Menu, Plus, ShieldPlus } from "lucide-react";
import { useMomentjes } from "@/lib/momentjes-store";
import { DeelMomentje, MomentjeKaart } from "@/components/Momentjes";
import { bekijkAls, geenRechten, isActief, laadAlsVerzorger, laadKring, laadRol, mag, meldAangekomenKring, meldOnderwegKring, mijnKringen, persoonLabel, reageerOphalen, rolNaam, toggleIngepakt, useAlsVerzorger, useKring, useOphalen, useRol, } from "@/lib/kring-store";
import { reageerHulp } from "@/lib/hulp-store";
import { auth } from "@/lib/auth-store";
import { useTranslation } from "react-i18next";
import i18n, { taalLocale } from "@/i18n";
import { InhoudLaden, LaadFout } from "@/components/Laden";
import { toonTelefoon } from "@/components/TelefoonInvoer";
import { Chevron, MetVinkje, MetChevron } from "@/components/Tekens";
const N = "routes.verzorger.";
export const Route = createFileRoute("/verzorger")({
    validateSearch: z.object({ p: z.string().optional(), s: z.string().optional() }),
    head: () => ({ meta: [
            { title: i18n.t("common.metaTitel", { titel: i18n.t("routes.verzorger.meta.titel") }) },
            { name: "description", content: i18n.t("routes.verzorger.meta.beschrijving") },
            { property: "og:title", content: i18n.t("common.metaTitel", { titel: i18n.t("routes.verzorger.meta.titel") }) },
            { property: "og:description", content: i18n.t("routes.verzorger.meta.ogBeschrijving") },
            { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
        ] }),
    component: Verzorger,
});
const vandaagIso = () => new Date().toLocaleDateString("en-CA");
const dagTekst = (d) => new Date(`${d}T12:00:00`).toLocaleDateString(taalLocale(), { weekday: "long", day: "numeric", month: "long" });
const OPEN = ["requested", "accepted"];
/**
 * Twee ingangen, één weergave (KringApp), altijd gebouwd uit wat de SERVER voor dit kringlid teruggeeft:
 * - als verzorger ingelogd: get-for-user (alleen actieve, bevestigde toegang binnen de periode) en
 *   manage-pickups "mine" (eigen ophaal-/brengmomenten en hulpverzoeken);
 * - als ouder met `?p=<id>`: view-as, het voorbeeld van precies wat dat kringlid ziet (de momenten en
 *   hulpverzoeken komen dan uit de eigen ouderlijst, gefilterd op dat kringlid).
 */
function Verzorger() {
    const { t } = useTranslation();
    const { p: pid } = Route.useSearch();
    const kring = useKring();
    const ov = useAlsVerzorger();
    const rol = useRol();
    const ouderLijst = useOphalen();
    const [eigen, setEigen] = useState(null); // views van dit account als verzorger
    const [eigenFout, setEigenFout] = useState(null);
    const [keuze, setKeuze] = useState(0);
    const [voorbeeld, setVoorbeeld] = useState(undefined); // undefined = laden, null = geen toegang (meer)
    const [voorbeeldFout, setVoorbeeldFout] = useState(null);
    const [poging, setPoging] = useState(0);
    useEffect(() => {
        if (pid)
            return;
        let weg = false;
        setEigenFout(null);
        laadKring();
        laadRol();
        laadAlsVerzorger();
        mijnKringen().then((v) => { if (!weg)
            setEigen(v); }).catch((e) => { if (!weg)
            setEigenFout(e); });
        return () => { weg = true; };
    }, [pid, poging]);
    useEffect(() => {
        if (!pid)
            return;
        let weg = false;
        setVoorbeeld(undefined);
        setVoorbeeldFout(null);
        bekijkAls(pid).then((v) => { if (!weg)
            setVoorbeeld(v ?? null); }).catch((e) => { if (!weg) {
            if (e?.code === "NOT_FOUND" || e?.code === "VALIDATION")
                setVoorbeeld("nietBeschikbaar");
            else
                setVoorbeeldFout(e);
        } });
        return () => { weg = true; };
    }, [pid, poging]);
    const opnieuw = () => setPoging((x) => x + 1);
    if (pid) {
        if (voorbeeldFout)
            return <Kader><LaadFout onOpnieuw={opnieuw}/></Kader>;
        if (voorbeeld === undefined)
            return <Kader><Laden /></Kader>;
        if (voorbeeld === "nietBeschikbaar") {
            return (<Kader>
          <p className="mt-6 text-sm text-ink-soft">{t(N + "nietBeschikbaar")}</p>
          <Link to="/verzorger" className="mt-6 flex min-h-11 w-full items-center justify-center rounded-full border border-border bg-card px-5 text-sm font-semibold text-brand">{t(N + "verlopen.terug")}</Link>
        </Kader>);
        }
        if (!voorbeeld) {
            return (<Kader>
          <h1 className="lora text-[30px] leading-tight">{t(N + "verlopen.titel")}</h1>
          <p className="mt-2 text-sm text-ink-soft">{t(N + "verlopen.uitleg")}</p>
          <Link to="/verzorger" className="mt-6 flex min-h-11 w-full items-center justify-center rounded-full border border-border bg-card px-5 text-sm font-semibold text-brand">{t(N + "verlopen.terug")}</Link>
        </Kader>);
        }
        const cid = voorbeeld.caregiver.id;
        return <KringApp view={voorbeeld} isVoorbeeld ophalen={{ toewijzingen: ouderLijst.toewijzingen.filter((a) => a.wieSoort === "caregiver" && a.wie === cid && [...OPEN, "declined"].includes(a.status)), hulp: ouderLijst.hulp.filter((h) => h.status !== "withdrawn" && h.ontvangers.some((o) => o.id === cid)), geladen: true }}/>;
    }
    if (eigenFout && eigen === null)
        return <Kader><LaadFout onOpnieuw={opnieuw}/></Kader>;
    if (eigen === null)
        return <Kader><Laden /></Kader>;
    if (eigen.length) {
        const view = eigen[Math.min(keuze, eigen.length - 1)];
        const cid = view.caregiver.id;
        return <KringApp view={view} ophalen={{ toewijzingen: ov.toewijzingen.filter((a) => a.wie === cid), hulp: ov.hulp.filter((h) => h.ontvangers.some((o) => o.id === cid)), geladen: ov.geladen, fout: ov.fout, opnieuw: laadAlsVerzorger }} andere={eigen.length > 1 ? eigen.map((v, i) => ({ i, naam: v.children.map((k) => k.name).join(` ${t("common.en")} `) || v.caregiver.name })) : null} kies={setKeuze} huidig={Math.min(keuze, eigen.length - 1)}/>;
    }
    // Alleen kringlid, maar (nu) geen toegang: geen ouder-app tonen.
    if (rol.rol === "verzorger") {
        return (<Kader>
        <h1 className="lora text-[30px] leading-tight">{t(N + "geenToegang.titel")}</h1>
        <p className="mt-2 text-sm text-ink-soft">{t(N + "verlopen.uitleg")}</p>
        <Uitloggen />
      </Kader>);
    }
    if (rol.rol === null)
        return <Kader><Laden /></Kader>;
    // Ouder zonder eigen kringtoegang: kies iemand uit de kring om het voorbeeld te bekijken.
    const metApp = kring.personen.filter((p) => p.uitgenodigd !== false && !String(p.id).startsWith("tmp-"));
    return (<Kader>
      <h1 className="lora text-[30px] leading-tight">{t(N + "voorbeeld.titel")}</h1>
      <p className="mt-2 text-sm text-ink-soft">{t(N + "voorbeeld.uitleg")}</p>
      <div className="mt-6 divide-y divide-border border-y border-border">
        {metApp.map((p) => (<Link key={p.id} to="/verzorger" search={{ p: p.id }} className="flex min-h-12 items-center justify-between gap-3 py-3 text-sm">
            <span className="min-w-0"><b>{persoonLabel(p)}</b><span className="block text-xs text-ink-soft">{rolNaam(p.rol)}{p.bevestigd === false && !p.ingetrokken ? t(N + "voorbeeld.nogNietBevestigd") : isActief(p) ? "" : t(N + "voorbeeld.geenToegang")}</span></span><Chevron className="size-4 shrink-0 text-ink-soft"/>
          </Link>))}
        {metApp.length === 0 ? <p className="py-3 text-center text-sm text-ink-soft">{t(N + "voorbeeld.leeg")}</p> : null}
      </div>
      <Link to="/meer" className="mt-6 flex min-h-11 w-full items-center justify-center rounded-full border border-border bg-card px-5 text-sm font-semibold text-brand">{t(N + "voorbeeld.terug")}</Link>
    </Kader>);
}
function Laden() {
    return <InhoudLaden hoogte="min-h-[60dvh]"/>;
}
function Uitloggen() {
    const { t } = useTranslation();
    const nav = useNavigate();
    const [bezig, setBezig] = useState(false);
    return (<button disabled={bezig} onClick={async () => { setBezig(true); await auth.logout(); nav({ to: "/welkom", replace: true }); }} className="mt-8 flex min-h-11 items-center gap-2 text-sm font-semibold text-ink-soft disabled:opacity-40">
      <LogOut className="size-4" strokeWidth={1.6}/>{t(N + "uitloggen")}
    </button>);
}
function Kader({ children, nav }) {
    return (<div className="app-canvas min-h-screen w-full font-body text-ink">
      <div className="mx-auto max-w-md px-5 pt-8" style={{ paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom, 0px))" }}>{children}</div>
      {nav}
    </div>);
}
const kop = "text-[11px] font-bold uppercase tracking-[0.14em] text-brand";
/** Server-view → het kringlid-object dat mag()/niveau() gebruiken (bevestigd en actief: de server filterde al). */
function persoonUitView(v) {
    const c = v.caregiver;
    return { id: c.id, naam: c.name, rol: c.role, uitgenodigd: true, bevestigd: true, ingetrokken: false, periode: { type: "doorlopend" }, rechten: Object.fromEntries(Object.entries(v.permissions ?? {}).map(([k, r]) => [k, { ...geenRechten(), ...r }])) };
}
/** "Kan niet" met een optionele reden (kort, alleen voor de ouders). */
function KanNiet({ onVerstuur, uit }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [reden, setReden] = useState("");
    if (!open)
        return <button disabled={uit} onClick={() => setOpen(true)} className="min-h-11 flex-1 rounded-full border border-border bg-card px-3 text-sm font-semibold disabled:opacity-40">{t(N + "kanNiet")}</button>;
    return (<div className="w-full space-y-2">
      <label className="block text-xs text-ink-soft">{t(N + "redenOptioneel")}
        <input value={reden} maxLength={300} onChange={(e) => setReden(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-ink"/>
      </label>
      <div className="flex gap-2">
        <button onClick={() => setOpen(false)} className="min-h-11 flex-1 rounded-full border border-border bg-card px-3 text-sm">{t("common.annuleren")}</button>
        <button disabled={uit} onClick={async () => { if (await onVerstuur(reden.trim()))
            setOpen(false); }} className="min-h-11 flex-1 rounded-full bg-brand px-3 text-sm font-semibold text-primary-foreground disabled:opacity-40">{t(N + "kanNietVersturen")}</button>
      </div>
    </div>);
}
function KringApp({ view, isVoorbeeld, andere, kies, huidig, ophalen }) {
    const { t } = useTranslation();
    const { lijst } = useMomentjes();
    const [tab, setTab] = useState("home");
    const [deel, setDeel] = useState(false);
    const [bezig, setBezig] = useState(null);
    const p = persoonUitView(view);
    const kids = view.children.map((k) => ({ id: k.id, naam: k.name, nood: k.emergency }));
    const kidsMet = (o, min) => kids.filter((k) => mag(p, k.id, o, min));
    const momentjesKids = kidsMet("momentjes");
    const magDelen = !isVoorbeeld && kidsMet("momentjes", "bijdragen").length > 0;
    const noodKids = kidsMet("nood");
    const vandaag = vandaagIso();
    // De server geeft alleen toewijzingen met toegang tot wisselmomenten of agenda van alle kinderen.
    const mijnMomenten = ophalen.toewijzingen.filter((a) => [...OPEN, "declined"].includes(a.status) && a.datum >= vandaag).sort((a, b) => (a.datum + a.tijd).localeCompare(b.datum + b.tijd));
    const actief = mijnMomenten.filter((a) => OPEN.includes(a.status));
    const mijnMomentjes = lijst.filter((m) => !m.prive && momentjesKids.some((k) => k.id === m.kindId) && (m.auteurId === p.id || m.kringIds?.includes(p.id)));
    const hulpVoorMij = ophalen.hulp;
    const tabs = [
        { id: "home", label: t(N + "tab.home"), icoon: Home },
        ...(momentjesKids.length ? [{ id: "momentjes", label: t(N + "tab.momenten"), icoon: Heart }] : []),
        { id: "meer", label: t(N + "tab.menu"), icoon: Menu },
    ];
    const nav = (<nav className="fixed bottom-0 left-1/2 z-20 w-full max-w-md -translate-x-1/2 border-t border-border bg-background">
      <div className="flex justify-around pt-2.5 pb-1">
        {tabs.map((x) => (<button key={x.id} onClick={() => setTab(x.id)} className={`flex flex-col items-center gap-1 border-t-2 px-4 py-1 ${tab === x.id ? "border-brand text-ink" : "border-transparent text-ink-soft"}`}>
            <x.icoon className="size-5" strokeWidth={1.6}/><span className="text-[11px] font-semibold">{x.label}</span>
          </button>))}
      </div>
    </nav>);
    const naamKids = (ids) => kids.filter((k) => ids.includes(k.id)).map((k) => k.naam).join(` ${t("common.en")} `);
    const meldingen = [
        ...mijnMomenten.filter((a) => a.status === "requested").map((a) => t(N + (a.soort === "wissel" ? "melding.haal" : "melding.breng"), { dag: dagTekst(a.datum), namen: naamKids(a.kindIds), tijd: a.tijd ? uur(a.tijd) : "" })),
        ...hulpVoorMij.filter((h) => h.status === "open" && h.ontvangers.find((o) => o.id === p.id)?.status === "requested").map((h) => t(N + "melding.hulp", { wat: h.wat })),
        ...(mijnMomentjes.some((m) => m.auteurId !== p.id) ? [t(N + "melding.nieuwMoment")] : []),
    ];
    const hulpActie = async (id, antwoord, reden) => {
        setBezig(id);
        const gelukt = await reageerHulp(id, antwoord, reden);
        setBezig(null);
        return gelukt;
    };
    const fout = !isVoorbeeld && ophalen.fout && !ophalen.geladen;
    return (<Kader nav={nav}>
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-soft">{t(N + "hoi", { naam: p.naam })}</p>
        {isVoorbeeld ? <Link to="/verzorger" className="text-[11px] font-semibold text-brand">{t(N + "voorbeeldSluiten")}</Link> : null}
      </div>
      {andere ? <div className="mt-2 flex flex-wrap gap-2">{andere.map((a) => <button key={a.i} onClick={() => kies(a.i)} aria-pressed={a.i === huidig} className={`rounded-full border px-3 py-1 text-xs font-semibold ${a.i === huidig ? "border-brand bg-white text-ink" : "border-border text-ink-soft"}`}>{a.naam}</button>)}</div> : null}

      {tab === "home" ? (<>
          <h1 className="lora mt-1 text-[30px] leading-tight">{actief.length ? t(N + "binnenkort") : t(N + "allesRustig")}</h1>
          {fout ? <LaadFout onOpnieuw={ophalen.opnieuw}/> : !isVoorbeeld && !ophalen.geladen ? <InhoudLaden hoogte="min-h-[20dvh]"/> : mijnMomenten.length === 0 ? <p className="mt-2 text-sm text-ink-soft">{kids.length ? t(N + "geenAfspraken", { namen: naamKids(kids.map((k) => k.id)) }) : t(N + "nietsGedeeld")}</p> : null}
          <div className="mt-5 space-y-6">
            {mijnMomenten.map((a) => <MijnMoment key={a.id} a={a} p={p} kids={kids} alleenKijken={isVoorbeeld} vandaag={vandaag}/>)}
          </div>

          {hulpVoorMij.length ? (<section className="mt-8">
              <h2 className={kop}>{t(N + "hulpGevraagd")}</h2>
              {hulpVoorMij.map((h) => {
                const mijn = h.ontvangers.find((o) => o.id === p.id);
                const open = h.status === "open" && mijn?.status === "requested";
                return (<div key={h.id} className="mt-2 border-b border-border pb-3 text-sm">
                  <p className="font-semibold">{h.wat}</p>
                  <p className="text-xs text-ink-soft">{naamKids(h.kindIds) ? `${naamKids(h.kindIds)} · ` : ""}{dagTekst(h.datum)}{h.tijd ? ` · ${uur(h.tijd)}` : ""}</p>
                  {open ? (<div className="mt-2 flex flex-wrap gap-2">
                      <button disabled={isVoorbeeld || bezig === h.id} onClick={() => hulpActie(h.id, "accept")} className="min-h-11 flex-1 rounded-full bg-brand px-4 text-xs font-semibold text-primary-foreground disabled:opacity-40">{t(N + "ikDoeHet")}</button>
                      <KanNiet uit={isVoorbeeld || bezig === h.id} onVerstuur={(reden) => hulpActie(h.id, "decline", reden)}/>
                    </div>)
                        : <p className="mt-1 text-xs text-ink-soft">{h.status === "accepted" && h.geaccepteerdDoor === p.id ? t(N + "hulp.jij") : mijn?.status === "declined" ? t(N + "hulp.kanNiet") : h.status === "accepted" ? t(N + "hulp.iemandAnders") : t(N + "hulp.nietNodig")}</p>}
                </div>);
            })}
            </section>) : null}

          {mijnMomentjes[0] ? (<section className="mt-8">
              <h2 className={kop}>{t(N + "nieuwMoment")}</h2>
              <p className="mt-2 text-sm">{mijnMomentjes[0].tekst}</p>
              <button onClick={() => setTab("momentjes")} className="mt-2 flex min-h-10 items-center text-xs font-semibold text-brand"><MetChevron>{t(N + "bekijkMoment")}</MetChevron></button>
            </section>) : null}

          {meldingen.length ? (<section className="mt-8">
              <h2 className={kop}>{t(N + "meldingen")}</h2>
              <ul className="mt-2 divide-y divide-border border-y border-border text-sm">
                {meldingen.map((m, i) => <li key={`${i}-${m}`} className="flex items-center gap-2 py-2.5"><Bell className="size-3.5 shrink-0 text-ink-soft" strokeWidth={1.6}/>{m}</li>)}
              </ul>
            </section>) : null}
        </>) : null}

      {tab === "momentjes" ? (<>
          <h1 className="lora mt-1 text-[30px] leading-tight">{t(N + "tab.momenten")}</h1>
          {magDelen ? <button type="button" onClick={() => setDeel(true)} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-brand/40 bg-brand-soft px-4 text-sm font-semibold text-brand"><Plus aria-hidden="true" strokeWidth={2} className="size-4 shrink-0"/>{t(N + "deel").replace(/^\+\s*/, "")}</button> : null}
          <div className="mt-5 space-y-3">
            {mijnMomentjes.map((m) => <MomentjeKaart key={m.id} m={m} kijker={p.id}/>)}
            {mijnMomentjes.length === 0 ? <p className="rounded-xl bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)] px-3 py-3 text-center text-sm text-ink-soft">{t(N + "geenMomenten")}</p> : null}
          </div>
          {magDelen ? <DeelMomentje open={deel} onSluit={() => setDeel(false)} alsKring={p.id}/> : null}
        </>) : null}

      {tab === "meer" ? (<>
          <h1 className="lora mt-1 text-[30px] leading-tight">{t(N + "tab.menu")}</h1>
          {actief.length ? (<section className="mt-6">
              <h2 className={kop}>{t(N + "komendeMomenten")}</h2>
              <div className="mt-1 divide-y divide-border border-y border-border">
                {actief.map((a) => (<div key={a.id} className="py-3 text-sm">
                    <p className="font-semibold">{dagTekst(a.datum)}{a.tijd ? ` · ${uur(a.tijd)}` : ""}</p>
                    <p className="text-xs text-ink-soft">{a.soort === "wissel" ? t(N + "wisselmoment", { plek: a.plek || "-" }) : [a.titel, a.plek].filter(Boolean).join(" · ")}</p>
                  </div>))}
              </div>
            </section>) : null}
          {noodKids.map((k) => <Noodkaart key={k.id} kind={k}/>)}
          {!actief.length && !noodKids.length ? <p className="mt-4 rounded-xl bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)] px-3 py-3 text-center text-sm text-ink-soft">{t(N + "nietsGedeeld")}</p> : null}
          {!isVoorbeeld ? <Uitloggen /> : null}
        </>) : null}
    </Kader>);
}
/** Eén ophaal- of brengmoment van dit kringlid, met accepteren/weigeren, onderweg en "ik ben er". */
function MijnMoment({ a, p, kids: alleKids, alleenKijken, vandaag }) {
    const { t } = useTranslation();
    const [bezig, setBezig] = useState(false);
    const kids = alleKids.filter((k) => a.kindIds.includes(k.id));
    const spullen = a.kindIds.some((k) => mag(p, k, "spullen"));
    const spullenAanpassen = !alleenKijken && a.status === "accepted" && a.kindIds.some((k) => mag(p, k, "spullen", "bijdragen"));
    const klaar = a.ingepakt ?? [];
    const mee = a.mee ?? [];
    const nogMee = mee.filter((x) => !klaar.includes(x)).length;
    const opDeDag = a.datum === vandaag;
    const doe = async (f) => { setBezig(true); const r = await f(); setBezig(false); return r; };
    const uit = alleenKijken || bezig;
    const knop = "min-h-11 flex-1 rounded-full border border-border bg-card px-3 text-sm font-semibold disabled:opacity-40";
    return (<section className="border-t border-border pt-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand">{dagTekst(a.datum)}</p>
      <p className="mt-1 font-display text-xl">{a.tijd ? `${uur(a.tijd)} · ` : ""}{a.soort === "wissel" ? t(N + "jijHaalt", { namen: kids.map((k) => k.naam).join(` ${t("common.en")} `) }) : a.titel}</p>
      {a.plek ? <p className="text-sm text-ink-soft">{a.plek}</p> : null}
      {(a.checkins ?? []).filter((c) => c.kind === "onderweg").map((c) => <p key={c.at} role="status" className="mt-2 rounded-md bg-brand-soft px-3 py-2 text-sm font-semibold">{t(N + "ouderOnderweg", { naam: c.name })}</p>)}
      {spullen && mee.length ? (<>
          <p className="mt-3 text-xs font-semibold">{t(N + "mee")} {nogMee ? t(N + "nogTeDoen", { n: nogMee }) : ""}</p>
          <ul className="mt-1 space-y-1">
            {mee.map((x) => {
                const ok = klaar.includes(x);
                return (<li key={x}>
                  <button disabled={!spullenAanpassen} onClick={() => toggleIngepakt(a.id, x)} aria-pressed={ok} className="flex min-h-9 items-center gap-2 text-sm">
                    <span className={`grid size-5 shrink-0 place-items-center rounded-full border ${ok ? "border-brand bg-brand text-primary-foreground" : "border-border"}`}>{ok ? <Check className="size-3"/> : null}</span>{x}
                  </button>
                </li>);
            })}
          </ul>
        </>) : null}
      {a.status === "requested" ? (<div className="mt-4 flex flex-wrap gap-2">
          <button disabled={uit} onClick={() => doe(() => reageerOphalen(a.id, "accept"))} className="min-h-11 flex-1 rounded-full bg-brand px-3 text-sm font-semibold text-primary-foreground disabled:opacity-40">{t(N + "ikRegel")}</button>
          <KanNiet uit={uit} onVerstuur={(reden) => doe(() => reageerOphalen(a.id, "decline", reden))}/>
        </div>) : a.status === "declined" ? (<div className="mt-3">
          <p className="text-xs text-ink-soft">{t(N + "jijKanNiet")}</p>
          <button disabled={uit} onClick={() => doe(() => reageerOphalen(a.id, "accept"))} className="mt-1 inline-flex min-h-10 items-center text-sm font-semibold text-brand disabled:opacity-40">{t(N + "tochRegelen")}</button>
        </div>) : a.aangekomenOp ? (<p role="status" className="mt-4 text-sm font-semibold text-brand"><MetVinkje>{t(N + "jijBentEr")}</MetVinkje></p>) : (<>
          <p className="mt-3 text-xs font-semibold text-brand"><MetVinkje>{t(N + "bevestigdDoorJou")}</MetVinkje></p>
          {opDeDag ? (<div className="mt-3 flex gap-2">
              <button disabled={uit || !!a.onderwegOp} onClick={() => doe(() => meldOnderwegKring(a.id))} className={`${knop} ${a.onderwegOp ? "border-brand bg-brand-soft" : ""}`}>{a.onderwegOp ? <MetVinkje achter>{t(N + "ikBenOnderweg")}</MetVinkje> : t(N + "ikBenOnderweg")}</button>
              <button disabled={uit} onClick={() => doe(() => meldAangekomenKring(a.id))} className="min-h-11 flex-1 rounded-full bg-brand px-3 text-sm font-semibold text-primary-foreground disabled:opacity-40">{t(N + "ikBenEr")}</button>
            </div>) : null}
        </>)}
    </section>);
}
/** Alleen de velden die de ouders op de noodkaart zetten; de server stuurt niets anders mee. */
function Noodkaart({ kind }) {
    const { t } = useTranslation();
    const e = kind.nood ?? {};
    const rij = (l, w) => (w ? <div key={l} className="py-2"><p className="text-[11px] uppercase tracking-wide text-ink-soft">{l}</p><p className="whitespace-pre-line text-sm">{w}</p></div> : null);
    const contacten = (e.contacts ?? []).map((c) => [c.name, c.role === "ouder" ? t(N + "nood.ouder") : i18n.exists(`routes.kinderenKindId.rol.${c.role}`) ? t(`routes.kinderenKindId.rol.${c.role}`).toLowerCase() : rolNaam(c.role), c.phone ? toonTelefoon(c.phone) : ""].filter(Boolean).join(" · ")).join("\n");
    const geboren = e.date_of_birth ? new Date(`${e.date_of_birth}T12:00:00`).toLocaleDateString(taalLocale(), { day: "numeric", month: "long", year: "numeric" }) : null;
    return (<section className="mt-7">
      <h2 className={`${kop} flex items-center gap-1.5`}><ShieldPlus className="size-3.5" strokeWidth={1.6}/>{t(N + "nood.titel", { naam: kind.naam })}</h2>
      <div className="mt-1 divide-y divide-border border-y border-border">
        {rij(t(N + "nood.naam"), kind.naam)}
        {rij(t(N + "nood.geboren"), geboren)}
        {rij(t(N + "nood.contacten"), contacten)}
        {rij(t(N + "nood.huisarts"), e.doctor)}
        {rij(t(N + "nood.allergieen"), e.allergies)}
        {rij(t(N + "nood.medicatie"), e.medication)}
        {rij(t(N + "nood.goedOmTeWeten"), e.extra)}
      </div>
    </section>);
}
