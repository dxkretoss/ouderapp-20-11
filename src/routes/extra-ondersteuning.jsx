import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { AppShell, PageHeader } from "@/components/AppShell";
import { AppIcon } from "@/components/AppIcon";
import { CoBadge } from "@/components/CoBadge";
import { CoPrivacy } from "@/components/CoPrivacy";
import { bevestig } from "@/lib/feedback";
import { useVoorkeuren, zetVoorkeur } from "@/lib/voorkeuren-store";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { Chevron, MetChevron } from "@/components/Tekens";
const N = "routes.extraOndersteuning.";
export const Route = createFileRoute("/extra-ondersteuning")({
    validateSearch: z.object({ onderdeel: z.enum(["afspraken", "intro"]).optional() }),
    head: () => ({ meta: [
            { title: i18n.t("common.metaTitel", { titel: i18n.t("routes.extraOndersteuning.meta.titel") }) },
            { name: "description", content: i18n.t("routes.extraOndersteuning.meta.beschrijving") },
            { property: "og:title", content: i18n.t("common.metaTitel", { titel: i18n.t("routes.extraOndersteuning.meta.titel") }) },
            { property: "og:description", content: i18n.t("routes.extraOndersteuning.meta.ogBeschrijving") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ] }),
    component: Extra,
});
// Functie-ids; titel/tekst via routes.extraOndersteuning.mogelijkheid.<id>.
const mogelijkheden = ["berichten", "samen", "afspraak", "geschiedenis", "ondersteuning", "exporteren"];
// Titel/tekst via routes.extraOndersteuning.hulpmiddel.<icoon>.
const hulpmiddelen = [
    { to: "/verhaal", icoon: "berichten", tint: "#E3E0EC" },
    { to: "/extra-ondersteuning", search: { onderdeel: "afspraken" }, icoon: "afspraak", tint: "#DCE3D3" },
    { to: "/tijdlijn", icoon: "geschiedenis", tint: "#DFE8F1" },
    { to: "/ondersteuning", icoon: "ondersteuning", tint: "#E3E0EC" },
    { to: "/exporteren", icoon: "exporteren", tint: "#E6DED3" },
];
const rij = "flex min-h-14 items-center gap-3 border-b border-border py-3.5";
function RijTekst({ titel, tekst }) {
    return <><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{titel}</span><span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">{tekst}</span></span><Chevron className="size-5 text-brand"/></>;
}
function Extra() {
    const { t } = useTranslation();
    const vk = useVoorkeuren();
    const { onderdeel } = Route.useSearch();
    const navigate = Route.useNavigate();
    const aanzetten = () => { zetVoorkeur("extraHouvast", true); bevestig(t(N + "staatAanMelding")); void navigate({ search: {} }); };
    if (vk.extraHouvast && onderdeel === "afspraken")
        return <AppShell>
    <PageHeader titel={t(N + "afspraken.titel")} subtitel={t(N + "afspraken.subtitel")} terug="/extra-ondersteuning"/>
    <div className="mt-4">
      <Link to="/afspraken" className={rij}><AppIcon functie="afspraak"/><RijTekst titel={t(N + "afspraken.tussen")} tekst={t(N + "afspraken.tussenUitleg")}/></Link>
      <Link to="/beslissingen" className={rij}><AppIcon functie="voorstel"/><RijTekst titel={t(N + "afspraken.beslissen")} tekst={t(N + "afspraken.beslissenUitleg")}/></Link>
    </div>
  </AppShell>;
    const intro = !vk.extraHouvast || onderdeel === "intro";
    return <AppShell>
    <PageHeader titel={t(N + "titel")} terug="/meer" zonderZoeken/>
    {intro ? <>
      <p className="lora mt-4 text-[22px] leading-snug text-[#2F4A3A]">{t(N + "intro.kop")}</p>
      <p className="mt-2 text-[15px] leading-snug text-ink-soft">{t(N + "intro.uitleg")}</p>
      <Link to="/verhaal" className="mt-4 block rounded-[22px] border-2 border-[#A9BCA8] px-4 py-3.5 [background:linear-gradient(135deg,rgba(220,230,210,.95),rgba(233,239,227,.9))]">
        <span className="flex items-center gap-3"><AppIcon functie="co" maat="lg"/><span className="min-w-0"><span className="block text-[16.5px] font-black">{t(N + "intro.coKennis")}</span><span className="block text-sm leading-snug text-[#2F4A3A]">{t(N + "intro.coUitleg")}</span></span></span>
        <span className="mt-3 block rounded-[16px_16px_16px_6px] bg-white/80 px-3 py-2 text-[14px] font-bold leading-snug">{t(N + "intro.coVoorbeeld")}</span>
        <span className="mt-3 block text-[14.5px] font-black text-[#3F5747]"><MetChevron>{t(N + "intro.vertelCo")}</MetChevron></span>
      </Link>
      <h2 className="mt-5 px-1 text-[13px] font-black uppercase tracking-[0.08em] text-ink-soft">{t(N + "intro.helptBij")}</h2>
      <div className="mt-2 divide-y divide-[#E9E1D5] rounded-[22px] border border-white/85 bg-white/60 px-3.5">
        {mogelijkheden.map((functie) => (<div key={functie} className="flex items-center gap-3 py-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-[14px]" style={{ background: hulpmiddelen.find((h) => h.icoon === functie)?.tint ?? "#DCE3D3" }}><AppIcon functie={functie} maat="sm" vorm="kaal"/></span>
            <span className="min-w-0"><span className="block text-[15.5px] font-black">{t(N + `mogelijkheid.${functie}.titel`)}</span><span className="block text-[13.5px] leading-snug text-ink-soft">{t(N + `mogelijkheid.${functie}.tekst`)}</span></span>
          </div>))}
      </div>
      <div className="mt-4 rounded-[22px] border border-white/85 bg-white/60 p-4">
        <h3 className="text-[17px] font-black">{vk.extraHouvast ? t(N + "intro.staatAan") : t(N + "intro.proberen")}</h3>
        <p className="mt-1 text-sm leading-snug text-ink-soft">{t(N + "intro.uitzetten")}</p>
        {vk.extraHouvast
                ? <Link to="/extra-ondersteuning" search={{}} className="mt-3 flex h-12 items-center justify-center rounded-full bg-brand text-[15px] font-black text-primary-foreground">{t(N + "intro.naarMijn")}</Link>
                : <button onClick={aanzetten} className="mt-3 flex h-12 w-full items-center justify-center rounded-full bg-brand text-[15px] font-black text-primary-foreground">{t(N + "intro.zetAan")}</button>}
      </div>
      <details className="group mt-3 rounded-[22px] border border-white/85 bg-white/60 px-4 py-3">
        <summary className="flex cursor-pointer list-none items-center text-[15px] font-black"><span className="flex-1">{t(N + "intro.watVerandert")}</span><Chevron className="size-4 text-ink-soft transition-transform group-open:rotate-90"/></summary>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{t(N + "intro.naAanzetten")}</p>
        <p className="mt-2 text-xs text-ink-soft">{t(N + "intro.apparaat")}</p>
        <div className="mt-2"><CoPrivacy /></div>
      </details>
    </> : <>
      <p className="lora mt-3 text-[19px] leading-snug text-[#2F4A3A]">{t(N + "aan.kop")}</p>
      <p className="mt-1 text-sm leading-snug text-ink-soft">{t(N + "aan.uitleg")}</p>
      <Link to="/verhaal" className="mt-4 flex items-center gap-3 rounded-[18px] border-2 border-[#A9BCA8] px-3.5 py-3 [background:linear-gradient(135deg,rgba(220,230,210,.95),rgba(233,239,227,.9))]">
        <CoBadge />
        <span className="min-w-0 flex-1"><span className="block text-[15px] font-black">{t(N + "aan.co")}</span><span className="block text-xs text-ink-soft">{t(N + "aan.coUitleg")}</span></span>
        <Chevron className="size-4 text-ink-soft"/>
      </Link>
      <h2 className="mt-5 px-1 text-[13px] font-black uppercase tracking-[0.08em] text-ink-soft">{t(N + "aan.hulpmiddelen")}</h2>
      <nav aria-label={t(N + "aan.onderdelen")} className="mt-2 divide-y divide-[#E9E1D5] rounded-[22px] border border-white/85 bg-white/60 px-3.5">
        {hulpmiddelen.map((h) => (<Link key={h.icoon} to={h.to} {...(h.search ? { search: h.search } : {})} className="flex min-h-14 items-center gap-3 py-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-[10px]" style={{ background: h.tint }}><AppIcon functie={h.icoon} maat="sm" vorm="kaal"/></span>
            <span className="min-w-0 flex-1"><span className="block text-[15px] font-black">{t(N + `hulpmiddel.${h.icoon}.titel`)}</span><span className="block text-xs text-ink-soft">{t(N + `hulpmiddel.${h.icoon}.tekst`)}</span></span>
            <Chevron className="size-4 text-ink-soft"/>
          </Link>))}
      </nav>
      <details className="group mt-3 rounded-[22px] border border-white/85 bg-white/60 px-4 py-3">
        <summary className="flex cursor-pointer list-none items-center text-[15px] font-black"><span className="flex-1">{t(N + "aan.uitlegPrivacy")}</span><Chevron className="size-4 text-ink-soft transition-transform group-open:rotate-90"/></summary>
        <Link to="/extra-ondersteuning" search={{ onderdeel: "intro" }} className="mt-2 flex min-h-10 items-center text-sm font-semibold text-brand"><MetChevron>{t(N + "aan.watIs")}</MetChevron></Link>
        <CoPrivacy />
      </details>
      <p className="mt-4 text-center text-xs text-ink-soft">{t(N + "aan.voorbeeld")}</p>
      <button onClick={() => { zetVoorkeur("extraHouvast", false); bevestig(t(N + "staatUitMelding")); }} className="mx-auto mt-1 block min-h-10 text-xs font-extrabold text-brand">{t(N + "aan.uitzetten")}</button>
    </>}
  </AppShell>;
}
