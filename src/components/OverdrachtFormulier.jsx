import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { tLijst } from "@/i18n";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Moon, NotebookPen, Plus, Star, CircleHelp, CalendarClock } from "lucide-react";
import { startState, useStart, leeftijdTekst } from "@/lib/start-store";
import { useAgenda } from "@/lib/agenda-store";
import { iso, plusDagen, voorkomens, dt } from "@/lib/agenda-datum";
import { bewaarConcept, deelOverdracht, legeInhoud, useOverdracht, wijzigOverdracht } from "@/lib/overdracht-store";
import { markeerOverdrachtIngevuld } from "@/lib/wissel-store";
import { MetVinkje } from "@/components/Tekens";
/** Overdracht (stijl A6): wat de andere ouder moet weten vóór de wissel. Alles optioneel, niets vooraf ingevuld. */
const GEZONDHEID = ["Alles goed", "Medicijn", "Ziek geweest", "Arts of tandarts"];
const SLAAP = ["Goed geslapen", "Onrustig", "Weinig gegeten"];
const SCHOOL = ["Huiswerk", "Toets", "Briefje", "Gym"];
/** De keuzes blijven Nederlandse ids (opgeslagen en vergeleken); alleen het label wordt vertaald. */
const KEUZE = { "Alles goed": "allesGoed", "Medicijn": "medicijn", "Ziek geweest": "ziekGeweest", "Arts of tandarts": "arts", "Goed geslapen": "goedGeslapen", "Onrustig": "onrustig", "Weinig gegeten": "weinigGegeten", "Huiswerk": "huiswerk", "Toets": "toets", "Briefje": "briefje", "Gym": "gym" };
const keuzeLabel = (t, v) => (KEUZE[v] ? t(`components.OverdrachtFormulier.keuze.${KEUZE[v]}`) : v);
const kortDag = (datum) => { const d = tLijst("common.dagenKort")[(dt(datum).getDay() + 6) % 7] ?? ""; return d.charAt(0).toUpperCase() + d.slice(1); };
const SCHERP = /\b(altijd|nooit|jij moet|jouw schuld|weer eens|zoals gewoonlijk|always|never|you must|your fault|yet again|as usual)\b/i;
const naamVan = (id) => startState().kinderen.find((k) => k.id === id)?.naam ?? "";
function Chip({ aan, onClick, children }) {
    return <button type="button" onClick={onClick} aria-pressed={aan} className={`h-9 rounded-full px-3.5 text-sm font-extrabold ${aan ? "bg-brand text-primary-foreground" : "border border-white/90 bg-white/75 text-ink"}`}>{children}</button>;
}
function Blok({ titel, icoon, tegel, kleur, open, wissel, children, extra }) {
    return (<section className="mt-2.5 rounded-[22px] border border-white/85 bg-white/60 px-3.5 py-3">
      <button type="button" onClick={wissel} aria-expanded={open} className="flex w-full items-center gap-2.5 text-left">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl" style={{ background: tegel, color: kleur }}>{icoon}</span>
        <span className="flex-1 text-[16.5px] font-black">{titel}</span>{extra}
        <ChevronDown className={`size-5 text-ink-soft transition-transform ${open ? "rotate-180" : ""}`} aria-hidden/>
      </button>
      {open ? <div className="mt-2.5">{children}</div> : null}
    </section>);
}
const veld = "w-full rounded-[14px] border border-[#E6DED2] bg-white px-3 py-2 text-[15px] outline-none";
export function OverdrachtFormulier({ momentId, aan, wanneer, viaSchool = false }) {
    const { t } = useTranslation();
    const st = useOverdracht();
    const start = useStart();
    const agenda = useAgenda();
    const kinderen = start.kinderen.map((k) => ({ ...k, kleur: k.kleur ?? "#8A7E72", leeftijd: leeftijdTekst(k.geboortedatum) ?? "" }));
    const gedeeld = st.gedeeld.find((o) => o.momentId === momentId);
    const [inhoud, setInhoudState] = useState(() => st.concept[momentId] ?? legeInhoud());
    const [open, setOpen] = useState({ gezondheid: true, slaap: true, school: true, komend: true, gevoel: true });
    const zetInhoud = (i) => { setInhoudState(i); bewaarConcept(momentId, i); };
    const wissel = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));
    const toggle = (veldnaam, w) => {
        const l = inhoud[veldnaam];
        zetInhoud({ ...inhoud, [veldnaam]: l.includes(w) ? l.filter((x) => x !== w) : [...l, w] });
    };
    const kids = inhoud.voor === "samen" ? kinderen : kinderen.filter((k) => k.id === inhoud.voor);
    const vandaag = iso(new Date());
    // Gedeelde afspraken van de komende dagen uit de agenda (privé-afspraken nooit).
    const komend = agenda.events.filter((a) => a.gedeeld !== false).flatMap((a) => voorkomens(a, vandaag, plusDagen(vandaag, 4)).map((d) => ({ ...a, sleutel: a.id + d, op: d }))).sort((a, b) => (a.op + a.tijd).localeCompare(b.op + b.tijd)).slice(0, 4);
    const kleurVan = (a) => kinderen.find((k) => a.kindIds?.[0] === k.id)?.kleur ?? "#8A7E72";
    const vrijeTekst = [inhoud.gezondheidNotitie, inhoud.schoolNotitie, inhoud.mooi, inhoud.vraag,].join(" ");
    const ietsIngevuld = vrijeTekst.trim().length > 0 || inhoud.gezondheid.length + inhoud.slaap.length + inhoud.school.length > 0;
    if (gedeeld) {
        return (<div className="mt-4">
        <div className="rounded-[22px] border-2 border-[#A9BCA8] px-4 py-3" style={{ background: "linear-gradient(135deg, rgba(220,230,210,.95), rgba(233,239,227,.9))" }}>
          <p className="text-[16px] font-black text-[#2F4A3A]"><MetVinkje>{t("components.OverdrachtFormulier.gedeeldMet", { aan })}</MetVinkje></p>
          <p className="text-sm text-[#3F5747]">{t("components.OverdrachtFormulier.zietVoor", { aan })}</p>
          <button onClick={() => { wijzigOverdracht(momentId); setInhoudState(gedeeld.inhoud); }} className="mt-1 inline-flex min-h-10 items-center text-sm font-black text-brand">{t("components.OverdrachtFormulier.aanpassen")}</button>
        </div>
        <p className="mt-4 text-xs font-extrabold uppercase tracking-[0.1em] text-ink-soft">{t("components.OverdrachtFormulier.zoZiet", { aan })}</p>
        <OverdrachtWeergave inhoud={gedeeld.inhoud} van={t("common.jij")}/>
      </div>);
    }
    return (<div className="mt-4">
      {viaSchool ? <p className="mb-2 rounded-2xl bg-[#E9EFE3] px-3.5 py-2.5 text-[14.5px] font-bold text-[#2F4A3A]">{t("components.OverdrachtFormulier.viaSchool", { aan })}</p> : null}
      <p className="text-[15px] text-[#3F5747]">{t("components.OverdrachtFormulier.watMoet", { aan, wanneer })}</p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t("components.OverdrachtFormulier.voorWie")}>
        <button onClick={() => zetInhoud({ ...inhoud, voor: "samen" })} aria-pressed={inhoud.voor === "samen"} className={`inline-flex h-10 items-center gap-2 rounded-full pl-1.5 pr-3.5 text-sm font-black ${inhoud.voor === "samen" ? "border-2 border-brand bg-white" : "bg-white/60"}`}>
          <span className="flex">{kinderen.map((k, i) => <span key={k.id} className="size-5 rounded-full border-2 border-white" style={{ background: k.kleur, marginLeft: i ? -7 : 0 }}/>)}</span>{t("components.OverdrachtFormulier.samen")}
        </button>
        {kinderen.map((k) => (<button key={k.id} onClick={() => zetInhoud({ ...inhoud, voor: k.id })} aria-pressed={inhoud.voor === k.id} className={`inline-flex h-10 items-center gap-2 rounded-full pl-1 pr-3.5 text-sm font-black ${inhoud.voor === k.id ? "border-2 bg-white" : "bg-white/60"}`} style={inhoud.voor === k.id ? { borderColor: k.kleur } : undefined}>
            <span className="grid size-7 place-items-center rounded-full text-xs text-white" style={{ background: k.kleur }}>{k.naam.slice(0, 1)}</span>{k.naam} {k.leeftijd}
          </button>))}
      </div>

      <Blok titel={t("components.OverdrachtFormulier.blok.gezondheid")} icoon={<Plus className="size-5"/>} tegel="#DCE3D3" kleur="#3F5747" open={!!open["gezondheid"]} wissel={() => wissel("gezondheid")}>
        <div className="flex flex-wrap gap-2">{GEZONDHEID.map((g) => <Chip key={g} aan={inhoud.gezondheid.includes(g)} onClick={() => toggle("gezondheid", g)}>{keuzeLabel(t, g)}</Chip>)}</div>
        {inhoud.gezondheid.includes("Medicijn") ? (<div className="mt-2.5 grid gap-2">
            <div className="flex gap-2">
              <select value={inhoud.medicijn?.kindId ?? ""} onChange={(e) => zetInhoud({ ...inhoud, medicijn: { kindId: e.target.value, wat: inhoud.medicijn?.wat ?? "", laatst: inhoud.medicijn?.laatst ?? "", volgende: inhoud.medicijn?.volgende ?? "" } })} aria-label={t("components.OverdrachtFormulier.voorWelkKind")} className="h-10 rounded-full border border-[#E6DED2] bg-white px-3 text-sm font-black">
                <option value="">{t("components.OverdrachtFormulier.kind")}</option>{kids.map((k) => <option key={k.id} value={k.id}>{k.naam}</option>)}
              </select>
              <input value={inhoud.medicijn?.wat ?? ""} onChange={(e) => zetInhoud({ ...inhoud, medicijn: { kindId: inhoud.medicijn?.kindId ?? "", laatst: inhoud.medicijn?.laatst ?? "", volgende: inhoud.medicijn?.volgende ?? "", wat: e.target.value } })} placeholder={t("components.OverdrachtFormulier.welkMedicijn")} aria-label={t("components.OverdrachtFormulier.welkMedicijn")} className={`${veld} flex-1`}/>
            </div>
            <div className="flex gap-2">
              <label className="flex-1 text-xs font-bold text-ink-soft">{t("components.OverdrachtFormulier.laatstGegeven")}<input type="time" value={inhoud.medicijn?.laatst ?? ""} onChange={(e) => zetInhoud({ ...inhoud, medicijn: { kindId: inhoud.medicijn?.kindId ?? "", wat: inhoud.medicijn?.wat ?? "", volgende: inhoud.medicijn?.volgende ?? "", laatst: e.target.value } })} className={`${veld} mt-1`}/></label>
              <label className="flex-1 text-xs font-bold text-ink-soft">{t("components.OverdrachtFormulier.volgendeKeer")}<input type="time" value={inhoud.medicijn?.volgende ?? ""} onChange={(e) => zetInhoud({ ...inhoud, medicijn: { kindId: inhoud.medicijn?.kindId ?? "", wat: inhoud.medicijn?.wat ?? "", laatst: inhoud.medicijn?.laatst ?? "", volgende: e.target.value } })} className={`${veld} mt-1`}/></label>
            </div>
          </div>) : null}
        {inhoud.gezondheid.some((g) => g !== "Alles goed") ? <input value={inhoud.gezondheidNotitie} onChange={(e) => zetInhoud({ ...inhoud, gezondheidNotitie: e.target.value })} placeholder={t("components.OverdrachtFormulier.toelichten")} aria-label={t("components.OverdrachtFormulier.toelichtingGezondheid")} className={`${veld} mt-2`}/> : null}
      </Blok>

      <Blok titel={t("components.OverdrachtFormulier.blok.slaap")} icoon={<Moon className="size-5"/>} tegel="#E6DFD3" kleur="#5A4636" open={!!open["slaap"]} wissel={() => wissel("slaap")}>
        <div className="flex flex-wrap gap-2">{SLAAP.map((g) => <Chip key={g} aan={inhoud.slaap.includes(g)} onClick={() => toggle("slaap", g)}>{keuzeLabel(t, g)}</Chip>)}</div>
      </Blok>

      <Blok titel={t("components.OverdrachtFormulier.blok.school")} icoon={<NotebookPen className="size-5"/>} tegel="#DFE8F1" kleur="#2E4A68" open={!!open["school"]} wissel={() => wissel("school")}>
        <div className="flex flex-wrap gap-2">{SCHOOL.map((g) => <Chip key={g} aan={inhoud.school.includes(g)} onClick={() => toggle("school", g)}>{keuzeLabel(t, g)}</Chip>)}</div>
        {inhoud.school.length ? <input value={inhoud.schoolNotitie} onChange={(e) => zetInhoud({ ...inhoud, schoolNotitie: e.target.value })} placeholder={t("components.OverdrachtFormulier.watGebeuren")} aria-label={t("components.OverdrachtFormulier.toelichtingSchool")} className={`${veld} mt-2`}/> : null}
      </Blok>

      {komend.length ? (<Blok titel={t("components.OverdrachtFormulier.blok.komend")} icoon={<CalendarClock className="size-5"/>} tegel="#EFE1C9" kleur="#6E5014" open={!!open["komend"]} wissel={() => wissel("komend")} extra={<span className="rounded-lg bg-[#DCE6D2] px-2 py-0.5 text-[11px] font-black text-[#3F5747]">{t("components.OverdrachtFormulier.uitAgenda")}</span>}>
          <ul>{komend.map((a) => <li key={a.sleutel} className="flex items-center gap-2.5 border-b border-[#E9E1D5] py-2 text-[15px] last:border-0"><b className="w-[76px] shrink-0 whitespace-nowrap">{kortDag(a.op)} {(a.tijd ?? "").slice(0, 5)}</b><span className="size-2.5 shrink-0 rounded-full" style={{ background: kleurVan(a) }}/><span className="truncate font-extrabold">{a.titel}</span></li>)}</ul>
          <p className="mt-1 text-xs text-ink-soft">{t("components.OverdrachtFormulier.alInAgenda", { aan })}</p>
        </Blok>) : null}

      <section className="mt-2.5 rounded-[22px] border border-white/85 px-3.5 py-3" style={{ background: "linear-gradient(135deg, rgba(243,225,228,.9), rgba(239,225,201,.85))" }}>
        <p className="flex items-center gap-2.5 text-[16.5px] font-black"><span className="grid size-9 place-items-center rounded-xl bg-white/70 text-[#7A3B48]"><Star className="size-5"/></span>{t("components.OverdrachtFormulier.ookMooi")}</p>
        <input value={inhoud.mooi} onChange={(e) => zetInhoud({ ...inhoud, mooi: e.target.value })} placeholder={t("components.OverdrachtFormulier.trotsOp")} aria-label={t("components.OverdrachtFormulier.ookMooi")} className={`${veld} mt-2.5`}/>
      </section>

      <section className="mt-2.5 rounded-[22px] border border-white/85 bg-white/60 px-3.5 py-3">
        <p className="flex items-center gap-2.5 text-[16.5px] font-black"><span className="grid size-9 place-items-center rounded-xl bg-[#DCE6D2] text-[#2F4A3A]"><CircleHelp className="size-5"/></span>{t("components.OverdrachtFormulier.nogIets", { aan })}</p>
        <p className="mt-1 text-sm text-ink-soft">{t("components.OverdrachtFormulier.bijzonderheid")}</p>
        <textarea value={inhoud.vraag} onChange={(e) => zetInhoud({ ...inhoud, vraag: e.target.value })} rows={2} placeholder={t("components.OverdrachtFormulier.vraagPlaceholder")} aria-label={t("components.OverdrachtFormulier.nogIetsLabel", { aan })} className={`${veld} mt-2 resize-none`}/>
        {inhoud.vraag.trim() ? (<div className="mt-2.5 rounded-[16px] bg-white/70 px-3 py-2.5">
            <p className="text-sm font-black"><Trans i18nKey="components.OverdrachtFormulier.gekocht" components={{ zacht: <span className="font-normal text-ink-soft"/> }}/></p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Chip aan={inhoud.betalen?.van === "kindrekening"} onClick={() => zetInhoud({ ...inhoud, betalen: inhoud.betalen?.van === "kindrekening" ? undefined : { van: "kindrekening", bedrag: inhoud.betalen?.bedrag ?? "" } })}>{t("components.OverdrachtFormulier.vanKindrekening")}</Chip>
              <Chip aan={inhoud.betalen?.van === "eigen"} onClick={() => zetInhoud({ ...inhoud, betalen: inhoud.betalen?.van === "eigen" ? undefined : { van: "eigen", bedrag: inhoud.betalen?.bedrag ?? "" } })}>{t("components.OverdrachtFormulier.eigenRekening")}</Chip>
            </div>
            {inhoud.betalen ? (<label className="mt-2 flex items-center gap-2 text-sm font-bold text-ink-soft">{t("components.OverdrachtFormulier.ongeveer")}
                <input inputMode="decimal" value={inhoud.betalen.bedrag} onChange={(e) => zetInhoud({ ...inhoud, betalen: { van: inhoud.betalen.van, bedrag: e.target.value.replace(/[^0-9,.]/g, "") } })} aria-label={t("components.OverdrachtFormulier.bedragOngeveer")} className="h-10 w-24 rounded-[12px] border border-[#E6DED2] bg-white px-2.5 text-[15px] text-ink outline-none"/>
                <span className="font-normal">{t("components.OverdrachtFormulier.optioneel")}</span>
              </label>) : null}
            {inhoud.betalen ? <p className="mt-1.5 text-xs text-ink-soft">{t("components.OverdrachtFormulier.naKopen", { aan })}</p> : null}
          </div>) : null}
        <p className="mt-1.5 text-xs text-ink-soft">{t("components.OverdrachtFormulier.verzoek", { aan })}</p>
      </section>

      {vrijeTekst.trim() ? (<div className="mt-2.5 flex items-start gap-2.5 rounded-[22px] border-2 border-[#A9BCA8] px-3.5 py-3" style={{ background: "linear-gradient(135deg, rgba(220,230,210,.95), rgba(233,239,227,.9))" }}>
          <span className="grid size-8 shrink-0 place-items-center rounded-full border border-[#C9D6C3] bg-[#E9EFE3] text-xs font-black text-[#3F5747]" aria-hidden>Co</span>
          <p className="text-[14.5px] leading-snug text-[#2F4A3A]">{SCHERP.test(vrijeTekst) ? <Trans i18nKey="components.OverdrachtFormulier.scherp" values={{ aan }} components={{ b: <b/> }}/> : <Trans i18nKey="components.OverdrachtFormulier.goedZo" components={{ b: <b/> }}/>}</p>
        </div>) : null}

      <button disabled={!ietsIngevuld} onClick={() => { deelOverdracht(momentId, aan, inhoud, inhoud.voor === "samen" ? kinderen.map((k) => k.id) : [inhoud.voor]); markeerOverdrachtIngevuld(); }} className="mt-4 h-[54px] w-full rounded-full bg-brand text-base font-black text-primary-foreground disabled:opacity-45">{t("components.OverdrachtFormulier.delen", { aan })}</button>
      <p className="mt-2 text-center text-xs text-ink-soft">{t("components.OverdrachtFormulier.spullenPaklijst", { aan })}</p>
    </div>);
}
/** Wat de ontvangende ouder ziet: belangrijk bovenaan, dan goed om te weten, het mooie en de vraag. */
export function OverdrachtWeergave({ inhoud, van }) {
    const { t } = useTranslation();
    const goed = [];
    if (inhoud.slaap.length)
        goed.push(inhoud.slaap.map((g) => keuzeLabel(t, g)).join(", "));
    if (inhoud.school.length)
        goed.push(t("components.OverdrachtFormulier.schoolRegel", { lijst: inhoud.school.map((g) => keuzeLabel(t, g)).join(", ").toLowerCase(), notitie: inhoud.schoolNotitie ? `. ${inhoud.schoolNotitie}` : "" }));
    const gezond = inhoud.gezondheid.filter((g) => g !== "Medicijn").map((g) => keuzeLabel(t, g));
    return (<div className="mt-2 space-y-2.5">
      {inhoud.medicijn?.wat || gezond.length ? (<div className="rounded-[22px] border border-white/85 bg-white/60 px-4 py-3">
          <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-ink-soft">{t("components.OverdrachtFormulier.belangrijk")}</p>
          {inhoud.medicijn?.wat ? <p className="mt-1.5 text-[15px]"><b>{inhoud.medicijn.kindId ? `${naamVan(inhoud.medicijn.kindId)} · ` : ""}{inhoud.medicijn.wat}</b>{inhoud.medicijn.laatst || inhoud.medicijn.volgende ? <span className="block text-sm text-ink-soft">{inhoud.medicijn.laatst ? t("components.OverdrachtFormulier.laatst", { tijd: inhoud.medicijn.laatst }) : ""}{inhoud.medicijn.laatst && inhoud.medicijn.volgende ? " · " : ""}{inhoud.medicijn.volgende ? t("components.OverdrachtFormulier.volgende", { tijd: inhoud.medicijn.volgende }) : ""}</span> : null}</p> : null}
          {gezond.length ? <p className="mt-1 text-[15px]">{gezond.join(", ")}{inhoud.gezondheidNotitie ? `: ${inhoud.gezondheidNotitie}` : ""}</p> : null}
        </div>) : null}
      {goed.length ? <div className="rounded-[22px] border border-white/85 bg-white/60 px-4 py-3"><p className="text-xs font-extrabold uppercase tracking-[0.1em] text-ink-soft">{t("components.OverdrachtFormulier.goedOmTeWeten")}</p><ul className="mt-1.5 space-y-1 text-[15px]">{goed.map((g) => <li key={g}>{g}</li>)}</ul></div> : null}
      {inhoud.mooi ? <div className="rounded-[22px] border border-white/85 px-4 py-3" style={{ background: "linear-gradient(135deg, rgba(243,225,228,.9), rgba(239,225,201,.85))" }}><p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[#7A3B48]">{t("components.OverdrachtFormulier.ookMooi")}</p><p className="mt-1 text-[15.5px] font-black">{inhoud.mooi}</p></div> : null}
      {inhoud.vraag ? <div className="rounded-[22px] border border-white/85 bg-white/60 px-4 py-3"><p className="text-xs font-extrabold uppercase tracking-[0.1em] text-ink-soft">{t("components.OverdrachtFormulier.nogIetsVan", { van })}</p><p className="mt-1 whitespace-pre-wrap text-[15.5px] font-black">{inhoud.vraag}</p>{inhoud.betalen ? <p className="mt-1.5 inline-flex rounded-full bg-[#DCE6D2] px-3 py-1 text-sm font-black text-[#2F4A3A]">{inhoud.betalen.van === "kindrekening" ? t("components.OverdrachtFormulier.betalenKindrekening") : t("components.OverdrachtFormulier.eigenRekening")}{inhoud.betalen.bedrag ? t("components.OverdrachtFormulier.ongeveerBedrag", { bedrag: inhoud.betalen.bedrag }) : ""}</p> : null}{inhoud.betalen ? <Link to="/kosten" search={{ uitgave: `${inhoud.vraag.slice(0, 50)}${inhoud.betalen.bedrag ? ` €${inhoud.betalen.bedrag}` : ""}`, ...(inhoud.betalen.van === "kindrekening" ? { bron: "kindrekening" } : {}) }} className="mt-2 flex h-10 w-fit items-center rounded-full bg-brand px-4 text-sm font-black text-primary-foreground">{t("components.OverdrachtFormulier.gekochtToevoegen")}</Link> : null}<p className="mt-1.5 text-xs text-ink-soft">{t("components.OverdrachtFormulier.verzoekKies")}</p></div> : null}
    </div>);
}
