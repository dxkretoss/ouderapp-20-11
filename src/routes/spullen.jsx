import { BewerkPotlood } from "@/components/ui-kit";
import { Plus } from "lucide-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import i18n, { tLijst } from "@/i18n";
import { AppShell, BackButton, Card, TerugKnop } from "@/components/AppShell";
import { Chevron, MetChevron, Vinkje } from "@/components/Tekens";
import { AppIcon } from "@/components/AppIcon";
import { kleurVanKind } from "@/lib/demo-data";
import { Lijst, useLijst } from "@/components/KleineLijst";
import { eigenSpullen, kindNaam, useTaken, voegSpulToe, zetSpul } from "@/lib/taken-store";
import { useStart } from "@/lib/start-store";
import { bevestig } from "@/lib/feedback";
import { useOnthouden } from "@/lib/onthouden";
import { Zichtbaar } from "@/components/Zichtbaar";
import { useNavigate } from "@tanstack/react-router";
// Eigen gezin: eigen spullen (geen voorbeelddata), met plusje en toevoegformulier.
function SpullenWrap() {
    const st = useStart();
    if (st.eigen)
        return <EigenSpullen />;
    return <Spullen />;
}
function EigenSpullen() {
    const { t } = useTranslation();
    const st = useStart();
    useTaken(); // herbereken bij wijzigingen
    const nav = useNavigate();
    const [nieuw, setNieuw] = useState(false);
    const [naam, setNaam] = useState("");
    const [kind, setKind] = useState(st.kinderen[0]?.id ?? "");
    const [type, setType] = useState("mee");
    const lijst = eigenSpullen();
    const opslaan = () => {
        if (!naam.trim() || !kind)
            return;
        voegSpulToe({ naam: naam.trim(), kind, type });
        bevestig(t("routes.spullen.melding.toegevoegd"), { uitleg: naam.trim() });
        setNaam("");
        setNieuw(false);
    };
    return (<AppShell>
      <div className="flex items-center gap-3">
        <BackButton terug="/meer"/>
        <h1 className="lora min-w-0 flex-1 text-[32px] leading-tight">{t("routes.spullen.titel")}</h1>
        <button aria-label={t("routes.spullen.nieuwSpul")} onClick={() => setNieuw(true)} className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-2xl leading-none text-primary-foreground"><Plus aria-hidden="true" strokeWidth={2.25} className="size-5"/></button>
      </div>
      {nieuw ? (<Card className="mt-4 space-y-3">
          <p className="font-display text-lg font-bold">{t("routes.spullen.nieuwSpul")}</p>
          <label className="block text-sm font-semibold">{t("routes.spullen.form.watIsHet")}<input value={naam} onChange={(e) => setNaam(e.target.value)} placeholder={t("routes.spullen.form.placeholderEigen")} className={`mt-1 w-full font-normal ${veld}`}/></label>
          {st.kinderen.length ? (<fieldset><legend className="text-sm font-semibold">{t("routes.spullen.form.vanWelkKind")}</legend><div className="mt-1 flex flex-wrap gap-2">
              {st.kinderen.map((k) => <button key={k.id} onClick={() => setKind(k.id)} aria-pressed={kind === k.id} className={knop(kind === k.id)}>{k.naam}</button>)}
            </div></fieldset>) : null}
          <fieldset><legend className="text-sm font-semibold">{t("routes.spullen.form.watErmee")}</legend><div className="mt-1 flex flex-wrap gap-2">
            {["mee", "vast", "dubbel"].map((tp) => <button key={tp} onClick={() => setType(tp)} aria-pressed={type === tp} className={knop(type === tp)}>{typeLabel(tp)}</button>)}
          </div></fieldset>
          <div className="flex gap-2">
            <button onClick={opslaan} className="min-h-11 flex-1 rounded-full bg-brand text-sm font-semibold text-primary-foreground">{t("common.toevoegen")}</button>
            <button onClick={() => setNieuw(false)} className="min-h-11 px-3 text-sm text-ink-soft">{t("common.annuleren")}</button>
          </div>
        </Card>) : null}
      {!lijst.length && !nieuw ? (<div className="mt-10 flex flex-col items-center text-center">
          <p className="font-display text-lg font-bold">{t("routes.spullen.leeg.titel")}</p>
          <p className="mt-1 max-w-xs text-sm text-ink-soft">{t("routes.spullen.leeg.tekst")}</p>
          <button onClick={() => setNieuw(true)} className="mt-5 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-primary-foreground">{t("routes.spullen.leeg.eerste")}</button>
          <button onClick={() => nav({ to: "/meer" })} className="mt-3 min-h-11 text-sm font-semibold text-ink-soft">{t("routes.spullen.leeg.terugMenu")}</button>
        </div>) : null}
      {["mee", "vast", "dubbel"].map((tp) => {
            const l = lijst.filter((s) => s.type === tp);
            if (!l.length)
                return null;
            return (<section key={tp} className="mt-5">
            <h2 className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">{groepLabel(tp)}</h2>
            <ul className="mt-2 divide-y divide-border rounded-md border border-border bg-card">
              {l.map((s) => (<li key={s.id} className="flex min-h-14 items-center gap-3 px-3 py-3">
                  <span className="flex-1"><span className="block text-sm font-semibold">{s.naam}</span>
                    <span className="block text-xs text-ink-soft">{kindNaam(s.kind).join(" & ")}</span></span>
                </li>))}
            </ul>
          </section>);
        })}
    </AppShell>);
}
export const Route = createFileRoute("/spullen")({
    head: () => ({
        meta: [
            { title: i18n.t("routes.spullen.meta.titel") },
            { name: "description", content: i18n.t("routes.spullen.meta.beschrijving") },
            { property: "og:title", content: i18n.t("routes.spullen.meta.titel") },
            { property: "og:description", content: i18n.t("routes.spullen.meta.ogBeschrijving") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: SpullenWrap,
});
const TYPES = ["mee", "vast", "dubbel"];
const typeLabel = (tp) => i18n.t(`routes.spullen.type.${tp}`);
const groepLabel = (tp) => i18n.t(`routes.spullen.groep.${tp}`);
const plekTekst = (p) => (p === "sanne" ? i18n.t("routes.spullen.plek.sanne") : p === "joris" ? i18n.t("routes.spullen.plek.joris") : p ? `${p === "school" ? i18n.t("routes.spullen.plek.school") : p}` : i18n.t("routes.spullen.plek.onbekend"));
const veld = "rounded-md border border-border bg-background px-3 py-2 text-sm";
const knop = (aan) => `min-h-11 rounded-full border px-3 text-sm ${aan ? "border-brand bg-brand-soft font-semibold" : "border-border"}`;
/** Paklijsten: vaste ids, namen en items uit de vertalingen. */
const PAKLIJSTEN = ["weekend", "vakantie", "sportdag", "schoolreisje"];
const paklijstNaam = (id) => i18n.t(`routes.spullen.paklijst.${id}.naam`);
const paklijstItems = (id) => tLijst(`routes.spullen.paklijst.${id}.items`);
/** Vaste spullen per dag: dag als index (maandag = 0) in common.dagen. */
const routines = [
    { id: "r1", dag: 0 },
    { id: "r2", dag: 1 },
    { id: "r3", dag: 3 },
    { id: "r4", dag: 6 },
];
function Spullen() {
    const { t } = useTranslation();
    const { spullen } = useTaken();
    const [nieuw, setNieuw] = useState(false);
    const [open, setOpen] = useState(null);
    const [voor, setVoor] = useOnthouden("spullen-voor", "samen", ["samen", "emma", "noah"]);
    const [pak, setPak] = useState("weekend");
    const [ingepakt, setIngepakt] = useState(new Set());
    // Zonder sessie: wordt bij elke (taal)wissel opnieuw opgebouwd, dus vertaalde startwaarden zijn hier veilig.
    const terugNaarJoris = t("routes.spullen.vergeten.terugNaar", { naam: "Joris" });
    const terugNaarSanne = t("routes.spullen.vergeten.terugNaar", { naam: "Sanne" });
    const vergeten = useLijst([
        { tekst: t("routes.spullen.vergeten.bibliotheekboek"), wie: terugNaarJoris, kind: "Emma", klaar: false },
        { tekst: t("routes.spullen.vergeten.winterjas"), wie: terugNaarSanne, kind: "Noah", klaar: false },
    ]);
    const gekozen = spullen.find((s) => s.id === open);
    if (gekozen)
        return <AppShell><SpulDetail s={gekozen} terug={() => setOpen(null)}/></AppShell>;
    const naamVan = (k) => (k === "emma" ? "Emma" : k === "noah" ? "Noah" : k);
    const zichtbaar = spullen.filter((x) => voor === "samen" || x.kind === voor);
    const mee = zichtbaar.filter((x) => x.type === "mee");
    // Bij "Samen" staat elk ding één keer: "Tandenborstel · Emma en Noah".
    const samengevoegd = (type) => {
        const groepen = new Map();
        for (const x of zichtbaar.filter((y) => y.type === type)) {
            const sleutel = `${x.naam.toLowerCase()}|${type === "vast" ? x.plek ?? "" : ""}`;
            groepen.set(sleutel, [...(groepen.get(sleutel) ?? []), x]);
        }
        return [...groepen.values()];
    };
    return (<AppShell>
      <div className="flex items-center gap-3">
        <BackButton terug="/meer"/>
        <h1 className="lora min-w-0 flex-1 text-[32px] leading-tight">{t("routes.spullen.titel")}</h1>
        <button aria-label={t("routes.spullen.nieuwSpul")} onClick={() => setNieuw(true)} className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-2xl leading-none text-primary-foreground"><Plus aria-hidden="true" strokeWidth={2.25} className="size-5"/></button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={() => setVoor("samen")} aria-pressed={voor === "samen"} className={`h-9 rounded-full px-4 text-sm font-extrabold ${voor === "samen" ? "bg-brand text-primary-foreground" : "border border-white/95 bg-white/75"}`}>{t("routes.spullen.samen")}</button>
        {["emma", "noah"].map((k) => (<button key={k} onClick={() => setVoor(k)} aria-pressed={voor === k} className={`flex h-9 items-center gap-1.5 rounded-full pl-1 pr-3.5 text-sm font-black ${voor === k ? "border-2 border-brand bg-white" : "bg-white/60"}`}>
            <span className="grid size-7 place-items-center rounded-full text-xs font-black text-white" style={{ background: kleurVanKind(k) }}>{naamVan(k)[0]}</span>{naamVan(k)}
          </button>))}
      </div>
      <Zichtbaar voor="samen" className="mt-2.5"/>
      {nieuw ? <NieuwSpul onKlaar={() => setNieuw(false)}/> : null}

      <Link to="/overdracht" className="mt-4 flex items-center gap-3 rounded-[22px] border-2 border-[#A9BCA8] px-4 py-3.5 [background:linear-gradient(135deg,rgba(220,230,210,.95),rgba(233,239,227,.9))]">
        <span className="grid size-[38px] shrink-0 place-items-center rounded-[13px] bg-white/70"><AppIcon functie="overdracht" maat="sm" vorm="kaal"/></span>
        <span className="min-w-0 flex-1"><span className="block text-[15.5px] font-black">{t("routes.spullen.paklijstWissel")}</span><span className="block text-xs text-ink-soft">{mee.length ? t("routes.spullen.dingenMee", { count: mee.length }) : t("routes.spullen.bekijkWatMee")}</span></span>
        <Chevron className="size-4 text-ink-soft"/>
      </Link>

      {["vast", "dubbel"].map((type) => {
            const l = samengevoegd(type);
            if (!l.length)
                return null;
            return (<section key={type} className="mt-5">
            <h2 className="px-1 text-[13px] font-black uppercase tracking-[0.08em] text-ink-soft">{groepLabel(type)}</h2>
            <ul className={`${GLAS} mt-2 divide-y divide-[#E9E1D5] px-1`}>
              {l.map((groep) => {
                    const x = groep[0];
                    const kids = [...new Set(groep.map((g) => naamVan(g.kind)))].join(` ${t("common.en")} `);
                    return (<li key={x.id}>
                  <button onClick={() => setOpen(x.id)} className="flex min-h-14 w-full items-center gap-3 px-3 py-3 text-left">
                    <span className="flex-1"><span className="block text-[15.5px] font-black">{x.naam}</span>
                      <span className="block text-xs text-ink-soft">{kids}{type === "vast" ? ` · ${plekTekst(x.plek)}` : ""}</span></span>
                    <Chevron className="size-4 text-ink-soft"/>
                  </button>
                </li>);
                })}
            </ul>
          </section>);
        })}

      <div className="mt-5 space-y-3">
        <KlapBlok titel={t("routes.spullen.vergeten.titel")} sub={t("routes.spullen.vergeten.sub")}>
          <Lijst data={vergeten} wieOpties={[terugNaarJoris, terugNaarSanne]} labels={[t("routes.spullen.vergeten.moetTerug"), t("routes.spullen.vergeten.terug")]} placeholder={t("routes.spullen.vergeten.placeholder")}/>
        </KlapBlok>
        <KlapBlok titel={t("routes.spullen.routines.titel")} sub={t("routes.spullen.routines.sub")}>
          <ul className="divide-y divide-[#E9E1D5]">
            {routines.map((r) => <li key={r.id} className="py-2.5"><p className="text-[11px] font-semibold uppercase text-ink-soft">{t("routes.spullen.routines.elke", { dag: (tLijst("common.dagen")[r.dag] ?? "").toLowerCase() })}</p><p className="text-sm">{t(`routes.spullen.routines.${r.id}`)}</p></li>)}
          </ul>
        </KlapBlok>
        <KlapBlok titel={t("routes.spullen.paklijsten.titel")} sub={t("routes.spullen.paklijsten.sub")}>
          <div className="grid grid-cols-2 gap-2">
            {PAKLIJSTEN.map((p) => <button key={p} onClick={() => { setPak(p); setIngepakt(new Set()); }} className={`min-h-11 rounded-full px-3 text-sm ${pak === p ? "bg-brand font-black text-primary-foreground" : "border border-[#E6DED2] bg-white font-bold"}`}>{paklijstNaam(p)}</button>)}
          </div>
          <ul className="mt-3 space-y-1">
            {paklijstItems(pak).map((x) => (<li key={x}><button onClick={() => setIngepakt((v) => { const n = new Set(v); if (n.has(x))
            n.delete(x);
        else
            n.add(x); return n; })} className="flex min-h-11 w-full items-center gap-3 text-left text-sm">
                <span className={`grid size-6 shrink-0 place-items-center rounded-full border-2 ${ingepakt.has(x) ? "border-brand bg-brand text-surface" : "border-[#A9A097]"}`}>{ingepakt.has(x) ? <Vinkje className="size-3.5"/> : null}</span>
                <span className={ingepakt.has(x) ? "text-ink-soft line-through" : ""}>{x}</span>
              </button></li>))}
          </ul>
          <p className="mt-2 text-xs text-ink-soft">{t("routes.spullen.paklijsten.ingepakt", { aantal: ingepakt.size, totaal: paklijstItems(pak).length })}</p>
        </KlapBlok>
      </div>
    </AppShell>);
}
const GLAS = "rounded-[22px] border border-white/85 bg-white/60";
function KlapBlok({ titel, sub, children }) {
    const [open, setOpen] = useState(false);
    return (<section className={GLAS}>
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-h-12 w-full items-center px-4 py-3 text-left">
        <span className="min-w-0 flex-1"><span className="block text-[15.5px] font-black">{titel}</span><span className="block text-xs text-ink-soft">{sub}</span></span>
        <Chevron richting="omlaag" open={open} className="size-4 text-ink-soft"/>
      </button>
      {open ? <div className="border-t border-[#E9E1D5] px-4 py-3">{children}</div> : null}
    </section>);
}
function PlekKeuze({ type, plek, setType, setPlek }) {
    const { t } = useTranslation();
    const anders = plek !== "sanne" && plek !== "joris";
    return (<>
      <fieldset><legend className="text-sm font-semibold">{t("routes.spullen.waarHoortHet")}</legend><div className="mt-1 flex flex-wrap gap-2">
        {TYPES.map((tp) => <button key={tp} onClick={() => setType(tp)} aria-pressed={type === tp} className={knop(type === tp)}>{typeLabel(tp)}</button>)}
      </div></fieldset>
      {type === "vast" ? (<fieldset><legend className="text-sm font-semibold">{t("routes.spullen.plekKeuze.waar")}</legend><div className="mt-1 flex flex-wrap gap-2">
          <button onClick={() => setPlek("sanne")} aria-pressed={plek === "sanne"} className={knop(plek === "sanne")}>{t("routes.spullen.plekKeuze.bij", { naam: "Sanne" })}</button>
          <button onClick={() => setPlek("joris")} aria-pressed={plek === "joris"} className={knop(plek === "joris")}>{t("routes.spullen.plekKeuze.bij", { naam: "Joris" })}</button>
          <button onClick={() => setPlek(anders && plek ? plek : "school")} aria-pressed={anders} className={knop(anders)}>{t("routes.spullen.plekKeuze.anders")}</button>
        </div>{anders ? <input value={plek} onChange={(e) => setPlek(e.target.value)} placeholder={t("routes.spullen.plekKeuze.placeholder")} aria-label={t("routes.spullen.plekKeuze.anderePlek")} className={`mt-2 w-full ${veld}`}/> : null}</fieldset>) : type === "mee" ? <p className="text-xs text-ink-soft">{t("routes.spullen.plekKeuze.vanzelf")}</p> : null}
    </>);
}
function SpulDetail({ s, terug }) {
    const { t } = useTranslation();
    const [bewerk, setBewerk] = useState(false);
    return (<>
      <div className="mt-2"><TerugKnop onClick={terug}/></div>
      <Card className="relative mt-3 space-y-3">
        {!bewerk ? <BewerkPotlood onClick={() => setBewerk(true)} label={t("routes.spullen.detail.plekAanpassen")}/> : null}
        <div><h1 className="lora pr-12 text-[28px] leading-tight">{s.naam}</h1><p className="text-sm text-ink-soft">{s.kind === "emma" ? "Emma" : "Noah"}</p></div>
        {bewerk ? (<>
            <PlekKeuze type={s.type} plek={s.plek ?? "sanne"} setType={(t) => zetSpul(s.id, { type: t, ...(t === "vast" && !s.plek ? { plek: "sanne" } : {}) })} setPlek={(p) => zetSpul(s.id, { plek: p })}/>
            <button onClick={() => setBewerk(false)} className="min-h-11 w-full rounded-full bg-brand text-sm font-semibold text-primary-foreground">{t("common.klaar")}</button>
          </>) : (<dl className="text-sm"><dt className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">{t("routes.spullen.waarHoortHet")}</dt><dd className="mt-0.5">{typeLabel(s.type)}{s.type === "vast" ? ` · ${plekTekst(s.plek)}` : ""}</dd></dl>)}
        {s.type === "mee" ? <Link to="/overdracht" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand"><MetChevron>{t("routes.spullen.detail.bijOverdracht")}</MetChevron></Link> : null}
      </Card>
    </>);
}
function NieuwSpul({ onKlaar }) {
    const { t } = useTranslation();
    const [naam, setNaam] = useState("");
    const [kind, setKind] = useState("emma");
    const [type, setType] = useState("mee");
    const [plek, setPlek] = useState("sanne");
    return (<Card className="mt-4 space-y-3">
      <p className="font-display text-lg font-bold">{t("routes.spullen.nieuwSpul")}</p>
      <label className="block text-sm font-semibold">{t("routes.spullen.form.watIsHet")}<input value={naam} onChange={(e) => setNaam(e.target.value)} placeholder={t("routes.spullen.form.placeholder")} className={`mt-1 w-full font-normal ${veld}`}/></label>
      <fieldset><legend className="text-sm font-semibold">{t("routes.spullen.form.voorWie")}</legend><div className="mt-1 flex gap-2">
        {["emma", "noah"].map((k) => <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k} className={knop(kind === k)}>{k === "emma" ? "Emma" : "Noah"}</button>)}
      </div></fieldset>
      <PlekKeuze type={type} plek={plek} setType={setType} setPlek={setPlek}/>
      <button disabled={!naam.trim()} onClick={() => { voegSpulToe({ naam: naam.trim(), kind, type, ...(type === "vast" ? { plek } : {}) }); onKlaar(); }} className="min-h-11 w-full rounded-full bg-brand text-sm font-semibold text-primary-foreground disabled:opacity-40">{t("common.toevoegen")}</button>
      <button onClick={onKlaar} className="min-h-11 w-full text-sm font-semibold text-ink-soft">{t("common.annuleren")}</button>
    </Card>);
}
