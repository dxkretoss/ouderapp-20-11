import { useState } from "react";
import { useTranslation } from "react-i18next";
import { taalLocale } from "@/i18n";
import { HandHeart, Heart, MessageCircle, PartyPopper, ThumbsUp } from "lucide-react";
import { AppIcon, Pictogram, tekstMetIcoon } from "@/components/AppIcon";
import { Vinkje } from "@/components/Tekens";
import { useKring, persoonLabel, mag, wieNaam } from "@/lib/kring-store";
import { kinderen, parents } from "@/lib/demo-data";
import { momentLabel, mijlpaalLabel, mijlpalen, reacties, reageer, voegMomentjeToe, } from "@/lib/momentjes-store";
/** Reactie-id (uit momentjes-store) → lucide-icoon. "tekst" = eigen korte reactie, "duim" = lege eigen reactie. */
const REACTIE_ICOON = { leuk: Heart, lief: HandHeart, trots: PartyPopper, watGoed: ThumbsUp, tekst: MessageCircle, duim: ThumbsUp };
function ReactieIcoon({ id, className = "size-4" }) {
    const Icon = REACTIE_ICOON[id] ?? MessageCircle;
    return <Icon aria-hidden="true" strokeWidth={1.9} className={`shrink-0 text-[#B4637A] ${className}`}/>;
}
export function MomentjeKaart({ m, kijker }) {
    const { t } = useTranslation();
    const [tekstOpen, setTekstOpen] = useState(false);
    const [tekst, setTekst] = useState("");
    const kind = kinderen.find((k) => k.id === m.kindId);
    const vanMij = kijker ? m.auteurId === kijker : m.van === "sanne";
    const auteur = m.van === "kring" ? wieNaam(m.auteurId) : m.van === "sanne" ? t("components.Momentjes.kaart.jou") : parents[m.van].naam;
    const kringTekst = m.kringIds?.length ? ` · ${m.kringIds.map((id) => wieNaam(id)).join(", ")}` : "";
    const getoond = tekstMetIcoon(m.tekst);
    return (<div className="overflow-hidden rounded-[22px] border border-white/85 bg-white/60">
      {m.foto ? <img src={m.foto} alt="" className="aspect-[4/3] w-full object-cover"/> : null}
      <div className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <img src={kind.avatar} alt={kind.naam} className="size-[30px] rounded-full border-2 object-cover" style={{ borderColor: kind.kleur ?? "#8A7E72" }}/>
          <span className="text-sm font-black">{kind.naam}</span>
          <span className="text-xs text-ink-soft">{t("components.Momentjes.kaart.vanWanneer", { auteur, wanneer: m.wanneer })}</span>
        </div>
        <p className="mt-2.5 flex items-start gap-1.5 text-[16.5px] font-extrabold leading-snug">{getoond.teken ? <Pictogram waarde={getoond.teken} maat="sm" className="mt-0.5"/> : null}<span>{getoond.tekst}</span></p>
        {m.reactie || m.reactieTekst ? (<p className="mt-3 flex flex-wrap items-center gap-1.5 rounded-[14px] bg-[#E9EFE3] px-3 py-2 text-xs text-[#2F4A3A]">
            <b>{vanMij ? parents.joris.naam : t("common.jij")}:</b> {m.reactie ? <ReactieIcoon id={m.reactie} className="size-3.5"/> : null} {m.reactieTekst || reacties.find((r) => r.id === m.reactie)?.l ? <span>{m.reactieTekst || reacties.find((r) => r.id === m.reactie)?.l}</span> : null}
          </p>) : null}
        {!vanMij && !m.reactie && !kijker ? (tekstOpen ? (<div className="mt-3 flex gap-2">
              <input value={tekst} maxLength={80} onChange={(e) => setTekst(e.target.value)} placeholder={t("components.Momentjes.kaart.korteReactie")} className="flex-1 rounded-xl bg-surface px-3 py-2 text-xs outline-none"/>
              <button onClick={() => { reageer(m.id, { reactie: tekst.trim() ? "tekst" : "duim", reactieTekst: tekst.trim() }); setTekstOpen(false); }} className="min-h-10 rounded-xl bg-brand px-3 text-xs font-semibold text-primary-foreground">{t("components.Momentjes.kaart.stuur")}</button>
            </div>) : (<div className="mt-3 flex flex-wrap gap-1.5">
              {reacties.map((r) => (<button key={r.id} onClick={() => reageer(m.id, { reactie: r.id, reactieTekst: r.l })} className="flex h-10 items-center gap-1.5 rounded-full border border-[#E6DED2] bg-white/80 px-3 text-[13px] font-extrabold">
                  <ReactieIcoon id={r.id}/> {r.l}
                </button>))}
              <button onClick={() => setTekstOpen(true)} aria-label={t("components.Momentjes.kaart.korteReactie")} className="grid size-10 place-items-center rounded-full text-ink-soft"><AppIcon functie="berichten" maat="sm" vorm="kaal"/></button>
            </div>)) : null}
        <p className="mt-2.5 text-xs text-ink-soft">{kijker ? t("components.Momentjes.kaart.gedeeldMetJou") : m.prive ? t("components.Momentjes.kaart.alleenVoorJou") : m.van === "kring" ? t("components.Momentjes.kaart.gedeeldMetOuders") : t("components.Momentjes.kaart.gedeeldMet", { wie: `${m.van === "sanne" ? parents.joris.naam : t("components.Momentjes.kaart.jou")}${kringTekst.replace(" · ", ", ")}` })}</p>
      </div>
    </div>);
}
export function DeelMomentje({ open, onSluit, kindId: startKind, alsKring }) {
    const { t } = useTranslation();
    const kring = useKring();
    const kindKeuze = alsKring ? kinderen.filter((k) => { const p = kring.personen.find((x) => x.id === alsKring); return p ? mag(p, k.id, "momentjes", "bijdragen") : false; }) : kinderen;
    const [kindId, setKindId] = useState(startKind ?? kindKeuze[0]?.id ?? kinderen[0].id);
    const [kringIds, setKringIds] = useState([]);
    // Alleen kringleden die momentjes van dit kind mogen bekijken, komen in aanmerking.
    const kringVoorKind = kring.personen.filter((p) => mag(p, kindId, "momentjes"));
    const [foto, setFoto] = useState();
    const [tekst, setTekst] = useState("");
    const [moment, setMoment] = useState("geen");
    const [mijlpaal, setMijlpaal] = useState();
    const [prive, setPrive] = useState(false);
    if (!open)
        return null;
    const deel = () => {
        const nu = new Date();
        voegMomentjeToe({
            id: String(Date.now()), kindId, van: alsKring ? "kring" : "sanne", auteurId: alsKring, tekst: tekst.trim(), foto, moment, mijlpaal, prive: alsKring ? false : prive,
            kringIds: alsKring || prive ? [] : kringIds.filter((id) => kringVoorKind.some((p) => p.id === id)),
            datum: `${nu.getFullYear()}-${String(nu.getMonth() + 1).padStart(2, "0")}-${String(nu.getDate()).padStart(2, "0")}`,
            wanneer: t("components.Momentjes.deel.wanneerVandaag", { tijd: nu.toLocaleTimeString(taalLocale(), { hour: "2-digit", minute: "2-digit" }) }),
        });
        setTekst("");
        setFoto(undefined);
        setMoment("geen");
        setMijlpaal(undefined);
        setPrive(false);
        setKringIds([]);
        onSluit();
    };
    const chip = (actief) => `rounded-full border px-3 py-1.5 text-xs font-semibold ${actief ? "border-brand bg-brand text-primary-foreground" : "border-border bg-white/70"}`;
    return (<div className="app-modal-achter z-40" onClick={onSluit}>
      <div className="app-modal" onClick={(e) => e.stopPropagation()}>
        <p className="flex items-center gap-1.5 font-display text-lg font-bold">{t("components.Momentjes.deel.titel")} <AppIcon functie="momentjes" maat="sm" vorm="kaal"/></p>
        <p className="mt-3 text-xs text-ink-soft">{t("components.Momentjes.deel.overWie")}</p>
        <div className="mt-1.5 flex gap-2">
          {kindKeuze.map((k) => (<button key={k.id} onClick={() => setKindId(k.id)} className={`flex items-center gap-2 ${chip(kindId === k.id)}`}>
              <img src={k.avatar} alt="" className="size-5 rounded-full object-cover"/>{k.naam}
            </button>))}
        </div>
        <p className="mt-4 text-xs text-ink-soft">{t("components.Momentjes.deel.foto")}</p>
        <label className="mt-1.5 block cursor-pointer overflow-hidden rounded-md border border-dashed border-brand/40 bg-white/60 text-center text-sm font-semibold text-brand">
          {foto ? <img src={foto} alt="" className="aspect-[4/3] w-full object-cover"/> : <span className="flex items-center justify-center gap-1.5 py-5"><AppIcon functie="foto" maat="sm" vorm="kaal"/>{t("components.Momentjes.deel.fotoKiezen")}</span>}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f)
        setFoto(URL.createObjectURL(f)); }}/>
        </label>
        <p className="mt-4 text-xs text-ink-soft">{t("components.Momentjes.deel.wat")}</p>
        <textarea value={tekst} onChange={(e) => setTekst(e.target.value)} rows={2} placeholder={t("components.Momentjes.deel.watPlaceholder")} className="mt-1.5 w-full resize-none rounded-md bg-white/80 p-3 text-sm outline-none"/>
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer py-1 font-semibold text-ink-soft">{t("components.Momentjes.deel.meerOpties")}</summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {["vooraf", "tijdens", "na"].map((m) => (<button key={m} onClick={() => setMoment(moment === m ? "geen" : m)} className={chip(moment === m)}>{momentLabel[m]}</button>))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {mijlpalen.map((m) => (<button key={m} onClick={() => setMijlpaal(mijlpaal === m ? undefined : m)} className={`flex items-center gap-1 ${chip(mijlpaal === m)}`}><AppIcon functie="mijlpaal" maat="sm" vorm="kaal"/> {mijlpaalLabel(m)}</button>))}
          </div>
        </details>
        {alsKring ? (<p className="mt-3 text-xs text-ink-soft">{t("components.Momentjes.deel.metOuders", { naam: kinderen.find((k) => k.id === kindId)?.naam })}</p>) : (<>
            <p className="mt-4 text-xs text-ink-soft">{t("components.Momentjes.deel.wieZien")}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <button onClick={() => { setPrive(true); setKringIds([]); }} className={chip(prive)}>{t("components.Momentjes.deel.alleenMij")}</button>
              <button onClick={() => setPrive(false)} className={chip(!prive)}>{parents.joris.naam}</button>
              {kringVoorKind.length ? (<button onClick={() => { setPrive(false); setKringIds(kringIds.length === kringVoorKind.length ? [] : kringVoorKind.map((p) => p.id)); }} className={chip(!prive && kringIds.length === kringVoorKind.length)}>
                  {t("components.Momentjes.deel.kringRond", { naam: kinderen.find((k) => k.id === kindId)?.naam })}
                </button>) : null}
            </div>
            {!prive && kringVoorKind.length ? (<div className="mt-2 flex flex-wrap gap-1.5">
                {kringVoorKind.map((p) => {
                    const aan = kringIds.includes(p.id);
                    return (<button key={p.id} onClick={() => setKringIds(aan ? kringIds.filter((x) => x !== p.id) : [...kringIds, p.id])} className={chip(aan)}>
                      <span className="inline-flex items-center gap-1">{aan ? <Vinkje className="size-3.5"/> : null}{persoonLabel(p)}</span>
                    </button>);
                })}
              </div>) : null}
          </>)}
        <button disabled={!tekst.trim() && !foto} onClick={deel} className="mt-4 w-full rounded-md bg-brand py-3 font-semibold text-primary-foreground disabled:opacity-40">
          {alsKring ? t("components.Momentjes.deel.delen") : prive ? t("components.Momentjes.deel.bewaren") : kringIds.length ? t("components.Momentjes.deel.delenMetPlus", { naam: parents.joris.naam, n: kringIds.length }) : t("components.Momentjes.deel.delenMet", { naam: parents.joris.naam })}
        </button>
      </div>
    </div>);
}
