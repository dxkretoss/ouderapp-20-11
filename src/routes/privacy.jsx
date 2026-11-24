import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useStart } from "@/lib/start-store";
import { laadKring, niveau, onderdelen, periodeTekst, persoonLabel, rechtenSamenvatting, rolNaam, useKring } from "@/lib/kring-store";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
export const Route = createFileRoute("/privacy")({
    head: () => ({
        meta: [
            { title: i18n.t("common.metaTitel", { titel: i18n.t("routes.privacy.meta.titel") }) },
            { name: "description", content: i18n.t("routes.privacy.meta.beschrijving") },
            { property: "og:title", content: i18n.t("common.metaTitel", { titel: i18n.t("routes.privacy.meta.titel") }) },
            { property: "og:description", content: i18n.t("routes.privacy.meta.beschrijving") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: PrivacyOverzicht,
});
/** Afgeleid, alleen lezen: gekoppelde ouders (start-store) en de kring met de rechten zoals de server ze geeft. */
function PrivacyOverzicht() {
    const { t } = useTranslation();
    const { personen } = useKring();
    const kinderen = useStart().kinderen.filter((k) => !String(k.id).startsWith("tmp-"));
    useEffect(() => { laadKring(); }, []);
    const zichtbaar = personen.filter((p) => !p.ingetrokken && !String(p.id).startsWith("tmp-"));
    return (<AppShell>
      <PageHeader titel={t("routes.privacy.meta.titel")} subtitel={t("routes.privacy.subtitel")} terug="/instellingen"/>
      <p className="mt-5 text-sm leading-relaxed text-ink-soft">
        {t("routes.privacy.intro")}
      </p>
      {kinderen.length === 0 ? <p className="mt-7 text-sm text-ink-soft">{t("routes.privacy.geenKinderen")}</p> : null}
      {kinderen.map((k) => {
            // Wie nu echt iets ziet (bevestigd, binnen de periode, met minstens één onderdeel).
            const met = zichtbaar.filter((p) => onderdelen.some((o) => niveau(p, k.id, o.id) !== "geen"));
            const contact = zichtbaar.filter((p) => p.rechten[k.id] && !met.includes(p));
            const ouders = k.ouders ?? [];
            return (<section key={k.id} className="mt-7">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">{k.naam}</h2>
              <Link to="/kring/$kindId" params={{ kindId: k.id }} className="text-xs font-semibold text-brand">{t("routes.privacy.aanpassen")}</Link>
            </div>
            <div className="mt-2 divide-y divide-border border-y border-border">
              {ouders.map((o) => (<div key={o.id} className="py-3">
                  <p className="text-sm font-semibold">{t("common.deAndereOuder")} <span className="font-normal text-ink-soft">· {t("routes.privacy.ouder")}</span></p>
                  <p className="text-xs text-ink-soft">{t("routes.privacy.ouderZiet", { naam: k.naam })}</p>
                </div>))}
              {met.map((p) => (<div key={p.id} className="py-3">
                  <p className="text-sm font-semibold">{persoonLabel(p)} <span className="font-normal text-ink-soft">· {rolNaam(p.rol)}</span></p>
                  <p className="text-xs text-ink-soft">{t("routes.privacy.ziet", { wat: rechtenSamenvatting(p, k.id) })}</p>
                  <p className="text-[11px] text-ink-soft">{periodeTekst(p.periode)}</p>
                </div>))}
              {contact.map((p) => (<div key={p.id} className="py-3">
                  <p className="text-sm font-semibold">{persoonLabel(p)} <span className="font-normal text-ink-soft">· {rolNaam(p.rol)}</span></p>
                  <p className="text-xs text-ink-soft">{p.uitgenodigd !== false && p.bevestigd === false ? t("routes.privacy.nogNietBevestigd") : t("routes.privacy.alleenContact")}</p>
                </div>))}
              {met.length + contact.length + ouders.length === 0 ? <p className="py-3 text-sm text-ink-soft">{t("routes.privacy.alleenJij", { naam: k.naam })}</p> : met.length + contact.length === 0 ? <p className="py-3 text-sm text-ink-soft">{t("routes.privacy.alleenOuders", { naam: k.naam })}</p> : null}
            </div>
          </section>);
        })}
      <section className="mt-7">
        <h2 className="font-display text-lg font-bold">{t("routes.privacy.professionals")}</h2>
        <p className="mt-1 text-xs text-ink-soft">{t("routes.privacy.professionalZiet")}</p>
        <p className="mt-2 border-y border-border py-3 text-sm text-ink-soft">{t("routes.privacy.geenProfessionals")}</p>
      </section>
      <Link to="/juridisch" className="mt-7 block text-center text-xs font-semibold text-brand">{t("routes.privacy.privacyverklaring")}</Link>
    </AppShell>);
}
