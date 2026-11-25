import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useStart, leeftijdTekst } from "@/lib/start-store";
import { KindSheet } from "@/components/EersteHome";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { ProfielBeeld } from "@/components/ProfielBeeld";
import { Chevron, MetChevron } from "@/components/Tekens";
import { AppIcon } from "@/components/AppIcon";
import { Plus } from "lucide-react";
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
const KAART = "rounded-[22px] border border-white/85 bg-white/60";
function Kinderen() {
    const { t } = useTranslation();
    const st = useStart();
    const kring = useKring();
    const betrokkenen = kring.personen.filter((p) => !p.ingetrokken && st.kinderen.some((k) => p.rechten[k.id]));
    const [kindOpen, setKindOpen] = useState(false);
    useEffect(() => { laadKring(); }, []);
    const N = "routes.kinderenIndex.";
    const plusKnop = (<button type="button" onClick={() => setKindOpen("kind")} aria-label={t(N + "kindToevoegen")} className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-primary-foreground shadow-[0_4px_14px_rgba(63,87,71,.25)] active:scale-95">
        <Plus className="size-5" strokeWidth={2.2} aria-hidden="true"/>
      </button>);
    // Een aangemeld account is altijd het eigen gezin (geen voorbeeldgezin meer).
    return (<AppShell>
        <PageHeader titel={t(N + "titel")} subtitel={t(N + "subtitel")} actie={plusKnop}/>

        {st.kinderen.length ? (<section className="mt-6">
            <h2 className="px-1 text-[13px] font-black uppercase tracking-[0.08em] text-ink-soft">{t(N + "kinderenKop")}</h2>
            <div className={`${KAART} mt-2 divide-y divide-[#E9E1D5] px-4`}>
              {st.kinderen.map((k) => (<Link key={k.id} to="/kinderen/$kindId" params={{ kindId: k.id }} className="flex min-h-[72px] items-center gap-3.5 py-3">
                  <ProfielBeeld beeld={k.beeld} naam={k.naam} kleur={k.kleur} maat={48}/>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-[17px] font-bold">{k.naam}</p>
                    <p className="text-[13px] text-ink-soft">{leeftijdTekst(k.geboortedatum) || t(N + "profielAanvullen")}{String(k.id).startsWith("tmp-") ? "" : ` · ${k.samen ? t(N + "samen") : t(N + "solo")}`}</p>
                  </div>
                  <Chevron className="size-4 shrink-0 text-ink-soft"/>
                </Link>))}
              <button type="button" onClick={() => setKindOpen("kind")} className="flex min-h-14 w-full items-center gap-3.5 py-3 text-left">
                <AppIcon functie="toevoegen" maat="md"/>
                <span className="flex-1 text-[15px] font-extrabold text-[#3F5747]">{t(N + "kindToevoegen")}</span>
              </button>
            </div>
          </section>) : (<section className={`${KAART} mt-6 px-6 py-8 text-center`}>
            <AppIcon functie="kinderen" maat="lg" className="mx-auto"/>
            <h2 className="mt-4 font-display text-xl font-bold">{t(N + "leegTitel")}</h2>
            <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-ink-soft">{t(N + "leegTekst")}</p>
            <button type="button" onClick={() => setKindOpen("kind")} className="mx-auto mt-5 flex min-h-12 w-full max-w-xs items-center justify-center gap-2 rounded-full bg-brand px-6 text-[15px] font-black text-primary-foreground shadow-[0_6px_18px_rgba(63,87,71,.22)] active:scale-[.99]">
              <Plus className="size-[18px]" strokeWidth={2.2} aria-hidden="true"/>{t(N + "kindToevoegen")}
            </button>
          </section>)}

        <section className="mt-7">
          <h2 className="px-1 text-[13px] font-black uppercase tracking-[0.08em] text-ink-soft">{t(N + "betrokkenenKop")}</h2>
          <div className={`${KAART} mt-2 divide-y divide-[#E9E1D5] px-4`}>
            {betrokkenen.map((p) => (<div key={p.id} className="flex min-h-14 items-center gap-3.5 py-3">
                <AppIcon functie="persoon" maat="md"/>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-extrabold">{persoonLabel(p)}</p>
                  <p className="truncate text-[13px] text-ink-soft">{[rolNaam(p.rol), p.contact].filter(Boolean).join(" · ")}</p>
                </div>
              </div>))}
            {!betrokkenen.length ? <p className="py-4 text-center text-[13px] leading-relaxed text-ink-soft">{t(N + "betrokkenenLeeg")}</p> : null}
            <button type="button" onClick={() => setKindOpen("familie")} disabled={!st.kinderen.length} className="flex min-h-14 w-full items-center gap-3.5 py-3 text-left disabled:opacity-50">
              <AppIcon functie="toevoegen" maat="md"/>
              <span className="flex-1 text-[15px] font-extrabold text-[#3F5747]">{t(N + "familieToevoegen")}</span>
            </button>
          </div>
          <Link to="/verbonden-personen" className="mt-3 flex min-h-11 w-full items-center justify-center rounded-full border border-border bg-card px-5 text-sm font-extrabold text-[#3F5747]">
            <MetChevron>{t(N + "alleVerbonden")}</MetChevron>
          </Link>
        </section>
        <KindSheet open={!!kindOpen} start={kindOpen || "kind"} onClose={() => setKindOpen(false)}/>
      </AppShell>);
}
