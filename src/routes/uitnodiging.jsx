import i18n from "@/i18n";
import { useTranslation } from "react-i18next";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { MetChevron } from "@/components/Tekens";
import { CoOuderUitnodiging } from "@/components/CoOuderUitnodiging";
import { api, foutTekst } from "@/lib/api";
import { auth, bewaarUitnodiging, useAuth, wisUitnodiging } from "@/lib/auth-store";
import { InhoudLaden } from "@/components/Laden";
import { geenRechten, laadRol, rechtenSamenvatting, rolNaam } from "@/lib/kring-store";
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
const KRING_TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * Twee soorten links: `?token=` (de andere ouder, 64 tekens) en `?t=` (iemand uit de kring rond een kind,
 * een uuid). Na inloggen/registreren stuurt de app terug naar `?token=<bewaarde sleutel>`; een uuid daar
 * is dus ook een kring-uitnodiging.
 */
function Uitnodiging() {
    const { token, t } = Route.useSearch();
    if (token && !KRING_TOKEN.test(token))
        return <CoOuderUitnodiging token={token}/>;
    return <KringUitnodiging sleutel={t ?? token}/>;
}
function KringUitnodiging({ sleutel }) {
    const { t } = useTranslation();
    const a = useAuth();
    const nav = useNavigate();
    const [u, setU] = useState(null);
    const [fout, setFout] = useState(null); // code die de pagina vervangt
    const [actieFout, setActieFout] = useState(null);
    const [stap, setStap] = useState("open");
    const [bezig, setBezig] = useState(false);
    useEffect(() => {
        if (!sleutel || !KRING_TOKEN.test(sleutel)) {
            setFout("NOT_FOUND");
            return;
        }
        let weg = false;
        api("manage-caregivers", "get-by-token", { token: sleutel })
            .then((r) => { if (!weg)
            setU(r.invitation); })
            .catch((e) => { if (!weg) {
            setFout(e.code ?? "SERVER");
            if (e.code !== "NETWORK" && e.code !== "SERVER")
                wisUitnodiging();
        } });
        return () => { weg = true; };
    }, [sleutel]);
    const ingelogd = a.status === "aan" || a.status === "onboarding";
    const knop = "flex w-full items-center justify-center gap-2 min-h-12 rounded-full bg-brand py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40";
    const accepteren = async () => {
        setBezig(true);
        setActieFout(null);
        try {
            await api("manage-caregivers", "accept", { token: sleutel });
            wisUitnodiging();
            // Een nieuw account via een kring-uitnodiging heeft geen welkomstappen nodig.
            if (a.status === "onboarding")
                await auth.updateProfile({ onboarding_completed: true });
            // De rol kan nu "alleen kringlid" zijn: opnieuw vragen, zodat de app meteen de kringweergave toont.
            laadRol(true);
            setStap("klaar");
        }
        catch (e) {
            const code = e.code ?? "SERVER";
            if (["INVITE_USED", "INVITE_CANCELLED", "INVITE_EXPIRED", "NOT_FOUND"].includes(code)) {
                wisUitnodiging();
                setFout(code);
            }
            else
                setActieFout(code);
        }
        setBezig(false);
    };
    if (stap === "klaar")
        return (<Kader><h1 className="lora text-[30px] leading-tight">{t("routes.uitnodiging.klaar.titel")}</h1><p className="mt-2 text-sm text-ink-soft">{t("routes.uitnodiging.klaar.tekst", { naam: u?.from_parent?.name || t("routes.uitnodiging.eenOuder") })}</p>
      <Link to="/verzorger" className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold text-brand"><MetChevron>{t("routes.uitnodiging.klaar.naarApp")}</MetChevron></Link></Kader>);
    if (fout)
        return (<Kader><h1 className="lora text-[30px] leading-tight">{t("routes.uitnodiging.ongeldig.titel")}</h1><p className="mt-2 text-sm text-ink-soft">{fout === "NETWORK" || fout === "SERVER" ? foutTekst(fout) : t("routes.uitnodiging.ongeldig.tekst")}</p></Kader>);
    if (!u)
        return <Kader><InhoudLaden hoogte="min-h-[60dvh]"/></Kader>;
    const kids = u.children ?? [];
    // Alleen voor de samenvatting: wat er na bevestigen zichtbaar wordt (de server beslist).
    const p = { uitgenodigd: true, bevestigd: true, ingetrokken: false, periode: { type: "doorlopend" }, rechten: Object.fromEntries(kids.map((k) => [k.id, { ...geenRechten(), ...(u.permissions?.[k.id] ?? {}) }])) };
    return (<Kader>
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand">{t("routes.uitnodiging.kop")}</p>
      <h1 className="lora mt-1 text-[30px] leading-tight">{t("routes.uitnodiging.hoi", { naam: u.name })}</h1>
      <p className="mt-2 text-sm text-ink-soft">{t("routes.uitnodiging.uitgenodigd", { naam: u.from_parent?.name || t("routes.uitnodiging.eenOuder"), rol: rolNaam(u.role).toLowerCase(), kinderen: kids.map((k) => k.name).join(t("routes.uitnodiging.en")) })}</p>
      {u.from_parent?.name ? <p className="mt-1 text-xs text-ink-soft">{t("routes.uitnodiging.door", { naam: u.from_parent.name })}</p> : null}

      {!ingelogd ? (<><p className="mt-6 text-sm">{t("routes.uitnodiging.privacy")}</p>
          {a.status === "laden" ? <p className="mt-4 flex items-center gap-2 text-sm text-ink-soft" role="status"><Loader2 className="size-4 animate-spin" aria-hidden="true"/>{t("common.laden")}</p> : <>
          <button onClick={() => { bewaarUitnodiging(sleutel); nav({ to: "/inloggen" }); }} className={`mt-4 ${knop}`}>{t("routes.uitnodiging.inloggen")}</button>
          <button onClick={() => { bewaarUitnodiging(sleutel); nav({ to: "/registreren" }); }} className="mt-2 w-full rounded-full border border-border py-3 text-sm font-semibold">{t("routes.uitnodiging.registreren")}</button>
          </>}</>) : (<>
          <h2 className="mt-6 text-[11px] font-bold uppercase tracking-[0.14em] text-brand">{t("routes.uitnodiging.teZien")}</h2>
          <div className="mt-1 divide-y divide-border border-y border-border">
            {kids.map((k) => <p key={k.id} className="py-2.5 text-sm"><b>{k.name}</b> · {rechtenSamenvatting(p, k.id)}</p>)}
          </div>
          <p className="mt-3 text-xs text-ink-soft">{t("routes.uitnodiging.ingelogdAls", { email: a.gebruiker?.email ?? "" })}</p>
          {actieFout ? <p role="alert" className="mt-3 text-xs font-semibold text-[#A4533E]">{actieFout === "INVITE_OWN" ? t("routes.uitnodiging.eigenKind") : foutTekst(actieFout)}</p> : null}
          <button disabled={bezig} onClick={accepteren} className={`mt-6 ${knop}`}>{bezig ? <Loader2 className="size-4 animate-spin" aria-hidden="true"/> : null}{t("routes.uitnodiging.bevestigen")}</button>
        </>)}
    </Kader>);
}
function Kader({ children }) {
    return <div className="app-canvas min-h-screen font-body text-ink"><div className="mx-auto max-w-md px-5 py-10">{children}</div></div>;
}
