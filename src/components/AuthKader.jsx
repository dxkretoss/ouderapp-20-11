import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, Eye, EyeOff, Info, Loader2 } from "lucide-react";
import { TALEN, zetTaal } from "@/i18n";
import { TerugKnop } from "@/components/AppShell";
/**
 * Gedeelde opbouw van /welkom, /inloggen, /registreren, /verifieren, /wachtwoord-vergeten en de
 * uitnodiging: volle hoogte mobiele kolom, bovenbalk met terug + taal, inhoud, knop onderaan.
 */
export const primair = "flex h-[54px] w-full items-center justify-center gap-2 rounded-full bg-brand text-base font-black text-primary-foreground shadow-[0_6px_18px_rgba(63,87,71,.22)] transition active:scale-[.99] disabled:opacity-40 disabled:shadow-none";
export const secundair = "flex h-[50px] w-full items-center justify-center gap-2 rounded-full border border-border bg-white/70 text-sm font-extrabold text-ink active:scale-[.99] disabled:opacity-40";
export const tekstKnop = "flex min-h-11 w-full items-center justify-center text-sm font-bold text-[#3F5747] disabled:opacity-50";
const N = "components.AuthKader.";
/** Compacte taalkeuze rechtsboven: al vóór het aanmelden kiezen. */
export function TaalWissel() {
    const { t, i18n: taal } = useTranslation();
    return (<div className="flex rounded-full bg-[rgba(226,216,203,.55)] p-0.5" role="radiogroup" aria-label={t("components.TaalKiezer.titel")}>
      {TALEN.map((x) => (<button key={x.id} type="button" lang={x.id} role="radio" aria-checked={taal.resolvedLanguage === x.id} aria-label={x.naam} onClick={() => zetTaal(x.id)} className={`h-8 min-w-10 rounded-full px-2.5 text-xs font-black uppercase ${taal.resolvedLanguage === x.id ? "bg-white text-[#3F5747] shadow-sm" : "text-ink-soft"}`}>{x.id}</button>))}
    </div>);
}
/** Volle-hoogte kolom. `terug`: functie voor de terugknop (weglaten = geen knop); `midden`: inhoud in de bovenbalk. */
export function AuthKader({ terug, terugLabel, midden, children }) {
    return (<div className="app-canvas min-h-[100dvh] font-body text-ink">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6" style={{ paddingTop: "max(1rem, env(safe-area-inset-top, 0px))", paddingBottom: "max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 1rem))" }}>
        <header className="flex h-14 items-center gap-3">
          {terug ? <TerugKnop onClick={terug} label={terugLabel}/> : <span className="size-10"/>}
          <div className="flex flex-1 justify-center gap-1.5">{midden}</div>
          <TaalWissel/>
        </header>
        {children}
      </div>
    </div>);
}
/** Formulier dat de hoogte vult: velden boven, knoppen onderaan. */
export function AuthFormulier({ onSubmit, children, onderaan }) {
    return (<form noValidate className="flex flex-1 flex-col" onSubmit={(e) => { e.preventDefault(); onSubmit?.(); }}>
      <div className="flex-1 pb-8 pt-6">{children}</div>
      <div className="space-y-2.5 pt-4">{onderaan}</div>
    </form>);
}
export function Titel({ children, uitleg }) {
    return (<>
      <h1 className="lora text-[30px] leading-tight">{children}</h1>
      {uitleg ? <p className="mt-2 text-sm text-ink-soft">{uitleg}</p> : null}
    </>);
}
const invoer = "h-14 w-full rounded-2xl border bg-white/80 px-4 text-base text-ink outline-none focus:ring-2";
/** Tekstveld met label en inline fout (aria-invalid + aria-describedby). */
export function Veld({ label, fout, hint, className = "", rechts, ...props }) {
    const id = useId();
    return (<div className={`mt-5 ${className}`}>
      <label htmlFor={id} className="block text-sm font-semibold text-ink-soft">{label}</label>
      <div className="relative mt-2">
        <input id={id} aria-invalid={fout ? true : undefined} aria-describedby={fout ? `${id}-fout` : hint ? `${id}-hint` : undefined} className={`${invoer} ${rechts ? "pr-14" : ""} ${fout ? "border-[#A4533E] focus:ring-[#A4533E]/20" : "border-border focus:border-brand focus:ring-brand/20"}`} {...props}/>
        {rechts}
      </div>
      {fout ? <p id={`${id}-fout`} className="mt-1.5 flex items-start gap-1.5 text-xs font-semibold text-[#A4533E]"><AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true"/>{fout}</p> : hint ? <p id={`${id}-hint`} className="mt-1.5 text-xs text-ink-soft">{hint}</p> : null}
    </div>);
}
/** Wachtwoord met tonen/verbergen (Eye/EyeOff). */
export function WachtwoordVeld(props) {
    const { t } = useTranslation();
    const [zichtbaar, setZichtbaar] = useState(false);
    return (<Veld type={zichtbaar ? "text" : "password"} {...props} rechts={<button type="button" onClick={() => setZichtbaar((x) => !x)} aria-label={zichtbaar ? t(N + "verberg") : t(N + "toon")} aria-pressed={zichtbaar} className="absolute right-1.5 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full text-ink-soft">
        {zichtbaar ? <EyeOff className="size-5" aria-hidden="true"/> : <Eye className="size-5" aria-hidden="true"/>}
      </button>}/>);
}
/** 6-cijferige code: alleen cijfers, groot en gespatieerd. */
export function CodeVeld({ waarde, onWaarde, ...props }) {
    return (<Veld inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={waarde} onChange={(e) => onWaarde(e.target.value.replace(/\D/g, "").slice(0, 6))} className="[&_input]:text-center [&_input]:font-mono [&_input]:text-2xl [&_input]:tracking-[0.4em]" {...props}/>);
}
/** Melding in de pagina: fout (rood), info (groen). */
export function Melding({ soort = "fout", children }) {
    const fout = soort === "fout";
    const Icoon = fout ? AlertCircle : Info;
    return (<div role={fout ? "alert" : "status"} className={`mt-5 flex items-start gap-2.5 rounded-[18px] border px-4 py-3 text-sm ${fout ? "border-[#EAD9D2] bg-[#F6E7E1] text-[#7A3B2B]" : "border-[#C9D6C3] bg-[#E9EFE3] text-[#3F5747]"}`}>
      <Icoon className="mt-0.5 size-4 shrink-0" aria-hidden="true"/>
      <div className="min-w-0">{children}</div>
    </div>);
}
/** Primaire knop met laadstand. */
export function HoofdKnop({ bezig, bezigTekst, children, type = "submit", disabled, ...props }) {
    return (<button type={type} disabled={disabled || bezig} aria-busy={bezig || undefined} className={primair} {...props}>
      {bezig ? <><Loader2 className="size-5 animate-spin" aria-hidden="true"/>{bezigTekst ?? children}</> : children}
    </button>);
}
/** Wachtwoordregels (zelfde als de server): ≥ 8 tekens, 1 hoofdletter, 1 cijfer of speciaal teken. */
export const wachtwoordEisen = [
    { id: "lengte", test: (p) => p.length >= 8 },
    { id: "hoofdletter", test: (p) => /[A-Z]/.test(p) },
    { id: "cijfer", test: (p) => /[\d\W_]/.test(p) },
];
export const wachtwoordSterk = (p) => wachtwoordEisen.every((e) => e.test(p));
export const geldigEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());
export function WachtwoordEisen({ wachtwoord }) {
    const { t } = useTranslation();
    return (<ul className="mt-2 space-y-1" aria-label={t(N + "eisen.titel")}>
      {wachtwoordEisen.map((e) => {
            const klaar = e.test(wachtwoord);
            return (<li key={e.id} className={`flex items-center gap-2 text-xs ${klaar ? "font-semibold text-[#3F5747]" : "text-ink-soft"}`}>
          <span aria-hidden="true" className={`size-2 rounded-full ${klaar ? "bg-brand" : "bg-border"}`}/>
          {t(N + "eisen." + e.id)}<span className="sr-only">{klaar ? t(N + "eisen.ok") : t(N + "eisen.nietOk")}</span>
        </li>);
        })}
    </ul>);
}
/** Volledige laadweergave (sessie controleren, gezin ophalen, doorsturen): zelfde beeld als het opstartscherm in index.html. */
export function Laden() {
    const { t } = useTranslation();
    return (<div className="app-canvas fixed inset-0 grid place-items-center font-body" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-[18px] motion-safe:animate-in motion-safe:fade-in">
        <img src="/favicon.png" alt="" width={64} height={64} className="size-16 rounded-[20px] bg-[#E9EFE3] p-1 shadow-[0_6px_18px_rgba(63,87,71,.2)]"/>
        <span className="font-display text-xl font-black tracking-tight text-[#2F4A3A] dark:text-ink">{t("common.appNaam")}</span>
        <span aria-hidden="true" className="size-[26px] animate-spin rounded-full border-[3px] border-[rgba(63,87,71,.18)] border-t-[#4F6B58] motion-reduce:[animation-duration:2.4s]"/>
        <span className="text-sm font-semibold text-ink-soft">{t("common.laden")}</span>
      </div>
    </div>);
}
