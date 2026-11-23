import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Lock, MailX } from "lucide-react";
import { api, foutTekst } from "@/lib/api";
import { auth, bewaarUitnodiging, useAuth, wisUitnodiging } from "@/lib/auth-store";
import { start } from "@/lib/start-store";
import { bevestig } from "@/lib/feedback";
import { ProfielBeeld } from "@/components/ProfielBeeld";
import { AuthKader, HoofdKnop, Melding, secundair, tekstKnop } from "@/components/AuthKader";
const N = "components.CoOuderUitnodiging.";
/** Status van de uitnodiging → foutcode (zelfde indeling als accept-invitation `assertOpen`). */
function statusCode(u) {
    if (u.status === "revoked" || u.status === "cancelled")
        return "INVITE_CANCELLED";
    if (u.status === "declined" || u.status === "rejected")
        return "INVITE_DECLINED";
    const open = ["sent", "pending", "viewed"].includes(u.status);
    if (u.status === "expired" || (open && u.expires_at && new Date(u.expires_at) < new Date()))
        return "INVITE_EXPIRED";
    // sent/pending/viewed staan open; al het andere (accepted, disconnected) is gebruikt.
    return open ? null : "INVITE_USED";
}
/**
 * Uitnodiging van de andere ouder (`/uitnodiging?token=`): bekijken (publiek) → inloggen of account
 * maken (het token blijft in sessionStorage) → accepteren → Home. Weigeren kan zonder account.
 */
