import i18n from "@/i18n";
import { useTranslation } from "react-i18next";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { auth, bestemmingNaInloggen, useAuth, VERIFIEER_SLEUTEL } from "@/lib/auth-store";
import { foutTekst } from "@/lib/api";
import { AuthFormulier, AuthKader, CodeVeld, HoofdKnop, Melding, Titel, WachtwoordEisen, WachtwoordVeld, wachtwoordSterk, secundair, tekstKnop } from "@/components/AuthKader";
const N = "routes.verifieren.";
const WACHT = 30;
export const Route = createFileRoute("/verifieren")({
    validateSearch: z.object({ email: z.string().optional() }),
    head: () => ({ meta: [
            { title: i18n.t("common.metaTitel", { titel: i18n.t(N + "meta.titel") }) },
            { name: "description", content: i18n.t(N + "meta.beschrijving") },
            { name: "robots", content: "noindex" },
        ] }),
    component: Verifieren,
});
function bewaardAdres() {
    try {
        return sessionStorage.getItem(VERIFIEER_SLEUTEL) ?? "";
    }
    catch {
        return "";
    }
}
function Verifieren() {
    const a = useAuth();
    // Bevestigd zonder wachtwoord (bv. in een andere browser): eerst een wachtwoord kiezen, daarna pas verder.
    if (a.gebruiker?.needs_password_reset === true && (a.status === "aan" || a.status === "onboarding"))
        return <WachtwoordKiezen gebruiker={a.gebruiker}/>;
    return <CodeInvoeren />;
}
/** Stap "Kies je wachtwoord" na verify-email met needs_password_reset (custom-auth set-password). */
function WachtwoordKiezen({ gebruiker }) {
    const { t } = useTranslation();
    const nav = useNavigate();
    const [wachtwoord, setWachtwoord] = useState("");
    const [geprobeerd, setGeprobeerd] = useState(false);
    const [bezig, setBezig] = useState(false);
    const [fout, setFout] = useState(null);
    const veldFout = !wachtwoordSterk(wachtwoord) ? t(N + "wachtwoord.fout") : fout === "WEAK_PASSWORD" ? foutTekst("WEAK_PASSWORD") : null;
    const versturen = async () => {
        setGeprobeerd(true);
        setFout(null);
        if (!wachtwoordSterk(wachtwoord))
            return;
        setBezig(true);
        try {
            const g = await auth.setPassword(wachtwoord);
            nav(bestemmingNaInloggen(g));
        }
        catch (e) {
            if (e?.code === "FORBIDDEN") {
                // Al ingesteld (bv. in een ander venster): de server weet het beter, opnieuw ophalen.
                const g = await auth.refreshMe();
                if (g && !g.needs_password_reset) {
                    nav(bestemmingNaInloggen(g));
                    return;
                }
            }
            setFout(e?.code ?? "SERVER");
            setBezig(false);
        }
    };
    const uitloggen = async () => {
        await auth.logout();
        nav({ to: "/welkom", replace: true });
    };
    const algemeen = fout && fout !== "WEAK_PASSWORD" ? foutTekst(fout) : null;
    return (<AuthKader>
      <AuthFormulier onSubmit={versturen} onderaan={<>
          <HoofdKnop bezig={bezig} bezigTekst={t(N + "wachtwoord.bezig")}>{t(N + "wachtwoord.knop")}</HoofdKnop>
          <button type="button" className={tekstKnop} disabled={bezig} onClick={uitloggen}>{t(N + "wachtwoord.uitloggen")}</button>
        </>}>
        <Titel uitleg={t(N + "wachtwoord.uitleg", { email: gebruiker?.email ?? "" })}>{t(N + "wachtwoord.titel")}</Titel>
        <WachtwoordVeld label={t(N + "wachtwoord.label")} value={wachtwoord} onChange={(e) => { setWachtwoord(e.target.value); if (fout)
            setFout(null); }} autoComplete="new-password" autoFocus fout={geprobeerd || fout === "WEAK_PASSWORD" ? veldFout : null}/>
        <WachtwoordEisen wachtwoord={wachtwoord}/>
        {algemeen ? <Melding>{algemeen}</Melding> : null}
      </AuthFormulier>
    </AuthKader>);
}
function CodeInvoeren() {
    const { t } = useTranslation();
    const nav = useNavigate();
    const zoek = Route.useSearch();
    const email = zoek.email || bewaardAdres();
    const [code, setCode] = useState("");
    const [bezig, setBezig] = useState(false);
    const [fout, setFout] = useState(null);
    const [opnieuw, setOpnieuw] = useState(null); // null | "bezig" | "verstuurd"
    const [wacht, setWacht] = useState(WACHT);
    useEffect(() => {
        if (wacht <= 0)
            return;
        const id = window.setTimeout(() => setWacht((w) => w - 1), 1000);
        return () => window.clearTimeout(id);
    }, [wacht]);
    const versturen = async () => {
        if (code.length !== 6) {
            setFout("LENGTE");
            return;
        }
        setBezig(true);
        setFout(null);
        try {
            const g = await auth.verifyEmail(email, code);
            try {
                sessionStorage.removeItem(VERIFIEER_SLEUTEL);
            }
            catch { /* geen opslag */ }
            // needs_password_reset: Verifieren toont nu zelf de stap "Kies je wachtwoord".
            if (g?.needs_password_reset)
                return;
            nav(bestemmingNaInloggen(g));
        }
        catch (e) {
            setFout(e.code ?? "SERVER");
            setBezig(false);
        }
    };
    const stuurOpnieuw = async () => {
        setOpnieuw("bezig");
        setFout(null);
        try {
            await auth.resendCode(email, "verify");
            setOpnieuw("verstuurd");
            setWacht(WACHT);
            setCode("");
        }
        catch (e) {
            setOpnieuw(null);
            setFout(e.code ?? "SERVER");
        }
    };
    if (!email)
        return (<AuthKader terug={() => nav({ to: "/welkom" })}>
        <div className="flex-1 pt-6"><Titel uitleg={t(N + "geenEmail")}>{t(N + "titel")}</Titel></div>
        <button type="button" className={secundair} onClick={() => nav({ to: "/registreren" })}>{t(N + "naarRegistreren")}</button>
      </AuthKader>);
    const codeFout = fout === "LENGTE" ? t(N + "fout.lengte") : ["CODE_INVALID", "CODE_EXPIRED", "TOO_MANY_ATTEMPTS"].includes(fout) ? foutTekst(fout) : null;
    return (<AuthKader terug={() => nav({ to: "/registreren", search: { email } })}>
      <AuthFormulier onSubmit={versturen} onderaan={<>
          <HoofdKnop bezig={bezig} bezigTekst={t(N + "bezig")} disabled={code.length !== 6}>{t(N + "knop")}</HoofdKnop>
          <button type="button" className={tekstKnop} disabled={opnieuw === "bezig" || wacht > 0} onClick={stuurOpnieuw}>
            {opnieuw === "bezig" ? t(N + "opnieuwBezig") : wacht > 0 ? t(N + "opnieuwOver", { n: wacht }) : t(N + "opnieuw")}
          </button>
        </>}>
        <Titel uitleg={t(N + "uitleg", { email })}>{t(N + "titel")}</Titel>
        <CodeVeld label={t(N + "code")} hint={t(N + "hint")} waarde={code} onWaarde={(c) => { setCode(c); if (fout)
            setFout(null); }} autoFocus fout={codeFout}/>
        {opnieuw === "verstuurd" ? <Melding soort="info">{t(N + "verstuurd", { email })}</Melding> : null}
        {fout && !codeFout ? <Melding>{foutTekst(fout)}</Melding> : null}
      </AuthFormulier>
    </AuthKader>);
}
