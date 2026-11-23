import i18n from "@/i18n";
import { useTranslation } from "react-i18next";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { CheckCircle2 } from "lucide-react";
import { auth, bestemmingNaInloggen } from "@/lib/auth-store";
import { foutTekst } from "@/lib/api";
import { AuthFormulier, AuthKader, CodeVeld, geldigEmail, HoofdKnop, Melding, Titel, Veld, WachtwoordEisen, WachtwoordVeld, wachtwoordSterk, tekstKnop } from "@/components/AuthKader";
const N = "routes.wachtwoordVergeten.";
/** Drie stappen: e-mail → code → nieuw wachtwoord, daarna klaar (de server maakt meteen een sessie). */
const STAPPEN = ["email", "code", "wachtwoord"];
export const Route = createFileRoute("/wachtwoord-vergeten")({
    validateSearch: z.object({ email: z.string().optional() }),
    head: () => ({ meta: [
            { title: i18n.t("common.metaTitel", { titel: i18n.t(N + "meta.titel") }) },
            { name: "description", content: i18n.t(N + "meta.beschrijving") },
            { name: "robots", content: "noindex" },
        ] }),
    component: WachtwoordVergeten,
});
function WachtwoordVergeten() {
    const { t } = useTranslation();
    const nav = useNavigate();
    const { email: voorEmail } = Route.useSearch();
    const [stap, setStap] = useState("email");
    const [email, setEmail] = useState(voorEmail ?? "");
    const [code, setCode] = useState("");
    const [wachtwoord, setWachtwoord] = useState("");
    const [herhaal, setHerhaal] = useState("");
    const [geprobeerd, setGeprobeerd] = useState(false);
    const [bezig, setBezig] = useState(false);
    const [fout, setFout] = useState(null);
    const [info, setInfo] = useState(null);
    const [gebruiker, setGebruiker] = useState(null);
    const index = STAPPEN.indexOf(stap);
    const naar = (s) => { setStap(s); setFout(null); setInfo(null); setGeprobeerd(false); };
    const terug = () => (index <= 0 || stap === "klaar" ? nav({ to: "/inloggen" }) : naar(STAPPEN[index - 1]));
    const doe = async (f) => {
        setBezig(true);
        setFout(null);
        try {
            await f();
        }
        catch (e) {
            setFout(e.code ?? "SERVER");
        }
        setBezig(false);
    };
    const emailFout = !email.trim() ? t("routes.inloggen.fout.emailLeeg") : !geldigEmail(email) ? t("routes.inloggen.fout.emailOngeldig") : null;
    const wwFout = !wachtwoordSterk(wachtwoord) ? t("routes.registreren.fout.wachtwoord") : fout === "WEAK_PASSWORD" ? foutTekst(fout) : null;
    const herhaalFout = herhaal !== wachtwoord ? t(N + "fout.nietGelijk") : null;
    const codeFout = ["CODE_INVALID", "CODE_EXPIRED", "TOO_MANY_ATTEMPTS"].includes(fout) ? foutTekst(fout) : null;
    const versturen = () => {
        setGeprobeerd(true);
        if (stap === "email") {
            if (emailFout)
                return;
            return doe(async () => { await auth.requestReset(email); setCode(""); naar("code"); });
        }
        if (stap === "code") {
            if (code.length !== 6)
                return;
            return doe(async () => { await auth.verifyResetCode(email, code); naar("wachtwoord"); });
        }
        if (stap === "wachtwoord") {
            if (wwFout || herhaalFout)
                return;
            return doe(async () => {
                try {
                    const g = await auth.resetPassword(email, code, wachtwoord);
                    setGebruiker(g);
                    naar("klaar");
                }
                catch (e) {
                    // Code inmiddels verlopen of ongeldig: terug naar de codestap.
                    if (["CODE_INVALID", "CODE_EXPIRED", "TOO_MANY_ATTEMPTS"].includes(e.code)) {
                        naar("code");
                        setCode("");
                    }
                    throw e;
                }
            });
        }
    };
    const opnieuw = () => doe(async () => { await auth.resendCode(email, "reset"); setCode(""); setInfo(t(N + "codeOpnieuw", { email: email.trim() })); });
    const midden = stap === "klaar" ? null : STAPPEN.map((s, i) => <span key={s} aria-hidden="true" className={`h-1.5 rounded-full transition-all ${i <= index ? "w-7 bg-brand" : "w-3.5 bg-border"}`}/>);
    if (stap === "klaar")
        return (<AuthKader>
        <div className="flex flex-1 flex-col">
          <div className="flex-1 pt-6">
            <CheckCircle2 className="size-12 text-brand" strokeWidth={1.6} aria-hidden="true"/>
            <div className="mt-4"><Titel uitleg={t(N + "klaar.uitleg")}>{t(N + "klaar.titel")}</Titel></div>
          </div>
          <HoofdKnop type="button" onClick={() => nav(bestemmingNaInloggen(gebruiker))}>{t(N + "klaar.knop")}</HoofdKnop>
        </div>
      </AuthKader>);
    return (<AuthKader terug={terug} midden={midden}>
      <p className="sr-only">{t("routes.welkom.stapVan", { n: index + 1, totaal: STAPPEN.length })}</p>
      <AuthFormulier onSubmit={versturen} onderaan={<>
          <HoofdKnop bezig={bezig} bezigTekst={t(N + `${stap}.bezig`)} disabled={stap === "code" && code.length !== 6}>{t(N + `${stap}.knop`)}</HoofdKnop>
          {stap === "code" ? <>
            <button type="button" className={tekstKnop} disabled={bezig} onClick={opnieuw}>{t(N + "code.opnieuw")}</button>
            <button type="button" className={tekstKnop} onClick={() => naar("email")}>{t(N + "code.anderAdres")}</button>
          </> : null}
        </>}>
        {stap === "email" ? (<>
            <Titel uitleg={t(N + "email.uitleg")}>{t(N + "email.titel")}</Titel>
            <Veld label={t("routes.inloggen.email")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("routes.registreren.emailPlaceholder")} autoComplete="email" inputMode="email" autoFocus fout={geprobeerd ? emailFout : null}/>
          </>) : null}
        {stap === "code" ? (<>
            <Titel uitleg={t(N + "code.uitleg", { email: email.trim() })}>{t(N + "code.titel")}</Titel>
            <CodeVeld label={t("routes.verifieren.code")} hint={t(N + "code.hint")} waarde={code} onWaarde={(c) => { setCode(c); setFout(null); }} autoFocus fout={codeFout}/>
          </>) : null}
        {stap === "wachtwoord" ? (<>
            <Titel uitleg={t(N + "wachtwoord.uitleg")}>{t(N + "wachtwoord.titel")}</Titel>
            <WachtwoordVeld label={t(N + "wachtwoord.nieuw")} value={wachtwoord} onChange={(e) => setWachtwoord(e.target.value)} autoComplete="new-password" autoFocus fout={geprobeerd ? wwFout : null}/>
            <WachtwoordEisen wachtwoord={wachtwoord}/>
            <WachtwoordVeld label={t(N + "wachtwoord.herhaal")} value={herhaal} onChange={(e) => setHerhaal(e.target.value)} autoComplete="new-password" fout={geprobeerd ? herhaalFout : null}/>
          </>) : null}
        {info ? <Melding soort="info">{info}</Melding> : null}
        {fout && !codeFout && fout !== "WEAK_PASSWORD" ? <Melding>{foutTekst(fout)}</Melding> : null}
      </AuthFormulier>
    </AuthKader>);
}
