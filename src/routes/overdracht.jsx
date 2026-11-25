import { createFileRoute, Link } from "@tanstack/react-router";
import { SlimmeMeeLijst } from "@/components/SlimmeMeeLijst";
import { OverdrachtFormulier } from "@/components/OverdrachtFormulier";
import { itemsVoor, useOverdracht, useWisselMomenten, volgendeVan } from "@/lib/overdracht-store";
import { VasteRoutines } from "@/components/VasteRoutines";
import { useEffect, useState } from "react";
import { AppShell, Card, PageHeader } from "@/components/AppShell";
import { AppIcon } from "@/components/AppIcon";
import { Chevron, MetChevron, Vinkje } from "@/components/Tekens";
import { IkBenLater } from "@/components/IkBenLater";
import { OnderwegStatus } from "@/components/OnderwegStatus";
import { ProfielBeeld } from "@/components/ProfielBeeld";
import { useStart } from "@/lib/start-store";
import { uur } from "@/lib/tijd-tekst";
import { dt } from "@/lib/agenda-datum";
import { useTranslation } from "react-i18next";
import i18n, { taalLocale } from "@/i18n";
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
    // ?moment=YYYY-MM-DD opent de lijst van dat wisselmoment (ook een voorbije wissel, vanuit de agenda of een melding).
    validateSearch: (s) => ({ moment: typeof s.moment === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.moment) ? s.moment : undefined }),
    component: Overdracht,
});
/** Keuzes uit de overdrachtsnotitie blijven Nederlandse ids; alleen de weergave wordt vertaald. */
const KEUZE = { "Alles goed": "allesGoed", "Medicijn": "medicijn", "Ziek geweest": "ziekGeweest", "Arts of tandarts": "arts", "Goed geslapen": "goedGeslapen", "Onrustig": "onrustig", "Weinig gegeten": "weinigGegeten", "Huiswerk": "huiswerk", "Toets": "toets", "Briefje": "briefje", "Gym": "gym" };
const keuze = (v) => (KEUZE[v] ? i18n.t(`components.OverdrachtFormulier.keuze.${KEUZE[v]}`) : v);
/**
 * Wissel: paklijst, overdracht en terugblik voor het eerstvolgende wisselmoment uit de eigen zorgverdeling.
 * Na een wissel kan de ontvangende ouder bij de vorige wissel nalopen wat er meekwam.
 */
