import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { AppIcon } from "@/components/AppIcon";
import { Badge } from "@/components/ui-kit";
import { markeerGebruikt } from "@/lib/gezag-store";
import { professionals } from "@/lib/demo-data";
import { bereikbareBegeleiders, GEZIN_DOSSIER, useProWerk } from "@/lib/pro-journaal-store";
import { toonDatum } from "@/lib/afspraken-store";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { Chevron, MetChevron } from "@/components/Tekens";
const N = "routes.contact.";
export const Route = createFileRoute("/contact")({
    head: () => ({
        meta: [
            { title: i18n.t("common.metaTitel", { titel: i18n.t("routes.contact.meta.titel") }) },
            { name: "description", content: i18n.t("routes.contact.meta.beschrijving") },
            { property: "og:title", content: i18n.t("common.metaTitel", { titel: i18n.t("routes.contact.meta.titel") }) },
            { property: "og:description", content: i18n.t("routes.contact.meta.ogBeschrijving") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: Contact,
});
// Titel/uitleg via routes.contact.gezamenlijk.<id>; `sinds` is een Nederlandse bronwaarde (getoond via toonDatum).
const startGezamenlijk = [
    { id: "app", status: "actief", sinds: "12 september" },
    { id: "onderwerpen", status: "geen" },
    { id: "verzoeken", status: "geen" },
    { id: "pro", status: "geen" },
];
function Groep({ titel, children }) {
    return (<section className="mt-6">
      <h2 className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">{titel}</h2>
      <div className="mt-2 divide-y divide-border rounded-md border border-border bg-card">{children}</div>
    </section>);
}
function Rij({ to, i, t, u }) {
    return (<Link to={to} onClick={() => markeerGebruikt("/contact")} className="flex min-h-14 items-center gap-3 px-3 py-3">
      <AppIcon functie={i} maat="md"/>
      <span className="flex-1"><span className="block text-sm font-semibold">{t}</span><span className="block text-xs text-ink-soft">{u}</span></span>
      <Chevron className="size-4 text-ink-soft"/>
    </Link>);
}
// Alleen tonen als een actieve professional volgens de bestaande rechten via de app bereikbaar is.
// Op dit moment heeft geen enkele betrokken professional toegang tot Berichten, dus deze rij blijft verborgen.
const organisatie = (naam) => professionals.find((p) => p.naam.startsWith(naam))?.organisatie;
function Contact() {
    const { t } = useTranslation();
    const werk = useProWerk();
    const bereikbaar = bereikbareBegeleiders(GEZIN_DOSSIER, werk);
    const [gezamenlijk, setGezamenlijk] = useState(startGezamenlijk);
    const [nachtrust, setNachtrust] = useState(false);
    const [van, setVan] = useState("21:00");
    const [tot, setTot] = useState("08:00");
    const [bewerkNacht, setBewerkNacht] = useState(false);
    return (<AppShell>
      <PageHeader titel={t(N + "titel")} subtitel={t(N + "subtitel")} terug="/extra-ondersteuning"/>
      <div className="mt-5 divide-y divide-border rounded-md border border-border bg-card">
        <Rij to="/gesprekken" i="bellen" t={t(N + "bellen")} u={t(N + "bellenUitleg")}/>
        <a href="#afspraken-contact" className="flex min-h-14 items-center gap-3 px-3 py-3"><AppIcon functie="berichten" maat="md"/><span className="flex-1"><span className="block text-sm font-semibold">{t(N + "afspraken")}</span><span className="block text-xs text-ink-soft">{t(N + "afsprakenUitleg")}</span></span><Chevron className="size-4 text-ink-soft"/></a>
        {bereikbaar.length >= 3 ? <Rij to="/begeleider-gesprek" i="ondersteuning" t={t(N + "begeleider")} u={t(N + "begeleiderUitleg")}/> : bereikbaar.map((p) => (<Link key={p.id} to="/begeleider-gesprek" search={{ pro: p.id }} onClick={() => markeerGebruikt("/contact")} className="flex min-h-14 items-center gap-3 px-3 py-3">
            <AppIcon functie="ondersteuning" maat="md"/>
            <span className="flex-1"><span className="block text-sm font-semibold">{t(N + "contactMet", { naam: p.naam })}</span><span className="block text-xs text-ink-soft">{[p.rol, organisatie(p.naam)].filter(Boolean).join(" · ")}</span></span>
            <Chevron className="size-4 text-ink-soft"/>
          </Link>))}
      </div>

      <div id="afspraken-contact"/>
      <Groep titel={t(N + "groepGedeeld")}>
        <p className="px-3 pt-3 text-xs text-ink-soft">{t(N + "geldtPas")}</p>
        {gezamenlijk.map((a) => (<div key={a.id} className="px-3 py-3">
            <p className="text-sm font-semibold">{t(N + `gezamenlijk.${a.id}.titel`)}</p>
            <p className="text-[11px] font-semibold text-ink-soft">{t(N + "gezamenlijkLabel")}</p>
            <p className="mt-0.5 text-xs">{t(N + `gezamenlijk.${a.id}.uitleg`)}</p>
            {a.status === "actief" ? (<Link to="/afspraken" className="mt-1 flex min-h-11 items-center justify-between text-xs"><Badge toon="info">{t(N + "actiefSinds", { datum: toonDatum(a.sinds) })}</Badge><Chevron className="size-4 text-ink-soft"/></Link>) : a.status === "voorstel" ? (<div className="mt-1"><Badge toon="klaar">{t(N + "wachtJoris")}</Badge></div>) : (<button onClick={() => setGezamenlijk((l) => l.map((x) => (x.id === a.id ? { ...x, status: "voorstel" } : x)))} className="mt-1 flex min-h-11 items-center text-xs font-semibold text-brand"><MetChevron>{t(N + "voorstellenJoris")}</MetChevron></button>)}
          </div>))}
      </Groep>

      <Groep titel={t(N + "alleenJou")}>
        <div className="relative px-3 py-3">
          <p className="pr-12 text-sm font-semibold">{t(N + "nachtDempen")}</p>
          <p className="text-[11px] font-semibold text-ink-soft">{t(N + "alleenJou")}</p>
          <button onClick={() => setBewerkNacht(!bewerkNacht)} aria-label={t(N + "nachtrustAanpassen")} className="absolute right-2 top-2 inline-flex size-11 items-center justify-center rounded-full text-ink-soft hover:bg-muted"><AppIcon functie="notitie" maat="sm" vorm="kaal"/></button>
          <p className="mt-0.5 text-xs">{nachtrust ? `${van} – ${tot}` : t(N + "staatUit")}</p>
          {bewerkNacht ? (<div className="mt-2 space-y-2">
              <label className="flex min-h-11 items-center justify-between text-sm">{t(N + "dempen")}<input type="checkbox" checked={nachtrust} onChange={(e) => setNachtrust(e.target.checked)} className="size-5 accent-[var(--color-brand)]"/></label>
              <div className="flex gap-2 text-sm">
                <input type="time" value={van} onChange={(e) => setVan(e.target.value)} className="flex-1 rounded-xl bg-surface px-3 py-2" aria-label={t(N + "vanaf")}/>
                <input type="time" value={tot} onChange={(e) => setTot(e.target.value)} className="flex-1 rounded-xl bg-surface px-3 py-2" aria-label={t(N + "tot")}/>
              </div>
              <p className="text-[11px] text-ink-soft">{t(N + "nietsVoorJoris")}</p>
            </div>) : null}
        </div>
      </Groep>
      <p className="mt-4 text-xs text-ink-soft">{t(N + "voetnoot")}</p>
    </AppShell>);
}
