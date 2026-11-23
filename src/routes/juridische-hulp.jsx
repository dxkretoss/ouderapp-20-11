import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { AppShell, BackButton } from "@/components/AppShell";
import { AppIcon } from "@/components/AppIcon";
import { juridischeBronnen } from "@/lib/juridische-bronnen";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { Chevron } from "@/components/Tekens";
export const Route = createFileRoute("/juridische-hulp")({
    head: () => ({
        meta: [
            { title: i18n.t("common.metaTitel", { titel: i18n.t("routes.juridischeHulp.meta.titel") }) },
            { name: "description", content: i18n.t("routes.juridischeHulp.meta.beschrijving") },
            { property: "og:title", content: i18n.t("common.metaTitel", { titel: i18n.t("routes.juridischeHulp.meta.titel") }) },
            { property: "og:description", content: i18n.t("routes.juridischeHulp.meta.ogBeschrijving") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: JuridischeHulp,
});
// Op groepId; de korte uitleg staat in routes.juridischeHulp.groepUitleg.<groepId>.
const groepStijl = {
    gratis: { icoon: "ondersteuning", tint: "#DCE3D3" },
    officieel: { icoon: "juridisch", tint: "#DFE8F1" },
    geld: { icoon: "kosten", tint: "#E6DED3" },
    samen: { icoon: "samen", tint: "#E3E0EC" },
};
function JuridischeHulp() {
    const { t } = useTranslation();
    const groepen = [...new Set(juridischeBronnen.map((b) => b.groepId))];
    return (<AppShell>
      <div className="flex items-center gap-3">
        <BackButton terug="/meer"/>
        <h1 className="lora min-w-0 flex-1 text-[32px] leading-tight">{t("routes.juridischeHulp.titel")}</h1>
      </div>
      <p className="mt-2 text-[15px] leading-snug text-ink-soft">{t("routes.juridischeHulp.intro")}</p>
      <p className="mt-3 flex items-start gap-2 rounded-[16px] bg-[#E9EFE3] px-3.5 py-2.5 text-[13px] leading-snug text-[#2F4A3A]"><AppIcon functie="info" maat="sm" vorm="kaal"/><span>{t("routes.juridischeHulp.geenAdvies")}</span></p>
      {groepen.map((g) => {
            const st = groepStijl[g] ? { ...groepStijl[g], uitleg: t(`routes.juridischeHulp.groepUitleg.${g}`) } : { icoon: "info", tint: "#DCE3D3", uitleg: "" };
            const groepNaam = juridischeBronnen.find((b) => b.groepId === g)?.groep ?? g;
            return (<section key={g} className="mt-5">
            <h2 className="px-1 text-[13px] font-black uppercase tracking-[0.08em] text-ink-soft">{groepNaam}{st.uitleg ? <span className="ml-1.5 text-xs font-bold normal-case tracking-normal">· {st.uitleg}</span> : null}</h2>
            <div className={`mt-2 divide-y divide-[#E9E1D5] rounded-[22px] px-3.5 ${g === "gratis" ? "border-2 border-[#A9BCA8] [background:linear-gradient(135deg,rgba(220,230,210,.95),rgba(233,239,227,.9))]" : "border border-white/85 bg-white/60"}`}>
              {juridischeBronnen.filter((b) => b.groepId === g).map((b) => (<a key={b.id} href={b.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 py-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-[13px]" style={{ background: g === "gratis" ? "rgba(255,255,255,.75)" : st.tint }}><AppIcon functie={st.icoon} maat="sm" vorm="kaal"/></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-black">{b.titel.replace(" — ", ": ")}</span>
                    <span className="block text-xs leading-snug text-ink-soft">{b.uitleg}</span>
                    <span className="mt-0.5 block text-[11px] font-semibold text-[#3F5747]">{new URL(b.url).hostname.replace("www.", "")}</span>
                  </span>
                  <ExternalLink className="size-4 shrink-0 text-ink-soft" strokeWidth={1.8} aria-label={t("routes.juridischeHulp.extern")}/>
                </a>))}
            </div>
          </section>);
        })}
      <Link to="/juridisch" className="mt-5 flex items-center gap-3 rounded-[22px] border border-white/85 bg-white/60 px-4 py-3">
        <span className="min-w-0 flex-1"><span className="block text-[15px] font-black">{t("routes.juridischeHulp.voorwaarden")}</span><span className="block text-xs text-ink-soft">{t("routes.juridischeHulp.voorwaardenUitleg")}</span></span>
        <Chevron className="size-4 text-ink-soft"/>
      </Link>
    </AppShell>);
}
