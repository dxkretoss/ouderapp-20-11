import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import type { HTMLAttributes, ReactNode } from "react";
import { Assistent } from "@/components/Assistent";
import { AppIcon } from "@/components/AppIcon";
import { gesprekken } from "@/lib/demo-data";
import { useStart } from "@/lib/start-store";
import { isVanOverzicht, vraagHeropen, wisTerug } from "@/lib/terug-store";

// Houdt de bezochte pagina's binnen de app bij, zodat "terug" altijd
// naar een echte app-pagina gaat (ook bij een directe paginalading).
const appGeschiedenis: string[] = [];

export function BackButton({ terug = "/meer" }: { terug?: string }) {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (appGeschiedenis[appGeschiedenis.length - 1] !== pathname) appGeschiedenis.push(pathname);
  return (
    <button
      onClick={() => {
        appGeschiedenis.pop(); // huidige pagina
        const vorige = appGeschiedenis.pop();
        if (vorige) window.history.back();
        else router.navigate({ to: terug });
      }}
      className="knop-kruis mt-1 size-11 shrink-0"
      aria-label="Terug"
    >
      <span className="text-lg leading-none">‹</span>
    </button>
  );
}

const navItems = [
  { to: "/", label: "Home", icoon: "home" },
  { to: "/agenda", label: "Agenda", icoon: "agenda" },
  { to: "/berichten", label: "Berichten", icoon: "berichten" },
  { to: "/kosten", label: "Kosten", icoon: "kosten" },
  { to: "/meer", label: "Menu", icoon: "meer" },
] as const;

const meerPaden = [
  "/meer",
  "/documenten",
  "/kinderen",
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

export function AppShell({ children, breed = false }: { children: ReactNode; breed?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { eigen } = useStart();
  const ongelezen = eigen ? 0 : gesprekken.reduce((s, g) => s + g.ongelezen, 0);

  const isActive = (to: string) => {
    if (to === "/") return pathname === "/";
    if (to === "/meer") return meerPaden.some((p) => pathname.startsWith(p));
    return pathname.startsWith(to);
  };

  return (
    <div className="app-canvas min-h-screen w-full font-body text-ink">
      <div className={`relative mx-auto max-w-md px-5 pb-32 pt-8 ${breed ? "md:max-w-3xl lg:max-w-6xl" : ""}`}>
        {pathname !== "/" && isVanOverzicht() ? (
          <Link to="/" onClick={vraagHeropen} className="mb-3 inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-ink-soft">← Terug naar overzicht</Link>
        ) : null}
        {children}
      </div>

      <nav className="fixed bottom-0 left-1/2 z-20 w-full max-w-md -translate-x-1/2 ">
        <div className="flex items-center justify-between border-t border-border bg-background px-3 pt-2.5 pb-1">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={wisTerug}
              className={`flex flex-col items-center gap-1 border-t-2 px-3 py-1 transition-colors ${isActive(item.to) ? "border-brand/70 text-ink" : "border-transparent text-ink-soft"
                }`}
            >
              <span className="relative">
                <AppIcon functie={item.icoon} vorm="kaal" maat="lg" actief={isActive(item.to)} />
                {item.to === "/berichten" && ongelezen > 0 ? (
                  <span aria-label={`${ongelezen} ongelezen`} className="absolute -right-2 -top-1 grid min-w-4 place-items-center rounded-full bg-brand px-1 text-[11px] font-bold text-primary-foreground">{ongelezen}</span>
                ) : null}
              </span>
              <span
                className={`text-[11px] ${isActive(item.to) ? "font-semibold" : "font-medium"}`}
              >
                {item.label}
              </span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function PageHeader({
  titel,
  subtitel,
  terug = "/meer",
  actie,
}: {
  titel: string;
  subtitel?: string;
  terug?: string;
  actie?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <BackButton terug={terug} />
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight text-ink">{titel}</h1>
        {subtitel ? <p className="mt-1 text-sm text-ink-soft">{subtitel}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2"><Assistent pagina={titel} />{actie}</div>
    </div>
  );
}

export function Card({ children, className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded-lg border border-border bg-card p-4 ${className}`} {...props}>{children}</div>
  );
}
