import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell, Card, PageHeader } from "@/components/AppShell";
import { kinderen } from "@/lib/demo-data";
import { gezagLabels, regelingNaam, setGezagState, useGezagState } from "@/lib/gezag-store";
import { AppIcon } from "@/components/AppIcon";
import { Vinkje, Chevron } from "@/components/Tekens";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
const N = "routes.gezag.";
export const Route = createFileRoute("/gezag")({
    head: () => ({
        meta: [
            { title: i18n.t("common.metaTitel", { titel: i18n.t("routes.gezag.meta.titel") }) },
            { name: "description", content: i18n.t("routes.gezag.meta.beschrijving") },
            { property: "og:title", content: i18n.t("common.metaTitel", { titel: i18n.t("routes.gezag.meta.titel") }) },
            { property: "og:description", content: i18n.t("routes.gezag.meta.ogBeschrijving") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: GezagPagina,
});
// Ids; labels via routes.gezag.recht / afwijking / uitleg.
const rechten = ["bekijken", "infoToevoegen", "afsprakenVoorstellen", "beslissingenGoedkeuren", "documentenBekijken", "documentenToevoegen", "professionals", "instellingen"];
const afwijkingen = ["aangepast", "informatie", "beperkteInfo", "begeleid", "geenOmgang", "communicatie", "anders"];
const uitleg = ["gezamenlijk", "eenhoofdig", "omgang", "zorgregeling", "omgangsregeling", "informatie"];
function magOuder(g, ouder, recht) {
    const heeftGezag = g === "gezamenlijk" || (g === "ouder1" && ouder === "sanne") || (g === "ouder2" && ouder === "joris");
    if (heeftGezag)
        return true;
    return ["bekijken", "infoToevoegen", "afsprakenVoorstellen", "documentenBekijken"].includes(recht);
}
function GezagPagina() {
    const { t } = useTranslation();
    const s = useGezagState();
    const [kindId, setKindId] = useState(kinderen[0].id);
    const [open, setOpen] = useState(null);
    const [afw, setAfw] = useState([]);
    const kind = kinderen.find((k) => k.id === kindId);
    const g = s.gezag[kindId] ?? "onbekend";
    const onduidelijk = g === "anders" || g === "onbekend" || g === "voogd" || s.afwijkend;
    return (<AppShell>
      <PageHeader titel={t(N + "titel")} subtitel={t(N + "subtitel")}/>

      <div className="mt-5 flex gap-2">
        {kinderen.map((k) => (<button key={k.id} onClick={() => setKindId(k.id)} className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold ${kindId === k.id ? "border-brand bg-white" : "border-transparent bg-surface text-ink-soft"}`}>
            <img src={k.avatar} alt="" className="size-6 rounded-full object-cover"/>
            {k.naam}
          </button>))}
      </div>

      <Card className="mt-4 space-y-2">
        <p className="text-sm font-semibold">{t(N + "situatieVan", { naam: kind.naam })}</p>
        {Object.keys(gezagLabels).map((k) => (<label key={k} className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm ${g === k ? "border-brand bg-white" : "border-border bg-surface"}`}>
            <input type="radio" name="gezag" checked={g === k} onChange={() => setGezagState({ gezag: { ...s.gezag, [kindId]: k }, bevestigd: { ...s.bevestigd, [kindId]: false } })} className="accent-[var(--color-brand)]"/>
            {gezagLabels[k]}
          </label>))}
        <div className="flex items-center justify-between rounded-md bg-bg-muted p-3 text-sm">
          {s.bevestigd[kindId] ? (<span className="inline-flex items-center gap-1.5"><AppIcon functie="akkoord" maat="sm" vorm="kaal"/>{t(N + "bevestigd")}</span>) : (<>
              <span className="text-ink-soft">{t(N + "nogNietBevestigd")}</span>
              <button onClick={() => setGezagState({ bevestigd: { ...s.bevestigd, [kindId]: true } })} className="rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-primary-foreground">{t(N + "bevestigen")}</button>
            </>)}
        </div>
        <p className="text-xs text-ink-soft">{t(N + "tip")}</p>
      </Card>

      {onduidelijk && (<Card className="mt-4 bg-accent-warm/25">
          <p className="flex items-start gap-2 text-sm"><AppIcon functie="info" maat="sm" vorm="kaal" className="mt-0.5 shrink-0"/><span>{t(N + "onduidelijk")}</span></p>
        </Card>)}

      <Card className="mt-4">
        <p className="text-sm font-semibold">{t(N + "heetDit", { regeling: regelingNaam(g) })}</p>
        <p className="mt-1 text-xs text-ink-soft">
          {g === "gezamenlijk"
            ? t(N + "beslissingenSamen")
            : t(N + "beslissingenGedeeld")}
        </p>
      </Card>

      <Card className="mt-4">
        <p className="text-sm font-semibold">{t(N + "wieMagWat")}</p>
        <p className="mt-1 text-xs text-ink-soft">{t(N + "wieMagWatUitleg")}</p>
        <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-2 text-sm">
          <span />
          <span className="text-xs font-semibold text-brand">Sanne</span>
          <span className="text-xs font-semibold">Joris</span>
          {rechten.map((r) => (<div key={r} className="contents">
              <span className="text-ink-soft">{t(N + `recht.${r}`)}</span>
              {["sanne", "joris"].map((o) => {
                const val = magOuder(g, o, r);
                return (<span key={o} className="flex justify-center" aria-label={`${t(N + `recht.${r}`)} ${o}: ${val ? t(N + "inUitleg") : t(N + "afhankelijk")}`}>
                    {val ? <Vinkje className="size-4 text-brand"/> : <span aria-hidden="true">—</span>}
                  </span>);
            })}
            </div>))}
        </div>
      </Card>

      <Card className="mt-4 space-y-3">
        <label className="flex items-center justify-between gap-3 text-sm font-semibold">
          {t(N + "afwijkend")}
          <input type="checkbox" checked={s.afwijkend} onChange={(e) => setGezagState({ afwijkend: e.target.checked })} className="size-5 accent-[var(--color-brand)]"/>
        </label>
        {s.afwijkend && (<>
            <p className="text-xs text-ink-soft">{t(N + "afwijkendUitleg")}</p>
            <div className="flex flex-wrap gap-2">
              {afwijkingen.map((a) => (<button key={a} onClick={() => setAfw(afw.includes(a) ? afw.filter((x) => x !== a) : [...afw, a])} className={`rounded-full border px-3 py-1.5 text-xs ${afw.includes(a) ? "border-brand bg-brand text-primary-foreground" : "border-white/70 bg-white/70"}`}>{t(N + `afwijking.${a}`)}</button>))}
            </div>
          </>)}
      </Card>

      <h2 className="mt-6 font-display text-lg font-bold">{t(N + "goedOmTeWeten")}</h2>
      <p className="text-xs text-ink-soft">{t(N + "algemeneInfo")}</p>
      <div className="mt-3 space-y-2">
        {uitleg.map((u) => (<Card key={u} className="p-0">
            <button onClick={() => setOpen(open === u ? null : u)} className="flex w-full items-center justify-between p-4 text-left text-sm font-semibold">
              {t(N + `uitleg.${u}.titel`)}<Chevron richting="omlaag" open={open === u} className="size-4 text-ink-soft"/>
            </button>
            {open === u && <p className="px-4 pb-4 text-sm text-ink-soft">{t(N + `uitleg.${u}.tekst`)}</p>}
          </Card>))}
      </div>
    </AppShell>);
}
