import i18n from "@/i18n";
import { laadWeergave } from "@/components/Laden";
import { meldingenBron } from "@/lib/meldingen-store";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { AppShell, BackButton } from "@/components/AppShell";
import { AppIcon } from "@/components/AppIcon";
import { Chevron } from "@/components/Tekens";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useActiviteiten } from "@/components/Activiteiten";
import { isGelezen, markeerIds } from "@/lib/activiteiten";
import { isOpen } from "@/lib/openstaande-voorstellen";
import { markeerGelezen } from "@/lib/meldingen-store";
import { VoorstellenOverzicht } from "@/components/VoorstellenOverzicht";
import { z } from "zod";
import { ProfielBeeld } from "@/components/ProfielBeeld";
import { useGezin } from "@/lib/gezin";
import { verversGezinAlsOud } from "@/lib/start-store";
export const Route = createFileRoute("/activiteiten")({
    validateSearch: z.object({ onderdeel: z.enum(["regelen"]).optional() }),
    head: () => ({
        meta: [
            { title: i18n.t("common.metaTitel", { titel: i18n.t("routes.activiteiten.meta.titel") }) },
            { name: "description", content: i18n.t("routes.activiteiten.meta.beschrijving") },
            { property: "og:title", content: i18n.t("common.metaTitel", { titel: i18n.t("routes.activiteiten.meta.titel") }) },
            { property: "og:description", content: i18n.t("routes.activiteiten.meta.ogBeschrijving") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: ActiviteitenPagina,
});
function ActiviteitenPagina() {
    const { t } = useTranslation();
    const zoek = Route.useSearch();
    const router = useRouter();
    const { lijst, gelezen, voorstellen } = useActiviteiten();
    const laadStatus = meldingenBron.useStatus();
    const [open, setOpen] = useState(null);
    const [alles, setAlles] = useState(zoek.onderdeel === "regelen");
    const lees = (a) => markeerGelezen(markeerIds(a));
    // Wacht op jou: herinneringen (overdracht, evaluatie) en voorstellen die op jouw reactie wachten.
    const wacht = [
        ...lijst.filter((a) => a.categorie === "regelen" && !a.id.startsWith("act-")).map((a) => ({ sleutel: a.id, titel: a.titel, omschrijving: a.uitleg, naar: a.naar, functie: a.icoon })),
        ...voorstellen.filter((v) => v.aanJou && isOpen(v)).map((v) => ({ sleutel: v.sleutel, titel: v.titel, omschrijving: v.omschrijving, naar: v.naar, functie: v.bron === "budget" || v.bron === "kost" ? "kosten" : v.bron === "afspraak" ? "afspraak" : "agenda" })),
    ];
    const feed = lijst.filter((a) => a.categorie !== "regelen").sort((x, y) => y.volgorde - x.volgorde);
    const nieuweFeed = feed.filter((a) => !isGelezen(a, gelezen));
    const eerdereFeed = feed.filter((a) => isGelezen(a, gelezen));
    return (<AppShell>
      <div className="flex items-center gap-3">
        <BackButton terug="/"/>
        <h1 className="lora min-w-0 flex-1 text-[32px] leading-tight">{t("routes.activiteiten.titel")}</h1>
        {nieuweFeed.length ? <button onClick={() => markeerGelezen(nieuweFeed.flatMap(markeerIds))} className="inline-flex min-h-10 items-center text-xs font-extrabold text-[#3F5747]">{t("routes.activiteiten.allesGelezen")}</button> : null}
      </div>

      {wacht.length ? (<section className="mt-4 rounded-[20px] border-2 border-[#A9BCA8] p-3.5 [background:linear-gradient(135deg,rgba(220,230,210,.95),rgba(233,239,227,.9))]">
          <div className="flex items-center"><h2 className="flex-1 text-[15.5px] font-black">{t("routes.activiteiten.wachtOpJou", { n: wacht.length })}</h2><button onClick={() => setAlles(!alles)} aria-expanded={alles} className="inline-flex min-h-10 items-center gap-0.5 text-[13px] font-extrabold text-[#3F5747]">{alles ? t("common.minder") : t("routes.activiteiten.alles")}<Chevron richting="omlaag" open={alles} className="size-4"/></button></div>
          <button onClick={() => router.navigate({ href: wacht[0].naar })} className="mt-2.5 flex w-full items-center gap-2.5 rounded-[14px] bg-white/80 px-3 py-2.5 text-left">
            <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-[#DFE8F1]"><AppIcon functie={wacht[0].functie} maat="sm" vorm="kaal"/></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-black">{wacht[0].titel}</span><span className="block truncate text-xs text-ink-soft">{wacht[0].omschrijving}</span></span>
            <span className="inline-flex h-8 shrink-0 items-center rounded-full bg-brand px-3.5 text-[13px] font-black text-primary-foreground">{t("routes.activiteiten.bekijk")}</span>
          </button>
          {wacht.length > 1 && !alles ? <p className="mt-2 px-1 text-[12.5px] text-ink-soft">{t("routes.activiteiten.enNog", { n: wacht.length - 1, lijst: wacht.slice(1, 4).map((v) => v.titel.replace(/^(Budget|Vakantie|Uitgave|Holiday|Expense): /, "").toLowerCase()).join(", ") })}{wacht.length > 4 ? "…" : ""}</p> : null}
        </section>) : null}
      {alles ? <VoorstellenOverzicht /> : null}

      {nieuweFeed.length ? <FeedGroep titel={t("routes.activiteiten.nieuw")} items={nieuweFeed} gelezen={gelezen} onOpen={(a) => { lees(a); setOpen(a); }}/> : null}
      {eerdereFeed.length ? <FeedGroep titel={t("routes.activiteiten.eerder")} items={eerdereFeed} gelezen={gelezen} onOpen={(a) => setOpen(a)}/> : null}
      {!wacht.length && !feed.length ? (laadWeergave(laadStatus, meldingenBron.ververs) ?? <div className="mt-16 text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-full border border-[#C9D6C3] bg-[#E9EFE3]"><Check className="size-7 text-[#3F5747]" strokeWidth={2.2}/></span>
          <p className="lora mt-3 text-[24px]">{t("routes.activiteiten.leeg.titel")}</p>
          <p className="mt-1 text-sm text-ink-soft">{t("routes.activiteiten.leeg.tekst")}</p>
        </div>) : null}
      <Details a={open} onClose={() => setOpen(null)}/>
    </AppShell>);
}
function FeedGroep({ titel, items, gelezen, onOpen }) {
    return (<section className="mt-5" aria-label={titel}>
      <h2 className="px-1 text-[13px] font-black uppercase tracking-[0.08em] text-ink-soft">{titel}</h2>
      <ul className="mt-2 divide-y divide-[#E9E1D5] rounded-[22px] border border-white/85 bg-white/60 px-3.5">
        {items.map((a) => <MeldingRij key={a.id} a={a} gelezen={isGelezen(a, gelezen)} onOpen={() => onOpen(a)}/>)}
      </ul>
    </section>);
}
/** Eén melding zoals op Instagram: wie (initiaal), wat (icoontje), één zin, hoe lang geleden, puntje als nieuw. */
function MeldingRij({ a, gelezen, onOpen }) {
    const { t } = useTranslation();
    const initiaal = a.door?.trim().charAt(0).toUpperCase();
    const gezin = useGezin();
    const naam = a.door?.trim().toLowerCase();
    const persoon = naam ? [gezin.ik, ...gezin.coOuders].find((p) => p?.naam?.trim().toLowerCase() === naam) : null;
    return (<li>
      <button onClick={onOpen} className="flex min-h-[60px] w-full items-center gap-3 py-2.5 text-left">
        <span className="relative shrink-0">
          {initiaal
            ? (persoon?.beeld ? <ProfielBeeld beeld={persoon.beeld} naam={a.door} maat={42}/> : <span className="grid size-[42px] place-items-center rounded-full bg-[#6F7F68] text-base font-black text-white">{initiaal}</span>)
            : <span className="grid size-[42px] place-items-center rounded-full bg-[#DCE3D3]"><AppIcon functie={a.icoon} maat="sm" vorm="kaal"/></span>}
          {initiaal ? <span className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.12)]"><AppIcon functie={a.icoon} maat="sm" vorm="kaal" className="scale-[.8]"/></span> : null}
        </span>
        <span className="min-w-0 flex-1 text-[14px] leading-snug">
          <span className={gelezen ? "font-bold" : "font-black"}>{a.titel}</span>{" "}
          <span className="text-ink">{a.uitleg}</span>{a.tijd ? <span className="text-ink-soft"> · {a.tijd}</span> : null}
        </span>
        {!gelezen ? <span aria-label={t("routes.activiteiten.nieuw")} className="size-2 shrink-0 rounded-full bg-brand"/> : null}
      </button>
    </li>);
}
function Details({ a, onClose }) {
    const { t } = useTranslation();
    const router = useRouter();
    return (<Sheet open={!!a} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
        {a ? (<>
            <SheetHeader className="text-left">
              <SheetTitle className="lora text-[24px] leading-tight">{a.titel}</SheetTitle>
              <SheetDescription>{a.uitleg}</SheetDescription>
            </SheetHeader>
            {a.onderdelen ? (<ul className="mt-3 divide-y divide-border">
                {a.onderdelen.map((o) => <li key={o.id} className="py-2 text-sm">{o.uitleg}{o.tijd ? <span className="block text-xs text-ink-soft">{o.tijd}</span> : null}</li>)}
              </ul>) : null}
            {a.wijzigingen?.length ? (<dl className="mt-3 space-y-2 text-sm">
                {a.wijzigingen.map((w) => (<div key={w.veld}>
                    <dt className="font-semibold">{w.veld}</dt>
                    <dd className="text-ink-soft">{t("routes.activiteiten.was", { waarde: w.oud })}</dd>
                    <dd>{t("routes.activiteiten.wordt", { waarde: w.nieuw })}</dd>
                  </div>))}
              </dl>) : null}
            {a.details?.length ? (<dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                {a.details.map((d) => <div key={d.label} className="contents"><dt className="text-ink-soft">{d.label}</dt><dd>{d.waarde}</dd></div>)}
              </dl>) : null}
            <button onClick={async () => { onClose(); await verversGezinAlsOud(true).catch(() => { }); router.navigate({ href: a.naar }); }} className="mt-4 flex h-12 w-full items-center justify-center rounded-full bg-brand px-4 text-[15px] font-black text-primary-foreground">
              {a.verzoek ? t("routes.activiteiten.bekijkenReageren") : t("routes.activiteiten.openen")}
            </button>
          </>) : null}
      </SheetContent>
    </Sheet>);
}
