import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { BewerkPotlood } from "@/components/ui-kit";
import { IK } from "@/lib/pro-journaal-store";
import { proKijkers, proToegangBakker } from "@/lib/export-rechten";
import { AppShell, BackButton, PageHeader } from "@/components/AppShell";
import { VoorOuders } from "@/components/pro/VoorOuders";
import { useStart } from "@/lib/start-store";
import { useTranslation } from "react-i18next";
import i18n, { taalLocale } from "@/i18n";
import { Chevron, Vinkje } from "@/components/Tekens";
const N = "routes.ondersteuning.";
export const Route = createFileRoute("/ondersteuning")({
    head: () => ({
        meta: [
            { title: i18n.t("common.metaTitel", { titel: i18n.t("routes.ondersteuning.meta.titel") }) },
            { name: "description", content: i18n.t("routes.ondersteuning.meta.beschrijving") },
            { property: "og:title", content: i18n.t("common.metaTitel", { titel: i18n.t("routes.ondersteuning.meta.titel") }) },
            { property: "og:description", content: i18n.t("routes.ondersteuning.meta.ogBeschrijving") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: Ondersteuning,
});
/** Wat een professional kan zien komt alleen uit de bestaande toegangslijst (export-rechten), nooit uit functie of organisatie. */
const betrokken = [
    { id: "bakker", naam: IK, get functie() { return i18n.t(N + "functieMediator"); }, organisatie: "Mediationpraktijk Midden", toegang: proToegangBakker, vanaf: proKijkers["bakker"].vanaf },
];
// Onderdeel-ids uit export-rechten; labels via routes.ondersteuning.onderdeel.<id>.
const alleOnderdelen = ["Zorgregeling", "Planning", "Documenten", "Communicatie", "Afspraken", "Besluiten", "Kosten"];
const onderdeelLabel = (o) => i18n.t(N + `onderdeel.${o}`);
function Ondersteuning() {
    const { t } = useTranslation();
    const router = useRouter();
    const [open, setOpen] = useState(null);
    const eigen = !!useStart().eigen;
    if (eigen)
        return <AppShell>
    <PageHeader titel={t(N + "titel")} subtitel={t(N + "subtitel")} terug="/extra-ondersteuning"/>
    <p className="mt-5 text-sm text-ink-soft">{t(N + "eigenLeeg")}</p>
    <p className="mt-3 text-sm text-ink-soft">{t(N + "eigenCo")}</p>
  </AppShell>;
    const hoofd = betrokken[0];
    const toonToegang = () => { setOpen(hoofd.id); setTimeout(() => document.getElementById("toegang")?.scrollIntoView({ behavior: "smooth" }), 50); };
    return (<AppShell>
      <div className="flex items-center gap-3">
        <BackButton terug="/meer"/>
        <h1 className="lora min-w-0 flex-1 text-[32px] leading-tight">{t(N + "titel")}</h1>
        <BewerkPotlood onClick={() => router.navigate({ to: "/professionals" })} label={t(N + "toegangAanpassen")}/>
      </div>
      <p className="mt-1.5 text-[14.5px] text-ink-soft">{t(N + "intro", { naam: hoofd.naam })}</p>

      <div className="mt-4"><VoorOudersAkkoord /></div>

      <section className={`${GLAS} mt-3 p-4`}>
        <div className="flex items-center gap-3">
          <span className="grid size-[52px] shrink-0 place-items-center rounded-full bg-brand text-xl font-black text-primary-foreground" aria-hidden>{hoofd.naam[0]}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-black">{hoofd.naam}</p>
            <p className="text-[13px] font-semibold text-ink-soft">{hoofd.functie} · {hoofd.organisatie}</p>
            <p className="text-xs text-ink-soft">{t(N + "betrokkenSinds", { datum: new Date(`${hoofd.vanaf}T00:00`).toLocaleDateString(taalLocale(), { day: "numeric", month: "long" }) })}</p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Link to="/begeleider-gesprek" className="flex h-[46px] flex-1 items-center justify-center rounded-full bg-brand text-sm font-black text-primary-foreground">{t(N + "gezamenlijkBericht")}</Link>
          <button onClick={() => (open === hoofd.id ? setOpen(null) : toonToegang())} aria-expanded={open === hoofd.id} className="flex h-[46px] flex-1 items-center justify-center rounded-full border border-white/95 bg-white/75 text-sm font-black text-[#2F4A3A]">{t(N + "watZiet", { naam: hoofd.naam })}</button>
        </div>
      </section>

      {open === hoofd.id ? (<section id="toegang" className={`${GLAS} mt-3 p-4`}>
          <p className="text-[17px] font-black">{t(N + "watZiet", { naam: hoofd.naam })}</p>
          <p className="text-[13px] font-semibold text-ink-soft">{t(N + "samenGekozen")}</p>
          <p className="mt-3 text-xs font-black uppercase tracking-[0.09em] text-ink-soft">{t(N + "wel")}</p>
          <ul>{alleOnderdelen.filter((o) => hoofd.toegang.includes(o)).map((o) => <li key={o} className="flex gap-2.5 border-b border-[#E9E1D5] py-2 text-[14.5px] last:border-0"><Vinkje className="mt-[3px] size-4 text-[#3F5747]"/>{onderdeelLabel(o)}</li>)}</ul>
          <p className="mt-3 text-xs font-black uppercase tracking-[0.09em] text-ink-soft">{t(N + "niet")}</p>
          <ul>{[...alleOnderdelen.filter((o) => !hoofd.toegang.includes(o)).map((o) => onderdeelLabel(o)), t(N + "gesprekkenCo"), t(N + "eigenNotities")].map((t) => <li key={t} className="flex gap-2.5 border-b border-[#E9E1D5] py-2 text-[14.5px] last:border-0"><span aria-hidden className="w-4 font-black text-ink-soft">–</span>{t}</li>)}</ul>
          <Link to="/professionals" className="mt-3 flex h-[46px] items-center justify-center rounded-full border border-white/95 bg-white/75 text-sm font-black text-[#2F4A3A]">{t(N + "toegangAanpassen")}</Link>
        </section>) : null}

      <div className="mt-3 flex items-start gap-2.5 px-1">
        <AppIcon functie="slot" maat="sm" vorm="kaal"/>
        <p className="text-[13.5px] leading-snug text-[#2F4A3A]">{t(N + "coPrive", { naam: hoofd.naam })}</p>
      </div>

      <div className="mt-5"><VoorOudersRest /></div>

      <Link to="/extra-ondersteuning" className={`${GLAS} mt-3 flex items-center px-4 py-3.5`}>
        <span className="min-w-0 flex-1"><span className="block text-[15.5px] font-black">{t(N + "extraHouvast")}</span><span className="block text-xs text-ink-soft">{t(N + "extraHouvastUitleg")}</span></span>
        <Chevron className="size-4 text-ink-soft"/>
      </Link>
      <p className="mt-5 text-center text-xs text-ink-soft">{t(N + "voorbeeld", { naam: hoofd.naam })}</p>
    </AppShell>);
}
const GLAS = "rounded-[22px] border border-white/85 bg-white/60";
const VoorOudersAkkoord = () => <VoorOuders dossier="bakker" ouder="Sanne" deel="akkoord"/>;
const VoorOudersRest = () => <VoorOuders dossier="bakker" ouder="Sanne" deel="rest"/>;
