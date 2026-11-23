import i18n from "@/i18n";
import { useTranslation } from "react-i18next";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { auth, bestemmingNaInloggen, leesUitnodiging, VERIFIEER_SLEUTEL } from "@/lib/auth-store";
import { foutTekst } from "@/lib/api";
import { AuthFormulier, AuthKader, geldigEmail, HoofdKnop, Melding, Titel, Veld, WachtwoordVeld, tekstKnop } from "@/components/AuthKader";
const N = "routes.inloggen.";
export const Route = createFileRoute("/inloggen")({
    validateSearch: z.object({ email: z.string().optional() }),
    head: () => ({ meta: [
            { title: i18n.t("common.metaTitel", { titel: i18n.t(N + "meta.titel") }) },
            { name: "description", content: i18n.t(N + "meta.beschrijving") },
            { name: "robots", content: "noindex" },
        ] }),
    component: Inloggen,
});
function Inloggen() {
    const { t } = useTranslation();
    const nav = useNavigate();
    const { email: voorEmail } = Route.useSearch();
    const [email, setEmail] = useState(voorEmail ?? "");
    const [wachtwoord, setWachtwoord] = useState("");
    const [geprobeerd, setGeprobeerd] = useState(false);
    const [bezig, setBezig] = useState(false);
    const [fout, setFout] = useState(null);
    const uitnodiging = !!leesUitnodiging();
    const emailFout = !email.trim() ? t(N + "fout.emailLeeg") : !geldigEmail(email) ? t(N + "fout.emailOngeldig") : null;
    const wachtwoordFout = !wachtwoord ? t(N + "fout.wachtwoordLeeg") : null;
    const versturen = async () => {
        setGeprobeerd(true);
        setFout(null);
        if (emailFout || wachtwoordFout)
            return;
        setBezig(true);
        try {
            const g = await auth.login(email, wachtwoord);
            nav(bestemmingNaInloggen(g));
        }
        catch (e) {
            if (e.code === "NOT_VERIFIED") {
                // De server heeft al een nieuwe code gestuurd.
                const adres = email.trim().toLowerCase();
                try {
                    sessionStorage.setItem(VERIFIEER_SLEUTEL, adres);
                }
                catch { /* geen opslag */ }
                nav({ to: "/verifieren", search: { email: adres } });
                return;
            }
            setFout(e.code ?? "SERVER");
            setBezig(false);
        }
    };
    return (<AuthKader terug={() => nav({ to: "/welkom" })}>
      <AuthFormulier onSubmit={versturen} onderaan={<>
          <HoofdKnop bezig={bezig} bezigTekst={t(N + "bezig")}>{t(N + "knop")}</HoofdKnop>
          <Link to="/registreren" className={tekstKnop}>{t(N + "geenAccount")}</Link>
        </>}>
        <Titel uitleg={t(N + "uitleg")}>{t(N + "titel")}</Titel>
        {uitnodiging ? <Melding soort="info">{t(N + "uitnodiging")}</Melding> : null}
        <Veld label={t(N + "email")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("routes.registreren.emailPlaceholder")} autoComplete="email" inputMode="email" autoFocus fout={geprobeerd ? emailFout : null}/>
        <WachtwoordVeld label={t(N + "wachtwoord")} value={wachtwoord} onChange={(e) => setWachtwoord(e.target.value)} autoComplete="current-password" fout={geprobeerd ? wachtwoordFout : null}/>
        <Link to="/wachtwoord-vergeten" search={geldigEmail(email) ? { email: email.trim() } : {}} className="mt-2 inline-flex min-h-10 items-center text-sm font-bold text-[#3F5747]">{t(N + "vergeten")}</Link>
        {fout ? <Melding>{foutTekst(fout)}</Melding> : null}
      </AuthFormulier>
    </AuthKader>);
}
