import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { HandHeart, Heart, MessageCircle, PartyPopper, ThumbsUp } from "lucide-react";
import { AppIcon, Pictogram, tekstMetIcoon } from "@/components/AppIcon";
import { Vinkje } from "@/components/Tekens";
import { useKring, persoonLabel, mag, mijnKringen, wieNaam } from "@/lib/kring-store";
import { useStart } from "@/lib/start-store";
import { useGezin } from "@/lib/gezin";
import { ProfielBeeld } from "@/components/ProfielBeeld";
import { verkleinFoto } from "@/lib/praktisch-sync";
import { Link } from "@tanstack/react-router";
import { momentLabel, mijlpaalLabel, mijlpalen, reacties, reageer, verwijderMomentje, voegMomentjeToe, zetMomentGedeeld } from "@/lib/momentjes-store";
import { DeelLabel, VerwijderDialoog } from "@/components/DelenKeuze";
import { bevestig } from "@/lib/feedback";
/** Reactie-id (uit momentjes-store) → lucide-icoon. "tekst" = eigen korte reactie, "duim" = lege eigen reactie. */
const REACTIE_ICOON = { leuk: Heart, lief: HandHeart, trots: PartyPopper, watGoed: ThumbsUp, tekst: MessageCircle, duim: ThumbsUp };
function ReactieIcoon({ id, className = "size-4" }) {
    const Icon = REACTIE_ICOON[id] ?? MessageCircle;
    return <Icon aria-hidden="true" strokeWidth={1.9} className={`shrink-0 text-[#B4637A] ${className}`}/>;
}
export function MomentjeKaart({ m, kijker }) {
    const { t } = useTranslation();
    const st = useStart();
    const g = useGezin();
    const [tekstOpen, setTekstOpen] = useState(false);
    const [tekst, setTekst] = useState("");
    const [weg, setWeg] = useState(false);
    const [bezig, setBezig] = useState(false);
    const kind = st.kinderen.find((k) => k.id === m.kindId) ?? { naam: "", kleur: "#8A7E72" };
    const ik = g.ik?.id;
    const vanMij = kijker ? m.auteurId === kijker : m.van === ik;
    // De andere ouder van DIT moment (per kind kan dat een andere ouder zijn).
    const anderId = vanMij ? m.anderId ?? g.anderVoor([m.kindId])?.id : m.van;
    const anderNaam = g.coOuders.find((c) => c.id === anderId)?.naam || t("common.deAndereOuder");
    const auteur = m.van === "kring" ? wieNaam(m.auteurId) : vanMij ? t("components.Momentjes.kaart.jou") : g.coOuders.some((c) => c.id === m.van) ? anderNaam : t("common.deAndereOuder");
    // Iets van een ander is altijd met jou gedeeld; eigen momenten: gedeeld of alleen jij.
    const gedeeld = !vanMij || !!m.gedeeld;
    const kanDelen = vanMij && !kijker && g.isSamen(m.kindId);
    const wissel = async () => {
        setBezig(true);
        const nu = !m.gedeeld;
        if (await zetMomentGedeeld(m.id, nu))
            bevestig(nu ? t("components.Momentjes.kaart.nuGedeeld") : t("components.Momentjes.kaart.nuPrive"));
        setBezig(false);
    };
    const verwijder = async () => {
        setWeg(false);
        if (await verwijderMomentje(m.id))
            bevestig(t("components.Momentjes.kaart.verwijderd"));
    };
    const kringTekst = m.kringIds?.length ? ` · ${m.kringIds.map((id) => wieNaam(id)).join(", ")}` : "";
    const getoond = tekstMetIcoon(m.tekst);
    return (<div className="overflow-hidden rounded-[22px] border border-white/85 bg-white/60">
      {m.foto ? <img src={m.foto} alt="" className="aspect-[4/3] w-full object-cover"/> : null}
      <div className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="grid size-[30px] place-items-center overflow-hidden rounded-full border-2" style={{ borderColor: kind.kleur ?? "#8A7E72" }}><ProfielBeeld beeld={kind.beeld} naam={kind.naam} kleur={kind.kleur ?? "#8A7E72"} maat={26}/></span>
          <span className="text-sm font-black">{kind.naam}</span>
          <span className="text-xs text-ink-soft">{t("components.Momentjes.kaart.vanWanneer", { auteur, wanneer: m.wanneer })}</span>
        </div>
        <p className="mt-2.5 flex items-start gap-1.5 text-[16.5px] font-extrabold leading-snug">{getoond.teken ? <Pictogram waarde={getoond.teken} maat="sm" className="mt-0.5"/> : null}<span>{getoond.tekst}</span></p>
        {m.reactie || m.reactieTekst ? (<p className="mt-3 flex flex-wrap items-center gap-1.5 rounded-[14px] bg-[#E9EFE3] px-3 py-2 text-xs text-[#2F4A3A]">
            <b>{m.reactieVan && m.reactieVan === ik ? t("common.jij") : anderNaam}:</b> {m.reactie ? <ReactieIcoon id={m.reactie} className="size-3.5"/> : null} {m.reactieTekst || reacties.find((r) => r.id === m.reactie)?.l ? <span>{m.reactieTekst || reacties.find((r) => r.id === m.reactie)?.l}</span> : null}
          </p>) : null}
        {!vanMij && !m.reactie && !kijker ? (tekstOpen ? (<div className="mt-3 flex gap-2">
              <input value={tekst} maxLength={80} onChange={(e) => setTekst(e.target.value)} placeholder={t("components.Momentjes.kaart.korteReactie")} className="min-w-0 flex-1 rounded-xl bg-surface px-3 py-2 text-xs outline-none"/>
              <button onClick={() => { reageer(m.id, { reactie: tekst.trim() ? "tekst" : "duim", reactieTekst: tekst.trim() }); setTekstOpen(false); }} className="min-h-10 shrink-0 rounded-full bg-brand px-4 text-xs font-semibold text-primary-foreground">{t("components.Momentjes.kaart.stuur")}</button>
            </div>) : (<div className="mt-3 flex flex-wrap gap-1.5">
              {reacties.map((r) => (<button key={r.id} onClick={() => reageer(m.id, { reactie: r.id, reactieTekst: r.l })} className="flex h-10 items-center gap-1.5 rounded-full border border-[#E6DED2] bg-white/80 px-3 text-[13px] font-extrabold">
                  <ReactieIcoon id={r.id}/> {r.l}
                </button>))}
              <button onClick={() => setTekstOpen(true)} aria-label={t("components.Momentjes.kaart.korteReactie")} className="grid size-10 place-items-center rounded-full text-ink-soft"><AppIcon functie="berichten" maat="sm" vorm="kaal"/></button>
            </div>)) : null}
        {kijker ? <p className="mt-2.5 text-xs text-ink-soft">{t("components.Momentjes.kaart.gedeeldMetJou")}</p> : (<div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <DeelLabel gedeeld={gedeeld || (!!m.kringIds?.length && !m.prive)}/>
            {!m.prive && (gedeeld || m.kringIds?.length) ? <span className="text-xs text-ink-soft">{m.van === "kring" ? t("components.Momentjes.kaart.gedeeldMetOuders") : t("components.Momentjes.kaart.gedeeldMet", { wie: [gedeeld ? (vanMij ? anderNaam : t("components.Momentjes.kaart.jou")) : null, kringTekst.replace(" · ", "")].filter(Boolean).join(", ") })}</span> : null}
          </div>)}
        {vanMij && !kijker ? (<div className="mt-1 flex flex-wrap gap-x-4">
            {kanDelen ? <button disabled={bezig} onClick={wissel} className="min-h-11 text-xs font-semibold text-brand disabled:opacity-50">{m.gedeeld ? t("components.Momentjes.kaart.maakPrive") : t("components.Momentjes.kaart.deelMet", { naam: anderNaam })}</button> : null}
            <button onClick={() => setWeg(true)} className="min-h-11 text-xs font-semibold text-ink-soft">{t("common.verwijderen")}</button>
          </div>) : null}
      </div>
      <VerwijderDialoog open={weg} onOpenChange={setWeg} titel={t("components.Momentjes.kaart.verwijderTitel")} tekst={m.gedeeld ? t("components.Momentjes.kaart.verwijderTekstGedeeld") : t("components.Momentjes.kaart.verwijderTekst")} onBevestig={verwijder}/>
    </div>);
}
export function DeelMomentje({ open, onSluit, kindId: startKind, alsKring }) {
    const { t } = useTranslation();
    const kring = useKring();
    const st = useStart();
    const g = useGezin();
    // Als kringlid: de kinderen komen uit de eigen kringweergave (manage-caregivers get-for-user), niet uit kring-store.
    const [kringKids, setKringKids] = useState([]);
    useEffect(() => {
        if (!alsKring)
            return;
        let weg = false;
        mijnKringen().then((views) => {
            if (weg)
                return;
            const v = views.find((x) => x.caregiver?.id === alsKring);
            setKringKids((v?.children ?? []).filter((c) => v.permissions?.[c.id]?.momentjes === "bijdragen").map((c) => ({ id: c.id, naam: c.name, kleur: c.color_code ?? "#8A7E72", beeld: c.avatar ?? undefined })));
        }).catch(() => { });
        return () => { weg = true; };
    }, [alsKring]);
    const kinderen = alsKring ? kringKids : st.kinderen;
    const kindKeuze = kinderen;
    const [kindId, setKindId] = useState(startKind ?? kindKeuze[0]?.id ?? kinderen[0]?.id ?? "");
    // De andere ouder van DIT kind; een Solo-kind kan niet met "de andere ouder" gedeeld worden: alleen jij en/of de kring.
    const anderVanKind = kindId ? g.anderVoor([kindId]) : null;
    const anderNaam = anderVanKind?.naam || t("components.Momentjes.deel.andereOuder");
    const metAnder = !!kindId && g.isSamen(kindId);
    const [bezig, setBezig] = useState(false);
    // Kinderen komen na het inloggen van de server: kies het eerste zodra ze er zijn.
    useEffect(() => { if (!kindId && kindKeuze[0])
        setKindId(kindKeuze[0].id); }, [kindId, kindKeuze]);
    const [kringIds, setKringIds] = useState([]);
    // Alleen kringleden die momentjes van dit kind mogen bekijken, komen in aanmerking.
    const kringVoorKind = kring.personen.filter((p) => mag(p, kindId, "momentjes"));
    const [foto, setFoto] = useState();
    const [tekst, setTekst] = useState("");
    const [moment, setMoment] = useState("geen");
    const [mijlpaal, setMijlpaal] = useState();
    // Nieuw moment = standaard "Alleen jij".
    const [priveKeuze, setPrive] = useState(true);
    // Zonder gekoppelde ouder en zonder gekozen kringleden blijft het altijd privé.
    const prive = priveKeuze || (!metAnder && !kringIds.length);
    if (!open)
        return null;
    const deel = async () => {
        if (bezig || !kindId)
            return;
        setBezig(true);
        const gelukt = await voegMomentjeToe({
            kindId, tekst: tekst.trim(), foto, moment, mijlpaal, prive: alsKring ? false : prive,
            kringIds: alsKring || prive ? [] : kringIds.filter((id) => kringVoorKind.some((p) => p.id === id)),
        });
        setBezig(false);
        if (!gelukt)
            return;
        setTekst("");
        setFoto(undefined);
        setMoment("geen");
        setMijlpaal(undefined);
        setPrive(true);
        setKringIds([]);
        onSluit();
    };
    const chip = (actief) => `min-h-9 rounded-full border px-3.5 text-xs font-semibold ${actief ? "border-brand bg-brand text-primary-foreground" : "border-border bg-white/70"}`;
    return (<div className="app-modal-achter z-40" onClick={onSluit}>
      <div className="app-modal" onClick={(e) => e.stopPropagation()}>
        <p className="flex items-center gap-1.5 font-display text-lg font-bold">{t("components.Momentjes.deel.titel")} <AppIcon functie="momentjes" maat="sm" vorm="kaal"/></p>
        <p className="mt-3 text-xs text-ink-soft">{t("components.Momentjes.deel.overWie")}</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {kindKeuze.map((k) => (<button key={k.id} onClick={() => setKindId(k.id)} className={`flex items-center gap-2 ${chip(kindId === k.id)}`}>
              <ProfielBeeld beeld={k.beeld} naam={k.naam} kleur={k.kleur ?? "#8A7E72"} maat={20}/>{k.naam}
            </button>))}
        </div>
        <p className="mt-4 text-xs text-ink-soft">{t("components.Momentjes.deel.foto")}</p>
        <label className="mt-1.5 block cursor-pointer overflow-hidden rounded-md border border-dashed border-brand/40 bg-white/60 text-center text-sm font-semibold text-brand">
          {foto ? <img src={foto} alt="" className="aspect-[4/3] w-full object-cover"/> : <span className="flex items-center justify-center gap-1.5 py-5"><AppIcon functie="foto" maat="sm" vorm="kaal"/>{t("components.Momentjes.deel.fotoKiezen")}</span>}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f)
        verkleinFoto(f).then(setFoto).catch(() => setFoto(undefined)); }}/>
        </label>
        <p className="mt-4 text-xs text-ink-soft">{t("components.Momentjes.deel.wat")}</p>
        <textarea value={tekst} onChange={(e) => setTekst(e.target.value)} rows={2} placeholder={t("components.Momentjes.deel.watPlaceholder")} className="mt-1.5 w-full resize-none rounded-md bg-white/80 p-3 text-sm outline-none"/>
        <details className="mt-2 text-xs">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-ink-soft">{t("components.Momentjes.deel.meerOpties")}</summary>
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
              {metAnder ? <button onClick={() => setPrive(false)} className={chip(!prive)}>{anderNaam}</button> : null}
              {kringVoorKind.length ? (<button onClick={() => { setPrive(false); setKringIds(kringIds.length === kringVoorKind.length ? [] : kringVoorKind.map((p) => p.id)); }} className={chip(!prive && kringIds.length === kringVoorKind.length)}>
                  {t("components.Momentjes.deel.kringRond", { naam: kinderen.find((k) => k.id === kindId)?.naam })}
                </button>) : null}
            </div>
            {!metAnder ? (<div className="mt-2.5 flex items-start gap-2.5 rounded-2xl border border-[#E3DACD] bg-white/70 px-3.5 py-3">
                <AppIcon functie="samen" maat="sm"/>
                <div className="min-w-0 text-xs leading-relaxed text-ink-soft">
                  {t("components.Momentjes.deel.nietGekoppeld")}{" "}
                  <Link to="/verbonden-personen" onClick={onSluit} className="font-extrabold text-[#3F5747] underline-offset-2 hover:underline">{t("components.Momentjes.deel.uitnodigen")}</Link>
                </div>
              </div>) : null}
            {(metAnder ? !prive : true) && kringVoorKind.length ? (<div className="mt-2 flex flex-wrap gap-1.5">
                {kringVoorKind.map((p) => {
                    const aan = kringIds.includes(p.id);
                    return (<button key={p.id} onClick={() => { setPrive(false); setKringIds(aan ? kringIds.filter((x) => x !== p.id) : [...kringIds, p.id]); }} className={chip(aan)}>
                      <span className="inline-flex items-center gap-1">{aan ? <Vinkje className="size-3.5"/> : null}{persoonLabel(p)}</span>
                    </button>);
                })}
              </div>) : null}
          </>)}
        <button disabled={(!tekst.trim() && !foto) || !kindId || bezig} onClick={deel} className="mt-4 min-h-12 w-full rounded-full bg-brand px-5 font-semibold text-primary-foreground disabled:opacity-40">
          {alsKring ? t("components.Momentjes.deel.delen") : prive ? t("components.Momentjes.deel.bewaren") : !metAnder ? t("components.Momentjes.deel.delenKring") : kringIds.length ? t("components.Momentjes.deel.delenMetPlus", { naam: anderNaam, n: kringIds.length }) : t("components.Momentjes.deel.delenMet", { naam: anderNaam })}
        </button>
      </div>
    </div>);
}
