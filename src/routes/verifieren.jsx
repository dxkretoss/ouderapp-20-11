import i18n from "@/i18n";
import { useTranslation } from "react-i18next";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { auth, bestemmingNaInloggen, VERIFIEER_SLEUTEL } from "@/lib/auth-store";
import { foutTekst } from "@/lib/api";
import { AuthFormulier, AuthKader, CodeVeld, HoofdKnop, Melding, Titel, secundair, tekstKnop } from "@/components/AuthKader";
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
