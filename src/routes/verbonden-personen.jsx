import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import i18n, { taalLocale } from "@/i18n";
import { AppShell, BackButton } from "@/components/AppShell";
import { AppIcon } from "@/components/AppIcon";
import { Chevron } from "@/components/Tekens";
import { ProfielBeeld } from "@/components/ProfielBeeld";
import { AndereOuderUitnodigen } from "@/components/AndereOuderUitnodigen";
import { start, useStart } from "@/lib/start-store";
import { api, foutTekst } from "@/lib/api";
import { bevestig } from "@/lib/feedback";
import { isActief, laadKring, persoonLabel, rechtenSamenvatting, rolNaam, useKring } from "@/lib/kring-store";
const N = "routes.verbondenPersonen.";
export const Route = createFileRoute("/verbonden-personen")({
    head: () => ({
        meta: [
            { title: i18n.t("common.metaTitel", { titel: i18n.t("routes.verbondenPersonen.titel") }) },
            { name: "description", content: i18n.t("routes.verbondenPersonen.beschrijving") },
            { property: "og:title", content: i18n.t("common.metaTitel", { titel: i18n.t("routes.verbondenPersonen.titel") }) },
            { property: "og:description", content: i18n.t("routes.verbondenPersonen.beschrijving") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: VerbondenPersonen,
});
const GLAS = "rounded-[22px] border border-white/85 bg-white/60";
const knop = "rounded-md bg-brand px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40";
/**
 * Verbonden personen: één overzicht van wie er met het gezin verbonden is — de andere ouder(s) (koppeling,
 * gedeelde kinderen, ontkoppelen), openstaande uitnodigingen (intrekken) en de kring rond de kinderen
 * (rol, status, korte samenvatting van wat ze zien). Alles is afgeleid van bestaande bronnen
 * (start-store ↔ accept-invitation, kring-store ↔ manage-caregivers); beheren gebeurt in de bestaande flows.
 */
function VerbondenPersonen() {
    const { t } = useTranslation();
    const st = useStart();
    const kring = useKring();
    const [ontkoppel, setOntkoppel] = useState(null);
    const [toevoegen, setToevoegen] = useState(false);
    useEffect(() => { laadKring(); }, []);
    const kinderen = st.kinderen.filter((k) => !String(k.id).startsWith("tmp-"));
    const naamKind = (id) => kinderen.find((k) => k.id === id)?.naam;
    const namen = (ids) => ids.map(naamKind).filter(Boolean).join(", ");
    const datum = (iso) => (iso ? new Date(iso).toLocaleDateString(taalLocale(), { day: "numeric", month: "long", year: "numeric" }) : "");
    const leden = kring.personen.filter((p) => !p.ingetrokken && !String(p.id).startsWith("tmp-"));
    const beheerbaar = kinderen.filter((k) => k.kanBewerken !== false);
    const status = (p) => (p.uitgenodigd === false ? t(N + "status.contact") : p.bevestigd === false ? t(N + "status.uitgenodigd") : isActief(p) ? t(N + "status.actief") : t(N + "status.verlopen"));
    return (<AppShell>
      <div className="flex items-center gap-3">
        <BackButton terug="/instellingen"/>
        <h1 className="lora min-w-0 flex-1 text-[32px] leading-tight">{t(N + "titel")}</h1>
      </div>
      <p className="mt-2 px-1 text-sm text-ink-soft">{t(N + "intro")}</p>

      <section className="mt-5">
        <h2 className="px-1 text-[13px] font-black uppercase tracking-[0.08em] text-ink-soft">{t(N + "ouders.kop")}</h2>
        <div className={`${GLAS} mt-2 divide-y divide-[#E9E1D5] px-3.5`}>
          {st.coOuders.map((c) => (<div key={c.id} className="py-3">
              <div className="flex items-center gap-3">
                <ProfielBeeld beeld={c.avatar ?? undefined} naam={c.name} maat={40}/>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-black">{c.name}</span>
                  <span className="block text-xs text-ink-soft">{t(N + "ouders.rol")} · {t(N + "ouders.gekoppeld")}</span>
                </span>
                <AppIcon functie="akkoord" maat="sm" vorm="kaal"/>
              </div>
              <p className="mt-2 text-xs text-ink-soft">{c.child_ids?.length ? t(N + "ouders.deelt", { kinderen: namen(c.child_ids) }) : t(N + "ouders.geenKinderen")}{c.connected_at ? ` · ${t(N + "ouders.sinds", { datum: datum(c.connected_at) })}` : ""}</p>
              <button type="button" onClick={() => setOntkoppel(c)} className="mt-1 min-h-11 text-xs font-semibold text-accent-warm">{t(N + "ouders.ontkoppelen")}</button>
            </div>))}
          {st.coOuders.length === 0 ? <p className="py-3 text-sm text-ink-soft">{t(N + "ouders.leeg")}</p> : null}
          <div className="pb-3">
            <AndereOuderUitnodigen zonderGekoppeld/>
          </div>
        </div>
      </section>

      <section className="mt-5">
        <h2 className="px-1 text-[13px] font-black uppercase tracking-[0.08em] text-ink-soft">{t(N + "kring.kop")}</h2>
        <div className={`${GLAS} mt-2 divide-y divide-[#E9E1D5] px-3.5`}>
          {leden.map((p) => {
            const kids = Object.keys(p.rechten).filter((k) => naamKind(k));
            const doel = kids[0];
            const inhoud = (<>
              {p.foto ? <img src={p.foto} alt="" className="size-10 shrink-0 rounded-full object-cover"/> : <AppIcon functie="persoon" maat="md"/>}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-black">{persoonLabel(p)}</span>
                <span className="block text-xs text-ink-soft">{rolNaam(p.rol)} · {status(p)}</span>
                {kids.map((k) => <span key={k} className="block truncate text-xs text-ink-soft">{naamKind(k)}: {p.uitgenodigd === false ? t(N + "kring.geenApp") : p.bevestigd === false ? t(N + "kring.naBevestigen", { wat: rechtenSamenvatting({ ...p, bevestigd: true }, k) }) : rechtenSamenvatting(p, k)}</span>)}
              </span>
              <Chevron className="size-4 shrink-0 text-ink-soft"/>
            </>);
            return doel ? <Link key={p.id} to="/kring/$kindId" params={{ kindId: doel }} className="flex min-h-[58px] items-center gap-3 py-2.5">{inhoud}</Link> : null;
        })}
          {leden.length === 0 ? <p className="py-3 text-sm text-ink-soft">{kring.geladen ? t(N + "kring.leeg") : <span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" aria-hidden="true"/>{t("common.laden")}</span>}</p> : null}
          {beheerbaar.length ? (<button type="button" onClick={() => setToevoegen(true)} className="flex min-h-[58px] w-full items-center gap-3 py-2.5 text-left">
              <AppIcon functie="toevoegen" maat="md"/>
              <span className="min-w-0 flex-1"><span className="block text-[15px] font-black">{t(N + "kring.toevoegen")}</span><span className="block text-xs text-ink-soft">{t(N + "kring.toevoegenUitleg")}</span></span>
              <Chevron className="size-4 text-ink-soft"/>
            </button>) : (<Link to="/kinderen" className="flex min-h-[58px] items-center gap-3 py-2.5">
              <AppIcon functie="kinderen" maat="md"/>
              <span className="min-w-0 flex-1"><span className="block text-[15px] font-black">{t(N + "kring.eerstKind")}</span></span>
              <Chevron className="size-4 text-ink-soft"/>
            </Link>)}
        </div>
        <p className="mt-2 px-1 text-[11px] text-ink-soft">{t(N + "kring.uitleg")}</p>
      </section>

      <Link to="/privacy" className="mt-6 block text-center text-xs font-semibold text-brand">{t(N + "wieZietWat")}</Link>

      {toevoegen ? (<div className="app-modal-achter z-40" onClick={() => setToevoegen(false)}>
          <div className="app-modal" onClick={(e) => e.stopPropagation()}>
            <p className="font-display text-lg">{t(N + "kring.voorWie")}</p>
            <div className="mt-3 divide-y divide-border border-y border-border">
              {beheerbaar.map((k) => (<Link key={k.id} to="/kring/$kindId" params={{ kindId: k.id }} search={{ toevoegen: true }} className="flex min-h-12 items-center gap-3 py-2">
                  <ProfielBeeld beeld={k.beeld} naam={k.naam} kleur={k.kleur} maat={32}/>
                  <span className="flex-1 text-sm font-semibold">{k.naam}</span>
                  <Chevron className="size-4 text-ink-soft"/>
                </Link>))}
            </div>
            <button onClick={() => setToevoegen(false)} className="mt-4 w-full rounded-md border border-border py-3 text-sm">{t("common.annuleren")}</button>
          </div>
        </div>) : null}

      {ontkoppel ? <Ontkoppelen ouder={ontkoppel} namen={namen(ontkoppel.child_ids ?? [])} sluit={() => setOntkoppel(null)}/> : null}
    </AppShell>);
}
/** Bevestiging in de telefoonkolom; ontkoppelen haalt koppelingen weg, de geschiedenis blijft bewaard. */
function Ontkoppelen({ ouder, namen, sluit }) {
    const { t } = useTranslation();
    const [bezig, setBezig] = useState(false);
    const [fout, setFout] = useState(null);
    const doe = async () => {
        setBezig(true);
        setFout(null);
        try {
            await api("accept-invitation", "disconnect", { co_parent_id: ouder.id });
            await start.hydrateer();
            laadKring();
            bevestig(t(N + "ontkoppel.klaar"));
            sluit();
        }
        catch (e) {
            setFout(e.code ?? "SERVER");
            setBezig(false);
        }
    };
    return (<div className="app-modal-achter z-40" onClick={() => !bezig && sluit()}>
      <div className="app-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <p className="font-display text-lg">{t(N + "ontkoppel.titel", { naam: ouder.name })}</p>
        <p className="mt-2 text-sm text-ink-soft">{namen ? t(N + "ontkoppel.uitleg", { kinderen: namen }) : t(N + "ontkoppel.uitlegZonder")}</p>
        <p className="mt-2 text-xs text-ink-soft">{t(N + "ontkoppel.geschiedenis")}</p>
        {fout ? <p role="alert" className="mt-3 text-xs font-semibold text-[#A4533E]">{foutTekst(fout)}</p> : null}
        <div className="mt-5 flex gap-2">
          <button disabled={bezig} onClick={sluit} className="flex-1 rounded-md border border-border py-3 text-sm">{t("common.annuleren")}</button>
          <button disabled={bezig} onClick={doe} className={`flex flex-1 items-center justify-center gap-2 ${knop}`}>{bezig ? <Loader2 className="size-4 animate-spin" aria-hidden="true"/> : null}{t(N + "ontkoppel.ja")}</button>
        </div>
      </div>
    </div>);
}
