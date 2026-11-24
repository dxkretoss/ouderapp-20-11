import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { startState } from "@/lib/start-store";
/** Groepswaarden voor "kind" ("Beide kinderen", "Gezin/algemeen" …) blijven als waarde bewaard; alleen de weergave wordt vertaald. Namen blijven namen. */
const KIND_GROEPEN = { "Beide kinderen": "beideKinderen", "Gezin/algemeen": "gezinAlgemeen", "Alle kinderen": "alleKinderen", "Allebei": "allebei", "Beide": "beide" };
export const kindLabel = (naam) => (KIND_GROEPEN[naam] ? i18n.t(`components.KostenTabs.kind.${KIND_GROEPEN[naam]}`) : naam);
/** Stijl A6: Kosten heeft twee tabbladen. Uitgaven = /kosten, Nog nodig = /boodschappen (bestaande route, eigen bron). */
export function KostenTabs({ actief }) {
    const { t } = useTranslation();
    const stijl = (aan) => `flex min-h-11 flex-1 items-center justify-center rounded-full text-[15px] ${aan ? "bg-white font-black text-[#3F5747] shadow-[0_2px_8px_rgba(60,50,40,.08)]" : "font-bold text-ink-soft"}`;
    return (<nav className="mt-4 flex rounded-full bg-[rgba(226,216,203,.55)] p-1" aria-label={t("components.KostenTabs.label")}>
      <Link to="/kosten" aria-current={actief === "uitgaven" ? "page" : undefined} className={stijl(actief === "uitgaven")}>{t("components.KostenTabs.uitgaven")}</Link>
      <Link to="/boodschappen" aria-current={actief === "nognodig" ? "page" : undefined} className={stijl(actief === "nognodig")}>{t("components.KostenTabs.nogNodig")}</Link>
    </nav>);
}
/** Naamlabel in de kindkleur: lichte achtergrond, cirkel met initiaal. */
export function KindPil({ naam, kleur }) {
    useTranslation();
    const label = kindLabel(naam);
    const c = kleur ?? startState().kinderen.find((k) => k.naam === naam)?.kleur ?? "#8A7E72";
    return (<span className="inline-flex h-6 items-center gap-1.5 rounded-full pl-0.5 pr-2.5 text-[13px] font-extrabold" style={{ background: `${c}26`, color: "#26211D" }}>
      <span className="grid size-[18px] place-items-center rounded-full text-[10px] font-black text-white" style={{ background: c }}>{label.slice(0, 1)}</span>
      {label}
    </span>);
}
