import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { start } from "@/lib/start-store";
import { AppLogo } from "@/components/AppLogo";
import { BeeldKiezer } from "@/components/ProfielBeeld";

export const Route = createFileRoute("/welkom")({
  head: () => ({
    meta: [
      { title: "Welkom — Ouderschap & Co" },
      { name: "description", content: "Begin in een paar seconden: je naam, hoe je de app wilt gebruiken, en je ziet meteen je eigen Home." },
      { property: "og:title", content: "Welkom bij Ouderschap & Co" },
      { property: "og:description", content: "Begin licht en vul de rest rustig aan vanuit de app." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Welkom,
});

function Welkom() {
  const nav = useNavigate();
  const [stap, setStap] = useState<0 | 1 | 2>(0);
  const [beeld, setBeeld] = useState<string | undefined>(undefined);
  const [naam, setNaam] = useState("");
  const [gebruik, setGebruik] = useState<"samen" | "zelf">("samen");
  const knop = "mt-6 w-full rounded-xl bg-brand py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40";
  const optie = (actief: boolean) => `w-full rounded-xl border p-3.5 text-left text-sm ${actief ? "border-brand bg-brand-soft" : "border-border bg-surface"}`;

  return (
    <div className="app-canvas flex min-h-screen flex-col items-center justify-center px-6 py-10 font-body text-ink">
      <div className="w-full max-w-md rounded-[2rem] border border-border bg-card p-8">
        <AppLogo className="mx-auto mb-7 w-64 max-w-full" slogan />
        {stap === 0 ? (
          <form onSubmit={(e) => { e.preventDefault(); if (naam.trim()) setStap(2); }}>
            <h1 className="font-display text-2xl font-bold">Fijn dat je er bent.</h1>
            <label className="mt-4 block text-sm text-ink-soft">Hoe mogen we je noemen?
              <input autoFocus value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Voornaam" autoComplete="given-name"
                className="mt-2 w-full rounded-xl border border-border bg-surface px-3 py-3 text-base text-ink outline-none focus:border-brand" />
            </label>
            <button type="submit" disabled={!naam.trim()} className={knop}>Verder</button>
          </form>
        ) : stap === 2 ? (
          <>
            <h1 className="font-display text-2xl font-bold">Een foto of avatar?</h1>
            <p className="mt-1 text-sm text-ink-soft">Helemaal optioneel. Zo herkent de andere ouder je straks wellicht sneller.</p>
            <div className="mt-4"><BeeldKiezer beeld={beeld} naam={naam} onKies={(b) => { if (!b && !beeld) setStap(1); else setBeeld(b); }} /></div>
            {beeld ? <button className={knop} onClick={() => setStap(1)}>Verder</button> : null}
            <button onClick={() => setStap(0)} className="mt-3 block w-full text-center text-xs font-semibold text-ink-soft">Terug</button>
          </>
        ) : (
          <>
            <h1 className="font-display text-2xl font-bold">Hoe wil je de app beginnen?</h1>
            <div className="mt-4 space-y-2">
              <button onClick={() => setGebruik("samen")} className={optie(gebruik === "samen")}>
                <p className="font-semibold">Samen gebruiken</p>
                <p className="text-xs text-ink-soft">Je wilt de app uiteindelijk samen met de andere ouder gebruiken. Uitnodigen kan ook later.</p>
              </button>
              <button onClick={() => setGebruik("zelf")} className={optie(gebruik === "zelf")}>
                <p className="font-semibold">Voor mezelf</p>
                <p className="text-xs text-ink-soft">Je organiseert alles eerst voor jezelf. Je kunt later alsnog iemand uitnodigen.</p>
              </button>
            </div>
            <p className="mt-2 text-xs text-ink-soft">Je kunt dit later aanpassen.</p>
            <button className={knop} onClick={() => { start.begin(naam, gebruik); start.zetOuderBeeld(beeld); nav({ to: "/" }); }}>Naar mijn Home</button>
            <button onClick={() => setStap(2)} className="mt-3 block w-full text-center text-xs font-semibold text-ink-soft">Terug</button>
          </>
        )}
        <Link to="/" onClick={() => start.naarVoorbeeld()} className="mt-4 block text-center text-xs font-semibold text-ink-soft">Eerst het voorbeeldgezin bekijken</Link>
      </div>
    </div>
  );
}
