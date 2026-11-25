import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { AppIcon } from "@/components/AppIcon";
import { Chevron } from "@/components/Tekens";
import { InhoudLaden, LaadFout } from "@/components/Laden";
import { bevestig } from "@/lib/feedback";
import { beantwoordToegang, laadToegang, trekToegangIn, useToegang, vraagToegang } from "@/lib/kindprofiel-store";
const N = "components.GezagToegang.";
const GLAS = "rounded-[22px] border border-white/85 bg-white/60";
const knopOpslaan = "flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-brand px-5 text-sm font-black text-primary-foreground disabled:opacity-50";
const knopAnnuleer = "flex h-11 flex-1 items-center justify-center rounded-full border border-[#E3DACD] bg-white/70 px-5 text-sm font-bold text-ink";
/** Leesbare niveaus; elk is een vaste combinatie van bekijken / voorstellen / bewerken (geen ladder in de opslag). */
const NIVEAUS = {
    alles: { view: true, propose: true, edit: true },
    voorstellen: { view: true, propose: true, edit: false },
    bekijken: { view: true, propose: false, edit: false },
    geen: { view: false, propose: false, edit: false },
};
export function niveauVan(a) {
    if (!a?.view)
        return "geen";
    if (a.edit && a.propose)
        return "alles";
    if (a.propose)
        return "voorstellen";
    return a.edit ? "alles" : "bekijken";
}
/**
 * "Gezag en toegang" voor één kind: wat jij en de andere ouder in de app kunnen bekijken, voorstellen en
 * bewerken (per onderdeel, zoals de server het afdwingt), open verzoeken en (met `bewerkbaar`) wijzigen.
 * Jouw eigen toegang beperken gaat meteen; een wijziging voor de andere ouder is een verzoek dat die ouder
 * moet beantwoorden. Gezag (zelf ingevuld) verandert hier niets aan.
 */