export function CoOuderUitnodiging({ token }) {
    const { t } = useTranslation();
    const nav = useNavigate();
    const a = useAuth();
    const [uitnodiging, setUitnodiging] = useState(null);
    const [fout, setFout] = useState(null); // code die de hele pagina vervangt
    const [actieFout, setActieFout] = useState(null); // code bij accepteren/weigeren
    const [bezig, setBezig] = useState(null); // "accepteren" | "weigeren" | "wissel"
    const [weigerVraag, setWeigerVraag] = useState(false);
    useEffect(() => {
        bewaarUitnodiging(token);
        let weg = false;
        api("accept-invitation", "inspect", { token })
            .then((r) => { if (!weg)
            setUitnodiging(r.invitation); })
            .catch((e) => { if (!weg)
            setFout(e.code ?? "SERVER"); });
        return () => { weg = true; };
    }, [token]);
    const terug = () => nav({ to: a.status === "aan" ? "/" : "/welkom" });
    const accepteren = async () => {
        setBezig("accepteren");
        setActieFout(null);
        try {
            const r = await api("accept-invitation", "accept", { token });
            wisUitnodiging();
            // Wie via een uitnodiging binnenkomt, gebruikt de app samen: de welkomstappen zijn dan klaar.
            if (a.status !== "aan")
                await auth.updateProfile({ onboarding_completed: true, usage_mode: "together" });
            else
                await auth.refreshMe();
            await start.hydrateer();
            bevestig(t(N + "gekoppeld", { naam: r.co_parent?.name ?? "" }));
            nav({ to: "/", replace: true });
        }
        catch (e) {
            const code = e.code ?? "SERVER";
            if (["INVITE_USED", "INVITE_CANCELLED", "INVITE_DECLINED", "INVITE_EXPIRED", "NOT_FOUND"].includes(code)) {
                wisUitnodiging();
                setFout(code);
            }
            else
                setActieFout(code);
            setBezig(null);
        }
    };
    const weigeren = async () => {
        setBezig("weigeren");
        setActieFout(null);
        try {
            await api("accept-invitation", "decline", { token });
            wisUitnodiging();
            setFout("INVITE_DECLINED");
        }
        catch (e) {
            setActieFout(e.code ?? "SERVER");
        }
        setBezig(null);
        setWeigerVraag(false);
    };
    const anderAccount = async () => {
        setBezig("wissel");
        await auth.logout();
        bewaarUitnodiging(token);
        nav({ to: "/inloggen" });
    };
    const code = fout ?? (uitnodiging ? statusCode(uitnodiging) : null);
    // Definitief niet meer bruikbaar: het bewaarde token mag weg (bij netwerk-/serverfout niet).
    useEffect(() => {
        if (code && code !== "SERVER" && code !== "NETWORK")
            wisUitnodiging();
    }, [code]);
    if (code) {
        return (<AuthKader terug={terug}>
        <div className="flex flex-1 flex-col">
          <div className="flex-1 pt-6">
            <MailX className="size-11 text-ink-soft" strokeWidth={1.6} aria-hidden="true"/>
            <h1 className="lora mt-4 text-[30px] leading-tight">{t(N + `status.${code}.titel`, { defaultValue: t(N + "status.NOT_FOUND.titel") })}</h1>
            <p className="mt-2 text-sm text-ink-soft">{t(N + `status.${code}.tekst`, { defaultValue: foutTekst(code) })}</p>
          </div>
          <button type="button" className={secundair} onClick={terug}>{a.status === "aan" ? t(N + "naarHome") : t(N + "naarStart")}</button>
        </div>
      </AuthKader>);
    }
    if (!uitnodiging)
        return (<AuthKader terug={terug}>
        <p className="flex flex-1 items-center justify-center gap-2 text-sm font-semibold text-ink-soft" role="status"><Loader2 className="size-5 animate-spin" aria-hidden="true"/>{t("common.laden")}</p>
      </AuthKader>);
    const van = uitnodiging.from_parent ?? {};
    const kinderen = uitnodiging.children ?? [];
    const namen = kinderen.map((k) => k.name);
    const namenTekst = namen.length <= 1 ? namen[0] ?? "" : `${namen.slice(0, -1).join(", ")} ${t("common.en")} ${namen.at(-1)}`;
    const ingelogd = a.status === "aan" || a.status === "onboarding";
    return (<AuthKader terug={terug}>
      <div className="flex flex-1 flex-col">
        <div className="flex-1 pt-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand">{t(N + "kop")}</p>
          <div className="mt-3 flex items-center gap-3">
            <ProfielBeeld beeld={van.avatar ?? undefined} naam={van.name || "?"} maat={56}/>
            <h1 className="lora min-w-0 text-[28px] leading-tight">{t(N + "titel", { naam: van.name })}</h1>
          </div>
          <p className="mt-3 text-sm text-ink-soft">{t(N + "uitleg", { naam: van.name, kinderen: namenTekst, count: namen.length })}</p>
          {kinderen.length ? <ul className="mt-4 flex flex-wrap gap-2" aria-label={t(N + "kinderen")}>
            {kinderen.map((k) => (<li key={k.id} className="flex min-h-9 items-center gap-2 rounded-full border border-border bg-white/70 py-1 pl-1 pr-3 text-sm">
                <ProfielBeeld beeld={k.avatar ?? undefined} naam={k.name} kleur={k.color_code ?? undefined} maat={28}/>
                <span className="font-semibold">{k.name}</span>
              </li>))}
          </ul> : null}
          <p className="mt-4 text-xs text-ink-soft">{t(N + "voor", { email: uitnodiging.to_email_masked })}</p>
          <div className="mt-5 flex items-start gap-2.5 rounded-[18px] bg-white/60 px-4 py-3 text-xs leading-relaxed text-ink-soft">
            <Lock className="mt-0.5 size-4 shrink-0 text-brand" strokeWidth={1.8} aria-hidden="true"/>
            <span>{t(N + "privacy")}</span>
          </div>
          {ingelogd ? <p className="mt-4 text-xs text-ink-soft">{t(N + "ingelogdAls", { email: a.gebruiker?.email ?? "" })}</p> : null}
          {actieFout === "INVITE_EMAIL_MISMATCH" ? (<Melding>
              <p>{t(N + "mismatch", { email: uitnodiging.to_email_masked, eigen: a.gebruiker?.email ?? "" })}</p>
              <button type="button" onClick={anderAccount} disabled={!!bezig} className="mt-2 min-h-10 text-sm font-extrabold underline-offset-2 hover:underline">{t(N + "anderAccount")}</button>
            </Melding>) : actieFout ? <Melding>{foutTekst(actieFout)}</Melding> : null}
          {weigerVraag ? (<div className="mt-5 rounded-[20px] border border-[#EAD9D2] bg-white/80 p-4 text-sm" role="alert">
              <p className="font-extrabold">{t(N + "weigeren.titel")}</p>
              <p className="mt-1 text-xs text-ink-soft">{t(N + "weigeren.tekst", { naam: van.name })}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setWeigerVraag(false)} className="h-11 rounded-full border border-border text-sm font-bold">{t("common.annuleren")}</button>
                <button type="button" onClick={weigeren} disabled={!!bezig} className="flex h-11 items-center justify-center gap-2 rounded-full bg-[#A4533E] text-sm font-black text-white disabled:opacity-50">{bezig === "weigeren" ? <Loader2 className="size-4 animate-spin" aria-hidden="true"/> : null}{t(N + "weigeren.ja")}</button>
              </div>
            </div>) : null}
        </div>
        <div className="space-y-2.5 pt-4">
          {a.status === "laden" ? <p className="flex h-[54px] items-center justify-center gap-2 text-sm font-semibold text-ink-soft" role="status"><Loader2 className="size-5 animate-spin" aria-hidden="true"/>{t("common.laden")}</p> : ingelogd ? (<HoofdKnop type="button" bezig={bezig === "accepteren"} bezigTekst={t(N + "accepterenBezig")} disabled={!!bezig} onClick={accepteren}>{t(N + "accepteren")}</HoofdKnop>) : (<>
              <HoofdKnop type="button" onClick={() => nav({ to: "/registreren" })}>{t(N + "registreren")}</HoofdKnop>
              <button type="button" className={secundair} onClick={() => nav({ to: "/inloggen" })}>{t(N + "inloggen")}</button>
            </>)}
          {weigerVraag ? null : <button type="button" className={tekstKnop} disabled={!!bezig} onClick={() => setWeigerVraag(true)}>{t(N + "weigerKnop")}</button>}
        </div>
      </div>
    </AuthKader>);
}
