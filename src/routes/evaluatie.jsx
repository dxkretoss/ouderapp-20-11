import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { AppIcon } from "@/components/AppIcon";
import { bewaarEvaluatie, evaluatieBron, useEvaluaties } from "@/lib/evaluatie-store";
import { LaadFout } from "@/components/Laden";
import { bevestig } from "@/lib/feedback";
import { useGezin } from "@/lib/gezin";
import { useTranslation, Trans } from "react-i18next";
import i18n, { taalLocale } from "@/i18n";
const N = "routes.evaluatie.";
/*
 * Evaluatiemoment (elk half jaar). Eerst voor jezelf, met de cirkel van invloed; daarna kies je zelf wat je deelt.
 * Wat je nodig hebt van jezelf en waar je geen invloed op hebt, blijft altijd alleen voor jou. Niets wordt vanzelf verstuurd.
 */
export const Route = createFileRoute("/evaluatie")({
    head: () => ({ meta: [{ title: i18n.t("common.metaTitel", { titel: i18n.t("routes.evaluatie.meta.titel") }) }, { name: "description", content: i18n.t("routes.evaluatie.meta.beschrijving") }] }),
    component: EvaluatiePagina,
});
// Ids; labels via routes.evaluatie.werkt.<id>.
const WERKT = ["goed", "grotendeels", "niet"];
// Detectie van scherpe woorden: Nederlands en Engels, zodat het in beide talen werkt.
const SCHERP = /\b(altijd|nooit|jij moet|jouw schuld|zoals gewoonlijk|always|never|you must|you have to|your fault|as usual)\b/i;
function Vraag({ titel, sub, waarde, zet, ph }) {
    return (<label className="block">
      <span className="block text-[16.5px] font-black">{titel}</span>
      {sub ? <span className="block text-sm text-ink-soft">{sub}</span> : null}
      <textarea value={waarde} onChange={(e) => zet(e.target.value)} rows={3} placeholder={ph} className="mt-2 w-full resize-none rounded-[16px] border border-[#E6DED2] bg-white px-3.5 py-2.5 text-[15px] leading-relaxed outline-none"/>
    </label>);
}
function Kaart({ children, kleur }) {
    return <section className="mt-3 space-y-4 rounded-[22px] border border-white/85 px-4 py-4" style={{ background: kleur ?? "rgba(255,255,255,.62)" }}>{children}</section>;
}
/** Drie ringen: jouw invloed (midden), samen afspreken, geen invloed (buiten). */
function Cirkel() {
    const { t } = useTranslation();
    const legenda = [
        { id: "invloed", kleur: "#4F6B58", rand: "#4F6B58" },
        { id: "samen", kleur: "#DCE3D3", rand: "#A9BCA8" },
        { id: "geen", kleur: "#F3EDE3", rand: "#D9CFC2" },
    ].map((l) => ({ ...l, titel: t(N + `cirkel.${l.id}.titel`), tekst: t(N + `cirkel.${l.id}.tekst`) }));
    return (<div className="mt-3">
      <svg viewBox="0 0 260 260" className="mx-auto block w-full max-w-[210px]" role="img" aria-label={t(N + "cirkel.aria")}>
        <circle cx="130" cy="130" r="125" fill="#F3EDE3" stroke="#D9CFC2"/>
        <circle cx="130" cy="130" r="88" fill="#DCE3D3" stroke="#A9BCA8"/>
        <circle cx="130" cy="130" r="50" fill="#4F6B58"/>
        <text x="130" y="27" textAnchor="middle" fontSize="12.5" fontWeight="800" fill="#7A6E62">{t(N + "cirkel.svgGeen")}</text>
        <text x="130" y="65" textAnchor="middle" fontSize="12.5" fontWeight="800" fill="#2F4A3A">{t(N + "cirkel.svgSamen")}</text>
        <text x="130" y="128" textAnchor="middle" fontSize="13.5" fontWeight="900" fill="#fff">{t(N + "cirkel.svgJouw")}</text>
        <text x="130" y="145" textAnchor="middle" fontSize="13.5" fontWeight="900" fill="#fff">{t(N + "cirkel.svgInvloed")}</text>
      </svg>
      <ul className="mt-3 space-y-1.5">
        {legenda.map((l) => (<li key={l.titel} className="flex items-start gap-2.5 text-[13.5px] leading-snug">
            <span aria-hidden className="mt-1 size-3 shrink-0 rounded-full border" style={{ background: l.kleur, borderColor: l.rand }}/>
            <span><span className="font-extrabold">{l.titel}:</span> {l.tekst}</span>
          </li>))}
      </ul>
    </div>);
}
function EvaluatiePagina() {
    const { t } = useTranslation();
    const g = useGezin();
    const nav = useNavigate();
    // Met meerdere andere ouders (per kind een andere) is "de andere ouder" de enige juiste naam.
    const ander = g.ander?.naam || t("common.deAndereOuder");
    const laadStatus = evaluatieBron.useStatus();
    const [stap, setStap] = useState("start");
    const [goed, setGoed] = useState("");
    const [anders, setAnders] = useState("");
    const [werkt, setWerkt] = useState("");
    const [nodig, setNodig] = useState("");
    const [zelf, setZelf] = useState("");
    const [loslaten, setLoslaten] = useState("");
    const [delen, setDelen] = useState({ goed: false, anders: false, werkt: false });
    const eerder = useEvaluaties();
    const [bewaard, setBewaard] = useState(false);
    const laatste = eerder[0];
    const ga = (s) => { setStap(s); if (typeof window !== "undefined")
        window.scrollTo({ top: 0 }); };
    const concept = [
        g.ander?.naam ? t(N + "concept.aanhef", { naam: g.ander.naam }) : t(N + "concept.aanhefZonderNaam"),
        delen.goed && goed.trim() ? t(N + "concept.goed", { tekst: goed.trim() }) : "",
        delen.anders && anders.trim() ? t(N + "concept.anders", { tekst: anders.trim() }) : "",
        delen.werkt && werkt ? t(N + "concept.werkt", { antwoord: t(N + `werkt.${werkt}`) }) : "",
        t(N + "concept.afsluiting"),
    ].filter(Boolean).join("\n");
    const ietsGedeeld = (delen.goed && goed.trim()) || (delen.anders && anders.trim()) || (delen.werkt && werkt);
    // Eén keer per doorloop bewaren (ook als de ouder daarna nog naar Berichten gaat).
    const bewaar = async () => {
        if (bewaard)
            return true;
        setBewaard(true);
        const gelukt = await bewaarEvaluatie({ goed, anders, werkt, nodig, zelf, loslaten });
        if (!gelukt)
            setBewaard(false); // foutmelding is getoond; opnieuw proberen kan
        else
            bevestig(t(N + "opgeslagen"));
        return gelukt;
    };
    return (<AppShell>
      <PageHeader titel={t(N + "titel")} subtitel={t(N + "subtitel")} terug="/meer"/>

      {stap === "start" ? (<div>
          <p className="lora mt-5 text-[25px] leading-snug">{t(N + "start.vraag")}</p>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{t(N + "start.uitleg", { ander })}</p>
          <Kaart kleur="linear-gradient(135deg, rgba(220,230,210,.95), rgba(233,239,227,.9))">
            <div className="flex items-start gap-2.5"><span className="grid size-8 shrink-0 place-items-center rounded-full border border-[#C9D6C3] bg-[#E9EFE3] text-xs font-black text-[#3F5747]" aria-hidden>Co</span><p className="text-[15px] leading-snug text-[#2F4A3A]"><Trans i18nKey="routes.evaluatie.start.co" components={{ b: <b /> }}/></p></div>
            <Cirkel />
          </Kaart>
          {laadStatus === "fout" ? <LaadFout onOpnieuw={evaluatieBron.ververs}/> : null}
          {laatste ? <p className="mt-3 text-sm text-ink-soft">{t(N + "start.vorige", { datum: new Date(laatste.datum).toLocaleDateString(taalLocale(), { day: "numeric", month: "long", year: "numeric" }) })}</p> : null}
          <button onClick={() => ga("jij")} className="mt-5 h-[54px] w-full rounded-full bg-brand text-base font-black text-primary-foreground">{t(N + "start.beginnen")}</button>
        </div>) : null}

      {stap === "jij" ? (<div>
          <p className="mt-4 text-xs font-extrabold uppercase tracking-[0.1em] text-brand">{t(N + "stap1")}</p>
          <Kaart>
            <Vraag titel={t(N + "vraag.goed")} waarde={goed} zet={setGoed} ph={t(N + "vraag.goedPh")}/>
            <Vraag titel={t(N + "vraag.anders")} waarde={anders} zet={setAnders} ph={t(N + "vraag.andersPh")}/>
            <div>
              <p className="text-[16.5px] font-black">{t(N + "vraag.werkt")}</p>
              <div className="mt-2 flex flex-wrap gap-2">{WERKT.map((w) => <button key={w} type="button" onClick={() => setWerkt(werkt === w ? "" : w)} aria-pressed={werkt === w} className={`h-10 rounded-full px-4 text-sm font-extrabold ${werkt === w ? "bg-brand text-primary-foreground" : "border border-white/90 bg-white/80"}`}>{t(N + `werkt.${w}`)}</button>)}</div>
            </div>
          </Kaart>
          <button onClick={() => ga("invloed")} className="mt-5 h-[54px] w-full rounded-full bg-brand text-base font-black text-primary-foreground">{t(N + "verder")}</button>
        </div>) : null}

      {stap === "invloed" ? (<div>
          <p className="mt-4 text-xs font-extrabold uppercase tracking-[0.1em] text-brand">{t(N + "stap2")}</p>
          <Kaart kleur="linear-gradient(135deg, rgba(220,230,210,.95), rgba(233,239,227,.9))">
            <div className="flex items-start gap-2.5"><span className="grid size-8 shrink-0 place-items-center rounded-full border border-[#C9D6C3] bg-[#E9EFE3] text-xs font-black text-[#3F5747]" aria-hidden>Co</span><p className="text-[15px] leading-snug text-[#2F4A3A]">{t(N + "invloedCo", { ander })}</p></div>
          </Kaart>
          <Kaart>
            <Vraag titel={t(N + "vraag.nodig")} sub={t(N + "vraag.nodigSub")} waarde={nodig} zet={setNodig} ph={t(N + "vraag.nodigPh")}/>
            <Vraag titel={t(N + "vraag.zelf")} sub={t(N + "vraag.zelfSub")} waarde={zelf} zet={setZelf} ph={t(N + "vraag.zelfPh")}/>
            <Vraag titel={t(N + "vraag.loslaten")} sub={t(N + "vraag.loslatenSub")} waarde={loslaten} zet={setLoslaten} ph={t(N + "vraag.optioneel")}/>
          </Kaart>
          <button onClick={() => ga("delen")} className="mt-5 h-[54px] w-full rounded-full bg-brand text-base font-black text-primary-foreground">{t(N + "verder")}</button>
        </div>) : null}

      {stap === "delen" ? (<div>
          <p className="mt-4 text-xs font-extrabold uppercase tracking-[0.1em] text-brand">{t(N + "stap3", { ander })}</p>
          <p className="mt-2 text-[15px] text-ink-soft">{t(N + "delen.uitleg")}</p>
          <Kaart>
            {[["goed", t(N + "delen.goed"), goed], ["anders", t(N + "delen.anders"), anders], ["werkt", t(N + "delen.werkt"), werkt ? t(N + `werkt.${werkt}`) : ""]].map(([k, l, w]) => (<label key={k} className={`flex items-start gap-3 ${w ? "" : "opacity-45"}`}>
                <input type="checkbox" disabled={!w} checked={delen[k] && !!w} onChange={(e) => setDelen({ ...delen, [k]: e.target.checked })} className="mt-1 size-5 accent-[var(--color-brand)]"/>
                <span className="min-w-0"><span className="block text-[15.5px] font-black">{l}</span><span className="block truncate text-sm text-ink-soft">{w || t(N + "delen.nietIngevuld")}</span></span>
              </label>))}
          </Kaart>
          {ietsGedeeld ? (<>
              <div className="mt-3 rounded-[20px] border-2 border-[#A9BCA8] bg-white/80 p-3.5">
                <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[#3F5747]">{t(N + "delen.voorstelBericht", { ander })}</p>
                <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed">{concept}</p>
              </div>
              {SCHERP.test(concept) ? <p className="mt-2 rounded-2xl bg-[#E9EFE3] px-3.5 py-2.5 text-sm text-[#2F4A3A]"><Trans i18nKey="routes.evaluatie.delen.scherp" components={{ b: <b /> }}/></p> : null}
              <button onClick={async () => { if (await bewaar())
                nav({ to: "/berichten", search: { concept } }); }} className="mt-4 flex h-[54px] w-full items-center justify-center rounded-full bg-brand text-base font-black text-primary-foreground">{t(N + "delen.verderBerichten")}</button>
              <p className="mt-2 text-center text-xs text-ink-soft">{t(N + "delen.nietsVerstuurd")}</p>
            </>) : null}
          <button onClick={async () => { if (await bewaar())
            ga("klaar"); }} className="mt-3 h-[50px] w-full rounded-full border border-white/90 bg-white/75 text-[15px] font-black">{t(N + "delen.alleenMezelf")}</button>
        </div>) : null}

      {stap === "klaar" ? (<div>
          <p className="lora mt-6 text-[25px] leading-snug">{t(N + "klaar.titel")}</p>
          <p className="mt-2 text-[15px] text-ink-soft">{t(N + "klaar.uitleg")}</p>
          {zelf.trim() ? <Kaart kleur="linear-gradient(135deg, rgba(220,230,210,.95), rgba(233,239,227,.9))"><p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[#3F5747]">{t(N + "klaar.zelf")}</p><p className="text-[16px] font-black text-[#2F4A3A]">{zelf}</p></Kaart> : null}
          <Link to="/verhaal" className="mt-5 flex h-[50px] w-full items-center justify-center rounded-full border border-white/90 bg-white/75 text-[15px] font-black"><AppIcon functie="co" maat="sm" className="mr-1.5"/>{t(N + "klaar.co")}</Link>
          <Link to="/" className="mt-2 flex h-[50px] w-full items-center justify-center text-[15px] font-black text-brand">{t(N + "klaar.home")}</Link>
        </div>) : null}
    </AppShell>);
}
