import { useState } from "react";
import { useTranslation } from "react-i18next";
import { differenceInYears, parseISO, isValid } from "date-fns";
import i18n from "@/i18n";
import { Button } from "@/components/ui/button";
import { IK, legIntakeVast, vandaagIso } from "@/lib/pro-journaal-store";
import { VELD } from "@/lib/ui-stijl";
const T = (k, o) => i18n.t(`pro.GezinIntake.${k}`, o);
const nieuwKind = () => ({ naam: "", geboortedatum: "", school: "", klas: "", regeling: "", bijzonder: "" });
const nieuwContact = () => ({ naam: "", organisatie: "", functie: "", contact: "", rol: "", samenwerking: "" });
/* Labels worden pas bij het renderen vertaald (functies i.p.v. vaste lijsten). */
const ouderVelden = () => [["dossier", T("veld.dossier"), "text", true], ...[1, 2].flatMap((i) => [[`ouder${i}`, T("veld.ouderNaam", { n: i }), "text", i === 1], [`email${i}`, T("veld.ouderEmail", { n: i }), "email"], [`tel${i}`, T("veld.ouderTel", { n: i }), "tel"], [`adres${i}`, T("veld.ouderAdres", { n: i })]]), ["situatie", T("veld.situatie"), "textarea"], ["gezag", T("veld.gezag")]];
const redenVelden = () => [["datum", T("veld.datum"), "date", true], ["verwijzer", T("veld.verwijzer")], ["reden", T("veld.reden"), "textarea", true], ["hulpvraag", T("veld.hulpvraag"), "textarea"], ["doelen", T("veld.doelen"), "textarea"], ["aandacht", T("veld.aandacht"), "textarea"]];
const startVelden = () => [["rol", T("veld.rol"), "text", true], ["start", T("veld.start"), "date", true], ["eerste", T("veld.eerste"), "textarea"]];
const kindSleutels = ["naam", "geboortedatum", "school", "klas", "regeling", "bijzonder"];
const kindLabel = (k) => T(`kind.${k}`);
const contactSleutels = ["naam", "organisatie", "functie", "contact", "rol", "samenwerking"];
const contactLabel = (k) => T(`contact.${k}`);
const stappen = () => ["gezin", "kinderen", "reden", "hulpverlening", "start", "samenvatting"].map((s) => T(`stap.${s}`));
/* Keuzewaarden blijven Nederlands (logica); weergave via vertaling. */
const hulpLabel = (h) => (h === "Ja" ? i18n.t("common.ja") : h === "Nee" ? i18n.t("common.nee") : T("nogNietBekend"));
const uitnodigenOpties = [["Uitnodiging voorbereiden", "uitnodiging"], ["Koppeling aan bestaand gezin voorbereiden", "koppeling"]];
const uitnodigenLabel = (u) => { const o = uitnodigenOpties.find(([v]) => v === u); return o ? T(`uitnodigen.${o[1]}`) : T("uitnodigen.later"); };
const inputStijl = `mt-1 w-full font-normal ${VELD}`;
const leeftijd = (g) => (g && isValid(parseISO(g)) ? differenceInYears(parseISO(vandaagIso()), parseISO(g)) : undefined);
export function GezinIntake({ open, onSluit, dossiers, onNieuwGezin, onOpen, onToegang }) {
    const { t } = useTranslation();
    const [stap, setStap] = useState(0);
    const [bestaand, setBestaand] = useState("");
    const [velden, setVelden] = useState({ datum: vandaagIso(), start: vandaagIso() });
    const [kinderen, setKinderen] = useState([nieuwKind()]);
    const [contacten, setContacten] = useState([]);
    const [hulp, setHulp] = useState("");
    const [uitnodigen, setUitnodigen] = useState("");
    const [klaar, setKlaar] = useState(null);
    const [controle, setControle] = useState(false);
    const [melding, setMelding] = useState("");
    const gekozen = dossiers.find((d) => d.id === bestaand);
    const dubbel = !gekozen && !!velden['dossier']?.trim() && dossiers.find((d) => d.gezin.trim().toLowerCase() === velden['dossier']?.trim().toLowerCase());
    const veld = ([key, label, type = "text", vereist = false], values = velden, wijzig = (k, v) => setVelden((s) => ({ ...s, [k]: v })), suffix = "") => <label key={key} className="block text-sm font-semibold">{label}{!vereist && ` ${t("pro.GezinIntake.optioneel")}`}{type === "textarea" ? <textarea aria-label={label + suffix} required={vereist} rows={2} value={values[key] ?? ""} onChange={(e) => wijzig(key, e.target.value)} className={inputStijl}/> : <input aria-label={label + suffix} type={type} max={key === "geboortedatum" ? vandaagIso() : undefined} required={vereist} value={values[key] ?? ""} onChange={(e) => wijzig(key, e.target.value)} className={inputStijl}/>}</label>;
    const overzicht = [
        t("pro.GezinIntake.sam.gezin", { gezin: gekozen?.gezin ?? velden['dossier'] ?? "" }),
        ...(gekozen ? [t("pro.GezinIntake.sam.bestaand", { ouders: gekozen.ouders, kinderen: gekozen.kinderen.join(", ") })] : []),
        ...[...(gekozen ? ouderVelden().slice(-2) : ouderVelden()), ...redenVelden(), ...startVelden()].filter(([k]) => velden[k]?.trim()).map(([k, l]) => `${l}: ${velden[k]}`),
        ...(gekozen ? (velden['kindAanvulling'] ? [t("pro.GezinIntake.sam.kindAanvulling", { tekst: velden['kindAanvulling'] })] : []) : kinderen.map((k, i) => `${t("pro.GezinIntake.kindN", { n: i + 1 })}:\n${Object.entries(k).filter(([, v]) => v).map(([l, v]) => `${kindLabel(l)}: ${v}`).join("\n")}`)),
        t("pro.GezinIntake.sam.hulp", { hulp: hulp ? hulpLabel(hulp) : t("pro.GezinIntake.sam.nogNietBekend") }),
        ...(hulp === "Ja" ? contacten.map((c, i) => `${t("pro.GezinIntake.professionalN", { n: i + 1 })}:\n${Object.entries(c).filter(([, v]) => v).map(([k, v]) => `${contactLabel(k)}: ${v}`).join("\n")}`) : []),
        t("pro.GezinIntake.sam.eigen", { naam: IK, voorbereiden: uitnodigen ? uitnodigenLabel(uitnodigen) : t("pro.GezinIntake.sam.laterBepalen") }),
        t("pro.GezinIntake.sam.toegang"),
    ].join("\n\n");
    const v = (k) => velden[k]?.trim() ?? "";
    const reset = () => { setStap(0); setBestaand(""); setVelden({ datum: vandaagIso(), start: vandaagIso() }); setKinderen([nieuwKind()]); setContacten([]); setHulp(""); setUitnodigen(""); setKlaar(null); setControle(false); setMelding(""); };
    const sluit = () => { if (klaar)
        reset(); onSluit(); };
    const afronden = () => {
        const ks = kinderen.filter((k) => k.naam.trim());
        // Interne opslagvorm "Naam – N jaar" (wordt bij weergave vertaald).
        const id = gekozen?.id ?? onNieuwGezin({ gezin: v("dossier"), ouders: [v("ouder1"), v("ouder2")].filter(Boolean).join(" & "), kinderen: ks.map((k) => { const l = leeftijd(k.geboortedatum ?? ""); return l === undefined ? k.naam.trim() : `${k.naam.trim()} – ${l} jaar`; }) });
        const ouderContact = [1, 2].map((i) => [v(`ouder${i}`), v(`email${i}`), v(`tel${i}`), v(`adres${i}`)].filter(Boolean).join(" · ")).filter((x) => x.includes(" · "));
        const kindInfo = gekozen ? [v("kindAanvulling")] : ks.map((k) => [k.naam.trim(), k.geboortedatum && t("pro.GezinIntake.info.geboren", { datum: k.geboortedatum }), k.school && t("pro.GezinIntake.info.school", { school: k.school }), k.klas && t("pro.GezinIntake.info.klas", { klas: k.klas }), k.bijzonder].filter(Boolean).join(" · "));
        legIntakeVast(id, { datum: v("datum"), verwijzer: v("verwijzer"), reden: v("reden"), hulpvraag: v("hulpvraag"), aandacht: v("aandacht"), hulpverleners: hulp === "Ja" ? contacten.filter((c) => c.naam.trim() || c.organisatie.trim()) : [] }, { gezag: v("gezag"), regeling: gekozen ? "" : ks.filter((k) => k.regeling.trim()).map((k) => (ks.length > 1 ? `${k.naam.trim()}: ${k.regeling.trim()}` : k.regeling.trim())).join("; "), start: v("start"), praktisch: v("eerste"), overig: [v("situatie"), ...ouderContact, ...kindInfo].filter(Boolean).join(" | ") }, v("doelen").split(/\n|;/), { rol: v("rol"), start: v("start") });
        return id;
    };
    const klaarGezin = dossiers.find((d) => d.id === klaar)?.gezin ?? (v("dossier") || t("pro.GezinIntake.hetGezin"));
    if (!open)
        return null;
    const stapTitels = stappen();
    const voortgang = <ol aria-label={t("pro.GezinIntake.voortgang")} className="mt-5 grid grid-cols-5 gap-1.5">{stapTitels.slice(0, 5).map((s, i) => { const status = i < stap ? "klaar" : i === stap ? "nu" : "later"; return <li key={s} aria-current={status === "nu" ? "step" : undefined} className="min-w-0"><span className={`block h-1.5 rounded-full ${status === "later" ? "bg-border" : "bg-primary"}`}/><span className={`mt-1.5 block text-xs leading-snug sm:text-sm ${status === "nu" ? "font-semibold text-ink" : "text-ink-soft"}`}><span className="sm:hidden">{i + 1}</span><span className="hidden sm:inline">{i + 1}. {s}</span></span></li>; })}</ol>;
    return <div className="mx-auto w-full max-w-2xl">
    <button type="button" onClick={sluit} className="mb-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-full text-sm font-medium text-ink-soft transition-colors hover:text-ink"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0" aria-hidden><path d="M14 6l-6 6 6 6"/></svg>{t("pro.GezinIntake.terug")}</button>
    <h1 className="font-display text-2xl">{t("pro.GezinIntake.titel")}</h1>
    <p className="mt-1 text-sm text-ink-soft">{t("pro.GezinIntake.prototype")}</p>
    {!klaar && voortgang}
    {klaar ? <div className="mt-6 space-y-3"><h3 className="font-display text-lg">{t("pro.GezinIntake.klaar.titel", { gezin: klaarGezin })}</h3><p className="text-sm">{t("pro.GezinIntake.klaar.waar")}</p><p className="text-sm">{t("pro.GezinIntake.klaar.toegang")}</p><p className="text-xs text-ink-soft">{t("pro.GezinIntake.klaar.tijdelijk")}</p><div className="flex flex-wrap gap-2"><Button onClick={() => { const id = klaar; reset(); onOpen(id); }}>{t("pro.GezinIntake.klaar.openen")}</Button><Button variant="outline" onClick={() => { reset(); onToegang(); }}>{t("pro.GezinIntake.klaar.toegangsaanvraag")}</Button><Button variant="ghost" onClick={sluit}>{t("common.sluiten")}</Button></div></div> : <form className="mt-6 space-y-4" onSubmit={(e) => { e.preventDefault(); if (dubbel)
            return; if (stap < 5) {
            setStap(stap + 1);
            setMelding("");
        }
        else if (controle)
            setKlaar(afronden()); }}>
      <p className="text-xs text-ink-soft">{stap < 5 ? t("pro.GezinIntake.stapVan", { n: stap + 1 }) : t("pro.GezinIntake.controleren")}</p><h3 className="font-display text-lg">{stapTitels[stap]}</h3>
      {stap === 0 && <><label className="block text-sm font-semibold">{t("pro.GezinIntake.bestaatAl")}<select aria-label={t("pro.GezinIntake.bestaatAl")} value={bestaand} onChange={(e) => setBestaand(e.target.value)} className={inputStijl}><option value="">{t("pro.GezinIntake.nieuwVoorbereiden")}</option>{dossiers.map((d) => <option key={d.id} value={d.id}>{d.gezin}</option>)}</select></label>{gekozen ? <p className="text-sm">{t("pro.GezinIntake.verwijstNaar", { gezin: gekozen.gezin, ouders: gekozen.ouders })}</p> : null}{(gekozen ? ouderVelden().slice(-2) : ouderVelden()).map((v) => veld(v))}{dubbel && <p role="alert" className="text-sm">{t("pro.GezinIntake.dubbel", { gezin: dubbel.gezin })}</p>}</>}
      {stap === 1 && <>{gekozen ? <><p className="text-sm">{t("pro.GezinIntake.bestaandeKinderen", { kinderen: gekozen.kinderen.join(" · ") })}</p><p className="text-xs text-ink-soft">{t("pro.GezinIntake.geenKindprofielen")}</p>{veld(["kindAanvulling", t("pro.GezinIntake.kindAanvulling"), "textarea"])}</> : <>{kinderen.map((k, i) => <fieldset key={i} className="space-y-2 border-t border-border pt-3"><legend className="font-semibold">{t("pro.GezinIntake.kindN", { n: i + 1 })}</legend>{kindSleutels.map((key) => veld([key, kindLabel(key), key === "geboortedatum" ? "date" : "text", key === "naam"], k, (key, value) => setKinderen((ks) => ks.map((v, j) => j === i ? { ...v, [key]: value } : v)), ` ${i + 1}`))}{k.geboortedatum && isValid(parseISO(k.geboortedatum)) && <p className="text-xs text-ink-soft">{t("pro.GezinIntake.leeftijd", { count: differenceInYears(parseISO(vandaagIso()), parseISO(k.geboortedatum)) })}</p>}{kinderen.length > 1 && <Button type="button" variant="ghost" onClick={() => setKinderen((ks) => ks.filter((_, j) => j !== i))}>{t("pro.GezinIntake.kindVerwijderen")}</Button>}</fieldset>)}<Button type="button" variant="outline" onClick={() => setKinderen((ks) => [...ks, nieuwKind()])}>{t("pro.GezinIntake.kindToevoegen")}</Button></>}</>}
      {stap === 2 && redenVelden().map((v) => veld(v))}
      {stap === 3 && <><label className="block text-sm font-semibold">{t("pro.GezinIntake.andereHulp")}<select aria-label={t("pro.GezinIntake.andereHulp")} value={hulp} onChange={(e) => { setHulp(e.target.value); if (e.target.value === "Ja" && !contacten.length)
            setContacten([nieuwContact()]); }} className={inputStijl}><option value="">{t("pro.GezinIntake.nogNietBekend")}</option><option value="Ja">{t("common.ja")}</option><option value="Nee">{t("common.nee")}</option></select></label>{hulp === "Ja" && <>{contacten.map((c, i) => <fieldset key={i} className="space-y-2 border-t border-border pt-3"><legend className="font-semibold">{t("pro.GezinIntake.professionalN", { n: i + 1 })}</legend>{contactSleutels.map((key) => veld([key, contactLabel(key)], c, (key, value) => setContacten((cs) => cs.map((v, j) => i === j ? { ...v, [key]: value } : v)), ` ${t("pro.GezinIntake.professionalSuffix", { n: i + 1 })}`))}<Button type="button" variant="ghost" onClick={() => setContacten((cs) => cs.filter((_, j) => j !== i))}>{t("pro.GezinIntake.professionalVerwijderen")}</Button></fieldset>)}<Button type="button" variant="outline" onClick={() => setContacten((cs) => [...cs, nieuwContact()])}>{t("pro.GezinIntake.professionalToevoegen")}</Button><p className="text-xs text-ink-soft">{t("pro.GezinIntake.geenAppToegang")}</p></>}</>}
      {stap === 4 && <><p className="text-sm">{t("pro.GezinIntake.jouwNaam", { naam: IK })}</p>{startVelden().map((v) => veld(v))}<label className="block text-sm font-semibold">{t("pro.GezinIntake.oudersUitnodigen")}<select aria-label={t("pro.GezinIntake.oudersUitnodigen")} value={uitnodigen} onChange={(e) => setUitnodigen(e.target.value)} className={inputStijl}><option value="">{t("pro.GezinIntake.uitnodigen.later")}</option>{uitnodigenOpties.map(([w, k]) => <option key={w} value={w}>{t(`pro.GezinIntake.uitnodigen.${k}`)}</option>)}</select></label><section className="border-y border-border py-3"><h4 className="font-semibold">{t("pro.GezinIntake.nogTeRegelen")}</h4><ul className="mt-2 list-disc pl-5 text-sm"><li>{t("pro.GezinIntake.regel.toestemming")}</li><li>{t("pro.GezinIntake.regel.uitnodiging")}</li><li>{t("pro.GezinIntake.regel.rechten")}</li><li>{t("pro.GezinIntake.regel.hulpverleners")}</li></ul><p className="mt-2 text-xs text-ink-soft">{t("pro.GezinIntake.geenRechten")}</p></section></>}
      {stap === 5 && <><p className="text-xs text-ink-soft">{t("pro.GezinIntake.intern")}</p><p className="whitespace-pre-wrap break-words text-sm">{overzicht}</p><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={controle} onChange={(e) => setControle(e.target.checked)} className="mt-1"/>{t("pro.GezinIntake.gecontroleerd")}</label></>}
      {melding && <p role="status" className="text-xs text-ink-soft">{melding}</p>}
      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-t border-border bg-background px-4 py-3 sm:mx-0 sm:px-0">{stap > 0 && <Button type="button" variant="outline" onClick={() => { setStap(stap - 1); setControle(false); }}>{t("common.vorige")}</Button>}<Button type="submit" disabled={!!dubbel || (stap === 5 && !controle)}>{stap === 5 ? t("pro.GezinIntake.afronden") : t("common.volgende")}</Button><Button type="button" variant="ghost" onClick={() => setMelding(t("pro.GezinIntake.conceptMelding"))}>{t("pro.GezinIntake.conceptBewaren")}</Button><Button type="button" variant="ghost" onClick={sluit}>{t("common.sluiten")}</Button></div>
    </form>}
  </div>;
}
