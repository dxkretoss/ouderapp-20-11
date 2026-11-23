import i18n from "@/i18n";
import { useTranslation } from "react-i18next";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { kinderen } from "@/lib/demo-data";
import { MetChevron } from "@/components/Tekens";
import { CoOuderUitnodiging } from "@/components/CoOuderUitnodiging";
import { bevestigUitnodiging, persoonVoorUitnodiging, rechtenSamenvatting, rolNaam, useKring } from "@/lib/kring-store";
export const Route = createFileRoute("/uitnodiging")({
    validateSearch: z.object({ t: z.string().optional(), token: z.string().optional() }),
    head: () => ({ meta: [
            { title: i18n.t("common.metaTitel", { titel: i18n.t("routes.uitnodiging.meta.titel") }) },
            { name: "description", content: i18n.t("routes.uitnodiging.meta.beschrijving") },
            { property: "og:title", content: i18n.t("common.metaTitel", { titel: i18n.t("routes.uitnodiging.meta.titel") }) },
            { property: "og:description", content: i18n.t("routes.uitnodiging.meta.ogBeschrijving") },
            { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
            { name: "robots", content: "noindex" },
        ] }),
    component: Uitnodiging,
});
/** Twee soorten links: `?token=` (de andere ouder, via de server) en `?t=` (iemand uit de kring rond een kind). */
function Uitnodiging() {
    const { token } = Route.useSearch();
    return token ? <CoOuderUitnodiging token={token}/> : <KringUitnodiging />;
}
function KringUitnodiging() {
    const { t: token } = Route.useSearch();
    const { t } = useTranslation();
    useKring();
    const p = token ? persoonVoorUitnodiging(token) : undefined;
    const [stap, setStap] = useState("open");
    const [email, setEmail] = useState("");
    const [ingelogd, setIngelogd] = useState(false);
    const knop = "w-full rounded-md bg-brand py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40";
    if (stap === "klaar")
        return (<Kader><h1 className="lora text-[30px] leading-tight">{t("routes.uitnodiging.klaar.titel")}</h1><p className="mt-2 text-sm text-ink-soft">{t("routes.uitnodiging.klaar.tekst")}</p>
      <Link to="/verzorger" className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold text-brand"><MetChevron>{t("routes.uitnodiging.klaar.naarApp")}</MetChevron></Link></Kader>);
    if (!p)
        return (<Kader><h1 className="lora text-[30px] leading-tight">{t("routes.uitnodiging.ongeldig.titel")}</h1><p className="mt-2 text-sm text-ink-soft">{t("routes.uitnodiging.ongeldig.tekst")}</p></Kader>);
    const kids = kinderen.filter((k) => p.rechten[k.id]);
    return (<Kader>
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand">{t("routes.uitnodiging.kop")}</p>
      <h1 className="lora mt-1 text-[30px] leading-tight">{t("routes.uitnodiging.hoi", { naam: p.naam })}</h1>
      <p className="mt-2 text-sm text-ink-soft">{t("routes.uitnodiging.uitgenodigd", { rol: rolNaam(p.rol).toLowerCase(), kinderen: kids.map((k) => k.naam).join(t("routes.uitnodiging.en")) })}</p>

      {stap === "open" ? (<><p className="mt-6 text-sm">{t("routes.uitnodiging.privacy")}</p>
          <button onClick={() => setStap("inloggen")} className={`mt-4 ${knop}`}>{t("routes.uitnodiging.inloggen")}</button></>) : null}

      {stap === "inloggen" ? (<><label className="mt-6 block text-xs font-semibold">{t("routes.uitnodiging.email")}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-brand"/></label>
          <button disabled={!/.+@.+\..+/.test(email)} onClick={() => { setIngelogd(true); setStap("bevestig"); }} className={`mt-4 ${knop}`}>{t("common.doorgaan")}</button>
          <p className="mt-2 text-[11px] text-ink-soft">{t("routes.uitnodiging.demo")}</p></>) : null}

      {stap === "bevestig" ? (<>
          <h2 className="mt-6 text-[11px] font-bold uppercase tracking-[0.14em] text-brand">{t("routes.uitnodiging.teZien")}</h2>
          <div className="mt-1 divide-y divide-border border-y border-border">
            {kids.map((k) => <p key={k.id} className="py-2.5 text-sm"><b>{k.naam}</b> · {rechtenSamenvatting({ ...p, bevestigd: true }, k.id)}</p>)}
          </div>
          <button onClick={() => { if (bevestigUitnodiging(p.sleutel, ingelogd))
            setStap("klaar"); }} className={`mt-6 ${knop}`}>{t("routes.uitnodiging.bevestigen")}</button>
        </>) : null}
    </Kader>);
}
function Kader({ children }) {
    return <div className="app-canvas min-h-screen font-body text-ink"><div className="mx-auto max-w-md px-5 py-10">{children}</div></div>;
}
