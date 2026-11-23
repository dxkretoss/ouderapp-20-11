import { uur } from "@/lib/tijd-tekst";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { z } from "zod";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { Check, ChevronRight, Clock, HeartHandshake, Plus, ShieldCheck, UserRound, Users } from "lucide-react";
import { AppShell, PageHeader, TerugKnop } from "@/components/AppShell";
import { MetChevron, Vinkje } from "@/components/Tekens";
import { BewerkPotlood } from "@/components/ui-kit";
import { UitnodigingDelen } from "@/components/UitnodigingDelen";
import { kinderen, parents, professionals } from "@/lib/demo-data";
import { geenRechten, isActief, niveau, onderdelen, periodeTekst, persoonLabel, rechtenSamenvatting, rolNaam, rolOpties, toggleNoodVeld, trekIn, kandidatenVoor, contactKandidaten, noodcontacten, useKring, voegPersoonToe, wieNaam, wijzigPersoon, zetWie, } from "@/lib/kring-store";
export const Route = createFileRoute("/kring/$kindId")({
    validateSearch: z.object({ toevoegen: z.boolean().optional(), rol: z.string().optional() }),
    loader: ({ params }) => {
        const kind = kinderen.find((k) => k.id === params.kindId);
        if (!kind)
            throw notFound();
        return { naam: kind.naam };
    },
    head: ({ loaderData }) => {
        const t = loaderData ? i18n.t("routes.kringKindId.meta.titel", { naam: loaderData.naam }) : i18n.t("routes.kringKindId.meta.nietGevonden");
        const d = i18n.t("routes.kringKindId.meta.beschrijving");
        return { meta: [
                { title: t }, { name: "description", content: d },
                { property: "og:title", content: t }, { property: "og:description", content: d },
                { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
            ] };
    },
    notFoundComponent: () => <AppShell><PageHeader titel={i18n.t("routes.kringKindId.kindNietGevonden")} terug="/kinderen"/></AppShell>,
    component: KringPagina,
});
const sectieKop = "text-[11px] font-bold uppercase tracking-[0.14em] text-brand";
const knop = "rounded-md bg-brand px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40";
const veldK = "mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-ink";
const keuze = (aan) => `rounded-md border px-3 py-2 text-sm font-semibold ${aan ? "border-brand bg-brand-soft text-ink" : "border-border text-ink-soft"}`;
function Rij({ icoon, titel, sub, extra, onClick }) {
    const inhoud = (<>
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft/70 text-brand">{icoon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{titel}</span>
        <span className="block text-xs text-ink-soft">{sub}</span>
        {extra ? <span className="mt-0.5 block text-xs text-ink-soft">{extra}</span> : null}
      </span>
      {onClick ? <ChevronRight className="size-4 text-ink-soft" strokeWidth={1.6}/> : null}
    </>);
    return onClick
        ? <button onClick={onClick} className="flex w-full items-center gap-3 py-3 text-left">{inhoud}</button>
        : <div className="flex items-center gap-3 py-3">{inhoud}</div>;
}
function KringPagina() {
    const { t } = useTranslation();
    const { kindId } = Route.useParams();
    const kind = kinderen.find((k) => k.id === kindId);
    const kring = useKring();
    const zoekK = Route.useSearch();
    const [scherm, setScherm] = useState(zoekK.toevoegen ? { t: "toevoegen" } : { t: "lijst" });
    const leden = kring.personen.filter((p) => p.rechten[kindId] && !p.ingetrokken);
    const momenten = kring.momenten.filter((m) => m.kindIds.includes(kindId));
    if (scherm.t === "toevoegen")
        return <Toevoegen kindId={kindId} beginRol={zoekK.rol} klaar={() => setScherm({ t: "lijst" })}/>;
    if (scherm.t === "persoon") {
        const p = kring.personen.find((x) => x.id === scherm.id);
        if (p)
            return <PersoonDetail p={p} kindId={kindId} terug={() => setScherm({ t: "lijst" })}/>;
    }
    if (scherm.t === "nood")
        return <NoodkaartInstellen kindId={kindId} terug={() => setScherm({ t: "lijst" })}/>;
    return (<AppShell>
      <PageHeader titel={t("routes.kringKindId.lijst.titel")} subtitel={t("routes.kringKindId.lijst.subtitel", { naam: kind.naam })} terug={`/kinderen/${kindId}`}/>

      <section className="mt-8">
        <h2 className={sectieKop}>{t("routes.kringKindId.lijst.ouders")}</h2>
        <div className="mt-1 divide-y divide-border border-y border-border">
          <Rij icoon={<UserRound className="size-4" strokeWidth={1.6}/>} titel={parents.sanne.naam} sub={t("routes.kringKindId.lijst.ouder")}/>
          <Rij icoon={<UserRound className="size-4" strokeWidth={1.6}/>} titel={parents.joris.naam} sub={t("routes.kringKindId.lijst.ouder")}/>
        </div>
      </section>

      <section className="mt-7">
        <h2 className={sectieKop}>{t("routes.kringKindId.lijst.familie")}</h2>
        <div className="mt-1 divide-y divide-border border-y border-border">
          {leden.map((p) => (<Rij key={p.id} icoon={p.foto ? <img src={p.foto} alt="" className="size-9 rounded-full object-cover"/> : <HeartHandshake className="size-4" strokeWidth={1.6}/>} titel={persoonLabel(p)} sub={`${rolNaam(p.rol)}${p.noodcontact ? t("routes.kringKindId.noodcontactAchter") : ""}`} extra={p.uitgenodigd === false ? t("routes.kringKindId.lijst.geenApp") : isActief(p) ? (p.periode.type === "doorlopend" ? rechtenSamenvatting(p, kindId) : periodeTekst(p.periode)) : t("routes.kringKindId.lijst.verlopen")} onClick={() => setScherm({ t: "persoon", id: p.id })}/>))}
          {leden.length === 0 ? <p className="py-3 text-sm text-ink-soft">{t("routes.kringKindId.lijst.leeg")}</p> : null}
        </div>
      </section>

      <section className="mt-7">
        <h2 className={sectieKop}>{t("routes.kringKindId.lijst.professionals")}</h2>
        <div className="mt-1 divide-y divide-border border-y border-border">
          {professionals.filter((p) => p.statusId === "actief").map((p) => (<Link key={p.id} to="/professionals" className="block">
              <Rij icoon={<ShieldCheck className="size-4" strokeWidth={1.6}/>} titel={p.naam} sub={rolNaam(p.rol)} extra={t("routes.kringKindId.lijst.beperkteToegang")}/>
            </Link>))}
        </div>
        <p className="mt-2 text-[11px] text-ink-soft">{t("routes.kringKindId.lijst.professionalsUitleg")}</p>
      </section>

      {noodcontacten(kindId).length ? (<p className="mt-3 text-xs text-ink-soft">{t("routes.kringKindId.lijst.noodcontact", { namen: noodcontacten(kindId).map((p) => `${persoonLabel(p)}${p.telefoon ? ` (${p.telefoon})` : ""}`).join(", ") })}</p>) : null}
      <button onClick={() => setScherm({ t: "toevoegen" })} className="mt-6 flex w-full items-center justify-center gap-2 rounded-md border border-brand py-3 text-sm font-semibold text-brand">
        <Plus className="size-4" strokeWidth={1.8}/> {t("routes.kringKindId.lijst.toevoegen")}
      </button>

      <section className="mt-9">
        <h2 className={sectieKop}>{t("routes.kringKindId.lijst.wieHaalt")}</h2>
        <p className="mt-1 text-xs text-ink-soft">{t("routes.kringKindId.lijst.wieHaaltUitleg")}</p>
        <div className="mt-2 divide-y divide-border border-y border-border">
          {momenten.map((m) => {
            const wie = kring.wie[m.id];
            const kandidaten = kandidatenVoor(m);
            const bev = kring.bevestigd[m.id];
            return (<div key={m.id} className="py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold">{m.dag} · {uur(m.tijd)} · {m.titel}</p>
                  {bev && wie && wie !== "sanne" && wie !== "joris" ? (<span className="flex items-center gap-1 text-[11px] font-semibold text-brand"><Check className="size-3"/>{bev === "er" ? t("routes.kringKindId.lijst.isEr") : t("routes.kringKindId.lijst.bevestigd")}</span>) : null}
                </div>
                <p className="text-xs text-ink-soft">{m.plek}</p>
                <select value={wie ?? ""} onChange={(e) => zetWie(m.id, e.target.value)} aria-label={t("routes.kringKindId.lijst.wieRegelt", { titel: m.titel })} className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                  <option value="sanne">Sanne</option>
                  <option value="joris">Joris</option>
                  {kandidaten.map((p) => <option key={p.id} value={p.id}>{persoonLabel(p)}</option>)}
                  {contactKandidaten(m).map((p) => <option key={p.id} value={p.id}>{t("routes.kringKindId.lijst.contactZonderApp", { naam: persoonLabel(p) })}</option>)}
                </select>
                {wie && kring.personen.find((x) => x.id === wie)?.uitgenodigd === false ? <p className="mt-1 text-[11px] text-ink-soft">{t("routes.kringKindId.lijst.doorJouGeregistreerd")}</p> : bev && wie && !["sanne", "joris"].includes(wie) ? <p className="mt-1 text-[11px] text-ink-soft">{t("routes.kringKindId.lijst.heeftBevestigd", { naam: wieNaam(wie) })}</p> : wie && !["sanne", "joris"].includes(wie) ? <p className="mt-1 text-[11px] text-ink-soft">{t("routes.kringKindId.lijst.wachtOpBevestiging")}</p> : null}
                <Link to="/veranderd" search={{ moment: m.id, kind: kindId }} className="mt-1 inline-flex min-h-8 items-center text-[11px] font-semibold text-brand"><MetChevron>{t("routes.kringKindId.lijst.nuAfstemmen")}</MetChevron></Link>
              </div>);
        })}
        </div>
        <p className="mt-2 text-[11px] text-ink-soft">{t("routes.kringKindId.lijst.alleenMetToegang")}</p>
      </section>

      <section className="mt-9">
        <h2 className={sectieKop}>{t("routes.kringKindId.lijst.noodkaart")}</h2>
        <div className="mt-1 border-y border-border">
          <Rij icoon={<ShieldCheck className="size-4" strokeWidth={1.6}/>} titel={t("routes.kringKindId.lijst.watOpNoodkaart")} sub={t("routes.kringKindId.lijst.onderdelenGedeeld", { count: (kring.noodkaart[kindId] ?? []).length })} onClick={() => setScherm({ t: "nood" })}/>
        </div>
      </section>

      <Link to="/verzorger" className="mt-8 flex items-center gap-2 text-xs font-semibold text-brand">
        <Users className="size-4" strokeWidth={1.6}/> {t("routes.kringKindId.lijst.bekijkKring")}
      </Link>
    </AppShell>);
}
const suggestie = ["agenda", "wissel", "taken", "spullen", "nood", "momentjes"];
function Toevoegen({ kindId, klaar, beginRol }) {
    const { t } = useTranslation();
    const kind = kinderen.find((k) => k.id === kindId);
    const [stap, setStap] = useState(1);
    const [rol, setRol] = useState(beginRol && rolOpties.includes(beginRol) ? beginRol : "");
    const [anders, setAnders] = useState("");
    const [naam, setNaam] = useState("");
    const [telefoon, setTelefoon] = useState("");
    const [email, setEmail] = useState("");
    const [adres, setAdres] = useState("");
    const [foto, setFoto] = useState();
    const [nood, setNood] = useState(false);
    const [kids, setKids] = useState([kindId]);
    const [periode, setPeriode] = useState({ type: "doorlopend" });
    const [rechten, setRechten] = useState({});
    const [voorstel, setVoorstel] = useState([]);
    const rolLabel = rol === "Anders" ? anders.trim() : rol;
    if (rol === "Professional") {
        return (<AppShell>
        <PageHeader titel={t("routes.kringKindId.toevoegen.professionalTitel")} terug={`/kring/${kindId}`}/>
        <p className="mt-6 text-sm text-ink-soft">{t("routes.kringKindId.toevoegen.professionalUitleg")}</p>
        <Link to="/professionals" className={`mt-5 block text-center ${knop}`}>{t("routes.kringKindId.toevoegen.naarProfessional")}</Link>
        <button onClick={() => setRol("")} className="mt-3 w-full py-2 text-sm text-ink-soft">{t("common.terug")}</button>
      </AppShell>);
    }
    const wieTitel = naam.trim() ? (["Opa", "Oma"].includes(rolLabel) ? t("routes.kringKindId.toevoegen.rolEnNaam", { rol: rolNaam(rolLabel).toLowerCase(), naam: naam.trim() }) : naam.trim()) : t("routes.kringKindId.toevoegen.dezePersoon");
    const zetRecht = (k, o, n) => setRechten((r) => ({ ...r, [k]: { ...(r[k] ?? geenRechten()), [o]: n } }));
    const opslaan = () => {
        const def = {};
        kids.forEach((k) => { def[k] = rechten[k] ?? geenRechten(); });
        setVerstuurd(voegPersoonToe({ ...profiel(), periode, rechten: def, uitgenodigd: true }));
    };
    const [verstuurd, setVerstuurd] = useState(null);
    const profiel = () => ({ naam: naam.trim(), rol: rolLabel, contact: telefoon.trim() || email.trim(), telefoon: telefoon.trim() || undefined, email: email.trim() || undefined, adres: adres.trim() || undefined, foto, noodcontact: nood, gezag: "geen" });
    const alleenContact = () => {
        const def = {};
        kids.forEach((k) => { def[k] = geenRechten(); });
        voegPersoonToe({ ...profiel(), periode: { type: "doorlopend" }, rechten: def, uitgenodigd: false });
        klaar();
    };
    const leesFoto = (f) => { if (!f)
        return; const r = new FileReader(); r.onload = () => setFoto(String(r.result)); r.readAsDataURL(f); };
    return (<AppShell>
      <PageHeader titel={t("routes.kringKindId.toevoegen.titel", { naam: kind.naam })} subtitel={t("routes.kringKindId.toevoegen.subtitel")} terug={`/kring/${kindId}`}/>
      <p className="mt-6 text-[11px] font-semibold text-ink-soft">{t("routes.kringKindId.toevoegen.stap", { stap })}</p>

      {stap === 1 ? (<>
          <h2 className="mt-2 font-display text-xl">{t("routes.kringKindId.toevoegen.wieToevoegen")}</h2>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {[...rolOpties, "Professional"].map((r) => <button key={r} onClick={() => setRol(r)} className={keuze(rol === r)}>{rolNaam(r)}</button>)}
          </div>
          {rol === "Anders" ? <input value={anders} onChange={(e) => setAnders(e.target.value)} placeholder={t("routes.kringKindId.toevoegen.andersPlaceholder")} className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"/> : null}
          <button disabled={!rolLabel} onClick={() => setStap(2)} className={`mt-6 w-full ${knop}`}>{t("routes.kringKindId.toevoegen.verder")}</button>
        </>) : null}

      {stap === 2 ? (<>
          <h2 className="mt-2 font-display text-xl">{t("routes.kringKindId.toevoegen.wieIsHet")}</h2>
          <label className="mt-4 block text-xs text-ink-soft">{t("routes.kringKindId.toevoegen.naam")}<input value={naam} onChange={(e) => setNaam(e.target.value)} className={veldK}/></label>
          <p className="mt-1 text-[11px] text-ink-soft">{t("routes.kringKindId.toevoegen.relatie", { naam: kind.naam, rol: rolNaam(rolLabel) })}</p>
          <label className="mt-3 flex items-center gap-3 text-xs text-ink-soft">
            {foto ? <img src={foto} alt="" className="size-12 rounded-full object-cover"/> : <span className="grid size-12 place-items-center rounded-full bg-brand-soft text-brand"><UserRound className="size-5" strokeWidth={1.6}/></span>}
            <span>{t("routes.kringKindId.toevoegen.foto")}<input type="file" accept="image/*" onChange={(e) => leesFoto(e.target.files?.[0])} className="mt-1 block text-xs"/></span>
          </label>
          <label className="mt-3 block text-xs text-ink-soft">{t("routes.kringKindId.toevoegen.telefoon")}<input type="tel" value={telefoon} onChange={(e) => setTelefoon(e.target.value)} className={veldK}/></label>
          <label className="mt-3 block text-xs text-ink-soft">{t("routes.kringKindId.toevoegen.email")}<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={veldK}/></label>
          <label className="mt-3 block text-xs text-ink-soft">{t("routes.kringKindId.toevoegen.adres")}<input value={adres} onChange={(e) => setAdres(e.target.value)} className={veldK}/></label>
          <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={nood} onChange={() => setNood(!nood)} className="accent-[var(--brand)]"/> {t("routes.kringKindId.noodcontact")}</label>
          <p className="mt-5 text-sm font-semibold">{t("routes.kringKindId.toevoegen.voorWelkKind")}</p>
          <div className="mt-2 flex gap-2">
            {kinderen.map((k) => {
                const aan = kids.includes(k.id);
                return <button key={k.id} onClick={() => setKids(aan ? kids.filter((x) => x !== k.id) : [...kids, k.id])} className={`inline-flex items-center gap-1 ${keuze(aan)}`}>{aan ? <Vinkje className="size-3.5"/> : null}{k.naam}</button>;
            })}
          </div>
          <div className="mt-6 rounded-md border border-border p-3 text-xs text-ink-soft">
            <Trans i18nKey="routes.kringKindId.toevoegen.geenToegangUitleg" components={{ b: <span className="font-semibold text-ink"/> }}/>
          </div>
          <div className="mt-4 grid gap-2">
            <button disabled={!naam.trim() || kids.length === 0} onClick={alleenContact} className="rounded-md border border-brand py-3 text-sm font-semibold text-brand disabled:opacity-40">{t("routes.kringKindId.toevoegen.contactOpslaan")}</button>
            <button disabled={!naam.trim() || kids.length === 0 || !(telefoon.trim() || email.trim())} onClick={() => setStap(3)} className={knop}>{t("routes.kringKindId.uitnodigen")}</button>
            {naam.trim() && !(telefoon.trim() || email.trim()) ? <p className="text-[11px] text-ink-soft">{t("routes.kringKindId.toevoegen.contactNodig")}</p> : null}
            <button onClick={() => setStap(1)} className="py-2 text-sm text-ink-soft">{t("common.terug")}</button>
          </div>
        </>) : null}

      {stap === 3 ? (<>
          <h2 className="mt-2 font-display text-xl">{t("routes.kringKindId.toevoegen.hoeLang", { wie: wieTitel })}</h2>
          <PeriodeKeuze periode={periode} onChange={setPeriode}/>
          {periode.type !== "doorlopend" ? (<div className="mt-6 border-t border-border pt-4">
              <p className="font-display text-lg">{t("routes.kringKindId.toevoegen.tijdelijk")}</p>
              <p className="text-xs text-ink-soft">{t("routes.kringKindId.toevoegen.tijdelijkUitleg", { wie: wieTitel })}</p>
              <div className="mt-3 space-y-1">
                {suggestie.map((o) => {
                    const aan = voorstel.includes(o);
                    return (<button key={o} onClick={() => setVoorstel(aan ? voorstel.filter((x) => x !== o) : [...voorstel, o])} className="flex w-full items-center gap-3 py-1.5 text-left text-sm">
                      <span className={`grid size-5 place-items-center rounded border ${aan ? "border-brand bg-brand text-primary-foreground" : "border-border"}`}>{aan ? <Check className="size-3"/> : null}</span>
                      {onderdelen.find((x) => x.id === o).titel}
                    </button>);
                })}
              </div>
              <p className="mt-2 text-[11px] text-ink-soft">{t("routes.kringKindId.toevoegen.volgendeStap")}</p>
            </div>) : null}
          <div className="mt-6 flex gap-2">
            <button onClick={() => setStap(2)} className="flex-1 rounded-md border border-border py-3 text-sm">{t("common.terug")}</button>
            <button onClick={() => {
                if (voorstel.length) {
                    const n = {};
                    kids.forEach((k) => { n[k] = { ...geenRechten(), ...Object.fromEntries(voorstel.map((o) => [o, "bekijken"])) }; });
                    setRechten(n);
                }
                setStap(4);
            }} className={`flex-1 ${knop}`}>{t("routes.kringKindId.toevoegen.verder")}</button>
          </div>
        </>) : null}

      {verstuurd ? (<>
          <h2 className="mt-2 font-display text-xl">{t("routes.kringKindId.toevoegen.uitnodigingVersturen")}</h2>
          <UitnodigingDelen p={verstuurd}/>
          <button onClick={klaar} className={`mt-6 w-full ${knop}`}>{t("common.klaar")}</button>
        </>) : stap === 4 ? (<>
          <h2 className="mt-2 font-display text-xl">{t("routes.kringKindId.toevoegen.watMag", { wie: wieTitel })}</h2>
          <p className="mt-1 text-xs text-ink-soft">{t("routes.kringKindId.toevoegen.standaardGeen")}</p>
          {rolLabel === "Stiefouder / bonusouder" ? <p className="mt-2 rounded-md bg-brand-soft/60 px-3 py-2 text-xs">{t("routes.kringKindId.toevoegen.bonusouder", { wie: wieTitel })}</p> : null}
          {kids.map((k) => (<RechtenEditor key={k} kindNaam={kinderen.find((x) => x.id === k).naam} rechten={rechten[k] ?? geenRechten()} onChange={(o, n) => zetRecht(k, o, n)}/>))}
          <div className="mt-6 flex gap-2">
            <button onClick={() => setStap(3)} className="flex-1 rounded-md border border-border py-3 text-sm">{t("common.terug")}</button>
            <button onClick={opslaan} className={`flex-1 ${knop}`}>{t("routes.kringKindId.toevoegen.uitnodigingVersturen")}</button>
          </div>
        </>) : null}
    </AppShell>);
}
/** Snelle keuzes voor tijdelijke toegang; alleen invulhulp, de ouder bevestigt daarna zelf. */
function snelPeriodes() {
    const iso = (d) => d.toISOString().slice(0, 10);
    const nu = new Date();
    const plus = (n) => { const d = new Date(nu); d.setDate(d.getDate() + n); return d; };
    const totVrij = (5 - nu.getDay() + 7) % 7;
    return [
        { l: i18n.t("routes.kringKindId.periode.vandaag"), start: iso(nu), eind: iso(nu) },
        { l: i18n.t("routes.kringKindId.periode.ditWeekend"), start: iso(plus(totVrij)), eind: iso(plus(totVrij + 2)) },
        { l: i18n.t("routes.kringKindId.periode.komendeWeek"), start: iso(nu), eind: iso(plus(6)) },
    ];
}
function PeriodeKeuze({ periode, onChange }) {
    const { t } = useTranslation();
    const opties = [{ t: "doorlopend", l: t("routes.kringKindId.periode.doorlopend") }, { t: "tot", l: t("routes.kringKindId.periode.tot") }, { t: "periode", l: t("routes.kringKindId.periode.periode") }];
    const veld = "rounded-md border border-border bg-background px-3 py-2 text-sm";
    return (<div className="mt-4 space-y-2">
      {opties.map((o) => (<button key={o.t} onClick={() => onChange(o.t === "doorlopend" ? { type: "doorlopend" } : o.t === "tot" ? { type: "tot", eind: "2027-07-24" } : { type: "periode", start: "2027-07-10", eind: "2027-07-24" })} className={`flex w-full items-center gap-3 text-left ${keuze(periode.type === o.t)}`}>
          <span className={`size-3.5 rounded-full border ${periode.type === o.t ? "border-4 border-brand" : "border-ink-soft"}`}/>{o.l}
        </button>))}
      {periode.type === "tot" ? <input type="date" value={periode.eind} onChange={(e) => onChange({ type: "tot", eind: e.target.value })} className={`w-full ${veld}`} aria-label={t("routes.kringKindId.periode.einddatum")}/> : null}
      {periode.type === "periode" ? (<div className="flex items-center gap-2">
          <input type="date" value={periode.start} onChange={(e) => onChange({ ...periode, start: e.target.value })} className={`flex-1 ${veld}`} aria-label={t("routes.kringKindId.periode.startdatum")}/>
          <span className="text-xs text-ink-soft">{t("routes.kringKindId.periode.tm")}</span>
          <input type="date" value={periode.eind} onChange={(e) => onChange({ ...periode, eind: e.target.value })} className={`flex-1 ${veld}`} aria-label={t("routes.kringKindId.periode.einddatum")}/>
        </div>) : null}
      {periode.type !== "doorlopend" ? (<div className="flex flex-wrap gap-2 pt-1">
          {snelPeriodes().map((s) => (<button key={s.l} type="button" onClick={() => onChange({ type: "periode", start: s.start, eind: s.eind })} className="rounded-full border border-brand/40 px-3 py-1 text-xs font-semibold text-brand">{s.l}</button>))}
        </div>) : null}
      {periode.type !== "doorlopend" ? <p className="text-[11px] text-ink-soft">{t("routes.kringKindId.periode.vervalt")}</p> : null}
    </div>);
}
function RechtenEditor({ kindNaam, rechten, onChange }) {
    const { t } = useTranslation();
    return (<section className="mt-5">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand">{t("routes.kringKindId.toegangTot", { naam: kindNaam })}</h3>
      <div className="mt-1 divide-y divide-border border-y border-border">
        {onderdelen.map((o) => (<div key={o.id} className="py-3">
            <p className="text-sm font-semibold">{o.titel}</p>
            <p className="text-[11px] text-ink-soft">{o.uitleg}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {o.niveaus.map((n) => (<button key={n.id} onClick={() => onChange(o.id, n.id)} aria-pressed={rechten[o.id] === n.id} className={`rounded-full border px-3 py-1 text-xs font-semibold ${rechten[o.id] === n.id ? "border-brand bg-brand text-primary-foreground" : "border-border text-ink-soft"}`}>
                  {n.label}
                </button>))}
            </div>
          </div>))}
      </div>
    </section>);
}
function PersoonDetail({ p, kindId, terug }) {
    const { t } = useTranslation();
    const [bewerk, setBewerk] = useState(false);
    const [intrekken, setIntrekken] = useState(false);
    const [rechten, setRechten] = useState(p.rechten);
    const [periode, setPeriode] = useState(p.periode);
    const kind = kinderen.find((k) => k.id === kindId);
    const actief = isActief(p);
    return (<AppShell>
      <div className="relative flex items-start gap-3 pr-12">
        {p.uitgenodigd !== false && !bewerk ? <BewerkPotlood onClick={() => setBewerk(true)} label={t("routes.kringKindId.persoon.rechtenVanAanpassen", { naam: persoonLabel(p) })} className="right-0 top-0"/> : null}
        <TerugKnop onClick={terug}/>
        <div>
          <h1 className="lora text-[30px] leading-tight">{persoonLabel(p)}</h1>
          <p className="mt-1 text-sm text-ink-soft">{rolNaam(p.rol)}{p.noodcontact ? t("routes.kringKindId.noodcontactAchter") : ""}</p>
        </div>
        {p.foto ? <img src={p.foto} alt="" className="ml-auto size-14 rounded-full object-cover"/> : null}
      </div>
      <div className="mt-5 divide-y divide-border border-y border-border text-sm">
        {p.telefoon || (!p.email && p.contact) ? <a href={`tel:${p.telefoon ?? p.contact}`} className="flex justify-between py-2.5"><span className="text-ink-soft">{t("routes.kringKindId.persoon.telefoon")}</span><span>{p.telefoon ?? p.contact}</span></a> : null}
        {p.email ? <a href={`mailto:${p.email}`} className="flex justify-between py-2.5"><span className="text-ink-soft">{t("routes.kringKindId.persoon.email")}</span><span>{p.email}</span></a> : null}
        {p.adres ? <div className="flex justify-between py-2.5"><span className="text-ink-soft">{t("routes.kringKindId.persoon.adres")}</span><span className="text-right">{p.adres}</span></div> : null}
        <button onClick={() => wijzigPersoon(p.id, { noodcontact: !p.noodcontact })} className="flex w-full justify-between py-2.5"><span className="text-ink-soft">{t("routes.kringKindId.noodcontact")}</span><span className="font-semibold text-brand">{p.noodcontact ? t("common.ja") : t("common.nee")}</span></button>
        <div className="flex justify-between py-2.5"><span className="text-ink-soft">{t("routes.kringKindId.persoon.gezag")}</span><span>{t("common.nee")}</span></div>
      </div>
      {p.uitgenodigd === false ? (<div className="mt-5">
          <p className="text-sm">{t("routes.kringKindId.persoon.alsContact", { naam: p.naam })}</p>
          <button disabled={!(p.telefoon || p.email)} onClick={() => { wijzigPersoon(p.id, { uitgenodigd: true }); setBewerk(true); }} className={`mt-3 w-full ${knop}`}>{t("routes.kringKindId.uitnodigen")}</button>
          {!(p.telefoon || p.email) ? <p className="mt-1 text-[11px] text-ink-soft">{t("routes.kringKindId.persoon.eerstContact")}</p> : <p className="mt-1 text-[11px] text-ink-soft">{t("routes.kringKindId.persoon.daarnaKiezen", { naam: p.naam })}</p>}
        </div>) : null}
      {!actief ? <p className="mt-4 rounded-md bg-muted px-3 py-2 text-xs text-ink-soft"><Clock className="mr-1 inline size-3"/>{t("routes.kringKindId.persoon.verlopen")}</p> : null}

      {p.uitgenodigd && p.bevestigd === false ? (<section className="mt-6">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand">{t("routes.kringKindId.persoon.nietBevestigd")}</h3>
          <UitnodigingDelen p={p}/>
        </section>) : null}
      {p.uitgenodigd === false ? null : bewerk ? (<>
          {Object.keys(rechten).map((k) => (<RechtenEditor key={k} kindNaam={kinderen.find((x) => x.id === k).naam} rechten={rechten[k]} onChange={(o, n) => setRechten((r) => ({ ...r, [k]: { ...r[k], [o]: n } }))}/>))}
          <h3 className="mt-6 text-[11px] font-bold uppercase tracking-[0.14em] text-brand">{t("routes.kringKindId.persoon.toegang")}</h3>
          <PeriodeKeuze periode={periode} onChange={setPeriode}/>
          <div className="mt-6 flex gap-2">
            <button onClick={() => { setRechten(p.rechten); setPeriode(p.periode); setBewerk(false); }} className="flex-1 rounded-md border border-border py-3 text-sm">{t("common.annuleren")}</button>
            <button onClick={() => { wijzigPersoon(p.id, { rechten, periode }); setBewerk(false); }} className={`flex-1 ${knop}`}>{t("common.opslaan")}</button>
          </div>
        </>) : (<>
          {Object.keys(p.rechten).map((k) => (<section key={k} className="mt-6">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand">{t("routes.kringKindId.toegangTot", { naam: kinderen.find((x) => x.id === k).naam })}</h3>
              <div className="mt-1 divide-y divide-border border-y border-border">
                {onderdelen.map((o) => (<div key={o.id} className="flex justify-between gap-3 py-2.5 text-sm">
                    <span>{o.titel}</span>
                    <span className="text-right text-ink-soft">{o.niveaus.find((n) => n.id === niveau(p, k, o.id)).label}</span>
                  </div>))}
              </div>
            </section>))}
          <h3 className="mt-6 text-[11px] font-bold uppercase tracking-[0.14em] text-brand">{t("routes.kringKindId.persoon.toegang")}</h3>
          <p className="mt-1 text-sm">{periodeTekst(p.periode)}</p>
          <p className="mt-4 text-[11px] text-ink-soft">{t("routes.kringKindId.persoon.nooitZichtbaar")}</p>
          <button onClick={() => setBewerk(true)} className={`mt-6 w-full ${knop}`}>{t("routes.kringKindId.persoon.rechtenAanpassen")}</button>
          <button onClick={() => setIntrekken(true)} className="mt-2 w-full rounded-md border border-border py-3 text-sm font-semibold text-accent-warm">{t("routes.kringKindId.persoon.intrekken")}</button>
          <Link to="/verzorger" search={{ p: p.id, s: p.sleutel }} className="mt-4 block text-center text-xs font-semibold text-brand">{t("routes.kringKindId.persoon.bekijkWat", { naam: persoonLabel(p) })}</Link>
        </>)}

      {intrekken ? (<div className="app-modal-achter z-40" onClick={() => setIntrekken(false)}>
          <div className="app-modal" onClick={(e) => e.stopPropagation()}>
            <p className="font-display text-lg">{t("routes.kringKindId.persoon.intrekken")}</p>
            <p className="mt-2 text-sm text-ink-soft">{t("routes.kringKindId.persoon.intrekkenUitleg", { naam: p.naam, kinderen: Object.keys(p.rechten).map((k) => kinderen.find((x) => x.id === k).naam).join(` ${t("common.en")} `) || kind.naam })}</p>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setIntrekken(false)} className="flex-1 rounded-md border border-border py-3 text-sm">{t("common.annuleren")}</button>
              <button onClick={() => { trekIn(p.id); terug(); }} className={`flex-1 ${knop}`}>{t("routes.kringKindId.persoon.intrekken")}</button>
            </div>
          </div>
        </div>) : null}
    </AppShell>);
}
const noodVeld = (id) => ({ id, get label() { return i18n.t(`routes.kringKindId.nood.veld.${id}`); } });
const noodVelden = [
    noodVeld("geboortedatum"), noodVeld("contacten"),
    noodVeld("huisarts"), noodVeld("allergieen"),
    noodVeld("medicatie"), noodVeld("extra"),
];
function NoodkaartInstellen({ kindId, terug }) {
    const { t } = useTranslation();
    const kring = useKring();
    const kind = kinderen.find((k) => k.id === kindId);
    const aan = kring.noodkaart[kindId] ?? [];
    return (<AppShell>
      <div className="flex items-start gap-3">
        <TerugKnop onClick={terug}/>
        <div>
          <h1 className="lora text-[30px] leading-tight">{t("routes.kringKindId.nood.titel", { naam: kind.naam })}</h1>
          <p className="mt-1 text-sm text-ink-soft">{t("routes.kringKindId.nood.uitleg")}</p>
        </div>
      </div>
      <div className="mt-6 divide-y divide-border border-y border-border">
        {noodVelden.map((v) => (<button key={v.id} onClick={() => toggleNoodVeld(kindId, v.id)} className="flex w-full items-center justify-between py-3 text-left text-sm">
            {v.label}
            <span className={`relative h-6 w-10 rounded-full ${aan.includes(v.id) ? "bg-brand" : "bg-muted"}`}>
              <span className={`absolute top-0.5 size-5 rounded-full bg-background transition-all ${aan.includes(v.id) ? "left-[18px]" : "left-0.5"}`}/>
            </span>
          </button>))}
      </div>
    </AppShell>);
}
