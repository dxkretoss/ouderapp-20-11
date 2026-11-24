import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useNuAfstemmen, reageerNuAfstemmen } from "@/lib/nu-afstemmen-store";
import { startState } from "@/lib/start-store";
import { useStart } from "@/lib/start-store";
import { AppIcon } from "@/components/AppIcon";
import { MetVinkje } from "@/components/Tekens";
/**
 * Schermvullende spoedwijziging: verschijnt bij een open "Nu afstemmen" van de andere ouder.
 * Reageren lost de melding op via de bestaande store; de planning verandert nooit vanzelf.
 * "Later beantwoorden" snoozet voor deze sessie — de melding blijft onder Nog af te stemmen.
 */
const SNOOZE_SLEUTEL = "onzeapp-spoed-snooze";
function gelezenSnooze() {
    try {
        const r = sessionStorage.getItem(SNOOZE_SLEUTEL);
        return new Set(r ? JSON.parse(r) : []);
    }
    catch {
        return new Set();
    }
}
function bewaarSnooze(s) {
    try {
        sessionStorage.setItem(SNOOZE_SLEUTEL, JSON.stringify([...s]));
    }
    catch {
        /* geen opslag: snooze geldt dan alleen in dit scherm */
    }
}
/** Zachte accentkleur per kind, uit het bestaande palet. */
const kindAccent = { emma: "#B8923E", noah: "#6F7F68" };
function minutenVerschil(oud, nieuw) {
    const [oh, om] = oud.split(":").map(Number);
    const [nh, nm] = nieuw.split(":").map(Number);
    if ([oh, om, nh, nm].some((n) => n === undefined || !Number.isFinite(n)))
        return null;
    return nh * 60 + nm - (oh * 60 + om);
}
export function SpoedScherm() {
    const { t } = useTranslation();
    const lijst = useNuAfstemmen();
    const st = useStart();
    const pad = useRouterState({ select: (r) => r.location.pathname });
    const [snooze, setSnooze] = useState(() => new Set());
    const [fase, setFase] = useState("vraag");
    const [eigenTijd, setEigenTijd] = useState("");
    const [weg, setWeg] = useState(false);
    // Snooze pas na hydratie lezen: op de server bestaat sessionStorage niet.
    useEffect(() => { setSnooze(gelezenSnooze()); }, []);
    // Alleen bij het voorbeeldgezin: een eigen gezin heeft nog geen gekoppelde andere ouder.
    const melding = st.eigen
        ? undefined
        : lijst.find((x) => x.status === "open" && x.van === "ander" && !snooze.has(x.id));
    useEffect(() => {
        // Alleen resetten bij een nieuwe melding; bij het oplossen (undefined) de "geregeld"-fase laten staan.
        if (!melding)
            return;
        setFase("vraag");
        setEigenTijd("");
        setWeg(false);
    }, [melding?.id]); // eslint-disable-line react-hooks/exhaustive-deps
    // In de "geregeld"-fase is de melding al opgelost; de bevestiging blijft kort staan.
    if (!melding && fase !== "geregeld")
        return null;
    // Niet tijdens de introductie of het opnieuw beginnen.
    if (pad === "/welkom" || pad === "/rondleiding")
        return null;
    const kindId = melding?.kindIds[0] ?? "";
    const kindNaam = startState().kinderen.find((k) => k.id === kindId)?.naam ?? t("components.SpoedScherm.jeKind");
    const accent = kindAccent[kindId] ?? "#C07B5C";
    const verschil = melding?.oudeTijd && melding.nieuweTijd ? minutenVerschil(melding.oudeTijd, melding.nieuweTijd) : null;
    const akkoordTekst = melding?.opties[1] ?? t("components.SpoedScherm.isGoed");
    const overnameTekst = melding?.opties[0] ?? t("components.SpoedScherm.ikHaalOp", { naam: kindNaam });
    const sluitZacht = () => {
        setWeg(true);
        // Na het wegvlakken volledig verwijderen; de melding is dan al opgelost.
        window.setTimeout(() => setFase("vraag"), 350);
    };
    const rondAf = (antwoord) => {
        if (!melding)
            return;
        // Eerst echt opslaan in de store, pas daarna "Geregeld ✓" tonen.
        reageerNuAfstemmen(melding.id, antwoord);
        setFase("geregeld");
        window.setTimeout(sluitZacht, 1400);
    };
    const later = () => {
        if (!melding)
            return;
        const s = new Set(snooze).add(melding.id);
        bewaarSnooze(s);
        setSnooze(s);
    };
    return (<div role="alertdialog" aria-modal="true" aria-label={t("components.SpoedScherm.aria", { titel: melding?.titel ?? t("components.SpoedScherm.afgehandeld") })} className={`fixed inset-0 z-[90] flex items-center justify-center bg-background/97 px-5 transition-opacity duration-300 ${weg ? "pointer-events-none opacity-0" : "opacity-100"}`}>
      {fase === "geregeld" ? (<p role="status" className="font-display text-2xl font-bold text-brand"><MetVinkje achter>{t("components.SpoedScherm.geregeld")}</MetVinkje></p>) : (<div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95">
          <div className="flex items-center gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-full font-display text-xl font-bold" style={{ backgroundColor: `${accent}22`, color: accent }}>
              {kindNaam.slice(0, 1)}
            </span>
            <div className="min-w-0">
              <p className="font-display text-base font-bold">{kindNaam}</p>
              <p className="text-xs text-ink-soft">{t("components.SpoedScherm.ophalenVandaag")}</p>
            </div>
            <span className="ml-auto rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-semibold text-brand">{t("components.SpoedScherm.nuAfstemmen")}</span>
          </div>

          <h2 className="mt-5 font-display text-xl font-bold leading-snug">{melding?.titel}</h2>
          <p className="mt-1 text-sm text-ink-soft">{t("components.SpoedScherm.zojuist")}</p>
          {melding?.toelichting ? <p className="mt-3 text-sm">{melding.toelichting}</p> : null}

          {melding?.oudeTijd && melding.nieuweTijd ? (<div className="mt-4 flex items-center justify-between rounded-xl bg-surface px-4 py-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{t("components.SpoedScherm.aankomst")}</p>
                <p className="font-display text-2xl font-bold">{melding.nieuweTijd}</p>
              </div>
              {verschil !== null && verschil > 0 ? (<span className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-ink-soft">{t("components.SpoedScherm.minLater", { n: verschil })}</span>) : null}
            </div>) : null}
          <p className="mt-3 text-xs text-ink-soft">{t("components.SpoedScherm.reactieUitleg")}</p>

          {fase === "vraag" ? (<div className="mt-6 grid grid-cols-3 gap-2">
              <button onClick={() => setFase("ander")} className="flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl border border-border px-2 text-xs font-semibold">
                <AppIcon functie="notitie" maat="sm" vorm="kaal"/>{t("common.anderVoorstel")}
              </button>
              <button onClick={() => rondAf(akkoordTekst)} className="flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl bg-brand px-2 text-xs font-semibold text-primary-foreground">
                <AppIcon functie="akkoord" maat="sm" vorm="kaal"/>{akkoordTekst}
              </button>
              <button onClick={() => setFase("overname")} className="flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl border border-border px-2 text-xs font-semibold">
                <AppIcon functie="berichten" maat="sm" vorm="kaal"/>{overnameTekst}
              </button>
            </div>) : null}

          {fase === "ander" ? (<form className="mt-6 space-y-3" onSubmit={(e) => {
                    e.preventDefault();
                    if (eigenTijd)
                        rondAf(t("components.SpoedScherm.anderVoorstelTijd", { tijd: eigenTijd }));
                }}>
              <label className="block text-sm font-semibold">
                {t("components.SpoedScherm.welkTijdstip")}
                <input type="time" value={eigenTijd} onChange={(e) => setEigenTijd(e.target.value)} className="mt-2 block w-full rounded-md border border-border bg-surface px-3 py-2"/>
              </label>
              <div className="flex gap-2">
                <button type="submit" disabled={!eigenTijd} className="min-h-[44px] flex-1 rounded-md bg-brand text-sm font-semibold text-primary-foreground disabled:opacity-40">{t("components.SpoedScherm.voorstelVersturen")}</button>
                <button type="button" onClick={() => setFase("vraag")} className="min-h-[44px] rounded-md border border-border px-4 text-sm font-semibold text-ink-soft">{t("common.terug")}</button>
              </div>
            </form>) : null}

          {fase === "overname" ? (<div className="mt-6 space-y-3">
              <p className="text-sm">{t("components.SpoedScherm.overnameUitleg", { naam: kindNaam })}</p>
              <div className="flex gap-2">
                <button onClick={() => rondAf(t("components.SpoedScherm.overnameAntwoord", { tekst: overnameTekst }))} className="min-h-[44px] flex-1 rounded-md bg-brand text-sm font-semibold text-primary-foreground">{t("components.SpoedScherm.voorstelVersturen")}</button>
                <button onClick={() => setFase("vraag")} className="min-h-[44px] rounded-md border border-border px-4 text-sm font-semibold text-ink-soft">{t("common.terug")}</button>
              </div>
            </div>) : null}

          <button onClick={later} className="mt-5 block w-full text-center text-xs font-semibold text-ink-soft">
            {t("components.SpoedScherm.later")}
          </button>
          <button onClick={() => rondAf(t("components.SpoedScherm.nietActueel"))} className="mt-2 block w-full text-center text-xs text-ink-soft underline-offset-2 hover:underline">
            {t("components.SpoedScherm.nietActueelSluiten")}
          </button>
        </div>)}
    </div>);
}
