import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { AppShell, BackButton, PageHeader } from "@/components/AppShell";
import { AppIcon } from "@/components/AppIcon";
import { SendHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { bereikbareBegeleiders, GEZIN_DOSSIER, momentKort, stuurOuderBericht, useProWerk, zelfdeGesprek } from "@/lib/pro-journaal-store";
import { Chevron } from "@/components/Tekens";
export const Route = createFileRoute("/begeleider-gesprek")({
    validateSearch: z.object({ met: z.enum(["prive", "samen"]).optional(), pro: z.string().optional() }),
    head: () => ({
        meta: [
            { title: i18n.t("routes.begeleiderGesprek.meta.titel") },
            { name: "description", content: i18n.t("routes.begeleiderGesprek.meta.beschrijving") },
            { property: "og:title", content: i18n.t("routes.begeleiderGesprek.meta.titel") },
            { property: "og:description", content: i18n.t("routes.begeleiderGesprek.meta.ogBeschrijving") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: BegeleiderGesprek,
});
const IKZELF = "Sanne";
const ANDERE = "Joris";
function BegeleiderGesprek() {
    const { t } = useTranslation();
    const werk = useProWerk();
    // Berichten met een begeleider zijn altijd gezamenlijk: beide ouders en de begeleider lezen alles.
    const { pro: proId } = Route.useSearch();
    const met = "samen";
    const navigate = Route.useNavigate();
    const [tekst, setTekst] = useState("");
    const bereikbaar = bereikbareBegeleiders(GEZIN_DOSSIER, werk);
    const ouders = met === "samen" ? [IKZELF, ANDERE] : [IKZELF];
    // Een bestaand gesprek blijft leesbaar, ook als de begeleider geen berichten meer mag ontvangen.
    const pro = proId ? werk.pros.find((p) => p.id === proId && p.dossier === GEZIN_DOSSIER) : bereikbaar.length === 1 ? bereikbaar[0] : undefined;
    const magSturen = !!pro && bereikbaar.some((p) => p.id === pro.id);
    if (!pro && bereikbaar.length > 1) {
        return (<AppShell>
        <PageHeader titel={t("routes.begeleiderGesprek.kiesTitel")} terug="/contact"/>
        <h2 className="mt-6 text-sm font-semibold">{t("routes.begeleiderGesprek.metWie")}</h2>
        <div className="mt-2 divide-y divide-border rounded-md border border-border bg-card">
          {bereikbaar.map((p) => (<button key={p.id} onClick={() => navigate({ search: { pro: p.id } })} className="flex min-h-14 w-full items-center gap-3 px-3 py-3 text-left">
              <span className="flex-1"><span className="block text-sm font-semibold">{p.naam}</span><span className="block text-xs text-ink-soft">{p.rol}</span></span>
              <Chevron className="size-4 text-ink-soft"/>
            </button>))}
        </div>
      </AppShell>);
    }
    if (!pro) {
        return (<AppShell>
        <PageHeader titel={t("routes.begeleiderGesprek.titel")} terug="/contact"/>
        <p className="mt-6 text-sm text-ink-soft">{t("routes.begeleiderGesprek.geenBegeleider")}</p>
      </AppShell>);
    }
    const lezers = met === "samen" ? t("routes.begeleiderGesprek.lezersSamen", { ik: IKZELF, ander: ANDERE, pro: pro.naam }) : t("routes.begeleiderGesprek.lezersPrive", { pro: pro.naam });
    const lijst = werk.berichten.filter((b) => zelfdeGesprek(b, GEZIN_DOSSIER, ouders)).sort((a, b) => a.moment.localeCompare(b.moment));
    const verstuur = () => {
        if (!tekst.trim() || !magSturen)
            return;
        stuurOuderBericht(GEZIN_DOSSIER, IKZELF, ouders, tekst.trim());
        setTekst("");
    };
    return (<AppShell>
      <div className="flex items-center gap-3">
        <BackButton terug="/ondersteuning"/>
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand text-lg font-black text-primary-foreground" aria-hidden>{pro.naam.charAt(0)}</span>
        <div className="min-w-0 flex-1">
          <h1 className="lora truncate text-[26px] leading-tight">{pro.naam}</h1>
          <p className="text-xs text-ink-soft">{pro.rol} · {t("routes.begeleiderGesprek.samenMet", { ander: ANDERE })}</p>
        </div>
      </div>
      <p className="mt-2.5 flex items-center gap-1.5 px-1 text-[12.5px] font-semibold text-ink-soft"><AppIcon functie="oog" maat="sm" vorm="kaal"/>{t("routes.begeleiderGesprek.gezamenlijk", { ander: ANDERE, pro: pro.naam })}</p>

      <div className="mt-4 space-y-3">
        {lijst.length === 0 ? (<div className="mt-8 text-center">
            <p className="lora text-[22px]">{t("routes.begeleiderGesprek.leeg.titel")}</p>
            <p className="mx-auto mt-1 max-w-[280px] text-sm text-ink-soft">{t("routes.begeleiderGesprek.leeg.tekst", { ander: ANDERE, pro: pro.naam })}</p>
          </div>) : null}
        {lijst.map((b) => {
            const vanMij = b.door === IKZELF;
            return (<div key={b.id} className={`flex ${vanMij ? "justify-end" : "justify-start"}`}>
              <div className="min-w-0 max-w-[80%]">
                <div className={`rounded-[20px] px-4 py-2.5 text-[15px] leading-snug ${vanMij ? "rounded-br-md bg-brand text-primary-foreground" : "rounded-bl-md border border-white/95 bg-white/90 text-ink"}`}>
                  {b.onderwerp !== "Gesprek met begeleider" ? <p className={`text-xs font-black ${vanMij ? "opacity-80" : "text-ink-soft"}`}>{b.onderwerp}</p> : null}
                  <p>{b.tekst}</p>
                </div>
                <p className={`mt-1 text-[11.5px] text-ink-soft ${vanMij ? "text-right" : ""}`}>{vanMij ? t("routes.begeleiderGesprek.verstuurd", { moment: momentKort(b.moment) }) : `${b.door} · ${momentKort(b.moment)}`}</p>
              </div>
            </div>);
        })}
      </div>

      {!magSturen ? <p role="status" className="mt-5 rounded-[16px] bg-white/60 px-3.5 py-2.5 text-sm">{t("routes.begeleiderGesprek.nietMeer", { pro: pro.naam })}</p> : (<div className="mt-5 flex items-end gap-2 rounded-[26px] bg-white p-1.5 shadow-[0_6px_18px_rgba(60,50,40,.10)]">
          <textarea id="bericht" aria-label={t("routes.begeleiderGesprek.berichtLabel", { ander: ANDERE, pro: pro.naam })} value={tekst} onChange={(e) => setTekst(e.target.value)} rows={Math.min(6, Math.max(1, tekst.split("\n").length + Math.floor(tekst.length / 34)))} placeholder={t("routes.begeleiderGesprek.placeholder")} className="min-h-10 min-w-0 flex-1 resize-none bg-transparent px-3 py-2 text-[15px] leading-snug outline-none placeholder:text-ink-soft/70"/>
          <button onClick={verstuur} disabled={!tekst.trim()} aria-label={t("common.versturen")} className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-primary-foreground disabled:opacity-40"><SendHorizontal className="size-[18px]" strokeWidth={2}/></button>
        </div>)}
    </AppShell>);
}
