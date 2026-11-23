import i18n from "@/i18n";
import { useTranslation } from "react-i18next";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { auth, leesUitnodiging, VERIFIEER_SLEUTEL } from "@/lib/auth-store";
import { foutTekst } from "@/lib/api";
import { AuthFormulier, AuthKader, geldigEmail, HoofdKnop, Melding, Titel, Veld, WachtwoordEisen, WachtwoordVeld, wachtwoordSterk, tekstKnop } from "@/components/AuthKader";
const N = "routes.registreren.";
export const Route = createFileRoute("/registreren")({
    validateSearch: z.object({ email: z.string().optional() }),
    head: () => ({ meta: [
            { title: i18n.t("common.metaTitel", { titel: i18n.t(N + "meta.titel") }) },
            { name: "description", content: i18n.t(N + "meta.beschrijving") },
            { name: "robots", content: "noindex" },
        ] }),
    component: Registreren,
});
function Registreren() {
    const { t } = useTranslation();
    const nav = useNavigate();
    const { email: voorEmail } = Route.useSearch();
    const [naam, setNaam] = useState("");
    const [email, setEmail] = useState(voorEmail ?? "");
    const [wachtwoord, setWachtwoord] = useState("");
    const [geprobeerd, setGeprobeerd] = useState(false);
    const [bezig, setBezig] = useState(false);
    const [fout, setFout] = useState(null);
    const uitnodiging = !!leesUitnodiging();
    const fouten = {
        naam: !naam.trim() ? t(N + "fout.naam") : null,
        email: !email.trim() ? t(N + "fout.emailLeeg") : !geldigEmail(email) ? t(N + "fout.emailOngeldig") : fout === "EMAIL_TAKEN" ? foutTekst("EMAIL_TAKEN") : null,
        wachtwoord: !wachtwoordSterk(wachtwoord) ? t(N + "fout.wachtwoord") : fout === "WEAK_PASSWORD" ? foutTekst("WEAK_PASSWORD") : null,
    };
    const toon = (k) => (geprobeerd || (k === "email" && fout === "EMAIL_TAKEN") ? fouten[k] : null);
    const versturen = async () => {
        setGeprobeerd(true);
        setFout(null);
        if (fouten.naam || !geldigEmail(email) || !wachtwoordSterk(wachtwoord))
            return;
        setBezig(true);
        try {
            const r = await auth.register(email, wachtwoord, naam);
            const adres = r.email ?? email.trim().toLowerCase();
            try {
                sessionStorage.setItem(VERIFIEER_SLEUTEL, adres);
            }
            catch { /* geen opslag */ }
            nav({ to: "/verifieren", search: { email: adres } });
        }
        catch (e) {
            setFout(e.code ?? "SERVER");
            setBezig(false);
        }
    };
    const algemeen = fout && fout !== "EMAIL_TAKEN" && fout !== "WEAK_PASSWORD" ? foutTekst(fout) : null;
    return (<AuthKader terug={() => nav({ to: "/welkom" })}>
      <AuthFormulier onSubmit={versturen} onderaan={<>
          <HoofdKnop bezig={bezig} bezigTekst={t(N + "bezig")}>{t(N + "knop")}</HoofdKnop>
          <Link to="/inloggen" className={tekstKnop}>{t(N + "alAccount")}</Link>
        </>}>
        <Titel uitleg={t(N + "uitleg")}>{t(N + "titel")}</Titel>
        {uitnodiging ? <Melding soort="info">{t(N + "uitnodiging")}</Melding> : null}
        <Veld label={t(N + "naam")} value={naam} onChange={(e) => setNaam(e.target.value)} placeholder={t(N + "naamPlaceholder")} autoComplete="given-name" autoFocus fout={toon("naam")}/>
        <Veld label={t(N + "email")} type="email" value={email} onChange={(e) => { setEmail(e.target.value); if (fout === "EMAIL_TAKEN")
            setFout(null); }} placeholder={t(N + "emailPlaceholder")} autoComplete="email" inputMode="email" fout={toon("email")}/>
        {fout === "EMAIL_TAKEN" ? <Link to="/inloggen" className="mt-1 inline-flex min-h-10 items-center text-xs font-extrabold text-[#3F5747]">{t(N + "naarInloggen")}</Link> : null}
        <WachtwoordVeld label={t(N + "wachtwoord")} value={wachtwoord} onChange={(e) => setWachtwoord(e.target.value)} autoComplete="new-password" fout={toon("wachtwoord")}/>
        <WachtwoordEisen wachtwoord={wachtwoord}/>
        {algemeen ? <Melding>{algemeen}</Melding> : null}
      </AuthFormulier>
    </AuthKader>);
}
