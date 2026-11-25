import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { stelNieuweAfspraakVoor, useAfspraken } from "@/lib/afspraken-store";
import { useVoorkeuren, zetVoorkeur } from "@/lib/voorkeuren-store";
import { useGezin } from "@/lib/gezin";
import { AppShell, PageHeader } from "@/components/AppShell";
import { AppIcon } from "@/components/AppIcon";
import { Badge } from "@/components/ui-kit";
import { markeerGebruikt } from "@/lib/gezag-store";
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
// De afspraken over contact zijn echte gedeelde afspraken (onderwerp "Contact" in Afspraken):
// voorstellen gaat via de bestaande afspraken-flow; de status komt van de server.
const CONTACT_AFSPRAKEN = ["app", "onderwerpen", "verzoeken"];
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
function Contact() {
    const { t } = useTranslation();
    const afspraken = useAfspraken();
    const vk = useVoorkeuren();
    const [bezig, setBezig] = useState(null);
    // Met meerdere andere ouders (per kind een andere) geldt een contactafspraak per andere ouder.
    const g = useGezin();
    const [anderId, setAnderId] = useState(null);
    const gekozenAnder = g.coOuders.length > 1 ? (anderId ?? g.coOuders[0]?.id) : null;
    const [bewerkNacht, setBewerkNacht] = useState(false);
    // Nachtrust is een persoonlijke voorkeur (op het account, alle apparaten).
    const nachtrust = !!vk.nachtrustAan;
    const van = vk.nachtrustVan || "21:00";
    const tot = vk.nachtrustTot || "08:00";
    const bijTitel = (id) => afspraken.find((a) => a.titel === t(N + `gezamenlijk.${id}.titel`) && (!gekozenAnder || a.anderId === gekozenAnder) && a.status !== "Gestopt" && a.status !== "Ingetrokken" && a.status !== "Niet doorgegaan");
    const voorstellen = async (id) => {
        setBezig(id);
        await stelNieuweAfspraakVoor({ onderwerp: "Contact", titel: t(N + `gezamenlijk.${id}.titel`), tekst: t(N + `gezamenlijk.${id}.uitleg`), ...(gekozenAnder ? { anderId: gekozenAnder } : {}) });
        setBezig(null);
    };
    return (<AppShell>
      <PageHeader titel={t(N + "titel")} subtitel={t(N + "subtitel")} terug="/extra-ondersteuning"/>
      <div className="mt-5 divide-y divide-border rounded-md border border-border bg-card">
        <a href="#afspraken-contact" className="flex min-h-14 items-center gap-3 px-3 py-3"><AppIcon functie="berichten" maat="md"/><span className="flex-1"><span className="block text-sm font-semibold">{t(N + "afspraken")}</span><span className="block text-xs text-ink-soft">{t(N + "afsprakenUitleg")}</span></span><Chevron className="size-4 text-ink-soft"/></a>
      </div>

      <div id="afspraken-contact"/>
      <Groep titel={t(N + "groepGedeeld")}>
        <p className="px-3 pt-3 text-xs text-ink-soft">{t(N + "geldtPas")}</p>
        {g.coOuders.length > 1 ? (<div className="flex flex-wrap gap-2 px-3 pt-2" role="group" aria-label={t(N + "metWie")}>
            {g.coOuders.map((c) => <button key={c.id} type="button" aria-pressed={gekozenAnder === c.id} onClick={() => setAnderId(c.id)} className={`min-h-9 rounded-full border px-3 py-1.5 text-xs font-semibold ${gekozenAnder === c.id ? "border-brand bg-brand text-primary-foreground" : "border-border bg-card"}`}>{t(N + "met", { naam: c.naam || t("common.deAndereOuder") })}</button>)}
          </div>) : null}
        {CONTACT_AFSPRAKEN.map((id) => {
            const a = bijTitel(id);
            return (<div key={id} className="px-3 py-3">
            <p className="text-sm font-semibold">{t(N + `gezamenlijk.${id}.titel`)}</p>
            <p className="text-[11px] font-semibold text-ink-soft">{t(N + "gezamenlijkLabel")}</p>
            <p className="mt-0.5 text-xs">{t(N + `gezamenlijk.${id}.uitleg`)}</p>
            {a?.status === "Actief" ? (<Link to="/afspraken" search={{ afspraak: a.id }} className="mt-1 flex min-h-11 items-center justify-between text-xs"><Badge toon="info">{a.geldtVanaf ? t(N + "actiefSinds", { datum: toonDatum(a.geldtVanaf) }) : t(N + "actief")}</Badge><Chevron className="size-4 text-ink-soft"/></Link>)
                : a ? (<Link to="/afspraken" search={{ afspraak: a.id }} className="mt-1 flex min-h-11 items-center"><Badge toon="klaar">{t(N + "wachtJoris")}</Badge></Link>)
                    : (<button disabled={bezig === id} onClick={() => voorstellen(id)} className="mt-1 flex min-h-11 items-center text-xs font-semibold text-brand disabled:opacity-50"><MetChevron>{t(N + "voorstellenJoris")}</MetChevron></button>)}
          </div>);
        })}
      </Groep>

      <Groep titel={t(N + "alleenJou")}>
        <div className="relative px-3 py-3">
          <p className="pr-12 text-sm font-semibold">{t(N + "nachtDempen")}</p>
          <p className="text-[11px] font-semibold text-ink-soft">{t(N + "alleenJou")}</p>
          <button onClick={() => setBewerkNacht(!bewerkNacht)} aria-label={t(N + "nachtrustAanpassen")} className="absolute right-2 top-2 inline-flex size-11 items-center justify-center rounded-full text-ink-soft hover:bg-muted"><AppIcon functie="notitie" maat="sm" vorm="kaal"/></button>
          <p className="mt-0.5 text-xs">{nachtrust ? `${van} – ${tot}` : t(N + "staatUit")}</p>
          {bewerkNacht ? (<div className="mt-2 space-y-2">
              <label className="flex min-h-11 items-center justify-between text-sm">{t(N + "dempen")}<input type="checkbox" checked={nachtrust} onChange={(e) => zetVoorkeur("nachtrustAan", e.target.checked)} className="size-5 accent-[var(--color-brand)]"/></label>
              <div className="flex gap-2 text-sm">
                <input type="time" value={van} onChange={(e) => zetVoorkeur("nachtrustVan", e.target.value)} className="flex-1 rounded-xl bg-surface px-3 py-2" aria-label={t(N + "vanaf")}/>
                <input type="time" value={tot} onChange={(e) => zetVoorkeur("nachtrustTot", e.target.value)} className="flex-1 rounded-xl bg-surface px-3 py-2" aria-label={t(N + "tot")}/>
              </div>
              <p className="text-[11px] text-ink-soft">{t(N + "nietsVoorJoris")}</p>
            </div>) : null}
        </div>
      </Groep>
      <p className="mt-4 text-xs text-ink-soft">{t(N + "voetnoot")}</p>
    </AppShell>);
}
