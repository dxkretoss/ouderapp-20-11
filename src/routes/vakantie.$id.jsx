import { VakantieFormulier, Reistoestemming } from "@/components/AgendaVakanties";
import { Button } from "@/components/ui/button";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useBevestigPopup } from "@/lib/feedback";
import { AppShell, Card, PageHeader } from "@/components/AppShell";
import { VoorstelIntrekken } from "@/components/VoorstelIntrekken";
import { RustigTip, useKeuzeTeksten } from "@/components/RustigTip";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { useVakanties, vakantieLijst, vakantiesGeladen, stelVerdelingVoor, accepteerVakantie, trekVakantieIn, wijsVakantieAf, vraagMeerTijdVakantie } from "@/lib/vakantie-store";
import { Chevron } from "@/components/Tekens";
export const Route = createFileRoute("/vakantie/$id")({
    // De lijst komt van de server; bij een directe link is die er misschien nog niet — de pagina wacht daar zelf op.
    loader: ({ params }) => {
        const v = vakantieLijst().find((x) => x.id === params.id);
        return v ? { naam: v.naam, periode: v.periode } : null;
    },
    head: ({ loaderData }) => ({
        meta: [
            { title: i18n.t("routes.vakantieId.meta.titel", { naam: loaderData?.naam ?? i18n.t("routes.vakantieId.meta.vakantie") }) },
            { name: "description", content: i18n.t("routes.vakantieId.meta.beschrijving", { naam: loaderData?.naam ?? i18n.t("routes.vakantieId.meta.dezeVakantie") }) },
            { property: "og:title", content: i18n.t("routes.vakantieId.meta.titel", { naam: loaderData?.naam ?? i18n.t("routes.vakantieId.meta.vakantie") }) },
            { property: "og:description", content: i18n.t("routes.vakantieId.meta.ogBeschrijving") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    notFoundComponent: () => <NietGevonden />,
    component: VakantiePagina,
});
function NietGevonden() {
    const { t } = useTranslation();
    return (<AppShell><PageHeader titel={t("routes.vakantieId.nietGevonden.titel")} terug="/planning"/><p className="mt-4 text-sm text-ink-soft"><Trans i18nKey="routes.vakantieId.nietGevonden.tekst" components={{ link: <Link to="/planning" className="text-brand underline"/> }}/></p></AppShell>);
}
function VakantiePagina() {
    const { t } = useTranslation();
    const { id } = Route.useParams();
    const v = useVakanties().find((x) => x.id === id);
    const k = useKeuzeTeksten();
    const [melding, setMelding] = useState("");
    const [wijzig, setWijzig] = useState(false);
    useBevestigPopup(melding);
    if (!v)
        return vakantiesGeladen() ? <NietGevonden /> : <AppShell><p className="mt-6 text-sm text-ink-soft">{t("common.laden")}</p></AppShell>;
    const status = v.status === "ingetrokken" ? t("routes.vakantieId.status.ingetrokken") : v.status === "afgesproken" ? t("routes.vakantieId.status.afgesproken") : v.status === "voorstel" ? (v.van === "Sanne" ? t("routes.vakantieId.status.verstuurd") : t("routes.vakantieId.status.vanAnder")) : t("routes.vakantieId.nietGeregeld");
    return (<AppShell>
      <PageHeader titel={v.naam} subtitel={v.periode} terug="/planning"/>
      <div className="mt-4 space-y-3 pb-8">
        <Card>
          <p className="text-xs text-ink-soft">{t("routes.vakantieId.bijWie")}</p>
          <p className="font-display text-lg font-bold">{v.ouder === "Sanne" ? t("routes.vakantieId.bijJou") : v.ouder === "Joris" ? t("routes.vakantieId.bijAnder") : v.ouder === "Samen" ? t("routes.vakantieId.samen") : t("routes.vakantieId.nietGeregeld")}</p>
          <p className="mt-1 text-sm">{status}</p>
          {v.status !== "afgesproken" && <p className="mt-1 text-xs text-ink-soft">{t("routes.vakantieId.totAkkoord")}</p>}
          {v.status === "open" && (<div className="mt-3 flex gap-2">
              {["Sanne", "Joris", "Samen"].map((o) => (<button key={o} onClick={() => stelVerdelingVoor(v.id, o)} className="flex-1 rounded-md bg-surface py-2 text-xs font-medium">{o === "Sanne" ? t("routes.vakantieId.bijJou") : o === "Joris" ? t("routes.vakantieId.bijAnder") : t("routes.vakantieId.samen")}</button>))}
            </div>)}
          {melding ? <p role="status" className="mt-2 text-sm font-semibold text-brand">{melding}</p> : null}
          {v.status === "voorstel" && v.van && v.van !== "Sanne" && (<div className="mt-3 grid gap-2 text-xs font-semibold">
              <button onClick={() => { if (accepteerVakantie(v.id))
            setMelding(t("routes.vakantieId.melding.akkoord")); }} className="min-h-11 rounded-md bg-brand text-primary-foreground">{t("common.akkoord")}</button>
              <button onClick={() => setWijzig(true)} className="min-h-11 rounded-md border border-border">{t("common.anderVoorstel")}</button>
              <button onClick={() => { if (wijsVakantieAf(v.id))
            setMelding(t("routes.vakantieId.melding.nietAkkoord")); }} className="min-h-11 rounded-md border border-border text-ink-soft">{t("common.nietAkkoord")}</button>
              {!v.meerTijd ? <button onClick={() => { if (vraagMeerTijdVakantie(v.id))
            setMelding(t("routes.vakantieId.melding.meerTijd")); }} className="min-h-11 rounded-md border border-border text-ink-soft">{t("common.meerTijdNodig")}</button> : <p className="text-xs font-normal text-ink-soft">{t("routes.vakantieId.meerTijdGevraagd")}</p>}
            </div>)}
          {v.status !== "afgesproken" ? <div className="mt-2"><RustigTip moment="vakantie"/></div> : null}
          {v.status === "voorstel" && v.van === "Sanne" && (<div className="mt-3 flex gap-2 text-xs">
              <VoorstelIntrekken onBevestig={() => trekVakantieIn(v.id)}/>

            </div>)}
        </Card>
        {v.status === "afgesproken" ? <Button className="min-h-11" variant="outline" onClick={() => setWijzig(true)}>{t("routes.vakantieId.wijzigen")}</Button> : null}
        {v.afgesproken ? <p className="text-sm text-ink-soft">{t("routes.vakantieId.oorspronkelijk", { periode: v.afgesproken.periode })}</p> : null}
        {v.buitenland ? <Reistoestemming vakantie={v}/> : null}
        {wijzig ? <VakantieFormulier bestaand={v} onSluit={() => setWijzig(false)}/> : null}
        {v.geschiedenis?.length ? <details className="group border-y border-border py-3"><summary className="flex list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden min-h-11 text-sm font-semibold"><Chevron className="size-4 shrink-0 group-open:rotate-90"/>{t("routes.vakantieId.geschiedenis")}</summary>{v.geschiedenis.map((g, i) => <p key={i} className="py-2 text-xs text-ink-soft">{g.datum.slice(0, 10)} · {g.door === "Sanne" ? t("common.jij") : t("routes.vakantieId.deAndereOuder")} · {g.actie} · {g.velden.periode}</p>)}</details> : null}
        {v.details && (<Card>
            <p className="text-xs text-ink-soft">{t("routes.vakantieId.reis")}</p>
            <p className="text-sm">{v.details}</p>
          </Card>)}
        <Card>
          <p className="mb-2 font-display font-bold">{t("routes.vakantieId.voorbereiden")}</p>
          <div className="grid gap-2 text-sm">
            <Link to="/agenda" className="rounded-md bg-surface px-3 py-2">{t("routes.vakantieId.links.agenda")}</Link>
            <Link to="/taken" className="rounded-md bg-surface px-3 py-2">{t("routes.vakantieId.links.taken")}</Link>
            <Link to="/kosten" className="rounded-md bg-surface px-3 py-2">{t("routes.vakantieId.links.kosten")}</Link>
          </div>
        </Card>
      </div>
    </AppShell>);
}
