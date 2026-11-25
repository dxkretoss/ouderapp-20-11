import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell, Card, PageHeader } from "@/components/AppShell";
import { AppIcon } from "@/components/AppIcon";
import { Chevron, MetChevron, MetVinkje, Vinkje } from "@/components/Tekens";
import { IkBenLater } from "@/components/IkBenLater";
import { useWisselMomenten, volgendeVan } from "@/lib/overdracht-store";
import { meldCheckIn, mijnCheckIn, onderwegVoor, useKring, useOphalen } from "@/lib/kring-store";
import { uur } from "@/lib/tijd-tekst";
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
const UUR = 3600_000;
const UITLEG = "halen-brengen-uitleg-gezien";
/** Alleen een weergavevoorkeur op dit apparaat: de uitleg over aankomst bevestigen is gelezen. */
const leesUitleg = () => { try {
    return localStorage.getItem(UITLEG) === "1";
}
catch {
    return false;
} };
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
    useKring();
    const s = useOphalen();
    // Dezelfde overdracht als op Home en Overdracht: het eerstvolgende wisselmoment uit de eigen zorgverdeling.
    const { moment: m } = volgendeVan(useWisselMomenten(21));
    // De fase hangt af van de klok: elke halve minuut opnieuw bekijken.
    const [nuMs, setNuMs] = useState(() => Date.now());
    useEffect(() => { const i = window.setInterval(() => setNuMs(Date.now()), 30_000); return () => window.clearInterval(i); }, []);
    const [uitlegGezien, setUitlegGezien] = useState(leesUitleg);
    const [bezig, setBezig] = useState(false);
    const aankomst = m ? mijnCheckIn(m.id, "aangekomen", s) : undefined;
    const bevestigd = aankomst ? { tijd: new Date(aankomst.op).toTimeString().slice(0, 5) } : undefined;
    const overdrachtMs = m ? new Date(`${m.datum}T${m.tijd || "12:00"}:00`).getTime() : 0;
    const fase = m && m.datum ? faseVan(m.datum, m.tijd || "12:00", nuMs) : "later";
    const aankomstMogelijk = fase === "vandaag" && Math.abs(overdrachtMs - nuMs) <= 45 * 60_000;
    const o = m ? onderwegVoor(m.id, s) : null;
    const onderweg = o?.naam;
    const zelfOnderweg = m ? !!mijnCheckIn(m.id, "onderweg", s) : false;
    const melden = async (soort) => {
        if (!m || bezig)
            return;
        setBezig(true);
        markeerGebruikt("/halen-brengen");
        await meldCheckIn(m, soort);
        setBezig(false);
    };
    const uitlegGelezen = () => {
        try {
            localStorage.setItem(UITLEG, "1");
        }
        catch { /* alleen deze sessie */ }
        setUitlegGezien(true);
    };
    return (<AppShell>
      <PageHeader titel={t("routes.halenBrengen.meta.titel")} subtitel={t("routes.halenBrengen.meta.beschrijving")} terug="/extra-ondersteuning"/>

      <div className="mt-5 divide-y divide-border rounded-md border border-border bg-card">
        <Link to="/afspraken" onClick={() => markeerGebruikt("/halen-brengen")} className="flex min-h-14 items-center gap-3 px-3 py-3">
          <AppIcon functie="veiligheid" maat="md"/>
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{t("routes.halenBrengen.afspraken")}</span><span className="block text-xs text-ink-soft">{t("routes.halenBrengen.bekijkAfgesproken")}</span></span>
          <Chevron className="size-4 shrink-0 text-ink-soft"/>
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

            {fase === "vandaag" && o ? <p role="status" className="rounded-md bg-brand-soft px-3 py-2 text-sm font-semibold">{o.soort === "ik" ? t("components.OnderwegStatus.jij") : o.soort === "ander" ? t("components.OnderwegStatus.andereOuder") : t("routes.halenBrengen.onderweg", { wie: onderweg })}</p> : null}

            {bevestigd ? (<p role="status" className="rounded-md bg-brand-soft px-3 py-2 text-sm font-semibold"><MetVinkje>{t("routes.halenBrengen.bevestigd", { tijd: bevestigd.tijd })}</MetVinkje></p>) : aankomstMogelijk ? (!uitlegGezien ? (<div className="space-y-2 rounded-md border border-border p-3 text-sm">
                  <p className="font-semibold">{t("routes.halenBrengen.aankomstBevestigen")}</p>
                  <p className="text-xs font-semibold">{t("routes.halenBrengen.watGebeurt")}</p>
                  <ul className="space-y-1 text-xs text-ink-soft">
                    <li className="flex items-start gap-1.5"><Vinkje className="mt-0.5 size-3.5 text-brand"/><span>{t("routes.halenBrengen.uitleg1")}</span></li>
                    <li className="flex items-start gap-1.5"><Vinkje className="mt-0.5 size-3.5 text-brand"/><span>{t("routes.halenBrengen.uitleg2")}</span></li>
                    <li className="flex items-start gap-1.5"><Vinkje className="mt-0.5 size-3.5 text-brand"/><span>{t("routes.halenBrengen.uitleg3")}</span></li>
                    <li className="flex items-start gap-1.5"><Vinkje className="mt-0.5 size-3.5 text-brand"/><span>{t("routes.halenBrengen.uitleg4")}</span></li>
                  </ul>
                  <button onClick={uitlegGelezen} className="min-h-11 w-full rounded-full border border-border text-sm font-semibold">{t("routes.halenBrengen.duidelijk")}</button>
                </div>) : (<div className="space-y-1">
                  <button disabled={bezig} onClick={() => melden("aangekomen")} className="min-h-12 w-full rounded-full bg-brand font-semibold text-primary-foreground disabled:opacity-40">{t("routes.halenBrengen.aankomstBevestigen")}</button>
                  <p className="text-[11px] text-ink-soft">{t("routes.halenBrengen.zelfBevestigen")}</p>
                </div>)) : null}

            {!bevestigd && (fase === "vandaag" || fase === "binnen24") ? (<div className="flex flex-wrap items-center gap-x-4 border-t border-border pt-2">
                <IkBenLater moment={m}/>
                {fase === "vandaag" && !zelfOnderweg ? (<button disabled={bezig} onClick={() => melden("onderweg")} className="min-h-11 text-sm font-semibold text-brand disabled:opacity-40">{t("routes.halenBrengen.ikBenOnderweg")}</button>) : null}
              </div>) : null}
            {fase === "vandaag" && zelfOnderweg && !bevestigd ? <p className="text-[11px] text-ink-soft">{t("routes.halenBrengen.meldingVerstuurd", { tijd: m.tijd ? uur(m.tijd) : "" })}</p> : null}
          </Card>
        </section>) : (<p className="mt-6 rounded-xl bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)] px-3 py-3 text-center text-sm text-ink-soft">{t("routes.halenBrengen.geenGepland")}</p>)}
    </AppShell>);
}
