import { Mijlpalen, useMijlpalenLijst, voegMijlpaal } from "@/components/Mijlpalen";
import { BewerkPotlood } from "@/components/ui-kit";
import { useKring, adresboek, persoonLabel } from "@/lib/kring-store";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { AppShell, BackButton, PageHeader } from "@/components/AppShell";
import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import i18n, { taalLocale } from "@/i18n";
import { Button } from "@/components/ui/button";
import { DeelMomentje, MomentjeKaart } from "@/components/Momentjes";
import { useMomentjes } from "@/lib/momentjes-store";
import { AppIcon } from "@/components/AppIcon";
import { Loader2, Pencil, Plus } from "lucide-react";
import { Chevron, Kruis, MetChevron } from "@/components/Tekens";
import { useStart, leeftijdTekst, kindKleuren, echteKindId, start } from "@/lib/start-store";
import { useGezin } from "@/lib/gezin";
import { bevestig } from "@/lib/feedback";
import { MedischGezag } from "@/components/MedischGezag";
import { BeeldKiezer, ProfielBeeld } from "@/components/ProfielBeeld";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { vandaagIso } from "@/lib/datum-vandaag";
import { InhoudLaden, LaadFout } from "@/components/Laden";
import { TelefoonInvoer, telLink, toonTelefoon } from "@/components/TelefoonInvoer";
import { laadKind, bewaarKind, bewaarNotitie, useKindProfiel, zetKindBeeld } from "@/lib/kindprofiel-store";
import { GezagToegang, GezagToegangRij } from "@/components/GezagToegang";
const N = "routes.kinderenKindId.";
export const Route = createFileRoute("/kinderen/$kindId")({
    loader: ({ params }) => {
        // Eigen kinderen hebben een server-id (uuid); of het kind bij dit account hoort, bepaalt het component.
        if (!/^[0-9a-f-]{36}$|^tmp-/i.test(params.kindId))
            throw notFound();
        return { naam: i18n.t("routes.kinderenKindId.kindprofiel") };
    },
    head: ({ loaderData }) => {
        const t = loaderData ? i18n.t("common.metaTitel", { titel: loaderData.naam }) : i18n.t("routes.kinderenKindId.meta.nietGevonden");
        return {
            meta: [
                { title: t },
                { name: "description", content: i18n.t("routes.kinderenKindId.meta.beschrijving") },
                { property: "og:title", content: t },
                { property: "og:description", content: i18n.t("routes.kinderenKindId.meta.beschrijving") },
                { property: "og:type", content: "profile" },
                { name: "twitter:card", content: "summary" },
            ],
        };
    },
    notFoundComponent: KindNietGevonden,
    component: KindProfielWrap,
});
function KindNietGevonden() {
    const { t } = useTranslation();
    return (<AppShell>
      <PageHeader titel={t("routes.kinderenKindId.nietGevonden")} terug="/kinderen"/>
    </AppShell>);
}
function KindProfielWrap() {
    const { kindId } = Route.useParams();
    const nav = useNavigate();
    const st = useStart();
    const k = st.kinderen.find((x) => x.id === kindId);
    const tijdelijk = String(kindId).startsWith("tmp-");
    const echt = tijdelijk ? echteKindId(kindId) : null;
    // Een net toegevoegd kind (tmp-…) krijgt na het opslaan een echt id: dan naar het echte profiel.
    useEffect(() => { if (echt)
        nav({ to: "/kinderen/$kindId", params: { kindId: echt }, replace: true }); }, [echt]);
    const server = k && !tijdelijk;
    const { kind, notitie, fout } = useKindProfiel(server ? kindId : null);
    if ((!k && !echt) || kind === null)
        return <KindNietGevonden />;
    if (!kind)
        return (<AppShell>
        <div className="flex items-center gap-3"><BackButton terug="/kinderen"/><h1 className="lora min-w-0 flex-1 text-[32px] leading-tight">{i18n.t(N + "allesOver", { naam: k?.naam ?? "" })}</h1></div>
        {fout && server ? <LaadFout onOpnieuw={() => laadKind(kindId)}/> : <InhoudLaden />}
      </AppShell>);
    return <KindProfiel kort={k} kind={kind} notitie={notitie}/>;
}
const GLAS = "rounded-[22px] border border-white/85 bg-white/60";
const veld = "mt-1.5 w-full rounded-xl border border-[#E3DACD] bg-white/85 px-3.5 py-2.5 text-[15px] font-normal text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";
const knopOpslaan = "flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-brand px-5 text-sm font-black text-primary-foreground shadow-[0_4px_12px_rgba(63,87,71,.2)] active:scale-[.99] disabled:opacity-50";
const knopAnnuleer = "flex h-11 flex-1 items-center justify-center rounded-full border border-[#E3DACD] bg-white/70 px-5 text-sm font-bold text-ink active:scale-[.99]";
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const lijst = (v) => (Array.isArray(v) ? v : []);
const schoon = (v) => (typeof v === "string" ? v.trim() : v ?? "");
const nieuwId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
const ROLLEN = ["ouder", "grootouder", "verzorger", "oppas", "familie", "school", "zorg", "anders"];
/** Volle jaren (voor de medische leeftijdsgroepen); null zonder geboortedatum. */
function jaren(geb) {
    if (!geb)
        return null;
    const d = new Date(`${geb}T12:00:00`), nu = new Date();
    let j = nu.getFullYear() - d.getFullYear();
    if (nu.getMonth() < d.getMonth() || (nu.getMonth() === d.getMonth() && nu.getDate() < d.getDate()))
        j -= 1;
    return j;
}
const datumTekst = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString(taalLocale(), { day: "numeric", month: "long", year: "numeric" }) : "");
/** Formulier met losse velden (zelfde vormgeving als het gezondheidsformulier). */
function Formulier({ velden, begin, onBewaar, onAnnuleer, extra, voet }) {
    const { t } = useTranslation();
    const [w, setW] = useState(begin);
    const [bezig, setBezig] = useState(false);
    return (<form className="space-y-3.5 border-t border-[#E9E1D5] pt-4" onSubmit={async (e) => { e.preventDefault();
        // Een ongeldig telefoonnummer (of ander ongeldig veld) eerst laten verbeteren.
        const fout = e.currentTarget.querySelector("[aria-invalid=\"true\"]");
        if (fout) {
            fout.focus();
            fout.blur();
            fout.focus();
            return;
        }
        setBezig(true); const ok = await onBewaar(w); setBezig(false); if (ok)
        onAnnuleer(); }}>
      {velden.map((v) => (<label key={v.id} className="block text-[13px] font-bold text-ink">{v.label}
          {v.type === "lang" ? <textarea aria-label={v.label} rows={2} value={w[v.id] ?? ""} onChange={(e) => setW((x) => ({ ...x, [v.id]: e.target.value }))} className={veld}/>
            : <input aria-label={v.label} type={v.type === "datum" ? "date" : "text"} max={v.type === "datum" ? v.max : undefined} required={v.verplicht} value={w[v.id] ?? ""} onChange={(e) => { const w2 = v.max && e.target.value > v.max ? v.max : e.target.value; setW((x) => ({ ...x, [v.id]: w2 })); }} className={veld}/>}
        </label>))}
      {extra ? extra(w, setW) : null}
      {voet ? <p className="text-xs text-ink-soft">{voet}</p> : null}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onAnnuleer} className={knopAnnuleer}>{t("common.annuleren")}</button>
        <button type="submit" disabled={bezig} className={knopOpslaan}>{bezig ? <Loader2 className="size-4 animate-spin" aria-hidden="true"/> : null}{t("common.opslaan")}</button>
      </div>
    </form>);
}
/** Knop onderaan een opengeklapte sectie: "Bewerken" (al gevuld) of "Toevoegen" (nog leeg), over de volle breedte. */
function SectieKnop({ gevuld, onClick }) {
    const { t } = useTranslation();
    return (<button type="button" onClick={onClick} className={`mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-extrabold text-[#3F5747] transition active:scale-[.99] ${gevuld ? "border border-[#E3DACD] bg-white/70 hover:bg-white" : "border-2 border-dashed border-[#CBD8C6] hover:bg-white/50"}`}>
      {gevuld ? <Pencil aria-hidden="true" strokeWidth={2} className="size-4"/> : <Plus aria-hidden="true" strokeWidth={2.2} className="size-4"/>}
      {gevuld ? t("common.bewerken") : t("common.toevoegen")}
    </button>);
}
/** Lijst bewerken (contacten, leerkrachten, activiteiten): items toevoegen en weghalen binnen het formulier. */
function LijstVelden({ titel, items, velden, onChange, toevoegenTekst }) {
    const { t } = useTranslation();
    const zetItem = (i, p) => onChange(items.map((x, j) => (j === i ? { ...x, ...p } : x)));
    return (<fieldset className="space-y-2">
      <legend className="mb-1 text-[13px] font-bold text-ink">{titel}</legend>
      {items.map((it, i) => (<div key={it.id ?? i} className="relative space-y-2.5 rounded-2xl border border-[#E9E1D5] bg-white/70 px-3.5 py-3 pr-12">
          <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={t("common.verwijderen")} className="absolute right-1 top-1 grid size-9 place-items-center rounded-full text-ink-soft"><Kruis className="size-4"/></button>
          {velden.map((v) => v.type === "rol" ? (<label key={v.id} className="block text-[11px] font-semibold text-ink-soft">{v.label}
              <select value={it[v.id] ?? "anders"} onChange={(e) => zetItem(i, { [v.id]: e.target.value })} className={veld}>
                {ROLLEN.map((r) => <option key={r} value={r}>{t(N + `rol.${r}`)}</option>)}
              </select></label>) : v.type === "vink" ? (<label key={v.id} className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={!!it[v.id]} onChange={(e) => zetItem(i, { [v.id]: e.target.checked })} className="size-4 accent-[var(--brand)]"/>{v.label}</label>)
            : v.type === "tel" ? (<div key={v.id} className="text-[11px] font-semibold text-ink-soft">{v.label}<TelefoonInvoer value={it[v.id] ?? ""} ariaLabel={v.label} onChange={(nr) => zetItem(i, { [v.id]: nr })}/></div>)
            : (<label key={v.id} className="block text-[11px] font-semibold text-ink-soft">{v.label}<input type={v.type === "email" ? "email" : "text"} value={it[v.id] ?? ""} onChange={(e) => zetItem(i, { [v.id]: e.target.value })} className={veld}/></label>))}
        </div>))}
      <button type="button" onClick={() => onChange([...items, { id: nieuwId() }])} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#CBD8C6] text-sm font-extrabold text-[#3F5747] transition hover:bg-white/50 active:scale-[.99]"><Plus aria-hidden="true" strokeWidth={2.2} className="size-4"/>{toevoegenTekst}</button>
    </fieldset>);
}
function KindProfiel({ kort, kind, notitie }) {
    const { t } = useTranslation();
    const kindId = kind.id;
    const gezin = useGezin();
    useKring();
    const kan = kind.can_edit !== false;
    // Toegang per onderdeel (server): wat je niet mag zien, komt niet mee; bewerken alleen met `edit`.
    const verborgen = lijst(kind.hidden_sections);
    const mag = (sectie) => kan && (kind.my_access?.[sectie]?.edit ?? true) && !verborgen.includes(sectie);
    const nav = useNavigate();
    const [toegangOpen, setToegangOpen] = useState(() => typeof window !== "undefined" && window.location.hash === "#toegang");
    const [verwijderOpen, setVerwijderOpen] = useState(false);
    const profiel = obj(kind.profile);
    const sec = (s) => obj(profiel[s]);
    const school = sec("school"), opvang = obj(school.opvang), gezond = sec("gezondheid"), prak = sec("praktisch");
    const personen = lijst(profiel.personen);
    const { lijst: momentjes } = useMomentjes();
    const mijn = momentjes.filter((m) => m.kindId === kindId);
    const mijlpalen = useMijlpalenLijst().filter((m) => m.kind === kindId);
    const [deelOpen, setDeelOpen] = useState(false);
    const [toevoegen, setToevoegen] = useState(false);
    const [mijlpaalTekst, setMijlpaalTekst] = useState("");
    const [alleMomenten, setAlleMomenten] = useState(false);
    const [open, setOpen] = useState(null);
    const [bewerk, setBewerk] = useState(null);
    const [beeldOpen, setBeeldOpen] = useState(false);
    const leeftijd = leeftijdTekst(kind.date_of_birth);
    const kleurHex = kind.color_code ?? kort.kleur ?? "#6F7F68";
    const kring = adresboek(kindId).map(persoonLabel);
    const ouders = [gezin.ik?.naam || t("common.jij"), ...lijst(kind.linked_parents).map((o) => o.name)];
    const mensen = [...ouders, ...kring];
    const groepen = [
        { id: "school", sectie: "school", icoon: "school", titel: t(N + "groep.school"), samenvatting: [kind.school, school.groep, kind.daycare].filter(Boolean).join(" · "), rijen: [
                { label: t(N + "groep.schoolLabel"), waarde: kind.school },
                { label: t(N + "groep.klas"), waarde: school.groep },
                { label: t(N + "eigen.leerkrachten"), waarde: lijst(school.leerkrachten).map((l) => [l.naam, l.telefoon ? toonTelefoon(l.telefoon) : "", l.email].filter(Boolean).join(" · ")).join("\n") },
                { label: t(N + "groep.opvang"), waarde: kind.daycare },
                { label: t(N + "eigen.opvangDagen"), waarde: opvang.dagen },
                { label: t(N + "eigen.opvangContact"), waarde: opvang.contact },
            ], formulier: () => (<Formulier velden={[
                    { id: "school", label: t(N + "groep.schoolLabel") }, { id: "groep", label: t(N + "groep.klas") },
                    { id: "daycare", label: t(N + "groep.opvang") }, { id: "dagen", label: t(N + "eigen.opvangDagen") }, { id: "contact", label: t(N + "eigen.opvangContact"), type: "lang" },
                ]} begin={{ school: kind.school ?? "", groep: school.groep ?? "", daycare: kind.daycare ?? "", dagen: opvang.dagen ?? "", contact: opvang.contact ?? "", leerkrachten: lijst(school.leerkrachten) }} extra={(w, setW) => <LijstVelden titel={t(N + "eigen.leerkrachten")} items={w.leerkrachten} onChange={(l) => setW((x) => ({ ...x, leerkrachten: l }))} toevoegenTekst={t(N + "eigen.leerkrachtToevoegen")} velden={[{ id: "naam", label: t(N + "naam") }, { id: "telefoon", label: t(N + "eigen.telefoon"), type: "tel" }, { id: "email", label: t(N + "eigen.email"), type: "email" }]}/>} onAnnuleer={() => setBewerk(null)} onBewaar={(w) => bewaarKind(kindId, {
                    school: schoon(w.school), daycare: schoon(w.daycare),
                    profile: { school: { ...school, groep: schoon(w.groep), leerkrachten: w.leerkrachten.filter((l) => schoon(l.naam)).map((l) => ({ id: l.id, naam: schoon(l.naam), telefoon: schoon(l.telefoon), email: schoon(l.email) })), opvang: { ...opvang, dagen: schoon(w.dagen), contact: schoon(w.contact) } } },
                })}/>) },
        { id: "gezondheid", sectie: "gezondheid", icoon: "gezondheid", titel: t(N + "groep.gezondheid"), samenvatting: [kind.doctor && t(N + "eigen.huisartsKlein"), gezond.tandarts && t(N + "groep.tandartsKlein"), kind.allergies && t(N + "eigen.allergieenKlein")].filter(Boolean).join(", "), rijen: [
                { label: t(N + "eigen.huisarts"), waarde: kind.doctor },
                { label: t(N + "eigen.tandarts"), waarde: gezond.tandarts },
                { label: t(N + "eigen.allergieen"), waarde: kind.allergies },
                { label: t(N + "eigen.medicatie"), waarde: gezond.medicatie },
                { label: t(N + "eigen.gezondheidOverig"), waarde: kind.medical_notes },
            ], voet: t(N + "groep.gezondheidVoet"), formulier: () => (<Formulier velden={[
                    { id: "doctor", label: t(N + "eigen.huisarts"), type: "lang" }, { id: "tandarts", label: t(N + "eigen.tandarts"), type: "lang" },
                    { id: "allergies", label: t(N + "eigen.allergieen"), type: "lang" }, { id: "medicatie", label: t(N + "eigen.medicatie"), type: "lang" }, { id: "overig", label: t(N + "eigen.gezondheidOverig"), type: "lang" },
                ]} begin={{ doctor: kind.doctor ?? "", tandarts: gezond.tandarts ?? "", allergies: kind.allergies ?? "", medicatie: gezond.medicatie ?? "", overig: kind.medical_notes ?? "" }} voet={t(N + "gezondheid.delen")} onAnnuleer={() => setBewerk(null)} onBewaar={(w) => bewaarKind(kindId, {
                    doctor: schoon(w.doctor), allergies: schoon(w.allergies), medical_notes: schoon(w.overig),
                    profile: { gezondheid: { ...gezond, tandarts: schoon(w.tandarts), medicatie: schoon(w.medicatie) } },
                })}/>), na: <MedischGezag kindId={kindId} naam={kind.name} leeftijd={jaren(kind.date_of_birth)}/> },
        { id: "activiteiten", sectie: "praktisch", icoon: "activiteiten", titel: t(N + "groep.activiteiten"), samenvatting: [prak.hobbys, ...lijst(prak.activiteiten).map((a) => a.naam)].filter(Boolean).join(" · "), rijen: [
                { label: t(N + "eigen.hobbys"), waarde: prak.hobbys },
                ...lijst(prak.activiteiten).map((a) => ({ label: a.naam, waarde: a.wanneer || "—" })),
            ], formulier: () => (<Formulier velden={[{ id: "hobbys", label: t(N + "eigen.hobbys"), type: "lang" }]} begin={{ hobbys: prak.hobbys ?? "", activiteiten: lijst(prak.activiteiten) }} extra={(w, setW) => <LijstVelden titel={t(N + "groep.activiteiten")} items={w.activiteiten} onChange={(l) => setW((x) => ({ ...x, activiteiten: l }))} toevoegenTekst={t(N + "eigen.activiteitToevoegen")} velden={[{ id: "naam", label: t(N + "eigen.activiteit") }, { id: "wanneer", label: t(N + "eigen.wanneer") }]}/>} onAnnuleer={() => setBewerk(null)} onBewaar={(w) => bewaarKind(kindId, {
                    profile: { praktisch: { ...prak, hobbys: schoon(w.hobbys), activiteiten: w.activiteiten.filter((a) => schoon(a.naam)).map((a) => ({ id: a.id, naam: schoon(a.naam), wanneer: schoon(a.wanneer) })) } },
                })}/>) },
        { id: "maten", sectie: "praktisch", icoon: "kledingmaten", titel: t(N + "groep.maten"), samenvatting: [kind.clothes_size && t(N + "groep.kledingMaat", { maat: kind.clothes_size }), kind.shoe_size && t(N + "groep.schoenMaat", { maat: kind.shoe_size })].filter(Boolean).join(" · "), rijen: [
                { label: t(N + "groep.kleding"), waarde: kind.clothes_size },
                { label: t(N + "groep.schoenen"), waarde: kind.shoe_size },
            ], voet: prak.matenGewijzigd ? t(N + "groep.laatstGewijzigd", { datum: datumTekst(prak.matenGewijzigd) }) : null, formulier: () => (<Formulier velden={[{ id: "kleding", label: t(N + "groep.kleding") }, { id: "schoen", label: t(N + "groep.schoenen") }]} begin={{ kleding: kind.clothes_size ?? "", schoen: kind.shoe_size ?? "" }} onAnnuleer={() => setBewerk(null)} onBewaar={(w) => bewaarKind(kindId, {
                    clothes_size: schoon(w.kleding), shoe_size: schoon(w.schoen),
                    profile: { praktisch: { ...prak, matenGewijzigd: new Date().toISOString().slice(0, 10) } },
                })}/>) },
        { id: "praktisch", sectie: "praktisch", icoon: "lijst", titel: t(N + "eigen.praktisch"), samenvatting: [prak.routines, prak.overig].filter(Boolean).join(" · "), rijen: [
                { label: t(N + "eigen.routines"), waarde: prak.routines },
                { label: t(N + "eigen.praktischOverig"), waarde: prak.overig },
            ], formulier: () => (<Formulier velden={[{ id: "routines", label: t(N + "eigen.routines"), type: "lang" }, { id: "overig", label: t(N + "eigen.praktischOverig"), type: "lang" }]} begin={{ routines: prak.routines ?? "", overig: prak.overig ?? "" }} onAnnuleer={() => setBewerk(null)} onBewaar={(w) => bewaarKind(kindId, {
                    profile: { praktisch: { ...prak, routines: schoon(w.routines), overig: schoon(w.overig) } },
                })}/>) },
        { id: "basis", sectie: "basis", icoon: "persoon", titel: t(N + "groep.basis"), samenvatting: kind.date_of_birth ? t(N + "groep.geborenOp", { datum: datumTekst(kind.date_of_birth) }) : "", rijen: [
                { label: t(N + "naam"), waarde: [kind.name, kind.last_name].filter(Boolean).join(" ") },
                { label: t(N + "groep.geboren"), waarde: datumTekst(kind.date_of_birth) },
                { label: t(N + "eigen.ouders"), waarde: ouders.join(", ") },
            ], formulier: () => <BasisFormulier kind={kind} onKlaar={() => setBewerk(null)}/> },
    ];
    const momenten = [
        ...mijn.map((m) => ({ soort: "Momentje", sleutel: m.datum ?? "0", m })),
        ...mijlpalen.map((p) => ({ soort: "Mijlpaal", sleutel: `${p.jaar}-00`, p })),
    ].sort((a, b2) => b2.sleutel.localeCompare(a.sleutel));
    const zichtbaar = alleMomenten ? momenten : momenten.slice(0, 2);
    const Rij = ({ id, icoon, titel, samenvatting }) => {
        const isOpen = open === id;
        return (<button onClick={() => { setOpen(isOpen ? null : id); setBewerk(null); }} className="flex min-h-14 w-full items-center gap-3 py-2.5 text-left" aria-expanded={isOpen}>
        {icoon}
        <span className="min-w-0 flex-1">
          <span className="block text-[15.5px] font-black">{titel}</span>
          <span className="block truncate text-xs text-ink-soft">{samenvatting || t(N + "nogNiets")}</span>
        </span>
        {samenvatting || isOpen ? <Chevron richting="omlaag" open={isOpen} className="size-4 text-ink-soft"/> : <Plus aria-hidden="true" strokeWidth={2} className="size-4 shrink-0 text-ink-soft"/>}
      </button>);
    };
    const goedOmTeWeten = [kind.allergies, gezond.medicatie].map((x) => x?.trim()).filter(Boolean).join(", ");
    const toonGroep = (g) => {
        const gevuld = g.rijen.filter((r) => r.waarde);
        const dicht = verborgen.includes(g.sectie);
        const kanHier = mag(g.sectie);
        return (<div key={g.id} id={`onderdeel-${g.id}`} className="scroll-mt-20">
            <Rij id={g.id} icoon={<AppIcon functie={g.icoon} maat="md"/>} titel={g.titel} samenvatting={dicht ? t(N + "toegang.geenToegangKort") : g.samenvatting}/>
            {open === g.id ? (<div className="mb-3 space-y-2">
                {dicht ? <p className="text-sm text-ink-soft">{t(N + "toegang.geenToegang")}</p> : null}
                {!dicht ? gevuld.map((r) => (<div key={r.label} className="rounded-md bg-white/60 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{r.label}</p>
                    <p className="whitespace-pre-line text-sm">{r.waarde}</p>
                  </div>)) : null}
                {!dicht && gevuld.length === 0 && bewerk !== g.id ? <p className="text-sm text-ink-soft">{kanHier ? t(N + "eigen.leegSectie") : t(N + "eigen.leegSectieLezen")}</p> : null}
                {!dicht && g.voet && gevuld.length ? <p className="text-[11px] text-ink-soft">{g.voet}</p> : null}
                {bewerk === g.id && kanHier ? g.formulier() : kanHier ? <SectieKnop gevuld={gevuld.length > 0} onClick={() => setBewerk(g.id)}/> : null}
                {!dicht && g.na && bewerk !== g.id ? g.na : null}
              </div>) : null}
          </div>);
    };
    return (<AppShell>
      <div className="flex items-center gap-3">
        <BackButton terug="/kinderen"/>
        <h1 className="lora min-w-0 flex-1 text-[32px] leading-tight">{t(N + "allesOver", { naam: kind.name })}</h1>
      </div>
      <section className={`${GLAS} relative mt-4 p-4`}>
        <div className="flex items-center gap-3.5 pr-10">
          <button type="button" disabled={!mag("basis")} onClick={() => setBeeldOpen(true)} aria-label={t(N + "eigen.beeldWijzigen", { naam: kind.name })} className="relative shrink-0 rounded-full border-[3px]" style={{ borderColor: kleurHex }}>
            <ProfielBeeld beeld={kort.beeld} naam={kind.name} kleur={kleurHex} maat={66}/>
          </button>
          <div className="min-w-0">
            <p className="text-[19px] font-black">{leeftijd ? t(N + "eigen.naamLeeftijd", { naam: kind.name, leeftijd }) : kind.name}</p>
            <p className="mt-0.5 text-sm leading-snug">{kind.description || <span className="text-ink-soft">{kan ? t(N + "eigen.omschrijvingLeeg") : t(N + "eigen.nogNietIngevuld")}</span>}</p>
          </div>
        </div>
        {mag("basis") ? <div className="absolute right-3 top-3"><BewerkPotlood onClick={() => { setOpen("basis-kop"); setBewerk("basis-kop"); }} label={t(N + "gegevensAanpassen", { naam: kind.name })}/></div> : null}
        {goedOmTeWeten ? (<div className="mt-3 flex items-start gap-2 rounded-[14px] bg-[#E9EFE3] px-3 py-2.5">
            <AppIcon functie="info" maat="sm" vorm="kaal"/>
            <p className="text-[13.5px] leading-snug text-[#2F4A3A]"><Trans i18nKey={N + "goedOmTeWeten"} values={{ tekst: goedOmTeWeten }} components={{ b: <b/> }}/></p>
          </div>) : null}
      </section>
      {bewerk === "basis-kop" ? <div className="mt-2"><BasisFormulier kind={kind} onKlaar={() => { setBewerk(null); setOpen(null); }}/></div> : null}
      <Sheet open={beeldOpen} onOpenChange={setBeeldOpen}>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-background">
          <SheetHeader><SheetTitle className="font-display">{t(N + "eigen.beeldTitel", { naam: kind.name })}</SheetTitle></SheetHeader>
          <div className="px-4 pb-6"><BeeldKiezer beeld={kort.beeld} naam={kind.name} overslaanTekst={t("common.sluiten")} onKies={(b) => { if (!b && !kort.beeld) {
        setBeeldOpen(false);
        return;
    } zetKindBeeld(kindId, b); bevestig(b ? t(N + "eigen.beeldOpgeslagen") : t(N + "eigen.beeldVerwijderd")); setBeeldOpen(false); }}/></div>
        </SheetContent>
      </Sheet>

      <div className={`${GLAS} mt-3 px-4`}>
        <Link to="/kring/$kindId" params={{ kindId }} className="flex min-h-14 items-center gap-3 py-3">
          <AppIcon functie="contact" maat="md"/>
          <span className="min-w-0 flex-1">
            <span className="block text-[15.5px] font-black">{t(N + "belangrijkePersonen")}</span>
            <span className="block truncate text-xs text-ink-soft">{t(N + "mensen", { count: mensen.length })} · {mensen.slice(0, 2).join(", ")}{mensen.length > 2 ? t(N + "enMeer", { n: mensen.length - 2 }) : ""}</span>
          </span>
          <Chevron className="size-5 text-ink-soft"/>
        </Link>
        <button onClick={() => { setOpen(open === "contact" ? null : "contact"); setBewerk(null); }} aria-expanded={open === "contact"} className="flex min-h-12 w-full items-center gap-3 border-t border-[#E9E1D5] py-2.5 text-left">
          <AppIcon functie="bellen" maat="md"/>
          <span className="min-w-0 flex-1"><span className="block text-[15.5px] font-black">{t(N + "telefoonnummers")}</span><span className="block truncate text-xs text-ink-soft">{personen.length ? personen.map((c) => c.naam).join(", ") : t(N + "nogNiets")}</span></span>
          {personen.length || open === "contact" ? <Chevron richting="omlaag" open={open === "contact"} className="size-4 text-ink-soft"/> : <Plus aria-hidden="true" strokeWidth={2} className="size-4 shrink-0 text-ink-soft"/>}
        </button>
        {open === "contact" ? (<div className="mb-3 space-y-2">
            {bewerk === "contact" && mag("personen") ? <Formulier velden={[]} begin={{ personen }} extra={(w, setW) => <LijstVelden titel={t(N + "eigen.contacten")} items={w.personen} onChange={(l) => setW((x) => ({ ...x, personen: l }))} toevoegenTekst={t(N + "eigen.contactToevoegen")} velden={[{ id: "naam", label: t(N + "naam") }, { id: "rol", label: t(N + "eigen.rolLabel"), type: "rol" }, { id: "telefoon", label: t(N + "eigen.telefoon"), type: "tel" }, { id: "email", label: t(N + "eigen.email"), type: "email" }, { id: "nood", label: t(N + "eigen.noodcontact"), type: "vink" }]}/>} voet={t(N + "eigen.contactenUitleg")} onAnnuleer={() => setBewerk(null)} onBewaar={(w) => bewaarKind(kindId, { profile: { personen: w.personen.filter((c) => schoon(c.naam)).map((c) => ({ id: c.id ?? nieuwId(), naam: schoon(c.naam), rol: c.rol ?? "anders", telefoon: schoon(c.telefoon), email: schoon(c.email), nood: !!c.nood })) } })}/> : <>
              {personen.map((c) => (<div key={c.id ?? c.naam} className="flex items-center justify-between gap-3 rounded-md bg-white/60 px-3 py-2">
                  <div className="min-w-0"><p className="text-sm font-semibold">{c.naam}</p><p className="text-xs text-ink-soft">{t(N + `rol.${ROLLEN.includes(c.rol) ? c.rol : "anders"}`)}{c.nood ? ` · ${t(N + "eigen.noodcontact")}` : ""}{c.email ? ` · ${c.email}` : ""}</p></div>
                  {c.telefoon ? <a href={telLink(c.telefoon)} className="flex min-h-11 shrink-0 items-center gap-1.5 text-xs font-semibold text-brand"><AppIcon functie="bellen" maat="sm" vorm="kaal"/>{toonTelefoon(c.telefoon)}</a> : null}
                </div>))}
              {verborgen.includes("personen") ? <p className="text-sm text-ink-soft">{t(N + "toegang.geenToegang")}</p> : !personen.length ? <p className="text-sm text-ink-soft">{mag("personen") ? t(N + "eigen.leegSectie") : t(N + "eigen.leegSectieLezen")}</p> : null}
              {mag("personen") ? <SectieKnop gevuld={personen.length > 0} onClick={() => setBewerk("contact")}/> : null}
            </>}
          </div>) : null}
        <GezagToegangRij onClick={() => setToegangOpen(true)} samenvatting={kort.samen ? t(N + "toegang.samenvattingSamen") : t(N + "toegang.samenvattingSolo")}/>
      </div>
      <Sheet open={toegangOpen} onOpenChange={setToegangOpen}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto rounded-t-3xl bg-background">
          <SheetHeader><SheetTitle className="font-display">{t(N + "toegang.titel", { naam: kind.name })}</SheetTitle></SheetHeader>
          <div className="px-4 pb-6">{toegangOpen ? <GezagToegang kindId={kindId} naam={kind.name} bewerkbaar/> : null}</div>
        </SheetContent>
      </Sheet>

      <h2 className="mt-6 px-1 text-[13px] font-black uppercase tracking-[0.08em] text-ink-soft">{t(N + "vaakNodig")}</h2>
      <div className={`${GLAS} mt-2 divide-y divide-[#E9E1D5] px-4`}>
        {groepen.filter((g) => ["school", "gezondheid", "activiteiten"].includes(g.id)).map(toonGroep)}
      </div>

      <h2 className="mt-6 px-1 text-[13px] font-black uppercase tracking-[0.08em] text-ink-soft">{t(N + "afEnToe")}</h2>
      <div className={`${GLAS} mt-2 divide-y divide-[#E9E1D5] px-4`}>
        {groepen.filter((g) => ["maten", "praktisch", "basis"].includes(g.id)).map(toonGroep)}
      </div>

      <PriveNotitie kindId={kindId} notitie={notitie}/>

      <section className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-[19px] font-black">{t(N + "momenten.titel", { naam: kind.name })}</h2>
          <button onClick={() => setToevoegen((v) => !v)} className="inline-flex min-h-11 items-center gap-1 text-[13.5px] font-extrabold text-brand"><Plus aria-hidden="true" strokeWidth={2.25} className="size-4 shrink-0"/>{t(N + "momenten.toevoegen").replace(/^\+\s*/, "")}</button>
        </div>
        {toevoegen ? (<div className="mt-2 space-y-2 border-y border-border py-3">
            <Button variant="ghost" className="min-h-11 w-full justify-between" onClick={() => { setToevoegen(false); setDeelOpen(true); }}>{t(N + "momenten.delen")}<Chevron className="size-4 text-ink-soft"/></Button>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!mijlpaalTekst.trim())
            return; voegMijlpaal({ kind: kindId, jaar: new Date().getFullYear(), tekst: mijlpaalTekst.trim() }); setMijlpaalTekst(""); setToevoegen(false); }}>
              <input aria-label={t(N + "momenten.mijlpaal")} className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder={t(N + "momenten.mijlpaalPlaceholder")} value={mijlpaalTekst} onChange={(e) => setMijlpaalTekst(e.target.value)}/>
              <button className="min-h-11 rounded-md bg-brand px-3 text-sm font-semibold text-primary-foreground">{t(N + "momenten.bewaar")}</button>
            </form>
          </div>) : null}
        <div className={`${GLAS} mt-2 space-y-3 px-4 py-3`}>
          {zichtbaar.map((x) => x.soort === "Momentje"
            ? <div key={`momentje-${x.m.id}`}><p className="mb-1 text-[11px] font-semibold text-ink-soft">{t(N + "momenten.momentje")}</p><MomentjeKaart m={x.m}/></div>
            : <div key={`mijlpaal-${x.p.id}`} className="flex items-start gap-2 border-b border-border pb-3"><AppIcon functie="mijlpaal" maat="sm"/><div><p className="text-sm font-semibold">{x.p.tekst}</p><p className="text-[11px] text-ink-soft">{t(N + "momenten.mijlpaalJaar", { jaar: x.p.jaar })}</p></div></div>)}
          {momenten.length === 0 ? <p className="text-sm text-ink-soft">{t(N + "momenten.leeg", { naam: kind.name })} <button type="button" onClick={() => setDeelOpen(true)} className="font-semibold text-brand">{t(N + "momenten.eerste")}</button></p> : null}
        </div>
        {momenten.length > 2 || alleMomenten ? (<button onClick={() => setAlleMomenten((v) => !v)} className="mt-3 min-h-11 text-sm font-semibold text-brand">{alleMomenten ? t(N + "momenten.minder") : <MetChevron>{t(N + "momenten.alle")}</MetChevron>}</button>) : null}
        {alleMomenten ? <Mijlpalen kindId={kindId} naam={kind.name} momentjesPerJaar={mijn.reduce((acc, m) => { const j = m.datum ? Number(m.datum.slice(0, 4)) : NaN; return Number.isFinite(j) ? { ...acc, [j]: (acc[j] ?? 0) + 1 } : acc; }, {})}/> : null}
      </section>
      <DeelMomentje open={deelOpen} onSluit={() => setDeelOpen(false)} kindId={kindId}/>
      <button type="button" onClick={() => setVerwijderOpen(true)} className="mt-8 flex min-h-11 w-full items-center justify-center text-sm font-bold text-accent-warm">{kort.samen || lijst(kind.linked_parents).length ? t(N + "verwijderen.knopGedeeld", { naam: kind.name }) : t(N + "verwijderen.knop", { naam: kind.name })}</button>
      {verwijderOpen ? <KindVerwijderen naam={kind.name} gedeeld={!!kort.samen || lijst(kind.linked_parents).length > 0} sluit={() => setVerwijderOpen(false)} doe={async () => {
            const modus = await start.verwijderKind(kindId);
            if (!modus)
                return false;
            bevestig(modus === "unlinked" ? t(N + "verwijderen.ontkoppeld") : t(N + "verwijderen.verwijderd"));
            nav({ to: "/kinderen", replace: true });
            return true;
        }}/> : null}
    </AppShell>);
}
/** Bevestiging voor verwijderen; bij een gedeeld kind verdwijnt alleen jouw koppeling. */
function KindVerwijderen({ naam, gedeeld, sluit, doe }) {
    const { t } = useTranslation();
    const [bezig, setBezig] = useState(false);
    return (<div className="app-modal-achter z-40" onClick={() => !bezig && sluit()}>
      <div className="app-modal" role="dialog" aria-modal="true" aria-labelledby="kind-verwijderen-titel" onClick={(e) => e.stopPropagation()}>
        <p id="kind-verwijderen-titel" className="font-display text-lg">{gedeeld ? t(N + "verwijderen.titelGedeeld", { naam }) : t(N + "verwijderen.titel", { naam })}</p>
        <p className="mt-2 text-sm text-ink-soft">{gedeeld ? t(N + "verwijderen.uitlegGedeeld", { naam }) : t(N + "verwijderen.uitleg", { naam })}</p>
        <div className="mt-5 flex gap-2">
          <button type="button" disabled={bezig} onClick={sluit} className={knopAnnuleer}>{t("common.annuleren")}</button>
          <button type="button" disabled={bezig} onClick={async () => { setBezig(true); const ok = await doe(); if (!ok)
            setBezig(false); }} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[#A4533E] px-5 text-sm font-black text-white disabled:opacity-50">{bezig ? <Loader2 className="size-4 animate-spin" aria-hidden="true"/> : null}{gedeeld ? t(N + "verwijderen.jaGedeeld") : t(N + "verwijderen.ja")}</button>
        </div>
      </div>
    </div>);
}
/** Naam, geboortedatum, korte omschrijving en kleur — gedeeld met de andere ouder. */
function BasisFormulier({ kind, onKlaar }) {
    const { t } = useTranslation();
    return (<Formulier velden={[
            { id: "name", label: t(N + "naam"), verplicht: true }, { id: "last_name", label: t(N + "eigen.achternaam") },
            { id: "date_of_birth", label: t(N + "eigen.geboortedatum"), type: "datum", max: vandaagIso() }, { id: "description", label: t(N + "korteOmschrijving"), type: "lang" },
        ]} begin={{ name: kind.name ?? "", last_name: kind.last_name ?? "", date_of_birth: kind.date_of_birth ?? "", description: kind.description ?? "", color_code: kind.color_code ?? "" }} extra={(w, setW) => (<div>
          <p className="text-xs font-semibold">{t(N + "eigen.kleurVan", { naam: w.name || kind.name })}</p>
          <div className="mt-1 flex gap-2" role="group" aria-label={t(N + "eigen.kleurKiezen", { naam: w.name || kind.name })}>
            {kindKleuren.map((c) => (<button type="button" key={c.id} onClick={() => setW((x) => ({ ...x, color_code: c.hex }))} aria-label={t(N + "eigen.kleur", { naam: c.naam })} aria-pressed={w.color_code === c.hex} className="size-8 rounded-full border-2" style={{ backgroundColor: c.hex, borderColor: w.color_code === c.hex ? c.hex : "transparent", opacity: w.color_code === c.hex ? 1 : 0.45 }}/>))}
          </div>
        </div>)} voet={t(N + "eigen.basisGedeeld")} onAnnuleer={onKlaar} onBewaar={async (w) => {
            if (!w.name.trim())
                return false;
            const ok = await bewaarKind(kind.id, { name: w.name.trim(), last_name: schoon(w.last_name), date_of_birth: w.date_of_birth || null, description: schoon(w.description), ...(w.color_code ? { color_code: w.color_code } : {}) });
            if (ok)
                bevestig(t(N + "eigen.opgeslagen"));
            return ok;
        }}/>);
}
/** Privénotitie per ouder: alleen de ingelogde ouder ziet en bewaart deze (child_private_notes). */
function PriveNotitie({ kindId, notitie }) {
    const { t } = useTranslation();
    const [tekst, setTekst] = useState(notitie);
    const [bezig, setBezig] = useState(false);
    useEffect(() => { setTekst(notitie); }, [notitie]);
    const gewijzigd = tekst !== notitie;
    return (<section className={`${GLAS} mt-6 p-4`}>
      <div className="flex items-start gap-3">
        <AppIcon functie="slot" maat="md"/>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15.5px] font-black">{t(N + "eigen.notitieTitel")}</h2>
          <p className="text-xs text-ink-soft">{t(N + "eigen.notitieUitleg")}</p>
        </div>
      </div>
      <textarea aria-label={t(N + "eigen.notitieTitel")} rows={3} value={tekst} onChange={(e) => setTekst(e.target.value)} placeholder={t(N + "eigen.notitiePlaceholder")} className={`${veld} mt-3`}/>
      {gewijzigd ? <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => setTekst(notitie)} className={knopAnnuleer}>{t("common.annuleren")}</button>
        <button type="button" disabled={bezig} onClick={async () => { setBezig(true); const ok = await bewaarNotitie(kindId, tekst); setBezig(false); if (ok)
            bevestig(t(N + "eigen.notitieOpgeslagen")); }} className={knopOpslaan}>{bezig ? <Loader2 className="size-4 animate-spin" aria-hidden="true"/> : null}{t("common.opslaan")}</button>
      </div> : null}
    </section>);
}
