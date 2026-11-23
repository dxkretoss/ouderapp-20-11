import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell, Card, PageHeader, TerugKnop } from "@/components/AppShell";
import { useTranslation } from "react-i18next";
import i18n, { tLijst } from "@/i18n";
import { bewaarLabel, bewaarOnderdelen, bewaarTermijnen, demoTranscript, moduleLabels, termijnLabel, useGesprekken, voegGesprekToe, werkOpnameBij, zetBewaar, zetModule, } from "@/lib/gesprekken-store";
import { useMeldingen } from "@/lib/gesprekken-store";
import { OnveiligKnop } from "@/components/Onveilig";
import { AppIcon } from "@/components/AppIcon";
import { Chevron, MetChevron, MetVinkje, Vinkje } from "@/components/Tekens";
import { Play } from "lucide-react";
import { uur } from "@/lib/tijd-tekst";
export const Route = createFileRoute("/gesprekken")({
    head: () => ({
        meta: [
            { title: i18n.t("routes.gesprekken.meta.titel") },
            { name: "description", content: i18n.t("routes.gesprekken.meta.beschrijving") },
            { property: "og:title", content: i18n.t("routes.gesprekken.meta.titel") },
            { property: "og:description", content: i18n.t("routes.gesprekken.meta.beschrijving") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: Gesprekken,
});
const nu = () => new Date().toTimeString().slice(0, 5);
function Schakel({ aan, onClick }) {
    return (<button onClick={onClick} aria-pressed={aan} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${aan ? "bg-brand" : "bg-border"}`}>
      <span className={`absolute top-0.5 size-5 rounded-full bg-card transition-all ${aan ? "left-5" : "left-0.5"}`}/>
    </button>);
}
/** Label met een vast icoon ervoor. */
function IcoonLabel({ functie, children }) {
    return <span className="inline-flex items-center gap-1.5"><AppIcon functie={functie} maat="sm" vorm="kaal"/>{children}</span>;
}
function Uit({ m }) {
    const { t } = useTranslation();
    return (<Card className="text-center">
      <p className="text-sm"><IcoonLabel functie={moduleLabels[m].icoon}>{moduleLabels[m].t}</IcoonLabel> {t("routes.gesprekken.staatUit")}</p>
      <button onClick={() => zetModule(m, true)} className="mt-3 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-primary-foreground">{t("routes.gesprekken.aanzetten")}</button>
    </Card>);
}
function Gesprekken() {
    const { t } = useTranslation();
    const [w, setW] = useState("bellen");
    const s = useGesprekken();
    const opnames = s.gesprekken.filter((g) => g.opname).length;
    const titel = w === "opnames" ? t("routes.gesprekken.titel.opnames") : w === "privacy" ? t("routes.gesprekken.titel.privacy") : t("routes.gesprekken.titel.bellen");
    return (<AppShell>
      {w === "bellen" ? <PageHeader titel={titel} subtitel={t("routes.gesprekken.subtitel")} terug="/contact"/> : (<div className="flex items-start gap-3">
          <TerugKnop onClick={() => setW("bellen")} label={t("routes.gesprekken.terugNaarBellen")}/>
          <h1 className="lora min-w-0 flex-1 text-[32px] leading-tight">{titel}</h1>
        </div>)}
      <div className="mt-5 space-y-4">
        {w === "bellen" && <Bellen />}
        {w === "opnames" && <Opnames />}
        {w === "privacy" && <Privacy />}
      </div>
      <div className="mt-6 space-y-1 text-sm">
        {w === "bellen" && opnames > 0 && <button onClick={() => setW("opnames")} className="flex min-h-11 items-center font-semibold text-brand"><MetChevron>{t("routes.gesprekken.opgenomenAantal", { n: opnames })}</MetChevron></button>}
        {w === "bellen" && <button onClick={() => setW("privacy")} className="block min-h-11 text-xs text-ink-soft underline">{t("routes.gesprekken.privacyInstellingen")}</button>}
      </div>
    </AppShell>);
}
function Bellen() {
    const { t } = useTranslation();
    const s = useGesprekken();
    const [fase, setFase] = useState("rust");
    const [soort, setSoort] = useState("audio");
    const [sec, setSec] = useState(0);
    const [begin, setBegin] = useState("");
    const [akkoord, setAkkoord] = useState([]);
    const [opStart, setOpStart] = useState("");
    const [opEind, setOpEind] = useState("");
    const [melding, setMelding] = useState("");
    const [afgelopen, setAfgelopen] = useState(null);
    useEffect(() => {
        if (fase === "gaat") {
            const timer = setTimeout(() => { setFase("bezig"); setBegin(nu()); setSec(0); }, 1500);
            return () => clearTimeout(timer);
        }
        if (fase !== "rust") {
            const timer = setInterval(() => setSec((x) => x + 1), 1000);
            return () => clearInterval(timer);
        }
        return undefined;
    }, [fase]);
    const bel = (sr) => { setSoort(sr); setFase("gaat"); setMelding(""); setAkkoord([]); setAfgelopen(null); setOpEind(""); };
    const ophangen = () => {
        const min = Math.max(1, Math.round(sec / 60));
        const duur = t("routes.gesprekken.duurLang", { count: min });
        voegGesprekToe({
            id: Date.now(), soort, datum: t("routes.gesprekken.demoDatum"), begin, eind: nu(), duur: t("routes.gesprekken.duurKort", { count: min }), status: "Beantwoord",
            ...(opStart ? { opname: { aangevraagd: "Sanne", akkoord, start: opStart, eind: opEind || nu() } } : {}),
        });
        setAfgelopen({ duur, begin });
        setFase("rust");
        setOpStart("");
    };
    const tijd = `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
    if (!s.aan.audio && !s.aan.video)
        return <Uit m="audio"/>;
    if (fase !== "rust")
        return (<Card className="space-y-4 text-center">
      {fase === "opname" && (<div role="status" className="flex items-center justify-between gap-2 rounded-md bg-destructive/15 px-3 py-2 text-sm font-semibold text-destructive">
          <span className="flex items-center gap-2"><span aria-hidden="true" className="size-2.5 animate-pulse rounded-full bg-destructive"/>{t("routes.gesprekken.opname.actief")}</span>
          <button onClick={() => { setOpEind(nu()); setFase("bezig"); setMelding(t("routes.gesprekken.opname.gestopt")); }} className="min-h-11 rounded-full border border-destructive/40 px-3 text-xs">{t("routes.gesprekken.opname.stop")}</button>
        </div>)}
      <div className="mx-auto grid size-24 place-items-center rounded-full bg-accent-warm/40"><AppIcon functie={soort === "video" ? "video" : "bellen"} maat="lg" vorm="kaal"/></div>
      <p className="font-display text-lg font-bold">Joris Bakker</p>
      <p className="text-sm text-ink-soft">{fase === "gaat" ? t("routes.gesprekken.aanHetBellen") : tijd}</p>
      {fase === "uitleg" && (<div className="space-y-2 rounded-md border border-border bg-card p-4 text-left text-sm">
          <p className="font-semibold">{t("routes.gesprekken.opname.vraag")}</p>
          <ul className="list-disc space-y-1 pl-5 text-xs text-ink-soft">
            {tLijst("routes.gesprekken.opname.uitleg").map((regel) => <li key={regel}>{regel}</li>)}
          </ul>
          <div className="flex gap-2 pt-1">
            <button onClick={() => setFase("verzoek")} className="min-h-11 flex-1 rounded-full bg-brand text-sm font-semibold text-primary-foreground">{t("routes.gesprekken.opname.vraagAkkoord")}</button>
            <button onClick={() => setFase("bezig")} className="min-h-11 rounded-full border border-border px-4 text-sm font-semibold">{t("routes.gesprekken.opname.nietOpnemen")}</button>
          </div>
        </div>)}
      {fase === "verzoek" && (<div className="space-y-3 rounded-md border border-border bg-card p-4 text-left">
          <p className="font-semibold">{t("routes.gesprekken.opname.wacht")}</p>
          <p className="text-sm text-ink-soft">{t("routes.gesprekken.opname.startPas")}</p>
          <p className="text-xs text-ink-soft">{t("routes.gesprekken.opname.voorbeeld")}</p>
          <div className="flex gap-2">
            <button onClick={() => { const w = t("routes.gesprekken.demoMoment", { tijd: nu() }); setAkkoord([{ wie: "Sanne", wanneer: w }, { wie: "Joris", wanneer: w }]); setOpStart(nu()); setFase("opname"); }} className="min-h-11 flex-1 rounded-full bg-brand text-sm font-semibold text-primary-foreground">{t("common.akkoord")}</button>
            <button onClick={() => { setFase("bezig"); setMelding(t("routes.gesprekken.opname.geenAkkoord")); }} className="min-h-11 flex-1 rounded-full border border-border text-sm font-semibold">{t("common.nietAkkoord")}</button>
          </div>
        </div>)}
      {melding && fase === "bezig" && <p className="text-sm text-ink-soft">{melding}</p>}
      <div className="flex justify-center gap-3">
        {fase === "bezig" && s.aan.opname && !opStart && (<button onClick={() => { setFase("uitleg"); setMelding(""); }} className="min-h-11 rounded-full border border-border px-4 text-sm font-semibold">{t("routes.gesprekken.opname.opnemen")}</button>)}
        <button onClick={ophangen} className="min-h-11 rounded-full bg-destructive px-5 text-sm font-semibold text-primary-foreground">{t("routes.gesprekken.ophangen")}</button>
      </div>
    </Card>);
    return (<>
      {afgelopen && (<Card className="space-y-3">
          <div><p className="font-semibold">{t("routes.gesprekken.afgelopen.titel")}</p><p className="text-sm text-ink-soft">{afgelopen.duur}</p></div>
          <p className="text-xs text-ink-soft">{t("routes.gesprekken.afgelopen.uitleg")}</p>
          <div className="flex gap-2">
            <Link to="/afspraken" className="flex min-h-11 flex-1 items-center justify-center rounded-full bg-brand text-sm font-semibold text-primary-foreground">{t("routes.gesprekken.afgelopen.vastleggen")}</Link>
            <button onClick={() => setAfgelopen(null)} className="min-h-11 flex-1 rounded-full border border-border text-sm font-semibold">{t("routes.gesprekken.afgelopen.nietsDoen")}</button>
          </div>
          <details>
            <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold text-ink-soft">••• {t("common.meer")}</summary>
            <OnveiligKnop gesprek={t("routes.gesprekken.afgelopen.onveiligGesprek", { begin: afgelopen.begin })}/>
          </details>
        </Card>)}
      <h2 className="font-display text-lg">{t("routes.gesprekken.bellenMet")}</h2>
      <div className="grid grid-cols-2 gap-3">
        <button disabled={!s.aan.audio} onClick={() => bel("audio")} className="flex min-h-16 items-center justify-center gap-2 rounded-lg bg-brand font-semibold text-primary-foreground disabled:opacity-40"><AppIcon functie="bellen" maat="sm" vorm="kaal"/>{t("routes.gesprekken.bellen")}</button>
        <button disabled={!s.aan.video} onClick={() => bel("video")} className="flex min-h-16 items-center justify-center gap-2 rounded-lg border border-border bg-card font-semibold disabled:opacity-40"><AppIcon functie="video" maat="sm" vorm="kaal"/>{t("routes.gesprekken.videobellen")}</button>
      </div>
      <p className="text-xs text-ink-soft">{t("routes.gesprekken.nietOpgenomen")}</p>
      <Logboek />
      <details className="group rounded-lg border border-border bg-card px-4">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between text-sm font-semibold">{t("routes.gesprekken.recent")} <Chevron className="size-4 text-ink-soft transition-transform group-open:rotate-90"/></summary>
        <div className="divide-y divide-border pb-2">
          {s.gesprekken.map((g) => (<div key={g.id} className="flex items-center gap-3 py-2.5">
              <AppIcon functie={g.soort === "video" ? "video" : "bellen"} maat="sm"/>
              <div className="flex-1">
                <p className="text-sm font-semibold">Joris · {g.datum}</p>
                <p className="text-xs text-ink-soft">{g.begin}–{g.eind} · {g.duur}</p>
              </div>
              {g.opname && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-ink-soft">{t("routes.gesprekken.opgenomen")}</span>}
            </div>))}
        </div>
      </details>
    </>);
}
function Opnames() {
    const { t } = useTranslation();
    const s = useGesprekken();
    const [open, setOpen] = useState(null);
    const [acties, setActies] = useState({});
    const lijst = s.gesprekken.filter((g) => g.opname);
    const VOORSTEL_ICOON = { a1: "agenda", a2: "notitie", a3: "kosten", a4: "doos" };
    const voorstellen = ["a1", "a2", "a3", "a4"].map((id) => ({ k: id, icoon: VOORSTEL_ICOON[id], soort: t(`routes.gesprekken.voorstel.${id}.soort`), zin: t(`routes.gesprekken.voorstel.${id}.zin`), v: t(`routes.gesprekken.voorstel.${id}.vraag`) }));
    return (<>
      <p className="text-sm text-ink-soft">{t("routes.gesprekken.opnames.intro")}</p>
      {lijst.length === 0 && <Card className="text-sm text-ink-soft">{t("routes.gesprekken.opnames.leeg")}</Card>}
      {lijst.map((g) => {
            const o = g.opname;
            const isOpen = open === g.id;
            return (<Card key={g.id} className="space-y-3">
            <button onClick={() => setOpen(isOpen ? null : g.id)} className="flex w-full items-center gap-3 text-left">
              <AppIcon functie="spraak" maat="sm"/>
              <div className="flex-1">
                <p className="text-sm font-semibold">{t("routes.gesprekken.opnames.kop", { datum: g.datum })}</p>
                <p className="text-xs text-ink-soft">{o.start}–{o.eind} · {g.duur}{o.kind ? ` · ${t("routes.gesprekken.opnames.over", { kind: o.kind })}` : ""}</p>
              </div>
              <Chevron richting="omlaag" open={isOpen} className="size-4 text-ink-soft"/>
            </button>
            {isOpen && (<div className="space-y-3 border-t border-border pt-3">
                <div className="rounded-md bg-muted/60 p-3 text-xs">
                  <p className="font-semibold">{t("routes.gesprekken.opnames.toestemming")}</p>
                  <p>{t("routes.gesprekken.opnames.aangevraagd", { wie: o.aangevraagd })}</p>
                  {o.akkoord.map((a) => <p key={a.wie} className="flex items-center gap-1"><Vinkje className="size-3.5 text-brand"/>{t("routes.gesprekken.opnames.akkoord", { wie: a.wie, wanneer: a.wanneer })}</p>)}
                  <p>{t("routes.gesprekken.opnames.periode", { start: o.start, eind: o.eind })}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold"><IcoonLabel functie="opname">{t("routes.gesprekken.opnames.origineel")}</IcoonLabel></p>
                  <div className="mt-1 flex items-center gap-2 rounded-full bg-card px-3 py-2 text-xs"><Play aria-hidden="true" className="size-3.5 fill-current"/><div className="h-1 flex-1 rounded-full bg-border"/><span>{g.duur}</span></div>
                  <p className="mt-1 text-[11px] text-ink-soft">{t("routes.gesprekken.opnames.demo")}</p>
                </div>
                {s.aan.transcriptie ? (o.transcript ? (<div>
                      <p className="text-sm font-semibold"><IcoonLabel functie="notitie">{t("routes.gesprekken.opnames.transcript")}</IcoonLabel></p>
                      <div className="mt-1 space-y-1 rounded-md bg-card p-3 text-xs">{o.transcript.map((r) => <p key={r}>{r}</p>)}</div>
                      <p className="mt-1 text-[11px] text-ink-soft">{t("routes.gesprekken.opnames.transcriptFouten")}</p>
                    </div>) : (<button onClick={() => werkOpnameBij(g.id, { transcript: demoTranscript() })} className="rounded-full border border-border px-4 py-2 text-sm font-semibold">{t("routes.gesprekken.opnames.uitschrijven")}</button>)) : <p className="text-xs text-ink-soft">{t("routes.gesprekken.opnames.uitschrijvenUit")}</p>}
                {s.aan.samenvatting && o.transcript && (o.samenvatting ? (<div className="rounded-md bg-brand-soft/60 p-3 text-sm">
                      <p className="font-semibold">{t("routes.gesprekken.opnames.besproken")}</p>
                      <ul className="mt-1 list-disc pl-5">{o.samenvatting.map((r) => <li key={r}>{r}</li>)}</ul>
                      <p className="mt-2 text-[11px] text-ink-soft">{t("routes.gesprekken.opnames.samenvattingUitleg")}</p>
                    </div>) : (<button onClick={() => werkOpnameBij(g.id, { samenvatting: tLijst("routes.gesprekken.opnames.demoSamenvatting") })} className="rounded-full border border-border px-4 py-2 text-sm font-semibold"><IcoonLabel functie="slim">{t("routes.gesprekken.opnames.samenvattingMaken")}</IcoonLabel></button>))}
                {s.aan.acties && o.samenvatting && (<div className="space-y-2">
                    <p className="text-sm font-semibold">{t("routes.gesprekken.opnames.voorstellen")}</p>
                    <p className="text-[11px] text-ink-soft">{t("routes.gesprekken.opnames.nietsDefinitief")}</p>
                    {voorstellen.map((v) => (<div key={v.k} className="rounded-md bg-card p-3 text-sm">
                        <p className="text-xs font-semibold text-ink-soft"><IcoonLabel functie={v.icoon}>{v.soort}</IcoonLabel></p>
                        <p>"{v.zin}"</p>
                        {acties[v.k] ? (<p className="mt-1 text-xs font-semibold text-brand">{acties[v.k] === "ja" ? <MetVinkje>{v.k === "a3" ? t("routes.gesprekken.opnames.voorgesteld") : t("routes.gesprekken.opnames.toegevoegd")}</MetVinkje> : t("routes.gesprekken.opnames.overgeslagen")}</p>) : (<div className="mt-2 flex items-center gap-2">
                            <span className="flex-1 text-xs text-ink-soft">{v.v}</span>
                            <button onClick={() => setActies({ ...acties, [v.k]: "ja" })} className="rounded-full bg-brand px-3 py-1 text-xs font-semibold text-primary-foreground">{t("common.ja")}</button>
                            <button onClick={() => setActies({ ...acties, [v.k]: "nee" })} className="rounded-full border border-border px-3 py-1 text-xs font-semibold">{t("common.nee")}</button>
                          </div>)}
                      </div>))}
                  </div>)}
              </div>)}
          </Card>);
        })}
    </>);
}
function Privacy() {
    const { t } = useTranslation();
    const s = useGesprekken();
    const vragen = [
        [t("routes.gesprekken.privacy.welke.v"), t("routes.gesprekken.privacy.welke.a", { opnames: s.gesprekken.filter((g) => g.opname).length, checkins: s.checkins.length })],
        [t("routes.gesprekken.privacy.waarom.v"), t("routes.gesprekken.privacy.waarom.a")],
        [t("routes.gesprekken.privacy.wie.v"), t("routes.gesprekken.privacy.wie.a")],
        [t("routes.gesprekken.privacy.toestemmingen.v"), t("routes.gesprekken.privacy.toestemmingen.a")],
        [t("routes.gesprekken.privacy.rechten.v"), t("routes.gesprekken.privacy.rechten.a")],
    ];
    return (<>
      <Card className="divide-y divide-border py-1">
        {Object.keys(moduleLabels).map((m) => (<div key={m} className="flex items-center justify-between gap-3 py-3">
            <div><p className="text-sm font-semibold"><IcoonLabel functie={moduleLabels[m].icoon}>{moduleLabels[m].t}</IcoonLabel></p><p className="text-xs text-ink-soft">{moduleLabels[m].u}</p></div>
            <Schakel aan={s.aan[m]} onClick={() => zetModule(m, !s.aan[m])}/>
          </div>))}
      </Card>
      <h2 className="font-display font-bold">{t("routes.gesprekken.privacy.hoeLang")}</h2>
      <Card className="space-y-2">
        {bewaarOnderdelen.map((b) => (<label key={b} className="flex items-center justify-between gap-3 text-sm">
            {bewaarLabel(b)}
            <select value={s.bewaar[b]} onChange={(e) => zetBewaar(b, e.target.value)} className="rounded-full border border-border bg-card px-3 py-1 text-sm">
              {bewaarTermijnen.map((o) => <option key={o} value={o}>{termijnLabel(o)}</option>)}
            </select>
          </label>))}
        <p className="text-[11px] text-ink-soft">{t("routes.gesprekken.privacy.voorbeeld")}</p>
      </Card>
      <h2 className="font-display font-bold">{t("routes.gesprekken.privacy.centrum")}</h2>
      {vragen.map(([v, a]) => (<details key={v} className="rounded-lg p-4">
          <summary className="cursor-pointer text-sm font-semibold">{v}</summary>
          <p className="mt-2 text-sm text-ink-soft">{a}</p>
        </details>))}
      <Link to="/professionals" className="flex min-h-11 items-center text-sm font-semibold text-brand"><MetChevron>{t("routes.gesprekken.privacy.toegang")}</MetChevron></Link>
      <p className="text-center text-xs text-ink-soft">{t("routes.gesprekken.privacy.voet")}</p>
    </>);
}
function Logboek() {
    const { t } = useTranslation();
    const m = useMeldingen();
    if (!m.length)
        return null;
    return (<Card className="space-y-2">
      <p className="text-sm font-semibold"><IcoonLabel functie="logboek">{t("routes.gesprekken.logboek.kop")}</IcoonLabel> <span className="font-normal text-ink-soft">· {t("routes.gesprekken.logboek.alleenJij")}</span></p>
      {m.map((x) => (<div key={x.id} className="rounded-md bg-muted/60 p-3 text-sm">
          <p className="text-xs text-ink-soft">{x.datum} · {uur(x.tijd)}{x.gesprek ? ` · ${x.gesprek}` : ""}</p>
          <p>{x.notitie || t("routes.gesprekken.logboek.geenNotitie")}</p>
        </div>))}
    </Card>);
}
