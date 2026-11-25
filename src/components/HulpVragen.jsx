import { useState } from "react";
import { useTranslation } from "react-i18next";
import { taalLocale } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui-kit";
import { AppIcon } from "@/components/AppIcon";
import { rolNaam, useKring, wieNaam } from "@/lib/kring-store";
import { hulpKandidaten, hulpStatusTekst, kindNamen, kinderenVoor, trekHulpIn, useHulpStatus, useHulpVerzoeken, verversHulp, vraagHulp } from "@/lib/hulp-store";
import { useStart } from "@/lib/start-store";
import { bevestig } from "@/lib/feedback";
import { uur } from "@/lib/tijd-tekst";
import { Chevron } from "@/components/Tekens";
const veld = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
const datumTekst = (d) => new Date(`${d}T12:00:00`).toLocaleDateString(taalLocale(), { weekday: "long", day: "numeric", month: "long" });
const kindTekst = (k) => kindNamen(Array.isArray(k) ? k : kinderenVoor(k)).join(" & ");
/** Het formulier zelf — één keer gebouwd, hergebruikt in Taken, Agenda en de wisselflow. */
export function HulpForm({ voorstel = {}, onKlaar }) {
    const { t } = useTranslation();
    const st = useStart();
    useKring();
    const opties = [...st.kinderen.map((k) => ({ id: k.id, naam: k.naam })), ...(st.kinderen.length > 1 ? [{ id: "alle", naam: t("common.alleKinderen") }] : [])];
    const gevraagd = voorstel.kind === "beide" ? "alle" : voorstel.kind;
    const standaard = opties.some((o) => o.id === gevraagd) ? gevraagd : st.kinderen[0]?.id ?? "alle";
    const [kind, setKind] = useState(standaard);
    const [wat, setWat] = useState(voorstel.wat ?? "");
    const [datum, setDatum] = useState(voorstel.datum ?? "");
    const [tijd, setTijd] = useState(voorstel.tijd ?? "15:00");
    const [aan, setAan] = useState([]);
    const [bezig, setBezig] = useState(false);
    const kandidaten = hulpKandidaten(kind);
    const vandaag = new Date().toLocaleDateString("en-CA");
    const verstuur = async () => {
        setBezig(true);
        const gelukt = await vraagHulp({ kind, wat: wat.trim(), datum, tijd, ontvangers: aan });
        setBezig(false);
        if (gelukt) {
            bevestig(t("components.HulpVragen.bevestig"));
            onKlaar?.();
        }
    };
    return (<div className="mt-2 space-y-3 rounded-md border border-border bg-card p-3">
      <label className="block text-xs font-semibold">{t("components.HulpVragen.voorWie")}
        <select value={kind} onChange={(e) => { setKind(e.target.value); setAan([]); }} className={`mt-1 ${veld}`}>
          {opties.map((o) => <option key={o.id} value={o.id}>{o.naam}</option>)}
        </select>
      </label>
      <label className="block text-xs font-semibold">{t("components.HulpVragen.welkeHulp")}
        <input value={wat} maxLength={200} onChange={(e) => setWat(e.target.value)} placeholder={t("components.HulpVragen.placeholder")} className={`mt-1 ${veld}`}/>
      </label>
      <div className="flex gap-2">
        <label className="flex-1 text-xs font-semibold">{t("components.HulpVragen.datum")}<input type="date" min={vandaag} value={datum} onChange={(e) => setDatum(e.target.value)} className={`mt-1 ${veld}`}/></label>
        <label className="w-28 text-xs font-semibold">{t("components.HulpVragen.tijd")}<input type="time" value={tijd} onChange={(e) => setTijd(e.target.value)} className={`mt-1 ${veld}`}/></label>
      </div>
      <fieldset>
        <legend className="text-xs font-semibold">{t("components.HulpVragen.aanWie")}</legend>
        {kandidaten.length ? kandidaten.map((p) => (<label key={p.id} className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={aan.includes(p.id)} onChange={(e) => setAan((l) => (e.target.checked ? [...l, p.id] : l.filter((x) => x !== p.id)))} className="size-5 accent-[var(--color-brand)]"/>
            {wieNaam(p.id)} <span className="text-xs text-ink-soft">· {rolNaam(p.rol)}</span>
          </label>)) : <p className="mt-1 text-xs text-ink-soft">{t("components.HulpVragen.niemand", { kind: kindTekst(kind) })}</p>}
      </fieldset>
      <p className="text-[11px] text-ink-soft">{t("components.HulpVragen.eerstAccepteert")}</p>
      <div className="flex gap-2">
        <Button disabled={bezig || !wat.trim() || !datum || datum < vandaag || !aan.length} onClick={verstuur} className="min-h-11 bg-brand text-primary-foreground shadow-none">{t("components.HulpVragen.klaarzetten")}</Button>
        <Button variant="ghost" onClick={() => onKlaar?.()}>{t("common.annuleren")}</Button>
      </div>
    </div>);
}
/** Rij die in een aanmaakscherm laat zien dat je ook iemand uit je netwerk kunt vragen. */
export function HulpKnop({ voorstel = {}, label: eigenLabel }) {
    const { t } = useTranslation();
    const label = eigenLabel ?? t("components.HulpVragen.vragenNetwerk");
    const [open, setOpen] = useState(false);
    if (!open) {
        return (<button type="button" onClick={() => setOpen(true)} className="flex min-h-11 w-full items-center gap-2 rounded-md border border-border px-3 text-left text-sm font-semibold text-ink">
        <AppIcon functie="hulp" maat="sm" vorm="kaal"/>
        <span className="flex-1">{label}</span>
        <Chevron className="size-4 text-ink-soft"/>
      </button>);
    }
    return (<div>
      <p className="text-xs font-semibold text-ink-soft">{label}</p>
      <HulpForm voorstel={voorstel} onKlaar={() => setOpen(false)}/>
    </div>);
}
/** Hulp vragen aan je netwerk — onderdeel van Taken. De ouders zien de status; de vrager kan intrekken. */
export function HulpVragen({ open: openVanBuiten, onOpenChange }) {
    const { t } = useTranslation();
    const lijst = useHulpVerzoeken().filter((h) => h.status !== "withdrawn");
    const status = useHulpStatus();
    const [zelf, setZelf] = useState(false);
    const open = openVanBuiten ?? zelf;
    const zetOpen = (o) => { setZelf(o); onOpenChange?.(o); };
    return (<section className="mt-5">
      {!open ? (<button onClick={() => zetOpen(true)} className="flex min-h-11 w-full items-center gap-2 px-1 text-left">
          <AppIcon functie="kindtips" maat="sm" vorm="kaal"/>
          <span className="flex-1 text-sm font-extrabold text-[#2F4A3A]">{t("components.HulpVragen.vragenNetwerk")}</span>
          <Chevron className="size-4 text-ink-soft"/>
        </button>) : <h2 className="px-1 text-[13px] font-black uppercase tracking-[0.08em] text-ink-soft">{t("components.HulpVragen.hulpVragen")}</h2>}
      {open ? <HulpForm onKlaar={() => zetOpen(false)}/> : null}
      {status === "fout" && !lijst.length ? (<p role="alert" className="mt-2 flex items-center gap-3 px-1 text-xs text-ink-soft">{t("common.laadFout")}
          <button onClick={verversHulp} className="min-h-11 font-semibold text-brand">{t("common.opnieuwProberen")}</button></p>) : null}
      {lijst.length ? (<div className="mt-2 divide-y divide-[#E9E1D5] rounded-[22px] border border-white/85 bg-white/60">
          {lijst.map((h) => (<div key={h.id} className="px-3 py-3">
              <p className="text-sm font-semibold">{h.wat}</p>
              <p className="text-xs text-ink-soft">{kindTekst(h.kindIds)} · {datumTekst(h.datum)}{h.tijd ? ` · ${uur(h.tijd)}` : ""}</p>
              <p className="mt-1 text-xs">{t("components.HulpVragen.gevraagdAan", { namen: h.ontvangers.map((o) => o.naam || wieNaam(o.id)).join(", ") })}</p>
              {h.ontvangers.filter((o) => o.status === "declined").map((o) => (<p key={o.id} className="text-xs text-ink-soft">{o.reden ? t("components.HulpVragen.kanNietReden", { naam: o.naam || wieNaam(o.id), reden: o.reden }) : t("components.HulpVragen.kanNiet", { naam: o.naam || wieNaam(o.id) })}</p>))}
              <div className="mt-1 flex items-center gap-3">
                <Badge toon={h.status === "accepted" ? "info" : "klaar"}>{hulpStatusTekst(h)}</Badge>
                {h.status === "open" && h.doorMij && !String(h.id).startsWith("tmp-") ? <button onClick={() => trekHulpIn(h.id)} className="min-h-11 text-xs font-semibold text-ink-soft">{t("components.HulpVragen.intrekken")}</button> : null}
              </div>
            </div>))}
        </div>) : null}
    </section>);
}
