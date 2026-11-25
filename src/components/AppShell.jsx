import { useTranslation } from "react-i18next";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { Assistent } from "@/components/Assistent";
import { AppIcon } from "@/components/AppIcon";
import { useOngelezenTotaal } from "@/lib/berichten-store";
import { useStart } from "@/lib/start-store";
import { useKringMomentenVoeden } from "@/lib/overdracht-store";
import { isVanOverzicht, vraagHeropen, wisTerug } from "@/lib/terug-store";
import { Chevron, MetChevron } from "@/components/Tekens";
// Houdt de bezochte pagina's binnen de app bij, zodat "terug" altijd
// naar een echte app-pagina gaat (ook bij een directe paginalading).
const appGeschiedenis = [];
/** Hoofdschermen uit de onderste balk: daar hoort geen terugknop (zoals in een mobiele app). */
export const TAB_PADEN = ["/", "/agenda", "/berichten", "/kosten", "/boodschappen", "/meer"];
export const isTabPagina = (pathname) => TAB_PADEN.includes(pathname.replace(/\/+$/, "") || "/");
/** De ene terugknop van de app: rond, met een chevron. Ook voor terug binnen een scherm (onClick). */
export function TerugKnop({ onClick, label, className = "" }) {
    const { t } = useTranslation();
    return (<button type="button" onClick={onClick} className={`knop-kruis size-10 shrink-0 active:scale-95 ${className}`} aria-label={label ?? t("common.terug")}>
      <Chevron richting="links" className="size-5"/>
    </button>);
}
export function BackButton({ terug = "/meer" }) {
    const router = useRouter();
    const pathname = useRouterState({ select: (s) => s.location.pathname });
    if (appGeschiedenis[appGeschiedenis.length - 1] !== pathname)
        appGeschiedenis.push(pathname);
    if (isTabPagina(pathname))
        return null;
    return (<TerugKnop onClick={() => {
            appGeschiedenis.pop(); // huidige pagina
            const vorige = appGeschiedenis.pop();
            if (vorige)
                window.history.back();
            else
                router.navigate({ to: terug });
        }}/>);
}
const navItems = [
    { to: "/", id: "home", icoon: "home" },
    { to: "/agenda", id: "agenda", icoon: "agenda" },
    { to: "/berichten", id: "berichten", icoon: "berichten" },
    { to: "/kosten", id: "kosten", icoon: "kosten" },
    { to: "/meer", id: "menu", icoon: "meer" },
];
const meerPaden = [
    "/meer",
    "/evaluatie",
    "/kind-tips",
    "/documenten",
    "/kinderen",
    "/verbonden-personen",
    "/afspraken",
    "/professionals",
    "/instellingen",
    "/zorgregeling",
    "/solo",
    "/welkom",
    "/wissel",
    "/taken",
    "/spullen",
    "/planning",
    "/samen-regelen",
    "/ondersteuning",
    "/extra-ondersteuning",
    "/contact",
    "/halen-brengen",
    "/begeleider-gesprek",
    "/gezag",
    "/beslissingen",
    "/tijdlijn",
    "/exporteren",
    "/gesprekken",
    "/kring",
    "/abonnement",
    "/juridische-hulp",
];
export function AppShell({ children, breed = false }) {
    const { t } = useTranslation();
    const pathname = useRouterState({ select: (s) => s.location.pathname });
    const { eigen } = useStart();
    const ongelezen = useOngelezenTotaal();
    useKringMomentenVoeden();
    const isActive = (to) => {
        if (to === "/")
            return pathname === "/";
        if (to === "/kosten" && pathname.startsWith("/boodschappen"))
            return true;
        if (to === "/meer" && pathname.startsWith("/boodschappen"))
            return false;
        if (to === "/meer")
            return meerPaden.some((p) => pathname.startsWith(p));
        return pathname.startsWith(to);
    };
    return (<div className={`app-canvas min-h-screen w-full font-body text-ink ${breed ? "zonder-kader" : ""}`}>
      <div className={`relative mx-auto max-w-md px-5 ${breed ? "md:max-w-3xl lg:max-w-6xl" : ""}`} style={{ paddingTop: "max(2rem, calc(env(safe-area-inset-top, 0px) + 1rem))", paddingBottom: "calc(6.5rem + env(safe-area-inset-bottom, 0px))" }}>
        {pathname !== "/" && isVanOverzicht() ? (<Link to="/" onClick={vraagHeropen} className="mb-3 inline-flex min-h-9 items-center gap-1 rounded-full bg-muted px-3.5 text-xs font-semibold text-ink-soft"><MetChevron richting="links">{t("components.AppShell.terugOverzicht")}</MetChevron></Link>) : null}
        {children}
      </div>

      <nav aria-label={t("components.AppShell.navLabel")} className="fixed bottom-0 left-1/2 z-20 w-full max-w-md -translate-x-1/2 px-3" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px))" }}>
        <div className="grid grid-cols-5 rounded-[28px] border border-white/70 bg-[color-mix(in_oklab,var(--card)_84%,transparent)] px-1.5 pb-2 pt-2 shadow-[0_14px_34px_-12px_rgba(47,74,58,.38),0_2px_8px_rgba(60,50,40,.06)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10">
          {navItems.map((item) => {
            const actief = isActive(item.to);
            return (<Link key={item.to} to={item.to} onClick={wisTerug} aria-current={actief ? "page" : undefined} className="group flex flex-col items-center gap-1 rounded-2xl py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
              <span className={`relative grid h-8 w-14 place-items-center rounded-full transition-all duration-300 ease-out ${actief ? "scale-100 bg-[#DCE6D6] dark:bg-[color-mix(in_oklab,var(--brand)_28%,transparent)]" : "scale-95 group-hover:bg-[color-mix(in_oklab,var(--foreground)_5%,transparent)] group-active:scale-90"}`}>
                <AppIcon functie={item.icoon} vorm="kaal" maat="lg" actief={actief}/>
                {item.to === "/berichten" && ongelezen > 0 ? (<span aria-label={t("components.AppShell.ongelezen", { count: ongelezen })} className="absolute -right-1 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand px-1 text-[10.5px] font-black leading-none text-primary-foreground ring-2 ring-[var(--card)]">{ongelezen > 9 ? "9+" : ongelezen}</span>) : null}
              </span>
              <span className={`text-[11px] leading-none tracking-[0.01em] transition-colors ${actief ? "font-extrabold text-[#2F4A3A] dark:text-ink" : "font-semibold text-ink-soft"}`}>
                {t(`components.AppShell.nav.${item.id}`)}
              </span>
            </Link>);
        })}
        </div>
      </nav>
    </div>);
}
export function PageHeader({ titel, subtitel, terug = "/meer", actie, zonderZoeken = false, }) {
    return (<div className="flex items-start gap-3">
      <BackButton terug={terug}/>
      <div className="min-w-0 flex-1">
        <h1 className={`lora break-words leading-tight hyphens-auto ${typeof titel === "string" && titel.length > 16 ? "text-[26px]" : "text-[32px]"}`}>{titel}</h1>
        {subtitel ? <p className="mt-1 text-sm text-ink-soft">{subtitel}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{zonderZoeken ? null : <Assistent pagina={titel}/>}{actie}</div>
    </div>);
}
export function Card({ children, className = "", ...props }) {
    return (<div className={`rounded-lg border border-border bg-card p-4 ${className}`} {...props}>{children}</div>);
}
