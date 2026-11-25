import { Button } from "@/components/ui/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useVoorkeuren, zetVoorkeur } from "@/lib/voorkeuren-store";
import { apparaatOndersteunt, registreerSlot } from "@/lib/app-slot";
import { AppShell, BackButton } from "@/components/AppShell";
import { AppIcon } from "@/components/AppIcon";
import { Chevron, MetChevron } from "@/components/Tekens";
import { TaalKiezer } from "@/components/TaalKiezer";
import { AfmeldenRij } from "@/components/Afmelden";
import { ProfielBeeld } from "@/components/ProfielBeeld";
import { start, useStart } from "@/lib/start-store";
import { useAuth } from "@/lib/auth-store";
import { setCheckinAan, useCheckin } from "@/lib/checkin-store";
import { regioLabel, regioUitleg, useRegio, zetRegio } from "@/lib/schoolvakanties";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
export const Route = createFileRoute("/instellingen")({
    head: () => ({
        meta: [
            { title: i18n.t("common.metaTitel", { titel: i18n.t("routes.instellingen.meta.titel") }) },
            { name: "description", content: i18n.t("routes.instellingen.meta.beschrijving") },
            { property: "og:title", content: i18n.t("common.metaTitel", { titel: i18n.t("routes.instellingen.meta.titel") }) },
            { property: "og:description", content: i18n.t("routes.instellingen.meta.ogBeschrijving") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: Instellingen,
});
function Keuze({ opties, waarde, onKies }) {
    return (<div className="space-y-2">
      {opties.map(([id, titel, uitleg]) => (<button key={id} onClick={() => onKies(id)} className={`flex w-full items-start gap-3 rounded-[16px] px-3 py-2.5 text-left ${waarde === id ? "border-2 border-brand bg-white" : "border border-[#E6DED2] bg-white/60"}`}>
          <span className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border ${waarde === id ? "border-brand" : "border-ink-soft/40"}`}>
            {waarde === id ? <span className="size-2 rounded-full bg-brand"/> : null}
          </span>
          <span><span className="block text-sm font-black">{titel}</span><span className="block text-xs text-ink-soft">{uitleg}</span></span>
        </button>))}
    </div>);
}
function Wissel({ label, uitleg, aan, onWissel, uit }) {
    return (<button onClick={onWissel} disabled={uit} role="switch" aria-checked={aan} className="flex w-full items-center justify-between gap-3 py-3 text-left disabled:opacity-50">
      <div>
        <p className="text-sm font-extrabold">{label}</p>
        <p className="text-xs leading-snug text-ink-soft">{uitleg}</p>
      </div>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${aan ? "bg-brand" : "bg-border"}`}>
        <span className={`absolute top-0.5 size-5 rounded-full bg-card transition-all ${aan ? "left-5" : "left-0.5"}`}/>
      </span>
    </button>);
}
function Instellingen() {
    const { t } = useTranslation();
    const vk = useVoorkeuren();
    const [slotMogelijk, setSlotMogelijk] = useState(null);
    const [slotMelding, setSlotMelding] = useState(null);
    useEffect(() => { apparaatOndersteunt().then(setSlotMogelijk); }, []);
    const wisselSlot = async () => {
        setSlotMelding(null);
        if (vk.vergrendelId) {
            zetVoorkeur("vergrendelId", null);
            return;
        }
        try {
            zetVoorkeur("vergrendelId", await registreerSlot());
            sessionStorage.setItem("onzeapp-ontgrendeld", "1");
            setSlotMelding(t("routes.instellingen.slot.aan"));
        }
        catch {
            setSlotMelding(t("routes.instellingen.slot.mislukt"));
        }
    };
    const st = useStart();
    const email = useAuth().gebruiker?.email ?? "";
    const checkin = useCheckin();
    // Samen/alleen is het profielveld usage_mode (via start-store, optimistisch).
    const gebruik = st.gebruik === "zelf" || st.gebruik === "alleen" ? "alleen" : "samen";
    const setGebruik = (g) => start.zetGebruik(g === "alleen" ? "zelf" : "samen");
    const regio = useRegio();
    const aantalAan = (...w) => w.filter(Boolean).length;
    return (<AppShell>
      <div className="flex items-center gap-3">
        <BackButton terug="/meer"/>
        <h1 className="lora min-w-0 flex-1 text-[32px] leading-tight">{t("routes.instellingen.meta.titel")}</h1>
      </div>

      {/* Profielsamenvatting: alleen jijzelf. Gekoppelde ouders en de kring staan onder Verbonden personen. */}
      <section className={`${GLAS} mt-4 flex items-center gap-3.5 p-4`}>
        <span className="shrink-0 rounded-full border-[3px] border-white"><ProfielBeeld beeld={st.beeld} naam={st.naam} maat={54}/></span>
        <div className="min-w-0">
          <p className="truncate text-[18px] font-black">{st.naam}</p>
          {email ? <p className="truncate text-[13px] text-ink-soft">{email}</p> : null}
        </div>
      </section>

      <Groep titel={t("routes.instellingen.groep.gezin")}>
        <Rij to="/kinderen" icoon="kinderen" titel={t("routes.instellingen.gezinBeheren.titel")} uitleg={t("routes.instellingen.gezinBeheren.uitleg")}/>
        <Rij to="/verbonden-personen" icoon="link" titel={t("routes.instellingen.verbonden.titel")} uitleg={st.coOuders?.length ? t("routes.instellingen.verbonden.gekoppeld") : st.uitgenodigd ? t("routes.instellingen.verbonden.uitgenodigd") : t("routes.instellingen.verbonden.uitleg")}/>
        <Rij to="/gezag" icoon="juridisch" titel={t("routes.instellingen.gezag.titel")} uitleg={t("routes.instellingen.gezag.uitleg")}/>
        <Uitklap icoon="samen" titel={t("routes.instellingen.gebruik.titel")} waarde={gebruik === "samen" ? t("routes.instellingen.gebruik.samen") : t("routes.instellingen.gebruik.alleen")}>
          <Keuze waarde={gebruik} onKies={setGebruik} opties={[
            ["samen", t("routes.instellingen.gebruik.samenTitel"), t("routes.instellingen.gebruik.samenUitleg")],
            ["alleen", t("routes.instellingen.gebruik.alleenTitel"), t("routes.instellingen.gebruik.alleenUitleg")],
        ]}/>
          <div className="mt-1 flex flex-wrap gap-x-4"><Link to="/solo" className="inline-flex min-h-10 items-center text-xs font-extrabold text-[#3F5747]"><MetChevron>{t("routes.instellingen.gebruik.persoonlijk")}</MetChevron></Link></div>
        </Uitklap>
        <Uitklap icoon="vakantie" titel={t("routes.instellingen.schoolvakanties.titel")} waarde={regioLabel[regio]}>
          <p className="mb-2 text-xs text-ink-soft">{t("routes.instellingen.schoolvakanties.uitleg")}</p>
          <Keuze waarde={regio} onKies={zetRegio} opties={["noord", "midden", "zuid"].map((r) => [r, regioLabel[r], regioUitleg[r]])}/>
        </Uitklap>
      </Groep>

      <Groep titel={t("routes.instellingen.groep.account")}>
        {/* Abonnementen: Milestone 3 (zie lib/fase.js) */}
        <Rij to="/privacy" icoon="oog" titel={t("routes.instellingen.wieZiet.titel")} uitleg={t("routes.instellingen.wieZiet.uitleg")}/>
        <Rij to="/exporteren" icoon="exporteren" titel={t("routes.instellingen.overzicht.titel")} uitleg={t("routes.instellingen.overzicht.uitleg")}/>
        <Rij to="/juridisch" icoon="juridisch" titel={t("routes.instellingen.voorwaarden.titel")} uitleg={t("routes.instellingen.voorwaarden.uitleg")}/>
      </Groep>

      <Groep titel={t("routes.instellingen.groep.weergave")}>
        <TaalKiezer/>
        <div className="py-3">
          <p className="text-[15px] font-black">{t("routes.instellingen.thema.titel")}</p>
          <div className="mt-2 flex gap-1 rounded-full bg-[rgba(226,216,203,.55)] p-1" role="radiogroup" aria-label={t("routes.instellingen.thema.titel")}>
            {[["licht", t("routes.instellingen.thema.licht")], ["donker", t("routes.instellingen.thema.donker")], ["automatisch", t("routes.instellingen.thema.automatisch")]].map(([th, l]) => (<button key={th} role="radio" aria-checked={vk.thema === th} onClick={() => zetVoorkeur("thema", th)} className={`min-h-9 flex-1 rounded-full text-[13.5px] ${vk.thema === th ? "bg-white font-black text-[#3F5747] shadow-[0_2px_8px_rgba(60,50,40,.08)]" : "font-bold text-ink-soft"}`}>{l}</button>))}
          </div>
        </div>
        <Rij to="/extra-ondersteuning" icoon="rust" titel={t("routes.instellingen.extraHouvast")} uitleg={vk.extraHouvast ? t("common.aan") : t("common.uit")}/>
        <Uitklap icoon="home" titel={t("routes.instellingen.levendig.titel")} waarde={vk.livingHome ? t("common.aan") : t("common.uit")}>
          <p className="text-xs text-ink-soft">{t("routes.instellingen.levendig.uitleg")}</p>
          <Wissel label={t("routes.instellingen.levendig.titel")} uitleg={t("routes.instellingen.levendig.wisselUitleg")} aan={vk.livingHome} onWissel={() => zetVoorkeur("livingHome", !vk.livingHome)}/>
          {vk.livingHome && <>
            <Wissel label={t("routes.instellingen.w.weer.label")} uitleg={t("routes.instellingen.w.weer.uitleg")} aan={vk.weerEffecten} onWissel={() => zetVoorkeur("weerEffecten", !vk.weerEffecten)}/>
            <Wissel label={t("routes.instellingen.w.seizoen.label")} uitleg={t("routes.instellingen.w.seizoen.uitleg")} aan={vk.seizoenEffecten} onWissel={() => zetVoorkeur("seizoenEffecten", !vk.seizoenEffecten)}/>
            <Wissel label={t("routes.instellingen.w.bijzonder.label")} uitleg={t("routes.instellingen.w.bijzonder.uitleg")} aan={vk.bijzondereMomenten} onWissel={() => zetVoorkeur("bijzondereMomenten", !vk.bijzondereMomenten)}/>
            <Wissel label={t("routes.instellingen.w.beweging.label")} uitleg={t("routes.instellingen.w.beweging.uitleg")} aan={vk.beweging === "verminderd"} onWissel={() => zetVoorkeur("beweging", vk.beweging === "verminderd" ? "automatisch" : "verminderd")}/>
            <label className="mt-1 block text-xs text-ink-soft">{t("routes.instellingen.levendig.weerVoor")}
              <input defaultValue={vk.weerPlaats} onBlur={(e) => zetVoorkeur("weerPlaats", e.target.value.trim() || "Haarlem")} className="mt-1 block w-full rounded-full border border-[#E6DED2] bg-white px-4 py-2 text-sm text-ink"/>
            </label>
            <p className="mt-1 text-[11px] text-ink-soft">{t("routes.instellingen.levendig.alleenPlaats")}</p>
          </>}
        </Uitklap>
      </Groep>

      <Groep titel={t("routes.instellingen.groep.co")}>
        <Uitklap icoon="co" titel={t("routes.instellingen.co.titel")} waarde={t("routes.instellingen.vanAan", { n: aantalAan(vk.aiSchrijfhulp, vk.rustigerCommuniceren, vk.communicatieSuggesties), totaal: 3 })}>
          <Wissel label={t("routes.instellingen.w.schrijfhulp.label")} uitleg={t("routes.instellingen.w.schrijfhulp.uitleg")} aan={vk.aiSchrijfhulp} onWissel={() => zetVoorkeur("aiSchrijfhulp", !vk.aiSchrijfhulp)}/>
          <Wissel label={t("routes.instellingen.w.rustiger.label")} uitleg={t("routes.instellingen.w.rustiger.uitleg")} aan={vk.rustigerCommuniceren} onWissel={() => zetVoorkeur("rustigerCommuniceren", !vk.rustigerCommuniceren)}/>
          <Wissel label={t("routes.instellingen.w.suggesties.label")} uitleg={t("routes.instellingen.w.suggesties.uitleg")} aan={vk.communicatieSuggesties} onWissel={() => zetVoorkeur("communicatieSuggesties", !vk.communicatieSuggesties)}/>
          {vk.verborgenCommunicatieSuggesties.length ? <Button variant="link" onClick={() => zetVoorkeur("verborgenCommunicatieSuggesties", [])} className="h-auto min-h-10 whitespace-normal px-0 text-xs">{t("routes.instellingen.co.verborgen")}</Button> : null}
          <p className="pt-1 text-[11px] text-ink-soft">{t("routes.instellingen.co.uitleg")}</p>
        </Uitklap>
        <Uitklap icoon="afstemmen" titel={t("routes.instellingen.rustig.titel")} waarde={aantalAan(vk.gestructureerdAfstemmen, vk.herinneringenGepauzeerd) ? t("common.aan") : t("common.uit")}>
          <Wissel label={t("routes.instellingen.w.rustigRegelen.label")} uitleg={t("routes.instellingen.w.rustigRegelen.uitleg")} aan={vk.gestructureerdAfstemmen} onWissel={() => zetVoorkeur("gestructureerdAfstemmen", !vk.gestructureerdAfstemmen)}/>
          <Wissel label={t("routes.instellingen.w.herinneringen.label")} uitleg={t("routes.instellingen.w.herinneringen.uitleg")} aan={vk.herinneringenGepauzeerd} onWissel={() => zetVoorkeur("herinneringenGepauzeerd", !vk.herinneringenGepauzeerd)}/>
        </Uitklap>
        {/* Bellen: niet in deze fase (zie lib/fase.js) */}
      </Groep>

      <Groep titel={t("routes.instellingen.groep.meldingen")}>
        <Uitklap icoon="melding" titel={t("routes.instellingen.meldingen.titel")} waarde={vk.rustmodus ? t("routes.instellingen.meldingen.rustmodusVanTot", { van: vk.rustVan, tot: vk.rustTot }) : t("routes.instellingen.meldingen.rustmodusUit")}>
          <Wissel label={t("routes.instellingen.w.rustmodus.label")} uitleg={t("routes.instellingen.w.rustmodus.uitleg", { van: vk.rustVan, tot: vk.rustTot })} aan={vk.rustmodus} onWissel={() => zetVoorkeur("rustmodus", !vk.rustmodus)}/>
          <Wissel label={t("routes.instellingen.w.bundelen.label")} uitleg={t("routes.instellingen.w.bundelen.uitleg")} aan={vk.bundelen} onWissel={() => zetVoorkeur("bundelen", !vk.bundelen)}/>
          <Wissel label={t("routes.instellingen.w.vandaag.label")} uitleg={t("routes.instellingen.w.vandaag.uitleg")} aan={vk.nuAfstemmenAltijd} onWissel={() => zetVoorkeur("nuAfstemmenAltijd", !vk.nuAfstemmenAltijd)}/>
          <Wissel label={t("routes.instellingen.w.feestdagen.label")} uitleg={t("routes.instellingen.w.feestdagen.uitleg")} aan={vk.bijzonderTonen} onWissel={() => zetVoorkeur("bijzonderTonen", !vk.bijzonderTonen)}/>
          <Wissel label={t("routes.instellingen.w.feestHerinnering.label")} uitleg={t("routes.instellingen.w.feestHerinnering.uitleg")} aan={vk.bijzonderHerinneren} onWissel={() => zetVoorkeur("bijzonderHerinneren", !vk.bijzonderHerinneren)}/>
          <p className="pt-1 text-[11px] text-ink-soft">{t("routes.instellingen.meldingen.echt")}</p>
        </Uitklap>
        <Uitklap icoon="slim" titel={t("routes.instellingen.slim.titel")} waarde={t("routes.instellingen.vanAan", { n: aantalAan(vk.slimSuggesties, vk.weekVooruit, vk.overdrachtHulp, vk.conflictControle, checkin.aan), totaal: 5 })}>
          <Wissel label={t("routes.instellingen.w.homeSuggesties.label")} uitleg={t("routes.instellingen.w.homeSuggesties.uitleg")} aan={vk.slimSuggesties} onWissel={() => zetVoorkeur("slimSuggesties", !vk.slimSuggesties)}/>
          <Wissel label={t("routes.instellingen.w.week.label")} uitleg={t("routes.instellingen.w.week.uitleg")} aan={vk.weekVooruit} onWissel={() => zetVoorkeur("weekVooruit", !vk.weekVooruit)}/>
          <Wissel label={t("routes.instellingen.w.overdracht.label")} uitleg={t("routes.instellingen.w.overdracht.uitleg")} aan={vk.overdrachtHulp} onWissel={() => zetVoorkeur("overdrachtHulp", !vk.overdrachtHulp)}/>
          <Wissel label={t("routes.instellingen.w.agenda.label")} uitleg={t("routes.instellingen.w.agenda.uitleg")} aan={vk.conflictControle} onWissel={() => zetVoorkeur("conflictControle", !vk.conflictControle)}/>
          <Wissel label={t("routes.instellingen.w.checkin.label")} uitleg={t("routes.instellingen.w.checkin.uitleg")} aan={checkin.aan} onWissel={() => setCheckinAan(!checkin.aan)}/>
        </Uitklap>
      </Groep>

      <Groep titel={t("routes.instellingen.groep.beveiliging")}>
        <div className="py-1">
          <Wissel label={t("routes.instellingen.w.slot.label")} uitleg={slotMogelijk === false ? t("routes.instellingen.w.slot.geen") : t("routes.instellingen.w.slot.uitleg")} aan={!!vk.vergrendelId} onWissel={wisselSlot} uit={slotMogelijk === false && !vk.vergrendelId}/>
          {slotMelding ? <p className="pb-2 text-xs text-ink-soft">{slotMelding}</p> : null}
          <p className="pb-2 text-[11px] text-ink-soft">{t("routes.instellingen.slot.telefoon")}</p>
        </div>
      </Groep>
      <AfmeldenRij className="mt-6"/>
      <p className="mt-6 text-center text-xs text-ink-soft">{t("routes.instellingen.voettekst")}</p>
    </AppShell>);
}
const GLAS = "rounded-[22px] border border-white/85 bg-white/60";
function Groep({ titel, children }) {
    return (<section className="mt-5">
      <h2 className="px-1 text-[13px] font-black uppercase tracking-[0.08em] text-ink-soft">{titel}</h2>
      <div className={`${GLAS} mt-2 divide-y divide-[#E9E1D5] px-3.5`}>{children}</div>
    </section>);
}
function Rij({ to, icoon, titel, uitleg }) {
    return (<Link to={to} className="flex min-h-[58px] items-center gap-3 py-2.5">
      <AppIcon functie={icoon} maat="md"/>
      <span className="min-w-0 flex-1"><span className="block text-[15px] font-black">{titel}</span><span className="block truncate text-xs text-ink-soft">{uitleg}</span></span>
      <Chevron className="size-4 text-ink-soft"/>
    </Link>);
}
function Uitklap({ icoon, titel, waarde, children }) {
    const [open, setOpen] = useState(false);
    return (<div>
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-h-[58px] w-full items-center gap-3 py-2.5 text-left">
        <AppIcon functie={icoon} maat="md"/>
        <span className="min-w-0 flex-1"><span className="block text-[15px] font-black">{titel}</span><span className="block truncate text-xs text-ink-soft">{waarde}</span></span>
        <Chevron className={`size-4 text-ink-soft ${open ? "rotate-90" : ""}`}/>
      </button>
      {open ? <div className="pb-3 pl-12">{children}</div> : null}
    </div>);
}
