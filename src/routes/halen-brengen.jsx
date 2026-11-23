import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell, Card, PageHeader } from "@/components/AppShell";
import { AppIcon } from "@/components/AppIcon";
import { Chevron, MetChevron, MetVinkje, Vinkje } from "@/components/Tekens";
import { IkBenLater } from "@/components/IkBenLater";
import { useKring } from "@/lib/kring-store";
import { useGesprekken, voegCheckInToe, zetModule, zetOnderweg } from "@/lib/gesprekken-store";
import { markeerGebruikt } from "@/lib/gezag-store";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
export const Route = createFileRoute("/halen-brengen")({
    head: () => ({
        meta: [
            { title: i18n.t("common.metaTitel", { titel: i18n.t("routes.halenBrengen.meta.titel") }) },
            { name: "description", content: i18n.t("routes.halenBrengen.meta.beschrijving") },
            { property: "og:title", content: i18n.t("common.metaTitel", { titel: i18n.t("routes.halenBrengen.meta.titel") }) },
            { property: "og:description", content: i18n.t("routes.halenBrengen.meta.ogBeschrijving") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: HalenBrengen,
});
const nu = () => new Date().toTimeString().slice(0, 5);
const UUR = 3600_000;
/** Fase t.o.v. het echte overdrachtsmoment; acties tonen we alleen als je er nu iets mee kunt. */
function faseVan(datum, tijd, nuMs) {
    const t = new Date(`${datum}T${tijd}:00`).getTime();
    if (!Number.isFinite(t))
        return "later";
    const verschil = t - nuMs;
    if (verschil < -2 * UUR)
        return "voorbij";
    const zelfdeDag = new Date(t).toDateString() === new Date(nuMs).toDateString();
    if (zelfdeDag)
        return "vandaag";
    return verschil <= 24 * UUR ? "binnen24" : "later";
}
function HalenBrengen() {
    const { t } = useTranslation();
    const kring = useKring();
    const s = useGesprekken();
    // Dezelfde overdracht als op Home en Overdracht: het eerstvolgende wisselmoment.
    const m = kring.momenten.find((x) => x.soort === "wissel");
    const bevestigd = m ? s.checkins.find((c) => c.momentId === m.id && c.wie === "Sanne") : undefined;
    // Voorbeeld: bekijk hoe het er op de overdrachtsdag uitziet, zonder iets aan de planning te veranderen.
    const [demoMinuten, setDemoMinuten] = useState(null);
    const overdrachtMs = m ? new Date(`${m.datum}T${m.tijd}:00`).getTime() : 0;
    const nuMs = demoMinuten === null ? Date.now() : overdrachtMs - demoMinuten * 60_000;
    const fase = m && m.datum ? faseVan(m.datum, m.tijd, nuMs) : "later";
    const aankomstMogelijk = fase === "vandaag" && Math.abs(overdrachtMs - nuMs) <= 45 * 60_000;
    const onderweg = m ? s.onderweg[m.id] : undefined;
    const bevestig = () => {
        if (!m)
            return;
        markeerGebruikt("/halen-brengen");
        voegCheckInToe({ id: Date.now(), wie: "Sanne", moment: t("routes.halenBrengen.checkinMoment", { dag: m.dag.toLowerCase(), tijd: m.tijd }), momentId: m.id, datum: m.dag, tijd: nu() });
        zetOnderweg(m.id, null);
    };
    return (<AppShell>
      <PageHeader titel={t("routes.halenBrengen.meta.titel")} subtitel={t("routes.halenBrengen.meta.beschrijving")} terug="/extra-ondersteuning"/>

      <div className="mt-5 divide-y divide-border rounded-md border border-border bg-card">
        <Link to="/afspraken" onClick={() => markeerGebruikt("/halen-brengen")} className="flex min-h-14 items-center gap-3 px-3 py-3">
          <AppIcon functie="veiligheid" maat="md"/>
          <span className="flex-1"><span className="block text-sm font-semibold">{t("routes.halenBrengen.afspraken")}</span><span className="block text-xs text-ink-soft">{t("routes.halenBrengen.bekijkAfgesproken")}</span></span>
          <Chevron className="size-4 text-ink-soft"/>
        </Link>
      </div>

      {m && fase !== "voorbij" ? (<section className="mt-6">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">{t("routes.halenBrengen.volgende")}</h2>
          <Card className="mt-2 space-y-3">
            <div>
              <p className="font-semibold">{t("routes.halenBrengen.momentRegel", { dag: fase === "vandaag" ? t("common.vandaag") : m.dag, tijd: m.tijd })}</p>
              <p className="text-sm text-ink-soft">{m.plek}</p>
              {fase !== "later" ? <Link to="/overdracht" className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-brand"><MetChevron>{t("routes.halenBrengen.voorbereiden")}</MetChevron></Link> : null}
            </div>

            {fase === "vandaag" && onderweg ? <p role="status" className="rounded-md bg-brand-soft px-3 py-2 text-sm font-semibold">{t("routes.halenBrengen.onderweg", { wie: onderweg })}</p> : null}

            {bevestigd ? (<p role="status" className="rounded-md bg-brand-soft px-3 py-2 text-sm font-semibold"><MetVinkje>{t("routes.halenBrengen.bevestigd", { tijd: bevestigd.tijd })}</MetVinkje></p>) : aankomstMogelijk ? (!s.aan.gps ? (<div className="space-y-2 rounded-md border border-border p-3 text-sm">
                  <p className="font-semibold">{t("routes.halenBrengen.aankomstBevestigen")}</p>
                  <p className="text-xs font-semibold">{t("routes.halenBrengen.watGebeurt")}</p>
                  <ul className="space-y-1 text-xs text-ink-soft">
                    <li className="flex items-start gap-1.5"><Vinkje className="mt-0.5 size-3.5 text-brand"/><span>{t("routes.halenBrengen.uitleg1")}</span></li>
                    <li className="flex items-start gap-1.5"><Vinkje className="mt-0.5 size-3.5 text-brand"/><span>{t("routes.halenBrengen.uitleg2")}</span></li>
                    <li className="flex items-start gap-1.5"><Vinkje className="mt-0.5 size-3.5 text-brand"/><span>{t("routes.halenBrengen.uitleg3")}</span></li>
                    <li className="flex items-start gap-1.5"><Vinkje className="mt-0.5 size-3.5 text-brand"/><span>{t("routes.halenBrengen.uitleg4")}</span></li>
                  </ul>
                  <button onClick={() => zetModule("gps", true)} className="min-h-11 w-full rounded-full border border-border text-sm font-semibold">{t("routes.halenBrengen.duidelijk")}</button>
                </div>) : (<div className="space-y-1">
                  <button onClick={bevestig} className="min-h-12 w-full rounded-full bg-brand font-semibold text-primary-foreground">{t("routes.halenBrengen.aankomstBevestigen")}</button>
                  <p className="text-[11px] text-ink-soft">{t("routes.halenBrengen.zelfBevestigen")}</p>
                </div>)) : null}

            {!bevestigd && (fase === "vandaag" || fase === "binnen24") ? (<div className="flex flex-wrap items-center gap-x-4 border-t border-border pt-2">
                <IkBenLater momentId={m.id}/>
                {fase === "vandaag" && !onderweg ? (<button onClick={() => { zetOnderweg(m.id, "Sanne", m.tijd); markeerGebruikt("/halen-brengen"); }} className="min-h-11 text-sm font-semibold text-brand">{t("routes.halenBrengen.ikBenOnderweg")}</button>) : null}
              </div>) : null}
            {fase === "vandaag" && onderweg && !bevestigd ? <p className="text-[11px] text-ink-soft">{t("routes.halenBrengen.melding", { wie: onderweg, tijd: m.tijd })}</p> : null}
          </Card>
          {import.meta.env.DEV ? (<details className="group mt-3 text-xs text-ink-soft">
            <summary className="flex list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden min-h-11 cursor-pointer"><Chevron className="size-4 shrink-0 group-open:rotate-90"/>{t("routes.halenBrengen.demo.titel")}</summary>
            <div className="flex flex-wrap gap-2">
              {[[null, t("routes.halenBrengen.demo.nu")], [20 * 60, t("routes.halenBrengen.demo.dagErvoor")], [3 * 60, t("routes.halenBrengen.demo.ochtend")], [10, t("routes.halenBrengen.demo.vlakVoor")], [-180, t("routes.halenBrengen.demo.na")]].map(([v, l]) => (<button key={l} onClick={() => setDemoMinuten(v)} className={`min-h-11 rounded-full border px-3 ${demoMinuten === v ? "border-brand text-ink" : "border-border"}`}>{l}</button>))}
            </div>
          </details>) : null}
        </section>) : (<p className="mt-6 text-sm text-ink-soft">{t("routes.halenBrengen.geenGepland")}</p>)}
    </AppShell>);
}
