import { createFileRoute, Link } from "@tanstack/react-router";
import { SlimmeMeeLijst } from "@/components/SlimmeMeeLijst";
import { OverdrachtFormulier } from "@/components/OverdrachtFormulier";
import { useOverdracht } from "@/lib/overdracht-store";
import { VasteRoutines } from "@/components/VasteRoutines";
import { useEffect, useState } from "react";
import { beginOverdracht, markeerOverdrachtIngevuld, useWissel } from "@/lib/wissel-store";
import { useAudit } from "@/lib/audit-store";
import { AppShell, Card, PageHeader } from "@/components/AppShell";
import { kinderen } from "@/lib/demo-data";
import { AppIcon } from "@/components/AppIcon";
import { Chevron, Vinkje } from "@/components/Tekens";
import { IkBenLater } from "@/components/IkBenLater";
import { OnderwegStatus } from "@/components/OnderwegStatus";
import { useTaken } from "@/lib/taken-store";
import { magAudit } from "@/lib/export-rechten";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
export const Route = createFileRoute("/overdracht")({
    head: () => ({
        meta: [
            { title: i18n.t("common.metaTitel", { titel: i18n.t("routes.overdracht.meta.titel") }) },
            { name: "description", content: i18n.t("routes.overdracht.meta.beschrijving") },
            { property: "og:title", content: i18n.t("common.metaTitel", { titel: i18n.t("routes.overdracht.meta.titel") }) },
            { property: "og:description", content: i18n.t("routes.overdracht.meta.ogBeschrijving") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: Overdracht,
});
const stemmingen = ["Vrolijk", "Rustig", "Moe", "Wat stil", "Verdrietig"];
const slaap = ["Goed", "Wisselend", "Onrustig"];
const onderwerpenOud = ["School / huiswerk", "Spullen mee", "Medicatie", "Emoties", "Sport / hobby", "Afspraken"];
const onderwerpenJong = ["Slaap", "Voeding", "Gezondheid", "Medicatie", "Spullen mee", "Knuffel / troost"];
const overgang = ["Soepel", "Even wennen", "Lastig"];
/** Waarden blijven Nederlandse ids (vergelijkingen); alleen de weergave wordt vertaald. */
const WAARDE = { "Vrolijk": "vrolijk", "Rustig": "rustig", "Moe": "moe", "Wat stil": "watStil", "Verdrietig": "verdrietig", "Goed": "goed", "Wisselend": "wisselend", "Onrustig": "onrustig", "School / huiswerk": "schoolHuiswerk", "Spullen mee": "spullenMee", "Medicatie": "medicatie", "Emoties": "emoties", "Sport / hobby": "sportHobby", "Afspraken": "afspraken", "Slaap": "slaap", "Voeding": "voeding", "Gezondheid": "gezondheid", "Knuffel / troost": "knuffel", "Soepel": "soepel", "Even wennen": "evenWennen", "Lastig": "lastig" };
/** Stemmingen met een vast icoon (AppIcon-functie). */
const ICOON_WAARDE = { "Vrolijk": "vrolijk", "Rustig": "rust", "Wat stil": "stil", "Verdrietig": "verdrietig" };
function WaardeLabel({ waarde }) {
    const functie = ICOON_WAARDE[waarde];
    if (!functie)
        return <>{toonWaarde(waarde)}</>;
    return <span className="inline-flex items-center gap-1"><AppIcon functie={functie} maat="sm" vorm="kaal"/>{toonWaarde(waarde)}</span>;
}
const toonWaarde = (v) => (WAARDE[v] ? i18n.t(`routes.overdracht.waarde.${WAARDE[v]}`) : v);
const lt = (k) => i18n.t(`routes.overdracht.log.${k}`);
const startLog = [
    { id: 1, get datum() { return lt("l1.datum"); }, kind: "emma", get richting() { return lt("vanJorisNaarJou"); }, stemming: "Vrolijk", slaap: "Goed", overgang: "Soepel", onderwerpen: ["School / huiswerk"], get positief() { return lt("l1.positief"); } },
    { id: 2, get datum() { return lt("l1.datum"); }, kind: "noah", get richting() { return lt("vanJorisNaarJou"); }, stemming: "Moe", slaap: "Onrustig", overgang: "Even wennen", onderwerpen: ["Spullen mee"], get notitie() { return lt("l2.notitie"); }, get positief() { return lt("l2.positief"); } },
    { id: 3, get datum() { return lt("l3.datum"); }, kind: "noah", get richting() { return lt("vanJouNaarJoris"); }, stemming: "Wat stil", slaap: "Onrustig", overgang: "Even wennen", onderwerpen: ["Emoties"], get notitie() { return lt("l3.notitie"); } },
    { id: 4, get datum() { return lt("l4.datum"); }, kind: "emma", get richting() { return lt("vanJorisNaarJou"); }, stemming: "Rustig", slaap: "Goed", overgang: "Soepel", onderwerpen: [], get positief() { return lt("l4.positief"); } },
    { id: 5, get datum() { return lt("l5.datum"); }, kind: "noah", get richting() { return lt("vanJouNaarJoris"); }, stemming: "Rustig", slaap: "Onrustig", overgang: "Soepel", onderwerpen: ["Medicatie"], get notitie() { return lt("l5.notitie"); } },
];
function Chips({ opties, waarde, onKies, multi }) {
    return (<div className="flex flex-wrap gap-2">
      {opties.map((o) => {
            const aan = waarde.includes(o);
            return (<button key={o} type="button" onClick={() => onKies(o)} aria-pressed={aan} className={`inline-flex min-h-10 items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition ${aan ? "border-brand bg-brand text-primary-foreground" : "border-white/70 bg-white/70"}`}>
            {multi && aan ? <Vinkje className="size-3.5"/> : null}<WaardeLabel waarde={o}/>
          </button>);
        })}
    </div>);
}
function Overdracht() {
    const { t } = useTranslation();
    const [tab, setTab] = useState("paklijst");
    const odSt = useOverdracht();
    const odGedeeld = odSt.gedeeld.some((o) => o.momentId === "w1");
    useEffect(() => { if (typeof window !== "undefined" && window.location.hash === "#overdracht")
        setTab("meegeven"); }, []);
    const [kindId, setKindId] = useState(kinderen[0]?.id ?? "emma");
    const kind = kinderen.find((k) => k.id === kindId);
    const jong = (kind?.leeftijd ?? 0) < 4;
    const [stemming, setStemming] = useState();
    const [slaapV, setSlaap] = useState();
    const [overgangV, setOvergang] = useState();
    const [onderwerpen, setOnderwerpen] = useState([]);
    const [notitie, setNotitie] = useState("");
    const [positief, setPositief] = useState("");
    const [log, setLog] = useState(startLog);
    const [verstuurd, setVerstuurd] = useState(false);
    const [filter, setFilter] = useState("alle");
    const audit = useAudit();
    const wissel = useWissel();
    const { spullen } = useTaken();
    useEffect(() => { beginOverdracht(kindId); }, [kindId]);
    const sinds = wissel.laatsteOverdracht[kindId];
    const gezien = new Set();
    const nieuweInfo = [...audit].reverse().filter((e) => {
        const sleutel = `${e.soort}:${e.itemId}`;
        if (!sinds || e.moment <= sinds || !kind || e.meta["zichtbaarheid"] === "privé" || !e.kinderen.includes(kind.naam) || !magAudit({ type: "ouder", id: "sanne" }, e.soort))
            return false;
        if (gezien.has(sleutel))
            return false;
        gezien.add(sleutel);
        if (e.actie !== "CREATED" && e.actie !== "UPDATED" && e.actie !== "ACCEPTED")
            return false;
        if (e.meta["type"] === "Spul")
            return spullen.some((s) => s.id === e.itemId && s.kind === kindId && s.type === "mee");
        return e.soort === "afspraak" || (e.soort === "dossier" && e.meta["type"] === "Gezondheid");
    }).slice(0, 3);
    const reset = () => { setStemming(undefined); setSlaap(undefined); setOvergang(undefined); setOnderwerpen([]); setNotitie(""); setPositief(""); };
    const versturen = () => {
        setLog([{ id: Date.now(), datum: t("routes.overdracht.log.vandaagDatum"), kind: kindId, richting: t("routes.overdracht.log.vanJouNaarJoris"), stemming, slaap: slaapV, overgang: overgangV, onderwerpen, notitie: notitie || undefined, positief: positief || undefined }, ...log]);
        reset();
        setVerstuurd(true);
        markeerOverdrachtIngevuld(kindId);
    };
    const zichtbaar = log.filter((r) => filter === "alle" || r.kind === filter);
    const telling = (fn) => zichtbaar.filter(fn).length;
    if (!kind)
        return null;
    return (<AppShell>
      <PageHeader titel={t("routes.overdracht.titel")} subtitel={t("routes.overdracht.subtitel")}/>
      <nav className="mt-4 flex rounded-full bg-[rgba(226,216,203,.55)] p-1" aria-label={t("routes.overdracht.onderdelen")}>
        {["paklijst", "meegeven", "terugblik"].map((tb) => (<button key={tb} onClick={() => setTab(tb)} aria-pressed={tab === tb} className={`relative flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full text-[15px] ${tab === tb ? "bg-white font-black text-[#3F5747] shadow-[0_2px_8px_rgba(60,50,40,.08)]" : "font-bold text-ink-soft"}`}>
            {tb === "paklijst" ? t("routes.overdracht.tab.paklijst") : tb === "meegeven" ? t("routes.overdracht.tab.overdracht") : t("routes.overdracht.tab.terugblik")}
            {tb === "meegeven" && !odGedeeld ? <span aria-label={t("routes.overdracht.nogInTeVullen")} className="size-2 rounded-full bg-[#4F6B58]"/> : null}
            {tb === "meegeven" && odGedeeld ? <span role="img" aria-label={t("routes.overdracht.gedeeld")} className="inline-flex"><Vinkje className="size-4"/></span> : null}
          </button>))}
      </nav>

      {tab === "paklijst" ? (<>
          <SlimmeMeeLijst momentId="w1"/>
          <OnderwegStatus momentId="w1"/>
          <IkBenLater momentId="w1"/>
          <Link to="/veranderd" search={{ moment: "w1" }} className="mt-1 flex min-h-10 items-center px-1 text-sm font-bold text-brand">{t("routes.overdracht.veranderd")}</Link>
          <VasteRoutines />
          {!odGedeeld ? <button onClick={() => setTab("meegeven")} className="mt-4 flex w-full items-center gap-3 rounded-[22px] border-2 border-[#A9BCA8] px-4 py-3 text-left" style={{ background: "linear-gradient(135deg, rgba(220,230,210,.95), rgba(233,239,227,.9))" }}><span className="min-w-0 flex-1"><span className="block text-[16px] font-black text-[#2F4A3A]">{t("routes.overdracht.overdrachtVoorJoris")}</span><span className="block text-sm text-[#3F5747]">{t("routes.overdracht.vulIn")}</span></span><Chevron className="size-5 text-[#3F5747]"/></button> : null}
        </>) : tab === "meegeven" ? (<OverdrachtFormulier momentId="w1" aan="Joris" wanneer={t("routes.overdracht.wanneer")} viaSchool/>) : (<div className="mt-5 space-y-4">
          <p className="text-sm text-ink-soft">{t("routes.overdracht.terugblikUitleg")}</p>
          <div className="flex gap-2">
            {[{ id: "alle", naam: t("common.allebei") }, ...kinderen].map((k) => (<button key={k.id} onClick={() => setFilter(k.id)} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${filter === k.id ? "bg-white shadow-sm" : "bg-surface text-ink-soft"}`}>{k.naam}</button>))}
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
                { l: t("routes.overdracht.stat.soepel"), n: telling((r) => r.overgang === "Soepel") },
                { l: t("routes.overdracht.stat.onrustig"), n: telling((r) => r.slaap === "Onrustig") },
                { l: t("routes.overdracht.stat.mooi"), n: telling((r) => !!r.positief) },
            ].map((s) => (<Card key={s.l} className="p-3">
                <p className="font-display text-2xl font-bold">{s.n}</p>
                <p className="text-[11px] text-ink-soft">{s.l}</p>
              </Card>))}
          </div>
          <p className="text-xs text-ink-soft">{t("routes.overdracht.vanDeLaatste", { n: zichtbaar.length })}</p>
          {zichtbaar.map((r) => {
                const k = kinderen.find((x) => x.id === r.kind);
                return (<Card key={r.id} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <img src={k.avatar} alt="" className="size-7 rounded-full object-cover"/>
                  <p className="flex-1 text-sm font-semibold">{k.naam} · {r.datum}</p>
                  <span className="text-[11px] text-ink-soft">{r.richting}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {r.stemming ? <span className="inline-flex items-center rounded-full bg-white/80 px-2 py-0.5"><WaardeLabel waarde={r.stemming}/></span> : null}
                  {[r.slaap && t("routes.overdracht.slaapLabel", { waarde: toonWaarde(r.slaap) }), r.overgang && t("routes.overdracht.overgangLabel", { waarde: toonWaarde(r.overgang) }), ...r.onderwerpen.map(toonWaarde)].filter(Boolean).map((x) => (<span key={x} className="rounded-full bg-white/80 px-2 py-0.5">{x}</span>))}
                </div>
                {r.notitie && <p className="text-sm text-ink-soft">{r.notitie}</p>}
                {r.positief && <p className="flex items-start gap-1.5 text-sm"><AppIcon functie="ster" maat="sm" vorm="kaal" className="mt-0.5 shrink-0"/><span>{r.positief}</span></p>}
              </Card>);
            })}
        </div>)}
    </AppShell>);
}
