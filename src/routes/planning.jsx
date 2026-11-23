import { AgendaVakanties } from "@/components/AgendaVakanties";
import { Sectie } from "@/components/ui-kit";
import { createFileRoute, Link, Navigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import i18n, { tLijst } from "@/i18n";
import { z } from "zod";
import { AlarmClock, CalendarDays, CalendarRange, Gift, Palmtree } from "lucide-react";
import { Chevron, MetChevron, MetVinkje } from "@/components/Tekens";
import { AppShell, Card, PageHeader } from "@/components/AppShell";
import { ContextToevoegen } from "@/components/ContextToevoegen";
import { VerdeelHulp, ReisHulp } from "@/components/VerdeelHulp";
import { useVakanties, voegVakantieVoorstelToe, stelVerdelingVoor, accepteerVakantie, trekVakantieIn } from "@/lib/vakantie-store";
import { useZorg, zorgDag } from "@/lib/zorg-store";
import { AppIcon } from "@/components/AppIcon";
/** Iconen bij de afstem-opties (Prima / Even bellen / Liever niet), op volgorde. */
const AFSTEM_ICOON = ["waardering", "twijfel", "afwijzen"];
import { Button } from "@/components/ui/button";
import { VoorstelIntrekken } from "@/components/VoorstelIntrekken";
export const Route = createFileRoute("/planning")({
    validateSearch: z.object({ eerder: z.boolean().optional(), toevoegen: z.enum(["vakantie", "verdelen", "bijzonder", "periode"]).optional(), periode: z.string().optional() }),
    head: () => ({
        meta: [
            { title: i18n.t("routes.planning.meta.titel") },
            { name: "description", content: i18n.t("routes.planning.meta.beschrijving") },
            { property: "og:title", content: i18n.t("routes.planning.meta.ogTitel") },
            { property: "og:description", content: i18n.t("routes.planning.meta.ogBeschrijving") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: PlanningInAgenda,
});
function PlanningInAgenda() {
    const zoek = Route.useSearch();
    if (!zoek.eerder)
        return <Navigate to="/agenda" replace search={{ onderdeel: "vakanties", vakantieNieuw: zoek.toevoegen === "bijzonder" ? "bijzonder" : zoek.toevoegen ? "vakantie" : undefined }}/>;
    return <EerderePlanning />;
}
function EerderePlanning() {
    const { t } = useTranslation();
    const zoek = Route.useSearch();
    const [eerder, setEerder] = useState(false);
    if (eerder)
        return <><div className="mx-auto max-w-md px-5 pt-4"><Button variant="outline" onClick={() => setEerder(false)}>{t("routes.planning.terugNaarVakanties")}</Button></div><Planning /></>;
    return <AppShell><PageHeader titel={t("routes.planning.titel")} terug="/agenda"/><AgendaVakanties toevoegen={zoek.toevoegen === "bijzonder" ? "bijzonder" : zoek.toevoegen ? "vakantie" : undefined}/><Button variant="link" className="mt-4 min-h-11 px-0 text-xs" onClick={() => setEerder(true)}>{t("routes.planning.eerder")}</Button></AppShell>;
}
const kleur = {
    Sanne: "bg-brand-soft text-brand",
    Joris: "bg-accent-warm/40 text-ink",
    Samen: "bg-surface text-ink",
    "Nog open": "border border-dashed border-ink-soft/40 text-ink-soft",
};
const leegReis = { bestemming: "", vertrek: "", terug: "", adres: "", reis: "", contact: "" };
const MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
/** Engelse maandafkortingen, zodat ook "25 Apr–3 May" herkend wordt. */
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** Weergave van de ouder-waarde; de waarde zelf ("Nog open", "Samen", namen) blijft ongewijzigd. */
const ouderTekst = (t, o) => o === "Nog open" ? t("routes.planning.ouder.nogOpen") : o === "Samen" ? t("routes.planning.ouder.samen") : o;
/** Haalt een periode uit bekende notaties: "25 apr–3 mei", "25 apr t/m 3 mei", "2025-04-25 t/m 2025-05-03". Onbekende tekst = geen controle. */
function periodeDatalen(tekst) {
    const t = tekst.toLowerCase().replace(/[–—]/g, "-").replace(/\s+(t\/m|tot en met|tot|to|until)\s+/g, "-");
    const iso = [...t.matchAll(/(\d{4})-(\d{2})-(\d{2})/g)].map((m) => new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    if (iso.length >= 2)
        return iso[0] <= iso[1] ? { van: iso[0], tot: iso[1] } : { van: iso[1], tot: iso[0] };
    const dt = [...t.matchAll(/(\d{1,2})\s*(jan|feb|mrt|mar|apr|mei|may|jun|jul|aug|sep|okt|oct|nov|dec)[a-zë]*/g)]
        .map((m) => ({ dag: Number(m[1]), mnd: MAANDEN.includes(m[2]) ? MAANDEN.indexOf(m[2]) : MONTHS.indexOf(m[2]) }))
        .filter((x) => x.mnd >= 0 && x.dag >= 1 && x.dag <= 31);
    if (dt.length < 2)
        return null;
    const a = new Date(2025, dt[0].mnd, dt[0].dag);
    const b = new Date(2025, dt[1].mnd, dt[1].dag);
    return a <= b ? { van: a, tot: b } : { van: b, tot: a };
}
/** Aantal dagen in deze periode dat Emma volgens de verdeling van de week bij de andere ouder is. */
function dagenBijAndereOuder(zorg, van, tot) {
    let n = 0;
    const d = new Date(van);
    for (let i = 0; d <= tot && i < 62; i++, d.setDate(d.getDate() + 1)) {
        if (d.getFullYear() === 2025 && d.getMonth() === 2 && zorgDag(zorg, "emma", d.getDate()).ouder !== "sanne")
            n++;
    }
    return n;
}
function Planning() {
    const { t } = useTranslation();
    const router = useRouter();
    const { toevoegen, periode } = Route.useSearch();
    const vak = useVakanties();
    const [gezien, setGezien] = useState({});
    const [besl, setBesl] = useState({});
    const [afst, setAfst] = useState({});
    const [voorstel, setVoorstel] = useState({ naam: periode ?? (toevoegen === "verdelen" ? t("routes.planning.meivakantie") : ""), periode: "", ouder: "Nog open", details: "" });
    const [buitenland, setBuitenland] = useState(false);
    const [reis, setReis] = useState(leegReis);
    const [docs, setDocs] = useState([]);
    const zorg = useZorg();
    const [overlap, setOverlap] = useState(null);
    const [reisdocument, setReisdocument] = useState("");
    const verstuurVakantie = (meta) => {
        if (buitenland && !reisdocument)
            return;
        const reisTekst = buitenland ? [reis.bestemming, reis.vertrek && reis.terug ? t("routes.planning.reisTekst.periode", { van: reis.vertrek, tot: reis.terug }) : "", docs.length ? t("routes.planning.reisTekst.documenten", { count: docs.length }) : "", reisdocument === "geldig" ? t("routes.planning.reisTekst.gecontroleerd") : t("routes.planning.reisTekst.regelen")].filter(Boolean).join(" · ") : "";
        voegVakantieVoorstelToe({ ...voorstel, details: [voorstel.details, reisTekst, meta].filter(Boolean).join(" · ") });
        setBuitenland(false);
        setReis(leegReis);
        setDocs([]);
        setOverlap(null);
        setReisdocument("");
        router.navigate({ to: "/planning", search: {} });
    };
    useEffect(() => {
        if (!toevoegen)
            return;
        setVoorstel({ naam: periode ?? (toevoegen === "verdelen" ? t("routes.planning.meivakantie") : ""), periode: "", ouder: "Nog open", details: "" });
        window.requestAnimationFrame(() => document.querySelector("#nieuw-periodevoorstel")?.scrollIntoView({ behavior: "smooth", block: "center" }));
    }, [toevoegen, periode]);
    return (<AppShell>
       <PageHeader titel={t("routes.planning.titel")} subtitel={t("routes.planning.subtitel")} actie={<ContextToevoegen titel={t("routes.planning.toevoegen.titel")} acties={[
                { titel: t("routes.planning.toevoegen.vakantie.titel"), uitleg: t("routes.planning.toevoegen.vakantie.uitleg"), icoon: Palmtree, onKies: () => router.navigate({ to: "/planning", search: { toevoegen: "vakantie" } }) },
                { titel: t("routes.planning.toevoegen.verdelen.titel"), uitleg: t("routes.planning.toevoegen.verdelen.uitleg"), icoon: CalendarRange, onKies: () => router.navigate({ to: "/planning", search: { toevoegen: "verdelen", periode: t("routes.planning.meivakantie") } }) },
                { titel: t("routes.planning.toevoegen.bijzonder.titel"), uitleg: t("routes.planning.toevoegen.bijzonder.uitleg"), icoon: Gift, onKies: () => router.navigate({ to: "/planning", search: { toevoegen: "bijzonder" } }) },
                { titel: t("routes.planning.toevoegen.periode.titel"), uitleg: t("routes.planning.toevoegen.periode.uitleg"), icoon: CalendarDays, onKies: () => router.navigate({ to: "/planning", search: { toevoegen: "periode" } }) },
            ]}/>}/>

      <div className="mt-4 space-y-3">
        <VerdeelHulp />
        <ReisHulp />
        {toevoegen ? (<Card className="scroll-mt-4" id="nieuw-periodevoorstel">
            <p className="font-display font-bold">{toevoegen === "vakantie" ? t("routes.planning.toevoegen.vakantie.titel") : toevoegen === "verdelen" ? t("routes.planning.toevoegen.verdelen.titel") : toevoegen === "bijzonder" ? t("routes.planning.kaart.bijzonder") : t("routes.planning.toevoegen.periode.titel")}</p>
            <p className="mt-1 text-xs text-ink-soft">{t("routes.planning.kaart.aanpassen")}</p>
            <div className="mt-3 space-y-2">
              <input value={voorstel.naam} onChange={(e) => setVoorstel({ ...voorstel, naam: e.target.value })} placeholder={t("routes.planning.kaart.naamPlaceholder")} className="w-full rounded-md bg-surface px-3 py-2 text-sm outline-none"/>
              <input value={voorstel.periode} onChange={(e) => setVoorstel({ ...voorstel, periode: e.target.value })} placeholder={t("routes.planning.kaart.periodePlaceholder")} className="w-full rounded-md bg-surface px-3 py-2 text-sm outline-none"/>
              <select value={voorstel.ouder} onChange={(e) => setVoorstel({ ...voorstel, ouder: e.target.value })} className="w-full rounded-md bg-surface px-3 py-2 text-sm outline-none">
                {["Nog open", "Sanne", "Joris", "Samen"].map((ouder) => <option key={ouder} value={ouder}>{ouderTekst(t, ouder)}</option>)}
              </select>
              <textarea value={voorstel.details} onChange={(e) => setVoorstel({ ...voorstel, details: e.target.value })} placeholder={t("routes.planning.kaart.toelichting")} rows={2} className="w-full resize-none rounded-md bg-surface px-3 py-2 text-sm outline-none"/>
              <label className="flex items-center gap-2 py-1 text-sm"><input type="checkbox" checked={buitenland} onChange={(e) => setBuitenland(e.target.checked)} className="accent-[var(--color-brand)]"/> {t("routes.planning.kaart.buitenland")}</label>
              {buitenland ? (<div className="space-y-2 rounded-md border border-border p-3">
                  {[["bestemming", t("routes.planning.reis.bestemming")], ["adres", t("routes.planning.reis.adres")], ["reis", t("routes.planning.reis.reis")], ["contact", t("routes.planning.reis.contact")]].map(([k, label]) => (<input key={k} value={reis[k]} onChange={(e) => setReis({ ...reis, [k]: e.target.value })} placeholder={label} className="w-full rounded-md bg-surface px-3 py-2 text-sm outline-none"/>))}
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-ink-soft">{t("routes.planning.reis.vertrek")}<input type="date" value={reis.vertrek} onChange={(e) => setReis({ ...reis, vertrek: e.target.value })} className="mt-1 w-full rounded-md bg-surface px-2 py-2 text-sm text-ink outline-none"/></label>
                    <label className="text-xs text-ink-soft">{t("routes.planning.reis.terug")}<input type="date" value={reis.terug} onChange={(e) => setReis({ ...reis, terug: e.target.value })} className="mt-1 w-full rounded-md bg-surface px-2 py-2 text-sm text-ink outline-none"/></label>
                  </div>
                  <p className="pt-1 text-sm font-semibold">{t("routes.planning.reis.toestemming")}</p>
                  <fieldset className="space-y-2 border-y border-border py-3">
                    <legend className="text-sm font-semibold">{t("routes.planning.reis.paspoortVraag")}</legend>
                    <p className="text-xs text-ink-soft">{t("routes.planning.reis.eisen")}</p>
                    <label className="flex items-center gap-2 text-sm"><input type="radio" name="reisdocument" checked={reisdocument === "geldig"} onChange={() => setReisdocument("geldig")}/>{t("routes.planning.reis.gecontroleerd")}</label>
                    <label className="flex items-center gap-2 text-sm"><input type="radio" name="reisdocument" checked={reisdocument === "regelen"} onChange={() => setReisdocument("regelen")}/>{t("routes.planning.reis.nogRegelen")}</label>
                    {reisdocument === "regelen" ? <Button asChild variant="link" size="sm" className="h-auto px-0"><Link to="/taken" search={{ taak: t("routes.planning.reis.taak", { wat: reis.bestemming || voorstel.naam }) }}><MetChevron>{t("routes.planning.reis.alsTaak")}</MetChevron></Link></Button> : null}
                  </fieldset>
                  <input type="file" multiple onChange={(e) => setDocs(Array.from(e.target.files ?? []).map((f) => f.name))} className="w-full text-xs" aria-label={t("routes.planning.reis.documentenToevoegen")}/>
                  {docs.length ? <p className="text-xs text-ink-soft">{t("routes.planning.reis.toegevoegd", { lijst: docs.join(", ") })}</p> : null}
                  <p className="text-xs leading-relaxed text-ink-soft"><Trans i18nKey="routes.planning.reis.info" components={{ link: <a className="font-semibold text-brand underline" href="https://www.rijksoverheid.nl/onderwerpen/paspoort-en-identiteitskaart/vraag-en-antwoord/toestemming-op-reis-met-kind" target="_blank" rel="noreferrer"/> }}/></p>
                </div>) : null}
              {overlap ? (<div role="status" className="rounded-md border border-border bg-muted p-3">
                  <p className="text-xs text-ink-soft">{t("routes.planning.overlap.tekst", { count: overlap })}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button onClick={() => verstuurVakantie(t("routes.planning.overlap.meta"))} className="rounded-full bg-brand px-3 py-1 text-xs font-semibold text-primary-foreground">{t("routes.planning.overlap.ja")}</button>
                    <button onClick={() => verstuurVakantie()} className="rounded-full border border-border px-3 py-1 text-xs font-semibold">{t("routes.planning.overlap.nee")}</button>
                  </div>
                </div>) : null}
              <button disabled={!voorstel.naam.trim() || !voorstel.periode.trim() || (buitenland && !reisdocument)} onClick={() => {
                if (overlap === null) {
                    const p = periodeDatalen(voorstel.periode);
                    const n = p ? dagenBijAndereOuder(zorg, p.van, p.tot) : 0;
                    if (n > 0) {
                        setOverlap(n);
                        return;
                    }
                }
                verstuurVakantie();
            }} className="w-full rounded-md bg-brand py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">{t("routes.planning.versturen")}</button>
              <p className="text-[11px] text-ink-soft">{t("routes.planning.naAkkoord")}</p>
            </div>
          </Card>) : null}
        <Sectie titel={t("routes.planning.vakanties.titel")} sub={t("routes.planning.vakanties.sub")} open>{(<>
            <p className="text-sm text-ink-soft">{t("routes.planning.vakanties.uitleg")}</p>
            {[...vak].sort((a, b) => Number(a.status === "afgesproken") - Number(b.status === "afgesproken")).map((v) => (<Card key={v.id}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link to="/vakantie/$id" params={{ id: v.id }} className="inline-flex items-center gap-0.5 font-display font-bold underline-offset-2 hover:underline">{v.naam}<Chevron className="size-4 text-ink-soft"/></Link>
                    <p className="text-sm text-ink-soft">{v.periode}</p>
                    {v.details && <p className="mt-1 flex items-center gap-1 text-xs"><AppIcon functie="vliegen" maat="sm" vorm="kaal"/>{v.details}</p>}
                    {v.status === "ingetrokken" ? <p className="mt-1 text-[11px] text-ink-soft">{t("routes.planning.vakanties.ingetrokken")}</p> : v.status === "afgesproken" ? <p className="mt-1 text-[11px] text-brand"><MetVinkje achter>{t("routes.planning.vakanties.afgesproken")}</MetVinkje></p> : v.status === "voorstel" ? <p className="mt-1 text-[11px] text-ink-soft">{t("routes.planning.vakanties.voorstel")}</p> : <p className="mt-1 text-[11px] text-ink-soft">{t("routes.planning.vakanties.open")}</p>}
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${kleur[v.ouder]}`}>{ouderTekst(t, v.ouder)}</span>
                </div>
                {v.status === "voorstel" && v.van === "Sanne" && (<div className="mt-3 flex gap-2 text-xs">
                    <VoorstelIntrekken onBevestig={() => trekVakantieIn(v.id)}/>
                    {import.meta.env.DEV ? <button onClick={() => accepteerVakantie(v.id)} className="flex-1 rounded-md bg-surface py-2 text-ink-soft">{t("routes.planning.vakanties.test")}</button> : null}
                  </div>)}
                {v.status === "open" && (<div className="mt-3 flex gap-2">
                    {["Sanne", "Joris", "Samen"].map((o) => (<button key={o} onClick={() => stelVerdelingVoor(v.id, o)} className="flex-1 rounded-md bg-surface py-2 text-xs font-medium">{ouderTekst(t, o)}</button>))}
                  </div>)}
              </Card>))}
          </>)}</Sectie>

        <Sectie titel={t("routes.planning.wieGaatMee.titel")}>{[
            { wat: t("routes.planning.wieGaatMee.texel"), wie: ["Sanne", "Emma", "Noah", t("routes.planning.wieGaatMee.omaEls")] },
            { wat: t("routes.planning.wieGaatMee.ski"), wie: ["Joris", "Emma", "Noah", t("routes.planning.wieGaatMee.lotte")] },
            { wat: t("routes.planning.wieGaatMee.daan"), wie: ["Joris", "Noah"] },
        ].map((x) => (<Card key={x.wat}>
            <p className="font-display font-bold">{x.wat}</p>
            <div className="mt-2 flex flex-wrap gap-2">{x.wie.map((w) => <span key={w} className="rounded-full bg-surface px-3 py-1 text-xs">{w}</span>)}</div>
          </Card>))}</Sectie>

        {(() => {
            const nogTeZien = tLijst("routes.planning.dubbelcheck.items").filter((x) => !gezien[x]);
            if (!nogTeZien.length)
                return null;
            return (<Sectie titel={t("routes.planning.dubbelcheck.titel")} sub={t("routes.planning.dubbelcheck.sub", { count: nogTeZien.length })}>{(<>
                <p className="text-sm text-ink-soft">{t("routes.planning.dubbelcheck.uitleg")}</p>
                <p className="text-xs text-ink-soft">{t("routes.planning.dubbelcheck.gezienUitleg")}</p>
                {nogTeZien.map((x) => (<Card key={x} className="flex items-center justify-between gap-3">
                    <div className="text-sm">
                      <p className="font-medium">{x}</p>
                      <p className="text-xs text-ink-soft">{t("routes.planning.dubbelcheck.jorisGezien")}</p>
                    </div>
                    <button onClick={() => setGezien((g) => ({ ...g, [x]: true }))} className="shrink-0 rounded-full bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand">{t("routes.planning.dubbelcheck.gezien")}</button>
                  </Card>))}
              </>)}</Sectie>);
        })()}

        <Sectie titel={t("routes.planning.week.titel")}>{(<Card>
            <p className="font-display font-bold">{t("routes.planning.week.kop")}</p>
            <ul className="mt-3 space-y-2 text-sm">
              {tLijst("routes.planning.week.items").map((x) => <li key={x} className="rounded-md bg-surface px-4 py-3">{x}</li>)}
            </ul>
            <p className="mt-3 text-xs text-ink-soft">{t("routes.planning.week.uitleg")}</p>
          </Card>)}</Sectie>

        <Sectie titel={t("routes.planning.beslissen.titel")}>{[
            { t: t("routes.planning.beslissen.kamp.t"), d: t("routes.planning.beslissen.kamp.d"), s: t("routes.planning.beslissen.kamp.s") },
            { t: t("routes.planning.beslissen.zwem.t"), d: t("routes.planning.beslissen.zwem.d"), s: t("routes.planning.beslissen.zwem.s") },
        ].map((x) => (<Card key={x.t}>
            <p className="font-display font-bold">{x.t}</p>
            <p className="flex items-center gap-1.5 text-sm text-destructive"><AlarmClock aria-hidden="true" className="size-4 shrink-0"/>{x.d}</p>
            <p className="text-xs text-ink-soft">{x.s}</p>
            {besl[x.t] ? <p className="mt-2 text-sm font-semibold text-brand">{t("routes.planning.beslissen.jouwReactie", { keuze: besl[x.t] })}</p> : (<div className="mt-3 flex gap-2">
                {tLijst("routes.planning.beslissen.opties").map((o) => <button key={o} onClick={() => setBesl((b) => ({ ...b, [x.t]: o }))} className="flex-1 rounded-md bg-surface py-2 text-xs font-medium">{o}</button>)}
              </div>)}
          </Card>))}</Sectie>

        <Sectie titel={t("routes.planning.afstemmen.titel")}>{(<>
            <p className="text-sm text-ink-soft">{t("routes.planning.afstemmen.uitleg")}</p>
            {tLijst("routes.planning.afstemmen.vragen").map((q) => (<Card key={q}>
                <p className="text-sm font-medium">{q}</p>
                {afst[q] !== undefined ? <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-brand"><AppIcon functie={AFSTEM_ICOON[afst[q]]} maat="sm" vorm="kaal"/>{tLijst("routes.planning.afstemmen.opties")[afst[q]]}</p> : (<div className="mt-2 flex gap-2">
                    {tLijst("routes.planning.afstemmen.opties").map((o, i) => <button key={o} onClick={() => setAfst((a) => ({ ...a, [q]: i }))} className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-md bg-surface py-2 text-xs"><AppIcon functie={AFSTEM_ICOON[i]} maat="sm" vorm="kaal"/>{o}</button>)}
                  </div>)}
              </Card>))}
          </>)}</Sectie>
      </div>
    </AppShell>);
}