export function GezagToegang({ kindId, naam, bewerkbaar = false }) {
    const { t } = useTranslation();
    const { toegang, laden, fout } = useToegang(kindId);
    const [kies, setKies] = useState(null); // { sectie, ouderId }
    const [bezig, setBezig] = useState(null);
    if (!toegang)
        return fout && !laden ? <LaadFout onOpnieuw={() => laadToegang(kindId)}/> : <InhoudLaden hoogte="min-h-[20dvh]"/>;
    const ik = toegang.parents.find((p) => p.rol === "ik");
    const ander = toegang.parents.find((p) => p.rol === "ander");
    const sectie = (s) => t(N + `sectie.${s}`);
    const niveau = (n) => t(N + `niveau.${n}`);
    const aanMij = toegang.requests.filter((r) => r.aan_mij);
    const vanMij = toegang.requests.filter((r) => r.door === "ik" && !r.aan_mij);
    const open = (sectieId, ouderId) => toegang.requests.find((r) => r.section === sectieId && r.parent_id === ouderId);
    const doe = async (sleutel, f, melding) => {
        setBezig(sleutel);
        const ok = await f();
        setBezig(null);
        if (ok && melding)
            bevestig(melding);
        return ok;
    };
    return (<div className="space-y-3">
      <p className="text-sm text-ink-soft">{t(N + "intro", { naam })}</p>

      {aanMij.map((r) => (<div key={r.id} className="rounded-[18px] border-2 border-[#A9BCA8] bg-[#E9EFE3] px-4 py-3 text-sm text-[#2F4A3A]" role="status">
          <p className="font-black">{t(N + "verzoek.titel")}</p>
          <p className="mt-0.5">{t(r.voor === "ik" ? N + "verzoek.voorJou" : N + "verzoek.voorAnder", { sectie: sectie(r.section), niveau: niveau(niveauVan(r)) })}</p>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={!!bezig} onClick={() => doe(r.id + "n", () => beantwoordToegang(kindId, r.id, false), t(N + "verzoek.nietAkkoordKlaar"))} className={knopAnnuleer}>{t(N + "verzoek.nietAkkoord")}</button>
            <button type="button" disabled={!!bezig} onClick={() => doe(r.id + "j", () => beantwoordToegang(kindId, r.id, true), t(N + "verzoek.akkoordKlaar"))} className={knopOpslaan}>{bezig === r.id + "j" ? <Loader2 className="size-4 animate-spin" aria-hidden="true"/> : null}{t(N + "verzoek.akkoord")}</button>
          </div>
        </div>))}

      <div className={`${GLAS} px-4 py-2`}>
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 border-b border-[#E9E1D5] py-2 text-xs font-semibold">
          <span />
          <span className="w-24 text-center text-brand">{t("common.jij")}</span>
          <span className="w-24 text-center leading-tight">{ander ? t("common.deAndereOuder") : ""}</span>
        </div>
        {toegang.sections.map((s) => (<div key={s} className="border-b border-[#E9E1D5] py-2 last:border-0">
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 text-sm">
              <span className="font-bold">{sectie(s)}</span>
              {[ik, ander].map((p, i) => p ? (<button key={p.id} type="button" disabled={!bewerkbaar} onClick={() => setKies(kies?.sectie === s && kies?.ouderId === p.id ? null : { sectie: s, ouderId: p.id })} aria-expanded={kies?.sectie === s && kies?.ouderId === p.id} aria-label={t(N + "celLabel", { sectie: sectie(s), wie: p.rol === "ik" ? t("common.jij") : t("common.deAndereOuder"), niveau: niveau(niveauVan(p.access[s])) })} className={`w-24 rounded-full px-2 py-1 text-center text-[11.5px] font-extrabold leading-tight ${niveauVan(p.access[s]) === "alles" ? "bg-[#DCE6D2] text-[#2F4A3A]" : niveauVan(p.access[s]) === "geen" ? "bg-[#EBD9CC] text-[#5A4636]" : "bg-white/80 text-ink"} ${bewerkbaar ? "" : "cursor-default"}`}>
                    {niveau(niveauVan(p.access[s]))}{open(s, p.id) ? " *" : ""}
                  </button>) : <span key={i} className="w-24"/>)}
            </div>
            {kies?.sectie === s ? <Wijzig kindId={kindId} sectie={s} ouder={toegang.parents.find((p) => p.id === kies.ouderId)} huidig={niveauVan(toegang.parents.find((p) => p.id === kies.ouderId)?.access[s])} onKlaar={() => setKies(null)}/> : null}
          </div>))}
        {toegang.requests.length ? <p className="py-2 text-[11px] text-ink-soft">{t(N + "sterUitleg")}</p> : null}
      </div>

      {vanMij.length ? <div className={`${GLAS} divide-y divide-[#E9E1D5] px-4`}>
        {vanMij.map((r) => (<div key={r.id} className="flex items-center gap-3 py-2.5 text-sm">
            <span className="min-w-0 flex-1">{t(r.voor === "ik" ? N + "wacht.voorJou" : N + "wacht.voorAnder", { sectie: sectie(r.section), niveau: niveau(niveauVan(r)) })}</span>
            <button type="button" disabled={!!bezig} onClick={() => doe(r.id, () => trekToegangIn(kindId, r.id), t(N + "wacht.ingetrokken"))} className="min-h-10 shrink-0 text-xs font-extrabold text-brand">{t(N + "wacht.intrekken")}</button>
          </div>))}
      </div> : null}

      {!ander ? <p className="rounded-2xl bg-white/60 px-4 py-3 text-xs text-ink-soft">{t(N + "solo")}</p> : null}
      <div className="flex items-start gap-2 rounded-[14px] bg-[#E9EFE3] px-3 py-2.5 text-[12.5px] leading-snug text-[#2F4A3A]">
        <AppIcon functie="info" maat="sm" vorm="kaal"/>
        <p>{t(N + "juridisch")}</p>
      </div>
    </div>);
}
/** Kiezen van een niveau voor één onderdeel en één ouder. */
function Wijzig({ kindId, sectie, ouder, huidig, onKlaar }) {
    const { t } = useTranslation();
    const [keuze, setKeuze] = useState(huidig);
    const [bezig, setBezig] = useState(false);
    if (!ouder)
        return null;
    const opties = Object.keys(NIVEAUS).filter((n) => !(sectie === "basis" && n === "geen"));
    const eigen = ouder.rol === "ik";
    const bewaar = async () => {
        if (keuze === huidig)
            return onKlaar();
        setBezig(true);
        const r = await vraagToegang(kindId, ouder.id, sectie, NIVEAUS[keuze]);
        setBezig(false);
        if (r) {
            // Een beperking van jezelf gaat meteen in; al het andere wacht op de andere ouder (open verzoek).
            const wacht = (r.requests ?? []).some((x) => x.section === sectie && x.parent_id === ouder.id);
            bevestig(wacht ? t(N + "verzoekVerstuurd") : t(N + "opgeslagen"));
            onKlaar();
        }
    };
    return (<div className="mt-2 space-y-2 rounded-2xl bg-white/70 px-3 py-3">
      <p className="text-xs font-semibold text-ink-soft">{eigen ? t(N + "wijzig.voorJou") : t(N + "wijzig.voorAnder")}</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t(N + "wijzig.label")}>
        {opties.map((n) => (<button key={n} type="button" role="radio" aria-checked={keuze === n} onClick={() => setKeuze(n)} className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${keuze === n ? "bg-brand text-primary-foreground" : "border border-white/90 bg-white/75 text-ink"}`}>{t(N + `niveau.${n}`)}</button>))}
      </div>
      <p className="text-[11.5px] text-ink-soft">{eigen ? t(N + "wijzig.uitlegJij") : t(N + "wijzig.uitlegAnder")}</p>
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onKlaar} className={knopAnnuleer}>{t("common.annuleren")}</button>
        <button type="button" disabled={bezig || keuze === huidig} onClick={bewaar} className={knopOpslaan}>{bezig ? <Loader2 className="size-4 animate-spin" aria-hidden="true"/> : null}{eigen ? t("common.opslaan") : t(N + "wijzig.vragen")}</button>
      </div>
    </div>);
}
/** Een regel om "Gezag en toegang" te openen (in het kindprofiel en op de gezagpagina). */
export function GezagToegangRij({ onClick, samenvatting }) {
    const { t } = useTranslation();
    return (<button type="button" onClick={onClick} className="flex min-h-14 w-full items-center gap-3 border-t border-[#E9E1D5] py-2.5 text-left">
      <AppIcon functie="juridisch" maat="md"/>
      <span className="min-w-0 flex-1"><span className="block text-[15.5px] font-black">{t(N + "titel")}</span><span className="block truncate text-xs text-ink-soft">{samenvatting || t(N + "samenvatting")}</span></span>
      <Chevron className="size-5 text-ink-soft"/>
    </button>);
}
