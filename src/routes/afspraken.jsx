import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { useBevestigPopup } from "@/lib/feedback";
import { RustigTip, useKeuzeTeksten } from "@/components/RustigTip";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Badge, BewerkPotlood } from "@/components/ui-kit";
import { AppShell, Card, PageHeader, TerugKnop } from "@/components/AppShell";
import { AppIcon } from "@/components/AppIcon";
import { VoorstelIntrekken } from "@/components/VoorstelIntrekken";
import { Button } from "@/components/ui/button";
import { zetVoorkeur, useVoorkeuren } from "@/lib/voorkeuren-store";
import { laadWeergave } from "@/components/Laden";
import { afsprakenBron } from "@/lib/afspraken-store";
import { IK, naam, nodig, ONDERWERPEN, onderwerpLabel, reageerOpVoorstel, stelNieuweAfspraakVoor, stelWijzigingVoor, toonDatum, useAfspraken, voorstelZin, wachtOpMij, trekAfspraakIn, isIngevuldeAfspraak } from "@/lib/afspraken-store";
import { useGezin } from "@/lib/gezin";
import { useStart } from "@/lib/start-store";
import { Chevron, MetChevron } from "@/components/Tekens";
import { chip as chipStijl, VELD } from "@/lib/ui-stijl";
export const Route = createFileRoute("/afspraken")({
    head: () => ({
        meta: [
            { title: i18n.t("common.metaTitel", { titel: i18n.t("routes.afspraken.meta.titel") }) },
            { name: "description", content: i18n.t("routes.afspraken.meta.beschrijving") },
            { property: "og:title", content: i18n.t("common.metaTitel", { titel: i18n.t("routes.afspraken.meta.titel") }) },
            { property: "og:description", content: i18n.t("routes.afspraken.meta.ogBeschrijving") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    // Alleen de ouderweergave: de professional-weergave (Milestone 3) is in deze fase niet bereikbaar.
    validateSearch: z.object({ nieuw: z.enum(["voorstel", "afspraak"]).optional(), afspraak: z.string().optional(), bron: z.string().optional() }),
    component: AfsprakenPagina,
});
/** Namen samenvoegen met "en"/"and". */
const lijstNamen = (namen, t) => namen.map((o) => naam(o)).join(` ${t("common.en")} `);
function AfsprakenPagina() {
    const { t } = useTranslation();
    const zoek = Route.useSearch();
    const lijst = useAfspraken();
    const laadStatus = afsprakenBron.useStatus();
    const vk = useVoorkeuren();
    const [houvastTip, setHouvastTip] = useState(false);
    const [open, setOpen] = useState(zoek.afspraak ?? null);
    useEffect(() => { setOpen(zoek.afspraak ?? null); setNieuw(!!zoek.nieuw); }, [zoek.afspraak, zoek.nieuw]);
    const [nieuw, setNieuw] = useState(!!zoek.nieuw);
    const [melding, setMelding] = useState(null);
    useBevestigPopup(melding);
    const gekozen = lijst.find((a) => a.id === open);
    if (gekozen) {
        return (<AppShell>
        <div className="mt-2 flex items-center gap-2.5"><TerugKnop onClick={() => setOpen(null)}/><span className="text-sm font-extrabold text-ink-soft">{t("routes.afspraken.terugNaarAfspraken")}</span></div>
        <Detail a={gekozen} onVoorstel={async (v) => {
                const a = await stelWijzigingVoor(gekozen.id, v);
                if (a)
                    setMelding(a.status === "Gestopt" || (!a.voorstel && v.soort !== "stoppen") ? t("routes.afspraken.melding.vastgelegd") : v.soort === "stoppen" ? t("routes.afspraken.melding.stoppenVerstuurd") : t("routes.afspraken.melding.wijzigingVerstuurd"));
            }} onReageer={async (k, tekst) => {
                const a = await reageerOpVoorstel(gekozen.id, k, tekst);
                if (a && k === "niet" && !gekozen.veiligheid && !vk.extraHouvast && !vk.extraHouvastTipGezien) {
                    zetVoorkeur("extraHouvastTipGezien", true);
                    setHouvastTip(true);
                }
            }} onIntrekken={() => { if (trekAfspraakIn(gekozen.id))
            setMelding(t("routes.afspraken.melding.ingetrokken")); }}/>
        {melding ? <p role="status" className="mt-3 text-xs text-ink-soft">{melding}</p> : null}
        {houvastTip ? <Link to="/extra-ondersteuning" className="mt-3 inline-flex min-h-11 items-center text-xs text-brand">{t("routes.afspraken.houvastTip")}</Link> : null}
      </AppShell>);
    }
    const zichtbaar = lijst.filter(isIngevuldeAfspraak).filter((a) => a.status === "Actief" || a.status === "Gestopt" || a.status === "Voorstel");
    const aandacht = lijst.filter(wachtOpMij);
    const groepen = ONDERWERPEN.map((o) => o.groep).filter((g, i, s) => s.indexOf(g) === i).map((g) => [g, zichtbaar.filter((a) => a.onderwerp === g && a.status !== "Gestopt" && !aandacht.includes(a))]).filter(([, l]) => l.length);
    const gestopt = zichtbaar.filter((a) => a.status === "Gestopt");
    return (<AppShell>
      <PageHeader titel={t("routes.afspraken.titel")} subtitel={t("routes.afspraken.subtitel")} terug="/extra-ondersteuning" actie={<div className="flex">
          <button aria-label={t("routes.afspraken.nieuweVoorstellen")} onClick={() => setNieuw(true)} className="grid size-10 place-items-center rounded-full bg-brand text-2xl leading-none text-primary-foreground">+</button>
        </div>}/>


      {melding ? (<Card className="mt-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold"><AppIcon functie="melding" maat="sm" vorm="kaal"/>{melding}</p>
          <button onClick={() => setMelding(null)} className="mt-1 min-h-11 text-xs font-semibold text-brand">{t("common.sluiten")}</button>
        </Card>) : null}

      {nieuw ? <NieuweAfspraak voorinvul={zoek.bron && !["agenda", "samen-regelen"].includes(zoek.bron) ? zoek.bron : ""} onAnnuleer={() => setNieuw(false)} onVerstuur={async ({ onderwerp, titel, tekst, kindIds, anderId }) => {
                const a = await stelNieuweAfspraakVoor({ onderwerp, titel, tekst, kindIds, anderId });
                if (!a)
                    return;
                setNieuw(false);
                setMelding(a.status === "Actief" ? t("routes.afspraken.melding.vastgelegd") : t("routes.afspraken.melding.nieuwAnder"));
            }}/> : null}

      {aandacht.length ? (<Sectie titel={t("routes.afspraken.jouwAandacht")}>
          {aandacht.map((a) => <Rij key={a.id} a={a} onOpen={() => setOpen(a.id)} status={voorstelZin(a.voorstel, naam(a.voorstel.door), a.voorstel.door === IK)} actie/>)}
        </Sectie>) : null}

      <div className="mt-4 flex flex-wrap gap-x-4">
        <Link to="/halen-brengen" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand"><AppIcon functie="overdracht" maat="sm" vorm="kaal"/>{t("routes.afspraken.halenBrengen")}</Link>
        <Link to="/contact" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand"><AppIcon functie="berichten" maat="sm" vorm="kaal"/>{t("routes.afspraken.contactafspraken")}</Link>
      </div>
      {groepen.length ? <h2 className="mt-6 font-display text-lg font-bold">{t("routes.afspraken.watAfgesproken")}</h2> : !aandacht.length && !gestopt.length ? (laadWeergave(laadStatus, afsprakenBron.ververs) ?? <div className="mt-6"><p className="rounded-xl bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)] px-3 py-3 text-center text-sm text-ink-soft">{t("routes.afspraken.nogGeen")}</p><button type="button" onClick={() => setNieuw(true)} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-brand/40 bg-brand-soft px-4 text-sm font-semibold text-brand"><Plus aria-hidden="true" strokeWidth={2} className="size-4 shrink-0"/>{t("routes.afspraken.nieuweVoorstellen")}</button></div>) : null}
      {groepen.map(([g, l]) => (<Sectie key={g} titel={onderwerpLabel(g)}>
          {l.map((a) => <Rij key={a.id} a={a} onOpen={() => setOpen(a.id)}/>)}
        </Sectie>))}
      {gestopt.length ? <Sectie titel={t("routes.afspraken.gestopt")}>{gestopt.map((a) => <Rij key={a.id} a={a} onOpen={() => setOpen(a.id)} status={t("routes.afspraken.gestoptOp", { datum: toonDatum(a.gestoptOp) })}/>)}</Sectie> : null}

      <p className="mt-6 text-xs text-ink-soft">{t("routes.afspraken.voetnoot")}</p>
    </AppShell>);
}
function Sectie({ titel, children }) {
    return (<section className="mt-5">
      <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">{titel}</h3>
      <div className="mt-2 divide-y divide-border rounded-md border border-border bg-card">{children}</div>
    </section>);
}
function Rij({ a, onOpen, status, actie }) {
    const { t } = useTranslation();
    const jouwReactie = status == null && !!a.voorstel && wachtOpMij(a);
    const s = status ?? (a.voorstel ? (jouwReactie ? t("routes.afspraken.jouwReactieNodig") : t("routes.afspraken.wachtOpReactieVan", { namen: lijstNamen(nodig(a.voorstel), t) })) : null);
    return (<button onClick={onOpen} className="flex w-full items-center gap-3 px-3 py-3 text-left">
      {a.veiligheid ? <AppIcon functie="veiligheid" maat="sm"/> : null}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{a.titel}</span>
        <span className="mt-0.5 block text-xs text-ink-soft">{a.tekst}</span>
        {s ? <span className="mt-1 block"><Badge toon={actie || jouwReactie ? "actie" : "klaar"}>{s}</Badge></span> : null}
      </span>
      <Chevron className="size-4 shrink-0 text-ink-soft"/>
    </button>);
}
function Veld({ label, children }) {
    return <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">{label}</dt><dd className="mt-0.5">{children}</dd></div>;
}
function Detail({ a, onVoorstel, onReageer, onIntrekken }) {
    const { t } = useTranslation();
    const versie = a.versie ?? 0;
    const [gezien, setGezien] = useState(versie);
    const eigen = useRef(false);
    useEffect(() => { if (eigen.current) {
        eigen.current = false;
        setGezien(versie);
    } }, [versie]);
    const verouderd = versie !== gezien;
    const k = useKeuzeTeksten();
    const doe = (f) => { if (verouderd)
        return; eigen.current = true; f(); };
    const [bewerk, setBewerk] = useState(false);
    const [tekst, setTekst] = useState(a.tekst);
    const [alt, setAlt] = useState(null);
    const [meer, setMeer] = useState(false);
    const [historie, setHistorie] = useState(false);
    const veld = `w-full ${VELD}`;
    const v = a.voorstel;
    const kanAanpassen = a.status === "Actief" && !v && !verouderd;
    if (verouderd) {
        return (<Card className="mt-3 space-y-2" role="status">
        <p className="font-semibold">{t("routes.afspraken.detail.veranderd")}</p>
        <p className="text-xs text-ink-soft">{t("routes.afspraken.detail.nietVerstuurd")}</p>
        <button onClick={() => { setGezien(versie); setBewerk(false); setAlt(null); }} className="min-h-11 w-full rounded-full bg-brand text-sm font-semibold text-primary-foreground">{t("routes.afspraken.detail.bekijkNieuwste")}</button>
      </Card>);
    }
    if (bewerk) {
        return (<Card className="mt-3 space-y-3">
        <h1 className="lora text-[28px] leading-tight">{t("routes.afspraken.detail.aanpassen")}</h1>
        <div><p className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">{t("routes.afspraken.detail.huidige")}</p><p className="mt-1 text-sm">{a.tekst}</p></div>
        <label className="block"><span className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">{t("routes.afspraken.detail.jouwVoorstel")}</span><textarea rows={3} className={`mt-1 ${veld}`} value={tekst} onChange={(e) => setTekst(e.target.value)}/></label>
        {a.formeel ? <p className="text-[11px] text-ink-soft">{t("routes.afspraken.detail.documentOngewijzigd")}</p> : null}
        <p className="text-xs text-ink-soft">{t("routes.afspraken.detail.blijftGelden")}</p>
        <button disabled={!tekst.trim() || tekst.trim() === a.tekst} onClick={() => doe(() => { onVoorstel({ soort: "wijziging", tekst: tekst.trim() }); setBewerk(false); })} className="min-h-11 w-full rounded-full bg-brand text-sm font-semibold text-primary-foreground disabled:opacity-40">{t("routes.afspraken.detail.wijzigingVoorstellen")}</button>
        <button onClick={() => setBewerk(false)} className="min-h-11 w-full text-sm font-semibold text-ink-soft">{t("common.annuleren")}</button>
      </Card>);
    }
    return (<Card className="relative mt-3">
      {kanAanpassen ? <BewerkPotlood onClick={() => { setTekst(a.tekst); setBewerk(true); }} label={t("routes.afspraken.detail.aanpassen")}/> : null}
      {a.veiligheid ? <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-soft"><AppIcon functie="veiligheid" maat="sm" vorm="kaal"/>{t("routes.afspraken.detail.overVeiligheid")}</p> : null}
      <h1 className="lora pr-12 text-[28px] leading-tight">{a.titel}</h1>
      {a.status === "Ingetrokken" ? <p className="mt-1 text-sm text-ink-soft">{t("routes.afspraken.detail.ingetrokken")}</p> : a.status === "Gestopt" ? <p className="mt-1 text-sm text-ink-soft">{t("routes.afspraken.gestoptOp", { datum: toonDatum(a.gestoptOp) })}</p> : a.status === "Voorstel" ? <p className="mt-1 text-sm text-ink-soft">{t("routes.afspraken.detail.voorstelGeenAfspraak")}</p> : null}

      {v ? (<div className="mt-4 space-y-2 rounded-md border border-border p-3 text-sm">
          <p className="font-semibold">{v.door === IK ? t("routes.afspraken.detail.jouwVoorstelKop") : `${voorstelZin(v, naam(v.door))}.`}</p>
          {v.meerTijd ? <p className="text-xs text-ink-soft">{v.meerTijd.door === IK ? t("routes.afspraken.detail.jijMeerTijd") : t("routes.afspraken.detail.anderMeerTijd", { naam: naam(v.meerTijd.door) })}</p> : null}
          {v.soort === "wijziging" ? <><p><span className="text-xs text-ink-soft">{t("routes.afspraken.detail.nu")}</span><br />{a.tekst}</p><p><span className="text-xs text-ink-soft">{t("routes.afspraken.detail.voorstel")}</span><br />{v.tekst}</p></> : v.soort === "stoppen" ? <p>{t("routes.afspraken.detail.stoptPas")}</p> : <p>{v.tekst ?? a.tekst}</p>}
          <p className="text-xs text-ink-soft">{nodig(v).length ? t("routes.afspraken.detail.wachtOp", { namen: nodig(v).map((o) => (o === IK ? t("routes.afspraken.detail.jou") : naam(o))).join(` ${t("common.en")} `) }) : null}{" "}{t("routes.afspraken.detail.geenReactie")}</p>
          {wachtOpMij(a) ? (alt === null ? (<div className="grid gap-2 pt-1">
              <button onClick={() => doe(() => onReageer("akkoord"))} className="min-h-11 rounded-full bg-brand text-sm font-semibold text-primary-foreground">{t("common.akkoord")}</button>
              <Button variant="outline" onClick={() => setAlt(v.tekst ?? a.tekst)}>{k.ander}</Button>
              <Button variant="outline" onClick={() => doe(() => onReageer("niet"))}>{k.niet}</Button>
              {!v.meerTijd ? <Button variant="outline" onClick={() => doe(() => onReageer("meer-tijd"))}>{t("common.meerTijdNodig")}</Button> : null}
              <RustigTip moment={a.veiligheid ? null : "voorstel"} veiligheid={!!a.veiligheid}/>
            </div>) : (<div className="space-y-2 pt-1">
              <p className="text-xs text-ink-soft">{t("routes.afspraken.detail.alternatiefUitleg")}</p>
              <textarea rows={3} className={veld} value={alt} onChange={(e) => setAlt(e.target.value)}/>
              <button disabled={!alt.trim()} onClick={() => doe(() => { onReageer("ander", alt.trim()); setAlt(null); })} className="min-h-11 w-full rounded-full bg-brand text-sm font-semibold text-primary-foreground disabled:opacity-40">{t("routes.afspraken.detail.anderSturen")}</button>
            </div>)) : null}
          {v.door === IK && nodig(v).length ? <VoorstelIntrekken onBevestig={() => doe(onIntrekken)}/> : null}
        </div>) : null}

      <dl className="mt-4 space-y-3 text-sm">
        <Veld label={t("routes.afspraken.watAfgesproken")}>{a.tekst}</Veld>
        <Veld label={t("routes.afspraken.detail.geldtVoor")}>{a.kind}</Veld>
        {a.afgesprokenOp ? <Veld label={t("routes.afspraken.detail.afgesprokenOp")}>{toonDatum(a.afgesprokenOp)}</Veld> : null}
        {a.geldtVanaf ? <Veld label={t("routes.afspraken.detail.geldtVanaf")}>{toonDatum(a.geldtVanaf)}</Veld> : null}
        {a.afgesprokenDoor ? <Veld label={t("routes.afspraken.detail.afgesprokenDoor")}>{a.afgesprokenDoor}</Veld> : null}
        {a.bron?.soort === "professional" ? <Veld label={t("routes.afspraken.detail.vastgelegdMet")}>{a.bron.label}</Veld> : null}
        {a.bron?.soort === "document" ? <Veld label={t("routes.afspraken.detail.bron")}>{a.bron.label}{a.bron.datum ? ` · ${toonDatum(a.bron.datum)}` : ""}{a.bron.document ? <><br /><Link to="/documenten" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand"><MetChevron>{t("routes.afspraken.detail.bekijkDocument")}</MetChevron></Link></> : null}</Veld> : null}
        {a.evaluatie && a.status === "Actief" ? <Veld label={t("routes.afspraken.detail.samenBekijken")}>{toonDatum(a.evaluatie)}{a.bron?.soort === "professional" ? <span className="block text-xs text-ink-soft">{t("routes.afspraken.detail.evaluatieUitleg", { datum: toonDatum(a.evaluatie, true) })}</span> : null}</Veld> : null}
      </dl>

      {a.koppeling ? <p className="mt-3 rounded-md bg-brand-soft/60 p-2 text-[11px]"><span className="inline-flex items-center gap-1.5"><AppIcon functie="link" maat="sm" vorm="kaal"/>{a.koppeling}</span></p> : null}

      <Button variant="ghost" onClick={() => setHistorie(!historie)} className="mt-3 h-auto min-h-11 w-full justify-between border-t border-border px-0 pt-2 text-sm font-semibold">{t("routes.afspraken.detail.geschiedenis")} <Chevron richting="omlaag" open={historie} className="size-4 text-ink-soft"/></Button>
      {historie ? (<div className="space-y-2 text-xs">
          {v ? <p className="text-ink-soft">{t(v.soort === "nieuw" ? "routes.afspraken.detail.historieNieuw" : "routes.afspraken.detail.historieWijziging", { door: naam(v.door), datum: toonDatum(v.datum), namen: lijstNamen(nodig(v), t) })}</p> : null}
          {a.geschiedenis.map((g, i) => <p key={i}><span className="text-ink-soft">{toonDatum(g.datum)}</span><br />{g.tekst}</p>)}
          {a.versies.length ? <div className="border-t border-border pt-2"><p className="font-semibold">{t("routes.afspraken.detail.eerdereVersies")}</p>{a.versies.map((x, i) => <p key={i} className="mt-1"><span className="text-ink-soft">{t("routes.afspraken.detail.goldTot", { datum: toonDatum(x.tot) })}</span><br />{x.tekst}</p>)}</div> : null}
          <p className="text-[11px] text-ink-soft">{t("routes.afspraken.detail.nietAanpasbaar")}</p>
        </div>) : null}

      {kanAanpassen ? (<div className="border-t border-border pt-1">
          <button onClick={() => setMeer(!meer)} aria-label={t("routes.afspraken.detail.meerOpties")} className="min-h-11 min-w-11 px-2 text-sm font-semibold text-ink-soft">•••</button>
          {meer ? <button onClick={() => doe(() => { onVoorstel({ soort: "stoppen" }); setMeer(false); })} className="block min-h-11 text-sm font-semibold text-brand">{t("routes.afspraken.detail.voorstelStoppen")}</button> : null}
        </div>) : null}

    </Card>);
}
function NieuweAfspraak({ voorinvul = "", onVerstuur, onAnnuleer }) {
    const { t } = useTranslation();
    const st = useStart();
    const g = useGezin();
    const [onderwerp, setOnderwerp] = useState(null);
    const [titel, setTitel] = useState("");
    const [tekst, setTekst] = useState(voorinvul);
    // Voor welk kind (of alle kinderen = het hele gezin) en, zonder kind bij meerdere andere ouders: met wie.
    const [kind, setKind] = useState(st.kinderen.length === 1 ? st.kinderen[0].id : "alle");
    const [ander, setAnder] = useState("");
    const [bezig, setBezig] = useState(false);
    const kindIds = kind === "alle" ? [] : [kind];
    const gemengd = !kindIds.length ? false : g.gemengd(kindIds);
    const kiesOuder = !kindIds.length && g.coOuders.length > 1;
    const geldig = !!titel.trim() && !!tekst.trim() && !gemengd && (!kiesOuder || !!ander) && !bezig;
    const veld = `w-full ${VELD}`;
    const chip = chipStijl;
    const verstuur = async () => {
        if (!geldig)
            return;
        setBezig(true);
        await onVerstuur({ onderwerp, titel: titel.trim(), tekst: tekst.trim(), kindIds, anderId: kiesOuder ? ander : undefined });
        setBezig(false);
    };
    return (<Card className="mt-4 space-y-3">
      {!onderwerp ? (<>
          <p className="font-display text-lg font-bold">{t("routes.afspraken.nieuw.waarOver")}</p>
          <div className="divide-y divide-border rounded-md border border-border">
            {ONDERWERPEN.map((o) => <button key={o.id} onClick={() => setOnderwerp(o.groep)} className="flex min-h-11 w-full items-center justify-between gap-3 px-3 text-left text-sm">{o.label}<Chevron className="size-4 shrink-0 text-ink-soft"/></button>)}
          </div>
        </>) : (<>
          <p className="font-display text-lg font-bold">{t("routes.afspraken.nieuw.wat")}</p>
          <p className="text-xs text-ink-soft">{onderwerpLabel(onderwerp)}</p>
          <input className={veld} maxLength={200} placeholder={t("routes.afspraken.nieuw.titelPlaceholder")} value={titel} onChange={(e) => setTitel(e.target.value)}/>
          <textarea rows={3} className={veld} maxLength={4000} placeholder={t("routes.afspraken.nieuw.tekstPlaceholder")} value={tekst} onChange={(e) => setTekst(e.target.value)}/>
          {st.kinderen.length > 1 ? (<fieldset>
              <legend className="text-xs font-semibold">{t("routes.afspraken.nieuw.voorWie")}</legend>
              <div className="mt-1 flex flex-wrap gap-2">
                {st.kinderen.map((k) => <button key={k.id} type="button" onClick={() => setKind(k.id)} aria-pressed={kind === k.id} className={chip(kind === k.id)}>{k.naam}</button>)}
                <button type="button" onClick={() => setKind("alle")} aria-pressed={kind === "alle"} className={chip(kind === "alle")}>{t("common.alleKinderen")}</button>
              </div>
            </fieldset>) : null}
          {kiesOuder ? (<fieldset>
              <legend className="text-xs font-semibold">{t("routes.afspraken.nieuw.metWie")}</legend>
              <div className="mt-1 flex flex-wrap gap-2">
                {g.coOuders.map((c, i) => <button key={c.id} type="button" onClick={() => setAnder(c.id)} aria-pressed={ander === c.id} className={chip(ander === c.id)}>{c.naam || t("components.DelenKeuze.andereOuderN", { n: i + 1 })}</button>)}
              </div>
            </fieldset>) : null}
          {gemengd ? <p role="alert" className="text-xs text-destructive">{t("lib.api.fout.MIXED_CHILDREN")}</p> : null}
          <p className="rounded-md bg-muted px-3 py-2 text-xs">{t("routes.afspraken.nieuw.geldtPas")}</p>
          <button disabled={!geldig} onClick={verstuur} className="min-h-11 w-full rounded-full bg-brand text-sm font-semibold text-primary-foreground disabled:opacity-40">{t("routes.afspraken.nieuw.versturen")}</button>
        </>)}
      <button onClick={onAnnuleer} className="min-h-11 w-full text-sm font-semibold text-ink-soft">{t("common.annuleren")}</button>
    </Card>);
}
