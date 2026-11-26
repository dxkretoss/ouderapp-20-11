import i18n from "@/i18n";
import { useTranslation } from "react-i18next";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { auth, useAuth } from "@/lib/auth-store";
import { foutTekst } from "@/lib/api";
import { voordelen } from "@/lib/abonnement";
import { AppLogo } from "@/components/AppLogo";
import { AppIcon } from "@/components/AppIcon";
import { AuthKader, HoofdKnop, Melding, primair, secundair } from "@/components/AuthKader";
import { Chevron, Vinkje } from "@/components/Tekens";
import { BeeldKiezer, ProfielBeeld } from "@/components/ProfielBeeld";
export const Route = createFileRoute("/welkom")({
    head: () => ({
        meta: [
            { title: i18n.t("common.metaTitel", { titel: i18n.t("routes.welkom.meta.titel") }) },
            { name: "description", content: i18n.t("routes.welkom.meta.beschrijving") },
            { property: "og:title", content: i18n.t("routes.welkom.meta.ogTitel") },
            { property: "og:description", content: i18n.t("routes.welkom.meta.ogBeschrijving") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: Welkom,
});
/**
 * Startscherm van de app en de welkomstappen na het verifiëren (foto, samen/alleen; naam alleen als
 * die nog onbekend is). Afronden zet `onboarding_completed` op de server (manage-profile).
 */
function Welkom() {
    const { t } = useTranslation();
    const nav = useNavigate();
    const a = useAuth();
    const g = a.gebruiker;
    const stappen = g?.name ? ["foto", "gebruik"] : ["naam", "foto", "gebruik"];
    const [stap, setStap] = useState("start");
    const [beeld, setBeeld] = useState(undefined);
    const [naam, setNaam] = useState("");
    const [gebruik, setGebruik] = useState("samen");
    const [bezig, setBezig] = useState(false);
    const [fout, setFout] = useState(null);
    const automatisch = useRef(false);
    // Net geverifieerd (of terug met onafgemaakte stappen): meteen verder met de welkomstappen.
    useEffect(() => {
        if (a.status !== "onboarding" || automatisch.current)
            return;
        automatisch.current = true;
        setBeeld(g?.avatar || undefined);
        setGebruik(g?.usage_mode === "solo" ? "zelf" : "samen");
        setStap(g?.name ? "foto" : "naam");
    }, [a.status, g]);
    const index = stappen.indexOf(stap);
    const terug = () => setStap(index <= 0 ? "start" : stappen[index - 1]);
    const naarHome = () => nav({ to: "/", replace: true });
    const doorgaan = () => (a.status === "aan" ? naarHome() : setStap(stappen[0]));
    const anderAccount = async () => {
        if (bezig)
            return;
        setBezig(true);
        try {
            await auth.logout();
        }
        finally {
            window.location.replace("/welkom");
        }
    };
    const afronden = async () => {
        setBezig(true);
        setFout(null);
        try {
            if ((beeld ?? null) !== (g?.avatar ?? null))
                await auth.setAvatar(beeld);
            await auth.updateProfile({ ...(stappen.includes("naam") ? { name: naam.trim() } : {}), usage_mode: gebruik === "zelf" ? "solo" : "together", onboarding_completed: true });
            naarHome();
        }
        catch (e) {
            setFout(e.code ?? "SERVER");
            setBezig(false);
        }
    };
    const voortgang = stap === "start" ? null : stappen.map((s, i) => <span key={s} aria-hidden="true" className={`h-1.5 rounded-full transition-all ${i <= index ? "w-7 bg-brand" : "w-3.5 bg-border"}`}/>);
    return (<AuthKader terug={stap === "start" ? undefined : terug} midden={voortgang}>
        {stap !== "start" ? <p className="sr-only">{t("routes.welkom.stapVan", { n: index + 1, totaal: stappen.length })}</p> : null}

        {stap === "start" ? (<>
            <section className="flex flex-1 flex-col justify-center py-6">
              <AppLogo className="mx-auto" slogan/>
              <ul className="mx-auto mt-9 w-full space-y-3">
                {voordelen.map((v) => (<li key={v.id} className="flex items-center gap-3 rounded-[20px] bg-white/60 px-3.5 py-3">
                    <AppIcon functie={v.functie} maat="md"/>
                    <span className="min-w-0">
                      <span className="block text-sm font-extrabold">{v.titel}</span>
                      <span className="block text-xs leading-snug text-ink-soft">{v.tekst}</span>
                    </span>
                  </li>))}
              </ul>
            </section>
            <div className="space-y-2.5">
              {a.status === "laden" ? (<p className="flex h-[54px] items-center justify-center gap-2 text-sm font-semibold text-ink-soft" role="status"><Loader2 className="size-5 animate-spin" aria-hidden="true"/>{t("common.laden")}</p>) : g ? (<>
                  <p className="pb-1 text-center text-xs font-bold uppercase tracking-[0.12em] text-ink-soft">{t("routes.welkom.welkomTerug")}</p>
                  <button type="button" onClick={doorgaan} disabled={bezig} className={primair}>
                    <span className="shrink-0 rounded-full bg-white p-0.5"><ProfielBeeld beeld={g.avatar ?? undefined} naam={g.name || g.email} maat={28}/></span>
                    <span className="truncate">{t("routes.welkom.doorgaanAls", { naam: g.name || g.email })}</span>
                  </button>
                  <button type="button" onClick={anderAccount} disabled={bezig} className={secundair}>{t("routes.welkom.anderAccount")}</button>
                </>) : (<>
                  <button type="button" onClick={() => nav({ to: "/registreren" })} className={primair}>{t("routes.welkom.aanDeSlag")}<Chevron className="size-5"/></button>
                  <button type="button" onClick={() => nav({ to: "/inloggen" })} className={secundair}>{t("routes.welkom.alAccount")}</button>
                </>)}
            </div>
          </>) : null}

        {stap === "naam" ? (<form className="flex flex-1 flex-col" onSubmit={(e) => { e.preventDefault(); if (naam.trim())
            setStap("foto"); }}>
            <div className="flex-1 pb-8 pt-6">
              <h1 className="lora text-[30px] leading-tight">{t("routes.welkom.fijn")}</h1>
              <label className="mt-6 block text-sm font-semibold text-ink-soft">{t("routes.welkom.naamVraag")}
                <input autoFocus value={naam} onChange={(e) => setNaam(e.target.value)} placeholder={t("routes.welkom.voornaam")} autoComplete="given-name" enterKeyHint="next" className="mt-2 h-14 w-full rounded-2xl border border-border bg-card px-4 text-base text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"/>
              </label>
            </div>
            <button type="submit" disabled={!naam.trim()} className={primair}>{t("routes.welkom.verder")}</button>
          </form>) : null}

        {stap === "foto" ? (<div className="flex flex-1 flex-col">
            <div className="flex-1 pb-8 pt-6">
              <h1 className="lora text-[30px] leading-tight">{g?.name ? t("routes.welkom.foto.titelNaam", { naam: g.name }) : t("routes.welkom.foto.titel")}</h1>
              <p className="mt-2 text-sm text-ink-soft">{t("routes.welkom.foto.uitleg")}</p>
              <div className="mt-6"><BeeldKiezer beeld={beeld} naam={g?.name || naam} onKies={(b) => { if (!b && !beeld)
                setStap("gebruik");
            else
                setBeeld(b); }}/></div>
            </div>
            {beeld ? <button type="button" className={primair} onClick={() => setStap("gebruik")}>{t("routes.welkom.verder")}</button> : null}
          </div>) : null}

        {stap === "gebruik" ? (<div className="flex flex-1 flex-col">
            <div className="flex-1 pb-8 pt-6">
              <h1 className="lora text-[30px] leading-tight">{t("routes.welkom.gebruik.titel")}</h1>
              <div className="mt-6 space-y-2.5" role="radiogroup">
                {[["samen", "samen", "samenUitleg"], ["zelf", "zelf", "zelfUitleg"]].map(([id, titel, uitleg]) => (<button key={id} type="button" role="radio" aria-checked={gebruik === id} onClick={() => setGebruik(id)} className={`flex w-full items-start gap-3 rounded-[20px] border p-4 text-left transition ${gebruik === id ? "border-2 border-brand bg-white" : "border-border bg-white/60"}`}>
                    <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 ${gebruik === id ? "border-brand bg-brand text-primary-foreground" : "border-ink-soft/40"}`}>{gebruik === id ? <Vinkje className="size-3"/> : null}</span>
                    <span>
                      <span className="block text-[15px] font-extrabold">{t(`routes.welkom.gebruik.${titel}`)}</span>
                      <span className="mt-0.5 block text-xs leading-snug text-ink-soft">{t(`routes.welkom.gebruik.${uitleg}`)}</span>
                    </span>
                  </button>))}
              </div>
              <p className="mt-3 text-xs text-ink-soft">{t("routes.welkom.gebruik.later")}</p>
              {fout ? <Melding>{foutTekst(fout)}</Melding> : null}
            </div>
            <HoofdKnop type="button" bezig={bezig} onClick={afronden}>{t(gebruik === "zelf" ? "routes.welkom.naarHomeSolo" : "routes.welkom.naarHome")}</HoofdKnop>
          </div>) : null}
    </AuthKader>);
}
