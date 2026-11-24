import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Moon, Heart, CloudRain, CircleHelp, MessageCircle, Home, Users, Gift, HandHeart, Check, Quote, Search } from "lucide-react";
import { AppShell, PageHeader, TerugKnop } from "@/components/AppShell";
import { useStart } from "@/lib/start-store";
import { leeftijdGroep } from "@/lib/lastige-momenten-kind";
import { AppIcon } from "@/components/AppIcon";
import { bronnen, kindTips, themas } from "@/lib/kind-tips";
import { useTranslation, Trans } from "react-i18next";
import i18n, { tLijst } from "@/i18n";
import { Chevron, Kruis } from "@/components/Tekens";
/** "Je kind en de scheiding": algemene tips over missen, loyaliteit en verdriet. Vaste tekst, geen AI. */
export const Route = createFileRoute("/kind-tips")({
    head: () => ({ meta: [{ title: i18n.t("routes.kindTips.meta.titel") }, { name: "description", content: i18n.t("routes.kindTips.meta.beschrijving") }] }),
    component: KindTipsPagina,
});
const GLAS = "rounded-[22px] border border-white/85 bg-white/60";
const metNaam = (t, namen) => t.replaceAll("{kind}", namen.length > 1 ? i18n.t("routes.kindTips.namenEn", { namen: namen.slice(0, -1).join(", "), laatste: namen.at(-1) }) : namen[0] ?? i18n.t("routes.kindTips.jeKind"));
const THEMA_ICOON = [Moon, Heart, CloudRain, CircleHelp, MessageCircle, Home, Users, Gift, HandHeart];
const UITLEG_SLEUTEL = "kindtips-uitleg-gezien";
function KindTipsPagina() {
    const { t } = useTranslation();
    const st = useStart();
    const jarenUit = (geb) => { if (!geb || !/^\d{4}-\d{2}-\d{2}/.test(geb))
        return null; const g = new Date(geb), n = new Date(); return n.getFullYear() - g.getFullYear() - (n < new Date(n.getFullYear(), g.getMonth(), g.getDate()) ? 1 : 0); };
    const kids = st.kinderen.map((k) => ({ naam: k.naam, kleur: k.kleur ?? "#8A7E72", jaren: jarenUit(k.geboortedatum) }));
    const [thema, setThema] = useState(null);
    const [tipId, setTipId] = useState(null);
    const tip = kindTips.find((t) => t.id === tipId);
    const [zoek, setZoek] = useState("");
    const woorden = zoek.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const gevonden = woorden.length ? kindTips.map((tp) => ({ tp, s: woorden.filter((w) => `${tp.vraag} ${tp.kort} ${themas[tp.thema].naam}`.toLowerCase().includes(w)).length })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 6).map((x) => x.tp) : [];
    const terug = () => { if (tipId != null)
        setTipId(null);
    else
        setThema(null); window.scrollTo({ top: 0 }); };
    const [uitlegOpen, setUitlegOpen] = useState(true);
    useEffect(() => {
        try {
            if (localStorage.getItem(UITLEG_SLEUTEL) === "1")
                setUitlegOpen(false);
            else
                localStorage.setItem(UITLEG_SLEUTEL, "1");
        }
        catch { /* geen opslag, uitleg blijft open */ }
    }, []);
    const kindNamen = kids.length > 1 ? t("routes.kindTips.namenOf", { namen: kids.slice(0, -1).map((k) => k.naam).join(", "), laatste: kids.at(-1).naam }) : kids[0]?.naam ?? t("routes.kindTips.jeKind");
    const kies = (id) => { setTipId(id); window.scrollTo({ top: 0 }); };
    return (<AppShell>
      {tip ? (<>
          <div className="mb-2 flex items-center gap-2.5"><TerugKnop onClick={terug}/><span className="min-w-0 truncate text-sm font-extrabold text-ink-soft">{themas[tip.thema].naam}</span></div>
          <TipPagina tip={tip} kids={kids} kies={kies}/>
        </>) : thema != null ? (<>
          <div className="mb-2 flex items-center gap-2.5"><TerugKnop onClick={terug}/><span className="min-w-0 truncate text-sm font-extrabold text-ink-soft">{t("routes.kindTips.alleOnderwerpen")}</span></div>
          <h1 className="lora text-[30px] leading-tight">{themas[thema].naam}</h1>
          <p className="text-sm text-ink-soft">{themas[thema].sub}</p>
          <div className={`${GLAS} mt-4 px-4 py-1`}>
            {kindTips.filter((x) => x.thema === thema).map((x) => (<button key={x.id} onClick={() => kies(x.id)} className="flex w-full items-center gap-2 border-b border-[#E9E1D5] py-3 text-left text-[15.5px] font-bold last:border-0"><span className="flex-1">{x.vraag}</span><Chevron className="size-4 text-ink-soft"/></button>))}
          </div>
        </>) : (<>
          <PageHeader titel={t("routes.kindTips.titel")} subtitel={t("routes.kindTips.subtitel")} terug="/meer" zonderZoeken/>
          <details open={uitlegOpen} onToggle={(e) => setUitlegOpen(e.currentTarget.open)} className="mt-4 rounded-[22px] border-2 border-[#A9BCA8] px-4 py-3.5 [background:linear-gradient(135deg,rgba(220,230,210,.95),rgba(233,239,227,.9))]">
            <summary className="flex cursor-pointer list-none items-center text-[13px] font-black uppercase tracking-[0.08em] text-[#3F5747]">
              <span className="flex-1">{t("routes.kindTips.uitleg.kop")}</span><Chevron className={`size-4 transition-transform ${uitlegOpen ? "rotate-90" : ""}`}/>
            </summary>
            <p className="mt-1.5 text-[15px] leading-snug text-[#2F4A3A]">{t("routes.kindTips.uitleg.intro")}</p>
            <div className="mt-2.5 grid gap-1.5">
              {tLijst("routes.kindTips.uitleg.voorbeelden").map((v) => (<p key={v} className="rounded-[14px] bg-white/75 px-3 py-2 text-[14px] font-bold leading-snug">“{v}”</p>))}
            </div>
            <p className="mt-3 text-[15px] leading-snug text-[#2F4A3A]">{t("routes.kindTips.uitleg.jeKrijgt")}</p>
            <ul className="mt-2 grid gap-2.5 text-[14.5px] leading-snug text-[#2F4A3A]">
              {[
                { I: Check, kop: t("routes.kindTips.uitleg.doenKop"), s: t("routes.kindTips.uitleg.doenTekst") },
                { I: Quote, kop: t("routes.kindTips.uitleg.zeggenKop"), s: t("routes.kindTips.uitleg.zeggenTekst", { namen: kindNamen }) },
                { I: Heart, kop: t("routes.kindTips.uitleg.ogenKop"), s: t("routes.kindTips.uitleg.ogenTekst") },
            ].map(({ I, kop, s }) => (<li key={kop} className="flex items-start gap-2.5">
                  <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full border border-[#C9D6C3] bg-white text-[#3F5747]"><I className="size-3.5" strokeWidth={2.5}/></span>
                  <span><b className="font-black">{kop}</b> {s}</span>
                </li>))}
            </ul>
            <p className="mt-3 text-[13px] text-[#3F5747]">{t("routes.kindTips.uitleg.basis")}</p>
          </details>
          <label className="mt-4 flex items-center gap-2 rounded-full bg-white px-4 shadow-[0_4px_14px_rgba(60,50,40,.06)]">
            <Search aria-hidden className="size-[18px] shrink-0 text-brand" strokeWidth={2}/>
            <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder={t("routes.kindTips.zoekPlaceholder")} aria-label={t("routes.kindTips.zoekLabel")} className="h-12 min-w-0 flex-1 bg-transparent text-[15px] font-semibold outline-none placeholder:font-normal placeholder:text-ink-soft"/>
          </label>
          {zoek.trim().length >= 2 ? (<div className={`${GLAS} mt-3 px-4 py-1`}>
              {gevonden.length ? gevonden.map((x) => <button key={x.id} onClick={() => kies(x.id)} className="flex w-full items-center gap-2 border-b border-[#E9E1D5] py-3 text-left text-[15px] font-bold last:border-0"><span className="flex-1">{x.vraag}</span><Chevron className="size-4 text-ink-soft"/></button>)
                    : <p className="py-3 text-sm text-ink-soft">{t("routes.kindTips.geenTip")}</p>}
            </div>) : null}
          {zoek.trim().length >= 2 ? null : <>
            <p className="mt-5 px-1 text-[13px] font-black uppercase tracking-[0.08em] text-ink-soft">{t("routes.kindTips.kiesOnderwerp")}</p>
            <div className={`${GLAS} mt-2 divide-y divide-[#E9E1D5]`}>
              {themas.map((th, i) => {
                    const Icoon = THEMA_ICOON[i] ?? Heart;
                    const aantal = kindTips.filter((k) => k.thema === i).length;
                    return (<button key={i} onClick={() => { setThema(i); window.scrollTo({ top: 0 }); }} className="flex w-full items-center gap-3 px-3.5 py-3 text-left">
                    <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[14px]" style={{ background: th.tegel, color: th.inkt }}><Icoon className="size-5"/></span>
                    <span className="min-w-0 flex-1"><span className="block text-[16px] font-black">{th.naam}</span><span className="block text-[13.5px] text-ink-soft">{th.sub} · {t("routes.kindTips.aantalVragen", { count: aantal })}</span></span>
                    <Chevron className="size-4 text-ink-soft"/>
                  </button>);
                })}
            </div>
          </>}
          <Link to="/verhaal" className="mt-4 flex items-center gap-3 rounded-[22px] border-2 border-[#A9BCA8] px-4 py-3" style={{ background: "linear-gradient(135deg, rgba(220,230,210,.95), rgba(233,239,227,.9))" }}>
            <span className="grid size-8 shrink-0 place-items-center rounded-full border border-[#C9D6C3] bg-[#E9EFE3] text-xs font-black text-[#3F5747]" aria-hidden>Co</span>
            <span className="min-w-0 flex-1 text-[15px] text-[#2F4A3A]"><Trans i18nKey="routes.kindTips.nietErbij" components={{ b: <b /> }}/></span>
          </Link>
          <Bronnen />
        </>)}
    </AppShell>);
}
function TipPagina({ tip, kids, kies }) {
    const { t } = useTranslation();
    const [voor, setVoor] = useState(kids.length > 1 ? "samen" : kids[0]?.naam ?? "samen");
    const gekozen = kids.find((k) => k.naam === voor);
    const zin = voor === "samen" || !gekozen ? tip.zeg.samen : tip.zeg[leeftijdGroep(gekozen.jaren)];
    const namen = voor === "samen" || !gekozen ? kids.map((k) => k.naam) : [gekozen.naam];
    const zus = kindTips.filter((x) => x.thema === tip.thema);
    const ook = zus.filter((x) => x.id !== tip.id);
    const th = themas[tip.thema];
    return (<div className="pb-6">
      <span className="rounded-full px-2.5 py-1 text-[13px] font-black" style={{ background: th.tegel, color: th.inkt }}>{th.naam}</span>
      <h1 className="mt-3 font-display text-[24px] font-black leading-tight">{tip.vraag}</h1>
      <p className="mt-3 border-l-[3px] border-[#A9BCA8] pl-3.5 text-base leading-relaxed">{tip.kort}</p>

      <p className="mt-6 mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-ink-soft">{t("routes.kindTips.tip.doen")}</p>
      <ol className={`${GLAS} space-y-2 px-4 py-3`}>
        {tip.doen.map((d, i) => <li key={d} className="flex gap-3 text-[15px] leading-snug"><span className="grid size-[26px] shrink-0 place-items-center rounded-full bg-[#DCE3D3] text-[13px] font-black text-[#3F5747]">{i + 1}</span><span className="pt-0.5">{d}</span></li>)}
      </ol>

      <div className="mt-4 rounded-[22px] border border-white/80 bg-[rgba(220,230,210,.9)] px-4 py-3.5">
        <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#3F5747]">{t("routes.kindTips.tip.zeggen")}</p>
        {kids.length ? (<div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={t("routes.kindTips.tip.tegenWie")}>
            {kids.length > 1 ? <button onClick={() => setVoor("samen")} aria-pressed={voor === "samen"} className={`h-8 rounded-full px-3 text-[13px] font-black ${voor === "samen" ? "border-2 border-[#4F6B58] bg-white" : "bg-white/60"}`}>{t("routes.kindTips.tip.samen")}</button> : null}
            {kids.map((k) => (<button key={k.naam} onClick={() => setVoor(k.naam)} aria-pressed={voor === k.naam} className={`inline-flex h-8 items-center gap-1.5 rounded-full pl-1 pr-3 text-[13px] font-black ${voor === k.naam ? "border-2 bg-white" : "bg-white/60"}`} style={voor === k.naam ? { borderColor: k.kleur } : undefined}>
                <span className="grid size-6 place-items-center rounded-full text-[11px] text-white" style={{ background: k.kleur }}>{k.naam.slice(0, 1)}</span>{k.naam}{k.jaren != null ? ` ${k.jaren}` : ""}
              </button>))}
          </div>) : null}
        <p className="mt-2.5 text-[19px] font-extrabold leading-snug text-[#2F4A3A]">“{zin}”</p>
      </div>

      {tip.reageren.length ? <>
        <p className="mt-6 mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-ink-soft">{t("routes.kindTips.tip.alsJeKindZegt")}</p>
        <div className="space-y-2.5">{tip.reageren.map((r) => (<div key={r.kind} className={`${GLAS} px-4 py-3`}>
            <p className="rounded-[16px_16px_16px_6px] bg-[#F3E1E4] px-3 py-2 text-[14.5px] font-bold text-[#4A2E33]">{metNaam(r.kind, namen)}</p>
            <p className="mt-2 ml-6 rounded-[16px_16px_6px_16px] bg-[#DCE6D2] px-3 py-2 text-[14.5px] font-bold text-[#2F4A3A]">{metNaam(r.jij, namen)}</p>
          </div>))}</div>
      </> : null}

      {tip.idee ? (<div className="mt-4 rounded-[22px] border border-white/85 px-4 py-3" style={{ background: "linear-gradient(135deg, rgba(239,225,201,.9), rgba(243,237,227,.85))" }}>
          <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#7A5E44]">{t("routes.kindTips.tip.idee")}</p>
          <p className="mt-1 text-[15px] leading-snug">{tip.idee}</p>
        </div>) : null}

      {tip.liever.length ? <>
        <p className="mt-6 mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-ink-soft">{t("routes.kindTips.tip.liever")}</p>
        <div className="space-y-1.5">{tip.liever.map((z) => <p key={z} className="flex gap-2 rounded-2xl bg-[rgba(234,219,199,.6)] px-3.5 py-2.5 text-[14.5px] text-[#5A4636]"><Kruis className="mt-[3px] size-4"/>{z}</p>)}</div>
      </> : null}

      <div className="mt-4 rounded-[22px] border border-white/85 p-4" style={{ background: "linear-gradient(135deg, rgba(243,225,228,.88), rgba(239,225,201,.82))" }}>
        <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#7A3B48]">{t("routes.kindTips.tip.ogen")}</p>
        <p className="lora mt-2 text-[18px] leading-snug text-[#4A2E33]">{metNaam(tip.kind, namen)}</p>
      </div>

      <div className="mt-3 flex items-start gap-2.5 rounded-[22px] border-2 border-[#A9BCA8] px-4 py-3" style={{ background: "linear-gradient(135deg, rgba(220,230,210,.95), rgba(233,239,227,.9))" }}>
        <span className="grid size-8 shrink-0 place-items-center rounded-full border border-[#C9D6C3] bg-[#E9EFE3] text-xs font-black text-[#3F5747]" aria-hidden>Co</span>
        <div className="min-w-0"><p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#3F5747]">{t("routes.kindTips.tip.enJij")}</p><p className="text-[15px] leading-snug text-[#2F4A3A]">{tip.voorJou}</p></div>
      </div>

      <Link to="/verhaal" className="mt-4 flex h-12 items-center justify-center rounded-full bg-brand text-[15px] font-black text-primary-foreground"><AppIcon functie="co" maat="sm" className="mr-1.5"/>{t("routes.kindTips.tip.denkMee")}</Link>
      <div className={`${GLAS} mt-4 px-4 py-3`}><p className="text-[15px] font-black">{t("routes.kindTips.tip.hulpZoeken")}</p><p className="text-[14.5px] leading-snug">{tip.hulp}</p></div>
      {ook.length ? (<details className={`group ${GLAS} mt-4 px-4 py-3`}>
          <summary className="flex cursor-pointer list-none items-center gap-2 text-[15px] font-black"><span className="flex-1">{t("routes.kindTips.tip.meerOver", { thema: th.naam.toLowerCase() })}</span><Chevron className="size-4 text-ink-soft transition-transform group-open:rotate-90"/></summary>
          <div className="mt-2">
            {ook.map((x) => <button key={x.id} onClick={() => kies(x.id)} className="flex w-full items-center gap-2 border-b border-[#E9E1D5] py-2.5 text-left text-[14.5px] font-bold last:border-0"><span className="flex-1">{x.vraag}</span><Chevron className="size-4 text-ink-soft"/></button>)}
          </div>
        </details>) : null}
      <Bronnen />
    </div>);
}
function Bronnen() {
    const { t } = useTranslation();
    return (<p className="mt-5 text-[12px] leading-relaxed text-ink-soft">
      {t("routes.kindTips.bronnen.intro")}{" "}
      {bronnen.map((b, i) => <span key={b.url}>{i ? t("routes.kindTips.bronnen.en") : ""}<a href={b.url} target="_blank" rel="noreferrer" className="underline">{b.naam}</a></span>)}.
      {" "}{t("routes.kindTips.bronnen.veiligThuis")}
    </p>);
}
