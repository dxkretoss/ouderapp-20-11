import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useStart, leeftijdTekst } from "@/lib/start-store";
import { KindSheet } from "@/components/EersteHome";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { ProfielBeeld } from "@/components/ProfielBeeld";
import { Chevron } from "@/components/Tekens";
import { laadKring, useKring, persoonLabel, rolNaam } from "@/lib/kring-store";
export const Route = createFileRoute("/kinderen/")({
    head: () => ({
        meta: [
            { title: i18n.t("routes.kinderenIndex.meta.titel") },
            { name: "description", content: i18n.t("routes.kinderenIndex.meta.beschrijving") },
            { property: "og:title", content: i18n.t("routes.kinderenIndex.meta.titel") },
            { property: "og:description", content: i18n.t("routes.kinderenIndex.meta.ogBeschrijving") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: Kinderen,
});
function Kinderen() {
    const { t } = useTranslation();
    const st = useStart();
    const kring = useKring();
    const betrokkenen = kring.personen.filter((p) => !p.ingetrokken && st.kinderen.some((k) => p.rechten[k.id]));
    const [kindOpen, setKindOpen] = useState(false);
    useEffect(() => { laadKring(); }, []);
    // Een aangemeld account is altijd het eigen gezin (geen voorbeeldgezin meer).
    return (<AppShell>
        <PageHeader titel={t("routes.kinderenIndex.titel")} subtitel={t("routes.kinderenIndex.subtitel")}/>
        <div className="mt-6 divide-y divide-border border-y border-border">
          {st.kinderen.map((k) => (<Link key={k.id} to="/kinderen/$kindId" params={{ kindId: k.id }} className="flex min-h-14 items-center gap-4 py-3">
              <ProfielBeeld beeld={k.beeld} naam={k.naam} kleur={k.kleur} maat={48}/>
              <div className="flex-1">
                <p className="font-display text-lg font-bold">{k.naam}</p>
                {leeftijdTekst(k.geboortedatum) ? <p className="text-xs text-ink-soft">{leeftijdTekst(k.geboortedatum)}</p> : null}
              </div>
              <Chevron className="size-5 text-ink-soft"/>
            </Link>))}
        </div>
        {!st.kinderen.length ? <p className="mt-4 text-sm text-ink-soft">{t("routes.kinderenIndex.leeg")}</p> : null}
        <details className="group mt-6 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-1 text-sm font-semibold text-ink-soft">{t("routes.kinderenIndex.beheren")}<Chevron className="size-4 group-open:rotate-90"/></summary>
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={() => setKindOpen("kind")} className="min-h-[44px] rounded-xl border border-border px-4 text-sm font-semibold">{t("routes.kinderenIndex.kindToevoegen")}</button>
            <button onClick={() => setKindOpen("familie")} className="min-h-[44px] rounded-xl border border-border px-4 text-sm font-semibold">{t("routes.kinderenIndex.familieToevoegen")}</button>
          </div>
          {betrokkenen.length ? <div className="mt-4 divide-y divide-border border-y border-border">
            {betrokkenen.map((p) => <div key={p.id} className="py-3"><p className="text-sm font-semibold">{persoonLabel(p)} <span className="font-normal text-ink-soft">· {rolNaam(p.rol)}</span></p>{p.contact ? <p className="text-xs text-ink-soft">{p.contact}</p> : null}</div>)}
          </div> : null}
        </details>
        <KindSheet open={!!kindOpen} start={kindOpen || "kind"} onClose={() => setKindOpen(false)}/>
      </AppShell>);
}
