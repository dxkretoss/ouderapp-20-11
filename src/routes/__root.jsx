import { QueryClientProvider } from "@tanstack/react-query";
import { isNietInDezeFase } from "@/lib/fase";
import { Outlet, Link, createRootRouteWithContext, useRouter, useRouterState, } from "@tanstack/react-router";
import { Fragment, useEffect } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AppSlot } from "../components/AppSlot";
import { Toaster } from "../components/ui/sonner";
import { SpoedScherm } from "../components/SpoedScherm";
import { OPENBARE_PADEN } from "@/lib/sessie-store";
import { useAuth } from "@/lib/auth-store";
import { useStart } from "@/lib/start-store";
import { laadRol, useRol } from "@/lib/kring-store";
import { AppLaden, Laadbalk } from "@/components/Laden";
function NotFoundComponent() {
    const { t } = useTranslation();
    return (<div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-extrabold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">{t("routes.root.nietGevonden.titel")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("routes.root.nietGevonden.tekst")}
        </p>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            {t("routes.root.naarHome")}
          </Link>
        </div>
      </div>
    </div>);
}
function ErrorComponent({ error, reset }) {
    console.error(error);
    const router = useRouter();
    const { t } = useTranslation();
    useEffect(() => {
        reportLovableError(error, { boundary: "tanstack_root_error_component" });
    }, [error]);
    return (<div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t("routes.root.fout.titel")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("routes.root.fout.tekst")}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button onClick={() => {
            router.invalidate();
            reset();
        }} className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            {t("routes.root.fout.opnieuw")}
          </button>
          <a href="/" className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent">
            {t("routes.root.naarHome")}
          </a>
        </div>
      </div>
    </div>);
}
export const Route = createRootRouteWithContext()({
    head: () => ({
        meta: [
            { charSet: "utf-8" },
            { name: "viewport", content: "width=device-width, initial-scale=1" },
            { title: i18n.t("routes.root.meta.titel") },
            {
                name: "description",
                content: i18n.t("routes.root.meta.beschrijving"),
            },
            { property: "og:title", content: i18n.t("routes.root.meta.titel") },
            {
                property: "og:description",
                content: i18n.t("routes.root.meta.beschrijving"),
            },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary_large_image" },
        ],
        links: [
            { rel: "stylesheet", href: appCss },
            { rel: "preconnect", href: "https://fonts.googleapis.com" },
            { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
            {
                rel: "stylesheet",
                href: "https://fonts.googleapis.com/css2?family=Nunito+Sans:opsz,wght@6..12,400;6..12,600;6..12,700&family=Nunito:wght@600;700;800;900&family=Lora:ital,wght@1,500&display=swap",
            },
            { rel: "icon", href: "/favicon.png", type: "image/png" },
        ],
    }),
    component: RootComponent,
    notFoundComponent: NotFoundComponent,
    errorComponent: ErrorComponent,
});
function RootComponent() {
    const { queryClient } = Route.useRouteContext();
    const hash = useRouterState({ select: (s) => s.location.hash });
    const pad = useRouterState({ select: (s) => s.location.pathname });
    const router = useRouter();
    // Startpunt van de app: zonder (geldige) sessie, of met onafgemaakte welkomstappen, altijd naar /welkom.
    const auth = useAuth();
    const st = useStart();
    const openbaar = OPENBARE_PADEN.some((p) => pad === p || pad.startsWith(p + "/"));
    // Na bevestigen zonder wachtwoord (needs_password_reset): eerst een wachtwoord kiezen op /verifieren, vóór al het andere.
    const naarWachtwoord = (auth.status === "aan" || auth.status === "onboarding") && auth.gebruiker?.needs_password_reset === true && pad !== "/verifieren";
    const naarWelkom = !naarWachtwoord && !openbaar && (auth.status === "uit" || auth.status === "onboarding");
    // Sessie wordt gecontroleerd, of het gezin van dit account is nog nooit opgehaald: even laden.
    const laden = !openbaar && (auth.status === "laden" || (auth.status === "aan" && st.geladenVoor !== auth.gebruiker?.id));
    const sessie = auth.status === "aan" ? "eigen" : "uit";
    // Alleen kringlid (geen eigen kinderen, geen gekoppelde ouder, wel kringtoegang): alleen de kringweergave.
    // De server beslist (manage-caregivers "role"); tot dat bekend is, geen ouder-app tonen.
    const rol = useRol();
    const misschienVerzorger = !openbaar && auth.status === "aan" && st.geladenVoor === auth.gebruiker?.id && !st.kinderen.length && !st.coOuders?.length;
    const rolBekend = rol.voor === auth.gebruiker?.id;
    useEffect(() => { if (misschienVerzorger)
        laadRol(); }, [misschienVerzorger]);
    const alleenVerzorger = misschienVerzorger && rolBekend && rol.rol === "verzorger";
    const rolLaden = misschienVerzorger && !rolBekend;
    const verzorgerPad = pad === "/verzorger" || pad.startsWith("/verzorger/");
    const naarVerzorger = alleenVerzorger && !verzorgerPad;
    useEffect(() => {
        if (naarWachtwoord)
            router.navigate({ to: "/verifieren", replace: true });
        else if (naarWelkom)
            router.navigate({ to: "/welkom", replace: true });
        else if (naarVerzorger)
            router.navigate({ to: "/verzorger", replace: true });
        else if (isNietInDezeFase(pad))
            router.navigate({ to: "/", replace: true });
    }, [naarWachtwoord, naarWelkom, naarVerzorger, pad, router]);
    const { i18n: taal } = useTranslation();
    // Andere taal: paginatitels opnieuw opbouwen; de key hieronder laat alle schermen opnieuw renderen,
    // zodat ook vertaalde labels uit src/lib (getters met i18n.t) de nieuwe taal tonen.
    useEffect(() => {
        const opnieuw = () => router.invalidate();
        taal.on("languageChanged", opnieuw);
        return () => taal.off("languageChanged", opnieuw);
    }, [router, taal]);
    // De SPA rendert geen <HeadContent/>: zet de titel uit head() van de diepste route zelf.
    const titel = useRouterState({ select: (s) => [...s.matches].reverse().flatMap((m) => m.meta ?? []).find((x) => x?.title)?.title });
    useEffect(() => {
        if (titel)
            document.title = titel;
    }, [titel]);
    // Vanuit zoeken: het gevonden item in beeld brengen en kort laten oplichten.
    useEffect(() => {
        if (!hash.startsWith("item-"))
            return;
        let poging = 0;
        let t = 0;
        const zoek = () => {
            const el = document.getElementById(hash);
            if (!el) {
                if (poging++ < 20)
                    t = window.setTimeout(zoek, 100);
                return;
            }
            el.scrollIntoView({ block: "center" });
            el.classList.add("zoekdoel-aan");
            window.setTimeout(() => el.classList.remove("zoekdoel-aan"), 2500);
        };
        t = window.setTimeout(zoek, 100);
        return () => window.clearTimeout(t);
    }, [hash]);
    return (<QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Fragment key={taal.resolvedLanguage}>
        <Laadbalk />
        {naarWachtwoord || naarWelkom || laden || naarVerzorger || (rolLaden && !verzorgerPad) ? <AppLaden /> : <Outlet />}
        {sessie === "uit" ? null : <AppSlot />}
        {sessie === "uit" || alleenVerzorger ? null : <SpoedScherm />}
      </Fragment>
      <Toaster position="top-center"/>
    </QueryClientProvider>);
}
