import { start } from "@/lib/besluiten-data";
import { GeschiedenisKnop } from "@/components/Geschiedenis";
import { leg } from "@/lib/audit-store";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { AppShell, Card, PageHeader } from "@/components/AppShell";
import { kinderen } from "@/lib/demo-data";
import { useGezagState } from "@/lib/gezag-store";
import { useTranslation } from "react-i18next";
import i18n, { tLijst } from "@/i18n";
import { MetVinkje } from "@/components/Tekens";
export const Route = createFileRoute("/beslissingen")({
    head: () => ({
        meta: [
            { title: i18n.t("common.metaTitel", { titel: i18n.t("routes.beslissingen.meta.titel") }) },
            { name: "description", content: i18n.t("routes.beslissingen.meta.beschrijving") },
            { property: "og:title", content: i18n.t("common.metaTitel", { titel: i18n.t("routes.beslissingen.meta.titel") }) },
            { property: "og:description", content: i18n.t("routes.beslissingen.meta.ogBeschrijving") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    validateSearch: z.object({ soort: z.string().optional(), kind: z.string().optional() }),
    component: Beslissingen,
});
// Opgeslagen soort-waarden (ook in zoekparameters); labels via routes.beslissingen.soort.<sleutel>.
const soortSleutel = { Schoolkeuze: "school", Medisch: "medisch", Verhuizing: "verhuizing", "Verdeling van de week": "verdeling", Opvoeding: "opvoeding" };
const soorten = Object.keys(soortSleutel);
const N = "routes.beslissingen.";
const soortNaam = (x, t) => (soortSleutel[x] ? t(`routes.beslissingen.soort.${soortSleutel[x]}`) : x);
// Logregels bewaren "2 mrt 09:30 uur" (Nederlandse bronwaarde); bij tonen wordt de maand vertaald.
const maandKortNl = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
function toonWanneer(w, t) {
    const m = /^(\d{1,2}) ([a-z]+) (\d{2}:\d{2})( uur)?$/.exec(w);
    const i = m ? maandKortNl.indexOf(m[2]) : -1;
    if (!m || i < 0)
        return w;
    return t(m[4] ? "routes.beslissingen.wanneerUur" : "routes.beslissingen.wanneer", { dag: m[1], maand: tLijst("common.maandenKort")[i], tijd: m[3] });
}
function status(b, t) {
    if (b.modus !== "goedkeuring")
        return { t: b.modus === "informatie" ? t("routes.beslissingen.terInformatie") : t("routes.beslissingen.graagMening"), c: "bg-bg-muted" };
    if (b.sanne === "niet" || b.joris === "niet")
        return { t: t("common.nietAkkoord"), c: "bg-accent-warm/40" };
    if (b.sanne === "akkoord" && b.joris === "akkoord")
        return { t: t("routes.beslissingen.samenAkkoord"), c: "bg-brand text-primary-foreground" };
    return { t: t("routes.beslissingen.inAfwachting"), c: "bg-white" };
}
function Beslissingen() {
    const { t } = useTranslation();
    const { gezag } = useGezagState();
    const [lijst, setLijst] = useState(start);
    const [titel, setTitel] = useState("");
    const zoek = Route.useSearch();
    const [soort, setSoort] = useState(soorten.includes(zoek.soort ?? "") ? zoek.soort : soorten[0]);
    const [kind, setKind] = useState(kinderen.some((k) => k.id === zoek.kind) ? zoek.kind : kinderen[0].id);
    const [mening, setMening] = useState("mening");
    const [openLog, setOpenLog] = useState(null);
    const samen = gezag[kind] === "gezamenlijk";
    const nu = "12 mrt " + new Date().toTimeString().slice(0, 5);
    const reageer = (id, wie, r) => {
        const b0 = lijst.find((b) => b.id === id);
        if (b0)
            leg("besluit", String(id), b0.titel, "gewijzigd", { veld: t(N + "audit.veld", { naam: wie === "sanne" ? "Sanne" : "Joris" }), oud: b0[wie] ? t(N + `audit.waarde.${b0[wie]}`) : t(N + "audit.geenReactie"), nieuw: r === "akkoord" ? t(N + "audit.akkoord") : t(N + "audit.nietAkkoord") }, wie === "sanne" ? "Sanne" : "Joris");
        setLijst(lijst.map((b) => b.id === id ? { ...b, [wie]: r, log: [...b.log, { wanneer: nu, wie: wie === "sanne" ? "Sanne" : "Joris", wat: r === "akkoord" ? t("common.akkoord") : t("common.nietAkkoord") }] } : b));
    };
    const voorstellen = () => {
        if (!titel.trim())
            return;
        const nid = Date.now();
        leg("besluit", String(nid), titel, "toegevoegd");
        setLijst([{ id: nid, titel, soort, kind, sanne: samen ? "akkoord" : undefined, modus: samen ? "goedkeuring" : mening, log: [{ wanneer: nu, wie: "Sanne", wat: samen ? t(N + "log.voorstelGedaan") : t(N + "log.gedeeld") }] }, ...lijst]);
        setTitel("");
    };
    return (<AppShell>
      <PageHeader titel={t(N + "titel")} subtitel={t(N + "subtitel")}/>

      <Card className="mt-5 space-y-3">
        <p className="text-sm font-semibold">{t(N + "nieuw")}</p>
        <input value={titel} onChange={(e) => setTitel(e.target.value)} placeholder={t(N + "placeholder")} className="w-full rounded-md border border-white/70 bg-white/80 p-3 text-sm"/>
        <div className="flex gap-2">
          <select value={soort} onChange={(e) => setSoort(e.target.value)} className="flex-1 rounded-md border border-white/70 bg-white/80 p-2.5 text-sm">{soorten.map((x) => <option key={x} value={x}>{soortNaam(x, t)}</option>)}</select>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="flex-1 rounded-md border border-white/70 bg-white/80 p-2.5 text-sm">{kinderen.map((k) => <option key={k.id} value={k.id}>{k.naam}</option>)}</select>
        </div>
        {samen ? (<p className="text-xs text-ink-soft">{t(N + "pasAlsAllebei")}</p>) : (<div className="flex gap-2">
            {["mening", "informatie"].map((m) => (<button key={m} onClick={() => setMening(m)} className={`flex-1 rounded-full border px-3 py-2 text-xs font-semibold ${mening === m ? "border-brand bg-white" : "border-border bg-surface text-ink-soft"}`}>{m === "mening" ? t(N + "graagMening") : t(N + "terInformatie")}</button>))}
          </div>)}
        <button onClick={voorstellen} className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-primary-foreground">{samen ? t(N + "voorstellenAanJoris") : t(N + "delenMetJoris")}</button>
      </Card>

      <div className="mt-5 space-y-3">
        {lijst.map((b) => {
            const st = status(b, t);
            const k = kinderen.find((x) => x.id === b.kind);
            return (<Card key={b.id} id={`item-${b.id}`} className="zoekdoel space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] tracking-wider text-ink-soft uppercase">{soortNaam(b.soort, t)} · {k.naam}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${st.c}`}>{st.t}</span>
              </div>
              <div className="flex items-start justify-between gap-2"><p className="font-semibold">{b.titel}</p><GeschiedenisKnop soort="besluit" itemId={String(b.id)} naam={b.titel}/></div>
              {b.modus === "goedkeuring" && (<div className="flex gap-4 text-xs text-ink-soft">
                  <span className="inline-flex items-center gap-1">Sanne: {b.sanne === "akkoord" ? <MetVinkje>{t(N + "vinkAkkoord")}</MetVinkje> : b.sanne === "niet" ? t(N + "audit.nietAkkoord") : "…"}</span>
                  <span className="inline-flex items-center gap-1">Joris: {b.joris === "akkoord" ? <MetVinkje>{t(N + "vinkAkkoord")}</MetVinkje> : b.joris === "niet" ? t(N + "audit.nietAkkoord") : "…"}</span>
                </div>)}
              {b.modus === "goedkeuring" && !b.joris && (<div className="flex gap-2">
                  <span className="self-center text-[11px] text-ink-soft">{t(N + "demoJoris")}</span>
                  <button onClick={() => reageer(b.id, "joris", "akkoord")} className="rounded-full bg-brand px-3 py-1 text-xs font-semibold text-primary-foreground">{t("common.akkoord")}</button>
                  <button onClick={() => reageer(b.id, "joris", "niet")} className="rounded-full bg-white px-3 py-1 text-xs font-semibold">{t("common.nietAkkoord")}</button>
                </div>)}
              <button onClick={() => setOpenLog(openLog === b.id ? null : b.id)} className="text-xs font-semibold text-brand">{openLog === b.id ? t(N + "verbergLogboek") : t(N + "logboek", { n: b.log.length })}</button>
              {openLog === b.id && (<ol className="space-y-1 border-l-2 border-brand-soft pl-3 text-xs">
                  {b.log.map((l, i) => <li key={i}><span className="text-ink-soft">{toonWanneer(l.wanneer, t)} · {l.wie}</span> — {l.wat}</li>)}
                </ol>)}
            </Card>);
        })}
      </div>
      <p className="mt-4 text-xs text-ink-soft">{t(N + "voetnoot")}</p>
    </AppShell>);
}
