import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { useBevestigPopup } from "@/lib/feedback";
import { RustigTip, useKeuzeTeksten } from "@/components/RustigTip";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Badge, BewerkPotlood, FilterBalk, OverzichtKaart } from "@/components/ui-kit";
import { AppShell, Card, PageHeader, TerugKnop } from "@/components/AppShell";
import { AppIcon } from "@/components/AppIcon";
import { VoorstelIntrekken } from "@/components/VoorstelIntrekken";
import { Button } from "@/components/ui/button";
import { zetVoorkeur, useVoorkeuren } from "@/lib/voorkeuren-store";
import { ANDER, IK, metPro, naam, nodig, ONDERWERPEN, onderwerpLabel, PRO, proLabel, toonDatum, useAfspraken, vandaag, voerUit, voorstelZin, wachtOpMij, zetAfspraken, trekAfspraakIn, isIngevuldeAfspraak } from "@/lib/afspraken-store";
import { Chevron, MetChevron } from "@/components/Tekens";
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
    validateSearch: z.object({ weergave: z.enum(["professional"]).optional(), nieuw: z.enum(["voorstel", "afspraak"]).optional(), afspraak: z.string().optional(), bron: z.string().optional() }),
    component: AfsprakenPagina,
});
// Rechten van de professional, in oplopende volgorde (index wordt vergeleken). Labels via routes.afspraken.recht.<id>.
const rechtenOpties = ["geen", "bekijken", "voorstellen", "toevoegen", "wijzigen", "status", "evalueren"];
/** Namen samenvoegen met "en"/"and". */
const lijstNamen = (namen, t) => namen.join(` ${t("common.en")} `);
function AfsprakenPagina() {
    const { t } = useTranslation();
    const zoek = Route.useSearch();
    const rol = zoek.weergave === "professional" ? "pro" : "ouder";
    const ik = rol === "pro" ? PRO : IK;
    const lijst = useAfspraken();
    const vk = useVoorkeuren();
    const [houvastTip, setHouvastTip] = useState(false);
    const setLijst = zetAfspraken;
    const [open, setOpen] = useState(zoek.afspraak ?? null);
    useEffect(() => { setOpen(zoek.afspraak ?? null); setNieuw(!!zoek.nieuw); }, [zoek.afspraak, zoek.nieuw]);
    const [nieuw, setNieuw] = useState(!!zoek.nieuw);
    const [recht, setRecht] = useState("evalueren");
    const [toegang, setToegang] = useState(false);
    const [melding, setMelding] = useState(null);
    useBevestigPopup(melding);
    const update = (id, f) => setLijst((l) => l.map((a) => (a.id === id ? f(a) : a)));
    const stelVoor = (id, v) => update(id, (a) => ({ ...a, voorstel: { ...v, door: ik, datum: vandaag(), akkoord: rol === "ouder" ? { [IK]: true } : {} }, geschiedenis: [{ datum: vandaag(), tekst: t(v.soort === "stoppen" ? "routes.afspraken.geschiedenis.stelVoorStoppen" : "routes.afspraken.geschiedenis.stelVoorWijziging", { wie: ik }) }, ...a.geschiedenis] }));
    const reageer = (id, wie, keuze, altTekst) => update(id, (a) => {
        const v = a.voorstel;
        if (!v || !nodig(v).includes(wie))
            return a;
        const d = vandaag();
        if (keuze === "niet")
            return { ...a, voorstel: undefined, status: v.soort === "nieuw" ? "Niet doorgegaan" : a.status, geschiedenis: [{ datum: d, tekst: t(v.soort === "nieuw" ? "routes.afspraken.geschiedenis.nietAkkoordNieuw" : "routes.afspraken.geschiedenis.nietAkkoordWijziging", { wie }) }, ...a.geschiedenis] };
        if (keuze === "ander")
            return { ...a, voorstel: { soort: v.soort === "stoppen" ? "wijziging" : v.soort, door: wie, tekst: altTekst, datum: d, akkoord: { [wie]: true } }, geschiedenis: [{ datum: d, tekst: t("routes.afspraken.geschiedenis.anderVoorstel", { wie, alt: altTekst, origineel: v.tekst ?? a.tekst }) }, ...a.geschiedenis] };
        const na = { ...a, voorstel: { ...v, akkoord: { ...v.akkoord, [wie]: true } }, geschiedenis: [{ datum: d, tekst: t(v.soort === "wijziging" ? "routes.afspraken.geschiedenis.akkoordWijziging" : "routes.afspraken.geschiedenis.akkoord", { wie }) }, ...a.geschiedenis] };
        return nodig(na.voorstel).length ? na : voerUit(na);
    });
    const gekozen = lijst.find((a) => a.id === open);
    if (gekozen) {
        return (<AppShell>
        <div className="mt-2 flex items-center gap-2.5"><TerugKnop onClick={() => setOpen(null)}/><span className="text-sm font-extrabold text-ink-soft">{t("routes.afspraken.terugNaarAfspraken")}</span></div>
        <Detail a={gekozen} rol={rol} magVoorstellen={rol === "ouder" || rechtenOpties.indexOf(recht) >= 2} magEvalueren={rol === "pro" && recht === "evalueren"} onVoorstel={(v) => { stelVoor(gekozen.id, v); setMelding(v.soort === "stoppen" ? t("routes.afspraken.melding.stoppenVerstuurd") : t("routes.afspraken.melding.wijzigingVerstuurd")); }} onReageer={(k, tekst) => {
                reageer(gekozen.id, IK, k, tekst);
                if (k === "niet" && !gekozen.veiligheid && !vk.extraHouvast && !vk.extraHouvastTipGezien) {
                    zetVoorkeur("extraHouvastTipGezien", true);
                    setHouvastTip(true);
                }
            }} onIntrekken={() => { if (trekAfspraakIn(gekozen.id, ik))
            setMelding(t("routes.afspraken.melding.ingetrokken")); }} onEvalueer={(k) => update(gekozen.id, (x) => ({ ...x, evaluatie: k === "Behouden" ? undefined : x.evaluatie, geschiedenis: [{ datum: vandaag(), tekst: t("routes.afspraken.geschiedenis.evaluatieBehouden") }, ...x.geschiedenis] }))}/>
        {melding ? <p role="status" className="mt-3 text-xs text-ink-soft">{melding}</p> : null}
        {houvastTip ? <Link to="/extra-ondersteuning" className="mt-3 inline-flex min-h-11 items-center text-xs text-brand">{t("routes.afspraken.houvastTip")}</Link> : null}
        {import.meta.env.DEV && gekozen.voorstel && nodig(gekozen.voorstel).includes(ANDER) ? (<button onClick={() => reageer(gekozen.id, ANDER, "akkoord")} className="mt-3 min-h-11 rounded-md border border-dashed border-border px-3 text-xs text-ink-soft">{t("routes.afspraken.demoJorisAkkoord")}</button>) : null}
      </AppShell>);
    }
    const q = "";
    const zichtbaar = lijst.filter(isIngevuldeAfspraak).filter((a) => (a.status === "Actief" || a.status === "Gestopt" || a.status === "Voorstel") && (!q || `${a.titel} ${a.tekst} ${a.onderwerp}`.toLowerCase().includes(q)));
    const aandacht = rol === "ouder" ? lijst.filter(wachtOpMij) : [];
    const groepen = ONDERWERPEN.map((o) => o.groep).filter((g, i, s) => s.indexOf(g) === i).map((g) => [g, zichtbaar.filter((a) => a.onderwerp === g && a.status !== "Gestopt" && !aandacht.includes(a))]).filter(([, l]) => l.length);
    const gestopt = zichtbaar.filter((a) => a.status === "Gestopt");
    return (<AppShell>
      <PageHeader titel={t("routes.afspraken.titel")} subtitel={t("routes.afspraken.subtitel")} terug="/extra-ondersteuning" actie={<div className="flex">
          {rol === "ouder" || rechtenOpties.indexOf(recht) >= 2 ? <button aria-label={t("routes.afspraken.nieuweVoorstellen")} onClick={() => setNieuw(true)} className="grid size-10 place-items-center rounded-full bg-brand text-2xl leading-none text-primary-foreground">+</button> : null}
        </div>}/>


      {melding ? (<Card className="mt-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold"><AppIcon functie="melding" maat="sm" vorm="kaal"/>{melding}</p>
          <button onClick={() => setMelding(null)} className="mt-1 min-h-11 text-xs font-semibold text-brand">{t("common.sluiten")}</button>
        </Card>) : null}

      {nieuw ? <NieuweAfspraak pro={rol === "pro"} voorinvul={zoek.bron && !["agenda", "samen-regelen"].includes(zoek.bron) ? zoek.bron : ""} onAnnuleer={() => setNieuw(false)} onVerstuur={(onderwerp, titel, tekst) => {
                const d = vandaag();
                setLijst((l) => [...l, { id: `n${Date.now()}`, titel, tekst, onderwerp, kind: "Emma & Noah", status: "Voorstel", ...(rol === "pro" ? { bron: metPro } : {}), versies: [],
                        voorstel: { soort: "nieuw", door: ik, datum: d, akkoord: rol === "ouder" ? { [IK]: true } : {} }, geschiedenis: [{ datum: d, tekst: t("routes.afspraken.geschiedenis.stelDezeVoor", { wie: ik }) }] }]);
                setNieuw(false);
                setMelding(rol === "pro" ? t("routes.afspraken.melding.proNieuw") : t("routes.afspraken.melding.nieuw"));
            }}/> : null}

      {aandacht.length ? (<Sectie titel={t("routes.afspraken.jouwAandacht")}>
          {aandacht.map((a) => <Rij key={a.id} a={a} onOpen={() => setOpen(a.id)} status={voorstelZin(a.voorstel, naam(a.voorstel.door), a.voorstel.door === IK)} actie/>)}
        </Sectie>) : null}

      <div className="mt-4 flex flex-wrap gap-x-4">
        <Link to="/halen-brengen" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand"><AppIcon functie="overdracht" maat="sm" vorm="kaal"/>{t("routes.afspraken.halenBrengen")}</Link>
        <Link to="/contact" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand"><AppIcon functie="berichten" maat="sm" vorm="kaal"/>{t("routes.afspraken.contactafspraken")}</Link>
      </div>
      {groepen.length ? <h2 className="mt-6 font-display text-lg font-bold">{t("routes.afspraken.watAfgesproken")}</h2> : <p className="mt-6 text-sm text-ink-soft">{q ? t("routes.afspraken.geenGevonden") : t("routes.afspraken.nogGeen")}</p>}
      {groepen.map(([g, l]) => (<Sectie key={g} titel={onderwerpLabel(g)}>
          {l.map((a) => <Rij key={a.id} a={a} onOpen={() => setOpen(a.id)}/>)}
        </Sectie>))}
      {gestopt.length ? <Sectie titel={t("routes.afspraken.gestopt")}>{gestopt.map((a) => <Rij key={a.id} a={a} onOpen={() => setOpen(a.id)} status={t("routes.afspraken.gestoptOp", { datum: toonDatum(a.gestoptOp) })}/>)}</Sectie> : null}

      <Card className="mt-6">
        <p className="text-sm font-semibold">{proLabel()}</p>
        <p className="mt-0.5 text-xs text-ink-soft">{t(`routes.afspraken.kanRecht.${recht}`)}{" "}{t("routes.afspraken.proGeldtPas")}</p>
        <button onClick={() => setToegang(!toegang)} className="mt-1 min-h-11 text-xs font-semibold text-brand">{toegang ? t("routes.afspraken.verbergToegang") : <MetChevron>{t("routes.afspraken.bekijkToegang")}</MetChevron>}</button>
        {toegang ? <Transparantie recht={recht} setRecht={setRecht}/> : null}
      </Card>

      {rol === "pro" ? <><ProDashboard lijst={lijst}/><Caseload /></> : null}

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
      <Chevron className="size-4 text-ink-soft"/>
    </button>);
}
function Veld({ label, children }) {
    return <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">{label}</dt><dd className="mt-0.5">{children}</dd></div>;
}
function Detail({ a, rol, magVoorstellen, magEvalueren, onVoorstel, onReageer, onIntrekken, onEvalueer }) {
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
    const veld = "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm";
    const v = a.voorstel;
    const kanAanpassen = magVoorstellen && a.status === "Actief" && !v && !verouderd;
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
          <p className="font-semibold">{v.door === IK ? t("routes.afspraken.detail.jouwVoorstelKop") : `${voorstelZin(v, v.door)}.`}</p>
          {v.soort === "wijziging" ? <><p><span className="text-xs text-ink-soft">{t("routes.afspraken.detail.nu")}</span><br />{a.tekst}</p><p><span className="text-xs text-ink-soft">{t("routes.afspraken.detail.voorstel")}</span><br />{v.tekst}</p></> : v.soort === "stoppen" ? <p>{t("routes.afspraken.detail.stoptPas")}</p> : <p>{v.tekst ?? a.tekst}</p>}
          <p className="text-xs text-ink-soft">{nodig(v).length ? t("routes.afspraken.detail.wachtOp", { namen: lijstNamen(nodig(v).map((o) => (o === IK ? t("routes.afspraken.detail.jou") : o)), t) }) : null}{" "}{t("routes.afspraken.detail.geenReactie")}</p>
          {rol === "ouder" && wachtOpMij(a) ? (alt === null ? (<div className="grid gap-2 pt-1">
              <button onClick={() => doe(() => onReageer("akkoord"))} className="min-h-11 rounded-full bg-brand text-sm font-semibold text-primary-foreground">{t("common.akkoord")}</button>
              <Button variant="outline" onClick={() => setAlt(v.tekst ?? a.tekst)}>{k.ander}</Button>
              <Button variant="ghost" onClick={() => doe(() => onReageer("niet"))}>{k.niet}</Button>
              <RustigTip moment={a.veiligheid ? null : "voorstel"} veiligheid={!!a.veiligheid}/>
            </div>) : (<div className="space-y-2 pt-1">
              <p className="text-xs text-ink-soft">{t("routes.afspraken.detail.alternatiefUitleg")}</p>
              <textarea rows={3} className={veld} value={alt} onChange={(e) => setAlt(e.target.value)}/>
              <button disabled={!alt.trim()} onClick={() => doe(() => { onReageer("ander", alt.trim()); setAlt(null); })} className="min-h-11 w-full rounded-full bg-brand text-sm font-semibold text-primary-foreground disabled:opacity-40">{t("routes.afspraken.detail.anderSturen")}</button>
            </div>)) : null}
          {v.door === (rol === "pro" ? PRO : IK) && nodig(v).length ? <VoorstelIntrekken onBevestig={() => doe(onIntrekken)}/> : null}
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
          {v ? <p className="text-ink-soft">{t(v.soort === "nieuw" ? "routes.afspraken.detail.historieNieuw" : "routes.afspraken.detail.historieWijziging", { door: v.door, datum: toonDatum(v.datum), namen: lijstNamen(nodig(v), t) })}</p> : null}
          {a.geschiedenis.map((g, i) => <p key={i}><span className="text-ink-soft">{toonDatum(g.datum)}</span><br />{g.tekst}</p>)}
          {a.versies.length ? <div className="border-t border-border pt-2"><p className="font-semibold">{t("routes.afspraken.detail.eerdereVersies")}</p>{a.versies.map((x, i) => <p key={i} className="mt-1"><span className="text-ink-soft">{t("routes.afspraken.detail.goldTot", { datum: toonDatum(x.tot) })}</span><br />{x.tekst}</p>)}</div> : null}
          <p className="text-[11px] text-ink-soft">{t("routes.afspraken.detail.nietAanpasbaar")}</p>
        </div>) : null}

      {kanAanpassen ? (<div className="border-t border-border pt-1">
          <button onClick={() => setMeer(!meer)} aria-label={t("routes.afspraken.detail.meerOpties")} className="min-h-11 text-sm font-semibold text-ink-soft">•••</button>
          {meer ? <button onClick={() => doe(() => { onVoorstel({ soort: "stoppen" }); setMeer(false); })} className="block min-h-11 text-sm font-semibold text-brand">{t("routes.afspraken.detail.voorstelStoppen")}</button> : null}
        </div>) : null}

      {magEvalueren && a.evaluatie && a.status === "Actief" ? (<div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
          <span className="w-full text-[11px] text-ink-soft">{t("routes.afspraken.detail.uitkomst")}</span>
          <button onClick={() => doe(() => onEvalueer("Behouden"))} className="min-h-11 rounded-full border border-border px-3">{t("routes.afspraken.detail.behouden")}</button>
          <button onClick={() => { setTekst(a.tekst); setBewerk(true); }} className="min-h-11 rounded-full border border-border px-3">{t("routes.afspraken.detail.aanpassingVoorstellen")}</button>
        </div>) : null}
    </Card>);
}
function NieuweAfspraak({ pro, voorinvul = "", onVerstuur, onAnnuleer }) {
    const { t } = useTranslation();
    const [onderwerp, setOnderwerp] = useState(null);
    const [titel, setTitel] = useState("");
    const [tekst, setTekst] = useState(voorinvul);
    const veld = "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm";
    return (<Card className="mt-4 space-y-3">
      {!onderwerp ? (<>
          <p className="font-display text-lg font-bold">{t("routes.afspraken.nieuw.waarOver")}</p>
          <div className="divide-y divide-border rounded-md border border-border">
            {ONDERWERPEN.map((o) => <button key={o.id} onClick={() => setOnderwerp(o.groep)} className="flex min-h-11 w-full items-center justify-between px-3 text-left text-sm">{o.label}<Chevron className="size-4 text-ink-soft"/></button>)}
          </div>
        </>) : (<>
          <p className="font-display text-lg font-bold">{t("routes.afspraken.nieuw.wat")}</p>
          <p className="text-xs text-ink-soft">{onderwerpLabel(onderwerp)}</p>
          <input className={veld} placeholder={t("routes.afspraken.nieuw.titelPlaceholder")} value={titel} onChange={(e) => setTitel(e.target.value)}/>
          <textarea rows={3} className={veld} placeholder={t("routes.afspraken.nieuw.tekstPlaceholder")} value={tekst} onChange={(e) => setTekst(e.target.value)}/>
          <p className="rounded-md bg-muted px-3 py-2 text-xs">{pro ? t("routes.afspraken.nieuw.geldtPasPro") : t("routes.afspraken.nieuw.geldtPas")}</p>
          <button disabled={!titel.trim() || !tekst.trim()} onClick={() => onVerstuur(onderwerp, titel.trim(), tekst.trim())} className="min-h-11 w-full rounded-full bg-brand text-sm font-semibold text-primary-foreground disabled:opacity-40">{t("routes.afspraken.nieuw.versturen")}</button>
        </>)}
      <button onClick={onAnnuleer} className="min-h-11 w-full text-sm font-semibold text-ink-soft">{t("common.annuleren")}</button>
    </Card>);
}
function Transparantie({ recht, setRecht }) {
    const { t } = useTranslation();
    return (<div className="mt-2 border-t border-border pt-3">
      <p className="text-sm font-semibold">{t("routes.afspraken.toegang.titel")}</p>
      <p className="mt-1 text-xs text-ink-soft">{t("routes.afspraken.toegang.wie")}</p>
      <label className="mt-3 block text-[11px] font-semibold text-ink-soft">{t("routes.afspraken.toegang.watMag")}</label>
      <select value={recht} onChange={(e) => setRecht(e.target.value)} className="mt-1 w-full rounded-md bg-surface px-3 py-2 text-sm">
        {rechtenOpties.map((r) => <option key={r} value={r}>{t(`routes.afspraken.recht.${r}`)}</option>)}
      </select>
      <p className="mt-2 text-[11px] text-ink-soft">{recht === "geen" ? t("routes.afspraken.toegang.ziestGeen") : t("routes.afspraken.toegang.zietAlle")}{" "}{t("routes.afspraken.toegang.beideAkkoord")}</p>
    </div>);
}
function ProDashboard({ lijst }) {
    const { t } = useTranslation();
    const tel = [
        { id: "actief", n: lijst.filter((a) => a.status === "Actief").length },
        { id: "veiligheid", n: lijst.filter((a) => a.veiligheid && a.status === "Actief").length },
        { id: "wacht", n: lijst.filter((a) => a.voorstel).length },
        { id: "evaluatie", n: lijst.filter((a) => a.evaluatie && a.status === "Actief").length },
    ];
    return (<Card className="mt-4">
      <p className="font-display font-bold">{t("routes.afspraken.pro.gezin", { naam: "De Vries / Bakker" })}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {tel.map((x) => <div key={x.id} className="rounded-md bg-surface p-2"><p className="font-display text-xl font-extrabold">{x.n}</p><p className="text-[11px] text-ink-soft">{t(`routes.afspraken.pro.tel.${x.id}`)}</p></div>)}
      </div>
      <p className="mt-2 text-[11px] text-ink-soft">{t("routes.afspraken.pro.geenScores")}</p>
    </Card>);
}
const achternamen = ["De Vries / Bakker", "Jansen", "Visser / Smit", "Meijer", "De Boer", "Mulder / Bos", "Vos", "Peters", "Hendriks / Dekker", "Van Dijk", "Kok", "Brouwer", "Van Leeuwen", "Willems / Maas", "Verhoeven", "Koster", "Prins", "Huisman", "Post / Kuipers", "Scholten"];
// Filter-ids; labels via routes.afspraken.pro.filter.<id>.
const filters = ["evaluatie", "bevestiging", "recent", "veiligheid", "afgerond"];
const caseload = achternamen.map((naam, i) => ({ naam, tags: filters.filter((_, j) => (i * 7 + j * 3) % 5 < 2) }));
function Caseload() {
    const { t } = useTranslation();
    const [f, setF] = useState(null);
    const zichtbaar = caseload.filter((g) => !f || g.tags.includes(f));
    return (<section className="mt-8">
      <h2 className="font-display text-lg font-bold">{t("routes.afspraken.pro.mijnGezinnen")}</h2>
      <p className="mt-1 text-xs text-ink-soft">{t("routes.afspraken.pro.aantalGezinnen", { count: caseload.length })}</p>
      <FilterBalk className="mt-3" opties={[{ id: "alle", label: t("routes.afspraken.pro.filter.alle") }, ...filters.map((id) => ({ id, label: t(`routes.afspraken.pro.filter.${id}`) }))]} waarde={f ?? "alle"} onChange={(x) => setF(x === "alle" ? null : x)}/>
      <div className="mt-3 space-y-2">
        {zichtbaar.map((g) => <OverzichtKaart key={g.naam} titel={t("routes.afspraken.pro.gezin", { naam: g.naam })} badges={g.tags.length ? g.tags.map((x) => <Badge key={x}>{t(`routes.afspraken.pro.filter.${x}`)}</Badge>) : <Badge>{t("routes.afspraken.pro.geenAandachtspunten")}</Badge>}/>)}
      </div>
    </section>);
}
