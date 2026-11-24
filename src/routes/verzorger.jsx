import { uur } from "@/lib/tijd-tekst";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { accepteerHulp, useHulpVerzoeken } from "@/lib/taken-store";
import { z } from "zod";
import { Bell, Check, Heart, Home, Loader2, Menu, ShieldPlus } from "lucide-react";
import { useMomentjes } from "@/lib/momentjes-store";
import { useKringMomentenVoeden } from "@/lib/overdracht-store";
import { DeelMomentje, MomentjeKaart } from "@/components/Momentjes";
import { bekijkAls, bevestig, geenRechten, isActief, laadKring, mag, mijnKringen, persoonLabel, rolNaam, toggleMee, useKring, } from "@/lib/kring-store";
import { useTranslation } from "react-i18next";
import i18n, { taalLocale } from "@/i18n";
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
/**
 * Twee ingangen, één weergave (KringApp), altijd gebouwd uit wat de SERVER voor dit kringlid teruggeeft:
 * - als verzorger ingelogd: get-for-user (alleen actieve, bevestigde toegang binnen de periode);
 * - als ouder met `?p=<id>`: view-as, het voorbeeld van precies wat dat kringlid ziet.
 */
function Verzorger() {
    const { t } = useTranslation();
    const { p: pid } = Route.useSearch();
    const kring = useKring();
    useKringMomentenVoeden();
    const [eigen, setEigen] = useState(null); // views van dit account als verzorger
    const [keuze, setKeuze] = useState(0);
    const [voorbeeld, setVoorbeeld] = useState(undefined); // undefined = laden, null = geen toegang
    useEffect(() => {
        if (pid)
            return;
        let weg = false;
        laadKring();
        mijnKringen().then((v) => { if (!weg)
            setEigen(v); }).catch(() => { if (!weg)
            setEigen([]); });
        return () => { weg = true; };
    }, [pid]);
    useEffect(() => {
        if (!pid)
            return;
        let weg = false;
        setVoorbeeld(undefined);
        bekijkAls(pid).then((v) => { if (!weg)
            setVoorbeeld(v ?? null); }).catch(() => { if (!weg)
            setVoorbeeld(null); });
        return () => { weg = true; };
    }, [pid]);
    if (pid) {
        if (voorbeeld === undefined)
            return <Kader><Laden /></Kader>;
        if (!voorbeeld) {
            return (<Kader>
          <h1 className="lora text-[30px] leading-tight">{t(N + "verlopen.titel")}</h1>
          <p className="mt-2 text-sm text-ink-soft">{t(N + "verlopen.uitleg")}</p>
          <Link to="/verzorger" className="mt-6 block text-xs font-semibold text-brand">{t(N + "verlopen.terug")}</Link>
        </Kader>);
        }
        return <KringApp view={voorbeeld} isVoorbeeld/>;
    }
    if (eigen === null)
        return <Kader><Laden /></Kader>;
    if (eigen.length) {
        const view = eigen[Math.min(keuze, eigen.length - 1)];
        return <KringApp view={view} andere={eigen.length > 1 ? eigen.map((v, i) => ({ i, naam: v.children.map((k) => k.name).join(` ${t("common.en")} `) || v.caregiver.name })) : null} kies={setKeuze} huidig={Math.min(keuze, eigen.length - 1)}/>;
    }
    // Ouder zonder eigen kringtoegang: kies iemand uit de kring om het voorbeeld te bekijken.
    const metApp = kring.personen.filter((p) => p.uitgenodigd !== false && !String(p.id).startsWith("tmp-"));
    return (<Kader>
      <h1 className="lora text-[30px] leading-tight">{t(N + "voorbeeld.titel")}</h1>
      <p className="mt-2 text-sm text-ink-soft">{t(N + "voorbeeld.uitleg")}</p>
      <div className="mt-6 divide-y divide-border border-y border-border">
        {metApp.map((p) => (<Link key={p.id} to="/verzorger" search={{ p: p.id }} className="flex items-center justify-between py-3 text-sm">
            <span><b>{persoonLabel(p)}</b><span className="block text-xs text-ink-soft">{rolNaam(p.rol)}{p.bevestigd === false && !p.ingetrokken ? t(N + "voorbeeld.nogNietBevestigd") : isActief(p) ? "" : t(N + "voorbeeld.geenToegang")}</span></span><Chevron className="size-4 text-ink-soft"/>
          </Link>))}
        {metApp.length === 0 ? <p className="py-3 text-sm text-ink-soft">{t(N + "voorbeeld.leeg")}</p> : null}
      </div>
      <Link to="/meer" className="mt-6 block text-center text-xs font-semibold text-brand">{t(N + "voorbeeld.terug")}</Link>
    </Kader>);
}
function Laden() {
    const { t } = useTranslation();
    return <p className="flex items-center gap-2 pt-10 text-sm font-semibold text-ink-soft" role="status"><Loader2 className="size-5 animate-spin" aria-hidden="true"/>{t("common.laden")}</p>;
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
function KringApp({ view, isVoorbeeld, andere, kies, huidig }) {
    const { t } = useTranslation();
    const kring = useKring();
    const hulpLijst = useHulpVerzoeken();
    const { lijst } = useMomentjes();
    const [tab, setTab] = useState("home");
    const [deel, setDeel] = useState(false);
    const p = persoonUitView(view);
    const kids = view.children.map((k) => ({ id: k.id, naam: k.name, nood: k.emergency }));
    const kidsMet = (o, min) => kids.filter((k) => mag(p, k.id, o, min));
    const momentjesKids = kidsMet("momentjes");
    const magDelen = !isVoorbeeld && kidsMet("momentjes", "bijdragen").length > 0;
    const wisselKids = kidsMet("wissel");
    const noodKids = kidsMet("nood");
    const zichtbaarMoment = (m) => m.kindIds.some((k) => mag(p, k, m.soort === "wissel" ? "wissel" : "agenda"));
    const mijnMomenten = kring.momenten.filter((m) => kring.wie[m.id] === p.id && zichtbaarMoment(m));
    const wissels = kring.momenten.filter((m) => m.soort === "wissel" && m.kindIds.some((k) => wisselKids.some((x) => x.id === k)));
    const mijnMomentjes = lijst.filter((m) => !m.prive && momentjesKids.some((k) => k.id === m.kindId) && (m.auteurId === p.id || m.kringIds?.includes(p.id)));
    const hulpVoorMij = hulpLijst.filter((h) => h.ontvangers?.includes(p.id));
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
        ...mijnMomenten.map((m) => t(N + (m.soort === "wissel" ? "melding.haal" : "melding.breng"), { dag: m.dag, namen: naamKids(m.kindIds.filter((k) => mag(p, k, m.soort === "wissel" ? "wissel" : "agenda"))), tijd: m.tijd })),
        ...(mijnMomentjes.some((m) => m.auteurId !== p.id) ? [t(N + "melding.nieuwMoment")] : []),
    ];
    return (<Kader nav={nav}>
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-soft">{t(N + "hoi", { naam: p.naam })}</p>
        {isVoorbeeld ? <Link to="/verzorger" className="text-[11px] font-semibold text-brand">{t(N + "voorbeeldSluiten")}</Link> : null}
      </div>
      {andere ? <div className="mt-2 flex flex-wrap gap-2">{andere.map((a) => <button key={a.i} onClick={() => kies(a.i)} aria-pressed={a.i === huidig} className={`rounded-full border px-3 py-1 text-xs font-semibold ${a.i === huidig ? "border-brand bg-white text-ink" : "border-border text-ink-soft"}`}>{a.naam}</button>)}</div> : null}

      {tab === "home" ? (<>
          <h1 className="lora mt-1 text-[30px] leading-tight">{mijnMomenten.length ? t(N + "binnenkort") : t(N + "allesRustig")}</h1>
          {mijnMomenten.length === 0 ? <p className="mt-2 text-sm text-ink-soft">{kids.length ? t(N + "geenAfspraken", { namen: naamKids(kids.map((k) => k.id)) }) : t(N + "nietsGedeeld")}</p> : null}
          <div className="mt-5 space-y-6">
            {mijnMomenten.map((m) => <MijnMoment key={m.id} m={m} p={p} kids={kids} alleenKijken={isVoorbeeld}/>)}
          </div>

          {wissels.length && !mijnMomenten.some((m) => m.soort === "wissel") ? (<section className="mt-8">
              <h2 className={kop}>{t(N + "volgendeWissel")}</h2>
              <p className="mt-2 text-sm font-semibold">{wissels[0].dag} · {wissels[0].tijd}</p>
            </section>) : null}

          {hulpVoorMij.length ? (<section className="mt-8">
              <h2 className={kop}>{t(N + "hulpGevraagd")}</h2>
              {hulpVoorMij.map((h) => (<div key={h.id} className="mt-2 border-b border-border pb-3 text-sm">
                  <p className="font-semibold">{h.wat}</p>
                  <p className="text-xs text-ink-soft">{new Date(h.datum).toLocaleDateString(taalLocale(), { weekday: "long", day: "numeric", month: "long" })} · {uur(h.tijd)}</p>
                  {h.status === "open" && !isVoorbeeld ? <button onClick={() => accepteerHulp(h.id, p.id)} className="mt-2 min-h-11 rounded-full bg-brand px-4 text-xs font-semibold text-primary-foreground">{t(N + "ikDoeHet")}</button>
                        : <p className="mt-1 text-xs text-ink-soft">{h.geaccepteerdDoor === p.id ? t(N + "hulp.jij") : h.status === "geaccepteerd" ? t(N + "hulp.iemandAnders") : h.status === "open" ? "" : t(N + "hulp.nietNodig")}</p>}
                </div>))}
            </section>) : null}

          {mijnMomentjes[0] ? (<section className="mt-8">
              <h2 className={kop}>{t(N + "nieuwMoment")}</h2>
              <p className="mt-2 text-sm">{mijnMomentjes[0].tekst}</p>
              <button onClick={() => setTab("momentjes")} className="mt-2 flex min-h-10 items-center text-xs font-semibold text-brand"><MetChevron>{t(N + "bekijkMoment")}</MetChevron></button>
            </section>) : null}

          {meldingen.length ? (<section className="mt-8">
              <h2 className={kop}>{t(N + "meldingen")}</h2>
              <ul className="mt-2 divide-y divide-border border-y border-border text-sm">
                {meldingen.map((m) => <li key={m} className="flex items-center gap-2 py-2.5"><Bell className="size-3.5 text-ink-soft" strokeWidth={1.6}/>{m}</li>)}
              </ul>
            </section>) : null}
        </>) : null}

      {tab === "momentjes" ? (<>
          <div className="mt-1 flex items-center justify-between">
            <h1 className="lora text-[30px] leading-tight">{t(N + "tab.momenten")}</h1>
            {magDelen ? <button onClick={() => setDeel(true)} className="text-xs font-semibold text-brand">{t(N + "deel")}</button> : null}
          </div>
          <div className="mt-5 space-y-3">
            {mijnMomentjes.map((m) => <MomentjeKaart key={m.id} m={m} kijker={p.id}/>)}
            {mijnMomentjes.length === 0 ? <p className="text-sm text-ink-soft">{t(N + "geenMomenten")}</p> : null}
          </div>
          {magDelen ? <DeelMomentje open={deel} onSluit={() => setDeel(false)} alsKring={p.id}/> : null}
        </>) : null}

      {tab === "meer" ? (<>
          <h1 className="lora mt-1 text-[30px] leading-tight">{t(N + "tab.menu")}</h1>
          {wisselKids.length && wissels.length ? (<section className="mt-6">
              <h2 className={kop}>{t(N + "komendeWissels")}</h2>
              <div className="mt-1 divide-y divide-border border-y border-border">
                {wissels.map((m) => (<div key={m.id} className="py-3 text-sm">
                    <p className="font-semibold">{m.dag} · {uur(m.tijd)}</p>
                    <p className="text-xs text-ink-soft">{t(N + "wisselmoment", { plek: m.plek })}</p>
                  </div>))}
              </div>
            </section>) : null}
          {noodKids.map((k) => <Noodkaart key={k.id} kind={k}/>)}
          {!(wisselKids.length && wissels.length) && !noodKids.length ? <p className="mt-4 text-sm text-ink-soft">{t(N + "nietsGedeeld")}</p> : null}
        </>) : null}
    </Kader>);
}
function MijnMoment({ m, p, kids: alleKids, alleenKijken }) {
    const { t } = useTranslation();
    const kring = useKring();
    const kids = alleKids.filter((k) => m.kindIds.includes(k.id) && mag(p, k.id, m.soort === "wissel" ? "wissel" : "agenda"));
    const spullen = m.kindIds.some((k) => mag(p, k, "spullen"));
    const spullenAanpassen = !alleenKijken && m.kindIds.some((k) => mag(p, k, "spullen", "bijdragen"));
    const agenda = m.kindIds.some((k) => mag(p, k, "agenda"));
    const klaar = kring.meeKlaar[m.id] ?? [];
    const bev = kring.bevestigd[m.id];
    const mee = m.mee ?? [];
    const nogMee = mee.filter((x) => !klaar.includes(x)).length;
    return (<section className="border-t border-border pt-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand">{m.dag}</p>
      <p className="mt-1 font-display text-xl">{uur(m.tijd)} · {m.soort === "wissel" ? t(N + "jijHaalt", { namen: kids.map((k) => k.naam).join(` ${t("common.en")} `) }) : m.titel}</p>
      <p className="text-sm text-ink-soft">{m.plek}</p>
      {spullen && mee.length ? (<>
          <p className="mt-3 text-xs font-semibold">{t(N + "mee")} {nogMee ? t(N + "nogTeDoen", { n: nogMee }) : ""}</p>
          <ul className="mt-1 space-y-1">
            {mee.map((x) => {
                const ok = klaar.includes(x);
                return (<li key={x}>
                  <button disabled={!spullenAanpassen} onClick={() => toggleMee(m.id, x)} className="flex items-center gap-2 text-sm">
                    <span className={`grid size-5 place-items-center rounded-full border ${ok ? "border-brand bg-brand text-primary-foreground" : "border-border"}`}>{ok ? <Check className="size-3"/> : null}</span>{x}
                  </button>
                </li>);
            })}
          </ul>
        </>) : null}
      {agenda && m.daarna ? <p className="mt-3 text-xs"><b>{t(N + "daarna")}</b> · {m.daarna}</p> : null}
      <div className="mt-4 flex gap-2">
        <button disabled={alleenKijken} onClick={() => bevestig(m.id, "regel")} className={`flex-1 rounded-md border py-2.5 text-sm font-semibold ${bev === "regel" ? "border-brand bg-brand-soft" : "border-border"}`}>{bev === "regel" ? <MetVinkje achter>{t(N + "ikRegel")}</MetVinkje> : t(N + "ikRegel")}</button>
        <button disabled={alleenKijken} onClick={() => bevestig(m.id, "er")} className={`flex-1 rounded-md py-2.5 text-sm font-semibold ${bev === "er" ? "bg-brand text-primary-foreground" : "border border-border"}`}>{bev === "er" ? <MetVinkje achter>{t(N + "ikBenEr")}</MetVinkje> : t(N + "ikBenEr")}</button>
      </div>
    </section>);
}
/** Alleen de velden die de ouders op de noodkaart zetten; de server stuurt niets anders mee. */
function Noodkaart({ kind }) {
    const { t } = useTranslation();
    const e = kind.nood ?? {};
    const rij = (l, w) => (w ? <div key={l} className="py-2"><p className="text-[11px] uppercase tracking-wide text-ink-soft">{l}</p><p className="whitespace-pre-line text-sm">{w}</p></div> : null);
    const contacten = (e.contacts ?? []).map((c) => [c.name, c.role === "ouder" ? t(N + "nood.ouder") : i18n.exists(`routes.kinderenKindId.rol.${c.role}`) ? t(`routes.kinderenKindId.rol.${c.role}`).toLowerCase() : rolNaam(c.role), c.phone].filter(Boolean).join(" · ")).join("\n");
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
