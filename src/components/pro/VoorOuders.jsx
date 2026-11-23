import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { AppIcon } from "@/components/AppIcon";
import { Chevron } from "@/components/Tekens";
import { IK, contactTypeLabel, datumKort, markeerBerichtGezien, markeerGezamenlijk, momentKort, ontvangerLabel, toggleActie, useProWerk, voorOudersVan, } from "@/lib/pro-journaal-store";
const GLAS = "rounded-[22px] border border-white/85 bg-white/60";
const HL = "rounded-[22px] border-2 border-[#A9BCA8] p-4 [background:linear-gradient(135deg,rgba(220,230,210,.95),rgba(233,239,227,.9))]";
/**
 * Eén weergave van wat ouders van de professional zien.
 * Wordt gebruikt in de ouderapp (interactief, voor één ouder) én als alleen-lezen "Bekijk als ouder" voor professionals,
 * zodat beide altijd exact dezelfde gegevens tonen.
 * "Nog te doen" telt precies wat Home als "Wacht op jou" van de professional toont.
 */
export function VoorOuders({ dossier, ouder, alleenLezen = false, deel = "alles" }) {
    const { t } = useTranslation();
    const s = useProWerk();
    const v = voorOudersVan(s, dossier, ouder);
    const kan = !alleenLezen && !!ouder;
    const [alles, setAlles] = useState(false);
    const o = ouder ?? "";
    const acties = v.acties.filter((a) => !a.klaar);
    const akkoordNodig = v.gezamenlijk.filter((g) => !g.akkoord[o] && !g.nietAkkoord?.[o]);
    const ongelezen = v.berichten.filter((b) => !b.gezien[o]);
    const aantal = acties.length + akkoordNodig.length + ongelezen.length;
    const gedeeld = [
        ...v.berichten.filter((b) => b.gezien[o] || !ouder).map((b) => ({ id: b.id, moment: b.moment, label: t("pro.VoorOuders.label.bericht"), icoon: "post", titel: b.onderwerp, tekst: b.tekst, extra: t("pro.VoorOuders.berichtExtra", { door: b.door, aan: ontvangerLabel(b.aan).toLowerCase() }) })),
        ...v.journaal.map((j) => ({ id: j.id, moment: j.moment, label: t("pro.VoorOuders.label.verslag"), icoon: "documenten", titel: j.onderwerp, tekst: j.notitie, extra: contactTypeLabel(j.type) })),
        ...v.gezamenlijk.filter((g) => g.akkoord[o] || g.nietAkkoord?.[o] || !ouder).map((g) => ({ id: g.id, moment: g.moment, label: t("pro.VoorOuders.label.afspraak"), icoon: "afspraak", titel: t("pro.VoorOuders.gezamenlijkeAfspraak"), tekst: g.tekst, extra: `${g.ingepland ? `${t("pro.VoorOuders.ingepland", { moment: momentKort(g.ingepland) })} · ` : ""}${t("pro.VoorOuders.akkoordVan", { namen: Object.keys(g.akkoord).join(", ") || t("pro.VoorOuders.nogNiemand") })}${g.nietAkkoord && Object.keys(g.nietAkkoord).length ? ` · ${t("pro.VoorOuders.nietAkkoordVan", { namen: Object.keys(g.nietAkkoord).join(", ") })}` : ""}` })),
        ...v.veilig.map((x) => ({ id: x.id, moment: `${x.start}T00:00`, label: x.status === "actief" ? t("pro.VoorOuders.label.veiligActief") : t("pro.VoorOuders.label.veiligBeeindigd"), icoon: "veiligheid", titel: x.titel, tekst: x.afspraak, extra: t("pro.VoorOuders.veiligExtra", { kind: x.kind, datum: datumKort(x.start) }), veilig: x.status === "actief" })),
    ].sort((a, b) => b.moment.localeCompare(a.moment));
    if (!aantal && !gedeeld.length)
        return deel === "akkoord" ? null : <p className="text-sm text-ink-soft">{t("pro.VoorOuders.nogNietsGedeeld")}</p>;
    const toonAkkoord = deel !== "rest";
    const toonRest = deel !== "akkoord";
    const overig = acties.length + ongelezen.length;
    return (<div className="space-y-4">
      {toonAkkoord && akkoordNodig.map((g) => (<section key={g.id} className={HL}>
          <p className="text-xs font-extrabold uppercase tracking-[0.09em] text-[#3F5747]">{t("pro.VoorOuders.akkoordGevraagd")}</p>
          <p className="mt-1.5 text-[17px] font-black">{t("pro.VoorOuders.nieuweAfspraak")}</p>
          <p className="mt-1 text-[15px] leading-snug">{g.tekst}</p>
          <p className="mt-1.5 text-xs text-ink-soft">{t("pro.VoorOuders.voorgesteldDoor", { naam: IK })}{g.ingepland ? ` · ${momentKort(g.ingepland)}` : ""} · {t("pro.VoorOuders.voorAllebei")}</p>
          {kan ? (<>
              <div className="mt-3 flex gap-2">
                <button onClick={() => markeerGezamenlijk(g.id, o, "akkoord")} className="h-[46px] flex-1 rounded-full bg-brand text-[15px] font-black text-primary-foreground">{t("common.akkoord")}</button>
                <Link to="/berichten" search={{ concept: t("pro.VoorOuders.conceptBespreken", { naam: IK, tekst: g.tekst }) }} className="flex h-[46px] flex-1 items-center justify-center rounded-full border border-white/95 bg-white/75 text-[15px] font-black text-[#2F4A3A]">{t("pro.VoorOuders.eerstBespreken")}</Link>
              </div>
              <button onClick={() => markeerGezamenlijk(g.id, o, "nietAkkoord")} className="mt-2 text-xs font-semibold text-ink-soft underline-offset-2 hover:underline">{t("common.nietAkkoord")}</button>
            </>) : null}
        </section>))}

      {toonRest && overig ? (<section>
          <h2 className="mt-2 text-[19px] font-black">{t("pro.VoorOuders.nogTeDoen")}</h2>
          <div className={`${GLAS} mt-2 divide-y divide-[#E9E1D5] px-4`}>
            {acties.map((a) => (<div key={a.id} className="py-3">
                <p className="text-[15.5px] font-black">{a.tekst}</p>
                <p className="text-xs text-ink-soft">{a.deadline ? t("pro.VoorOuders.uiterlijk", { datum: datumKort(a.deadline) }) : a.omschrijving}</p>
                {kan ? (<div className="mt-2 flex gap-2">
                    {/rooster|upload|document|timetable|schedule/i.test(a.tekst) ? <Link to="/documenten" className="inline-flex h-9 items-center rounded-full bg-brand px-4 text-sm font-black text-primary-foreground">{t("pro.VoorOuders.uploaden")}</Link> : null}
                    <button onClick={() => toggleActie(a.id, o)} className="inline-flex h-9 items-center rounded-full border border-[#E6DED2] bg-white px-4 text-sm font-black">{t("pro.VoorOuders.gedaan")}</button>
                  </div>) : null}
              </div>))}
            {ongelezen.map((b) => (<div key={b.id} className="py-3">
                <p className="text-xs text-ink-soft">{t("pro.VoorOuders.berichtVan", { naam: b.door })}</p>
                <p className="text-[15.5px] font-black">{b.onderwerp}</p>
                <p className="text-sm leading-snug">{b.tekst}</p>
                {kan ? <button onClick={() => markeerBerichtGezien(b.id, o)} className="mt-2 inline-flex h-9 items-center rounded-full border border-[#E6DED2] bg-white px-4 text-sm font-black">{t("pro.VoorOuders.gezien")}</button> : null}
              </div>))}
          </div>
          <p className="mt-2 px-1 text-[11.5px] text-ink-soft">{t("pro.VoorOuders.gezienNietAkkoord")}</p>
        </section>) : null}

      {toonRest && gedeeld.length ? (<details className={`${GLAS} px-4 py-3`} open={alles} onToggle={(e) => setAlles(e.target.open)}>
          <summary className="flex min-h-10 cursor-pointer list-none items-center text-[15.5px] font-black"><span className="flex-1">{t("pro.VoorOuders.eerderGedeeld", { n: gedeeld.length })}</span><Chevron className={`size-4 text-ink-soft transition-transform ${alles ? "rotate-90" : ""}`}/></summary>
          <p className="mt-1 text-xs text-ink-soft">{t("pro.VoorOuders.alleenBewust")}</p>
          <ul className="mt-2 divide-y divide-[#E9E1D5]">
            {gedeeld.map((g) => (<li key={g.id} className={`flex gap-3 py-3 ${g.veilig ? "border-l-2 border-[var(--ic-salie)] pl-2" : ""}`}>
                <AppIcon functie={g.icoon} maat="sm"/>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-ink-soft">{g.label} · {g.moment.endsWith("T00:00") ? datumKort(g.moment.slice(0, 10)) : momentKort(g.moment)}</p>
                  <p className="text-sm font-semibold">{g.titel}</p>
                  <p className="text-sm">{g.tekst}</p>
                  {g.extra ? <p className="mt-0.5 text-[11px] text-ink-soft">{g.extra}</p> : null}
                </div>
              </li>))}
          </ul>
        </details>) : null}
    </div>);
}
export function VoorbeeldBanner({ onSluit }) {
    const { t } = useTranslation();
    return (<div className="mb-5 flex items-center gap-3 rounded-md border border-brand/40 bg-brand-soft px-3 py-2.5 text-xs">
      <Eye className="size-4 shrink-0 text-brand"/>
      <span className="flex-1 font-semibold">{t("pro.VoorOuders.voorbeeldBanner")}</span>
      <button onClick={onSluit} className="font-semibold text-brand">{t("common.sluiten")}</button>
    </div>);
}