function Overdracht() {
    const { t } = useTranslation();
    const [tab, setTab] = useState("paklijst");
    const odSt = useOverdracht();
    const st = useStart();
    const { moment: gevraagd } = Route.useSearch();
    // Lijsten blijven een maand bewaard: ook voorbije wissels tot zo ver terug zijn te openen.
    const momenten = useWisselMomenten(42, 35);
    const { moment, daarna, vorige } = volgendeVan(momenten);
    const [vorigeTonen, setVorigeTonen] = useState(false);
    const gekozenIndex = gevraagd ? momenten.findIndex((m) => m.id === gevraagd) : -1;
    // Staat de gevraagde wissel niet (meer) in de verdeling maar wel een lijst: toon die lijst.
    const losseLijst = gevraagd && gekozenIndex < 0 ? itemsVoor(odSt, gevraagd) : [];
    const gekozen = gekozenIndex >= 0 ? momenten[gekozenIndex] : losseLijst.length ? {
        id: gevraagd, datum: gevraagd, soort: "wissel", tijd: "", plek: "", kindIds: [...new Set(losseLijst.flatMap((i) => i.kindIds))],
        namen: st.kinderen.filter((k) => losseLijst.some((i) => i.kindIds.includes(k.id))).map((k) => k.naam), naarMij: false,
        dag: dt(gevraagd).toLocaleDateString(taalLocale(), { weekday: "long", day: "numeric", month: "long" }),
    } : null;
    const gekozenDaarna = gekozenIndex >= 0 ? momenten[gekozenIndex + 1] ?? null : null;
    const getoond = gekozen ?? (vorigeTonen && vorige ? vorige : moment);
    const odGedeeld = !!getoond && odSt.gedeeld.some((o) => o.momentId === getoond.id);
    useEffect(() => { if (typeof window !== "undefined" && window.location.hash === "#overdracht")
        setTab("meegeven"); }, []);
    const [filter, setFilter] = useState("alle");
    const logs = [...odSt.gedeeld, ...odSt.ontvangen].sort((a, b) => String(b.gedeeldOp).localeCompare(String(a.gedeeldOp)));
    const zichtbaar = logs.filter((r) => filter === "alle" || r.kindIds.includes(filter));
    const telling = (fn) => zichtbaar.filter(fn).length;
    // Na de wissel: de ontvangende ouder loopt de lijst van de vorige wissel na (tot drie dagen erna).
    const vorigeNalopen = !!vorige && vorige.naarMij && (Date.now() - dt(vorige.datum).getTime()) / 864e5 <= 3 && odSt.items.some((i) => i.momentId === vorige.id && i.ontvangen === undefined);
    const wanneer = getoond ? `${getoond.dag}${getoond.tijd ? ` ${uur(getoond.tijd)}` : ""}` : "";
    return (<AppShell>
      <PageHeader titel={t("routes.overdracht.titel")} subtitel={getoond ? t("routes.overdracht.subtitelMoment", { wanneer }) : t("routes.overdracht.subtitel")}/>
      <nav className="mt-4 flex rounded-full bg-[rgba(226,216,203,.55)] p-1" aria-label={t("routes.overdracht.onderdelen")}>
        {["paklijst", "meegeven", "terugblik"].map((tb) => (<button key={tb} onClick={() => setTab(tb)} aria-pressed={tab === tb} className={`relative flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full text-[15px] ${tab === tb ? "bg-white font-black text-[#3F5747] shadow-[0_2px_8px_rgba(60,50,40,.08)]" : "font-bold text-ink-soft"}`}>
            {tb === "paklijst" ? t("routes.overdracht.tab.paklijst") : tb === "meegeven" ? t("routes.overdracht.tab.overdracht") : t("routes.overdracht.tab.terugblik")}
            {tb === "meegeven" && getoond && !odGedeeld ? <span aria-label={t("routes.overdracht.nogInTeVullen")} className="size-2 rounded-full bg-[#4F6B58]"/> : null}
            {tb === "meegeven" && odGedeeld ? <span role="img" aria-label={t("routes.overdracht.gedeeld")} className="inline-flex"><Vinkje className="size-4"/></span> : null}
          </button>))}
      </nav>

      {tab !== "terugblik" && !getoond ? (<Card className="mt-5 text-sm text-ink-soft">
          <p>{t("routes.overdracht.geenWissel")}</p>
          <Link to="/" className="mt-2 inline-flex min-h-10 items-center font-semibold text-brand"><MetChevron>{t("routes.overdracht.verdelingInstellen")}</MetChevron></Link>
        </Card>) : null}

      {tab === "paklijst" && getoond ? (<>
          {gekozen ? <Link to="/overdracht" search={{}} className="mt-3 inline-flex min-h-10 items-center text-sm font-bold text-brand"><MetChevron>{t("routes.overdracht.naarVolgende")}</MetChevron></Link> : null}
          {!gekozen && vorigeNalopen && !vorigeTonen ? <button onClick={() => setVorigeTonen(true)} className="mt-4 flex w-full items-center gap-3 rounded-[22px] border border-white/85 bg-white/70 px-4 py-3 text-left"><AppIcon functie="overdracht" maat="sm" vorm="kaal"/><span className="min-w-0 flex-1 text-[15px] font-black">{t("routes.overdracht.vorigeNalopen")}</span><Chevron className="size-5 text-ink-soft"/></button> : null}
          {!gekozen && vorigeTonen ? <button onClick={() => setVorigeTonen(false)} className="mt-3 inline-flex min-h-10 items-center text-sm font-bold text-brand"><MetChevron>{t("routes.overdracht.naarVolgende")}</MetChevron></button> : null}
          <SlimmeMeeLijst moment={getoond} daarna={gekozen ? gekozenDaarna : vorigeTonen ? moment : daarna}/>
          <OnderwegStatus momentId={getoond.id}/>
          <IkBenLater moment={getoond}/>
          <Link to="/veranderd" search={{ moment: getoond.id }} className="mt-1 flex min-h-10 items-center px-1 text-sm font-bold text-brand">{t("routes.overdracht.veranderd")}</Link>
          <VasteRoutines />
          {!odGedeeld ? <button onClick={() => setTab("meegeven")} className="mt-4 flex w-full items-center gap-3 rounded-[22px] border-2 border-[#A9BCA8] px-4 py-3 text-left" style={{ background: "linear-gradient(135deg, rgba(220,230,210,.95), rgba(233,239,227,.9))" }}><span className="min-w-0 flex-1"><span className="block text-[16px] font-black text-[#2F4A3A]">{t("routes.overdracht.overdrachtVoorJoris")}</span><span className="block text-sm text-[#3F5747]">{t("routes.overdracht.vulIn")}</span></span><Chevron className="size-5 text-[#3F5747]"/></button> : null}
        </>) : tab === "meegeven" && getoond ? (<OverdrachtFormulier key={getoond.id} momentId={getoond.id} kindIds={getoond.kindIds} aan={t("common.deAndereOuder")} wanneer={wanneer} viaSchool={/school|opvang|childcare|nursery/i.test(getoond.plek ?? "")}/>) : tab === "terugblik" ? (<div className="mt-5 space-y-4">
          <p className="text-sm text-ink-soft">{t("routes.overdracht.terugblikUitleg")}</p>
          {st.kinderen.length > 1 ? <div className="flex flex-wrap gap-2">
            {[{ id: "alle", naam: t("common.alleKinderen") }, ...st.kinderen].map((k) => (<button key={k.id} onClick={() => setFilter(k.id)} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${filter === k.id ? "bg-white shadow-sm" : "bg-surface text-ink-soft"}`}>{k.naam}</button>))}
          </div> : null}
          {zichtbaar.length ? <div className="grid grid-cols-3 gap-2 text-center">
            {[
                { l: t("routes.overdracht.stat.soepel"), n: telling((r) => r.inhoud.gezondheid?.includes("Alles goed")) },
                { l: t("routes.overdracht.stat.onrustig"), n: telling((r) => r.inhoud.slaap?.includes("Onrustig")) },
                { l: t("routes.overdracht.stat.mooi"), n: telling((r) => !!r.inhoud.mooi) },
            ].map((s) => (<Card key={s.l} className="p-3">
                <p className="font-display text-2xl font-bold">{s.n}</p>
                <p className="text-[11px] text-ink-soft">{s.l}</p>
              </Card>))}
          </div> : <p className="text-sm text-ink-soft">{t("routes.overdracht.terugblikLeeg")}</p>}
          {zichtbaar.length ? <p className="text-xs text-ink-soft">{t("routes.overdracht.vanDeLaatste", { n: zichtbaar.length })}</p> : null}
          {zichtbaar.map((r) => {
                const kids = st.kinderen.filter((k) => r.kindIds.includes(k.id));
                const i = r.inhoud;
                return (<Card key={r.id ?? `${r.momentId}-${r.van}`} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="flex">{kids.map((k, n) => <span key={k.id} style={{ marginLeft: n ? -8 : 0 }}><ProfielBeeld beeld={k.beeld} naam={k.naam} kleur={k.kleur} maat={28}/></span>)}</span>
                  <p className="flex-1 text-sm font-semibold">{kids.map((k) => k.naam).join(" & ")} · {dt(r.momentId).toLocaleDateString(taalLocale(), { day: "numeric", month: "short" })}</p>
                  <span className="text-[11px] text-ink-soft">{r.van === "ik" ? t("routes.overdracht.log.vanJou") : t("routes.overdracht.log.vanAnder")}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {[...(i.gezondheid ?? []), ...(i.slaap ?? []), ...(i.school ?? [])].map((x) => (<span key={x} className="rounded-full bg-white/80 px-2 py-0.5">{keuze(x)}</span>))}
                </div>
                {i.gezondheidNotitie || i.schoolNotitie ? <p className="text-sm text-ink-soft">{[i.gezondheidNotitie, i.schoolNotitie].filter(Boolean).join(" · ")}</p> : null}
                {i.mooi ? <p className="flex items-start gap-1.5 text-sm"><AppIcon functie="ster" maat="sm" vorm="kaal" className="mt-0.5 shrink-0"/><span>{i.mooi}</span></p> : null}
                {i.vraag ? <p className="whitespace-pre-wrap text-sm">{i.vraag}</p> : null}
              </Card>);
            })}
        </div>) : null}
    </AppShell>);
}
