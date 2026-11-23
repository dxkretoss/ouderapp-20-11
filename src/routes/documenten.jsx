import { Link } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { AppShell, BackButton, PageHeader } from "@/components/AppShell";
import { Assistent } from "@/components/Assistent";
import { ContextToevoegen } from "@/components/ContextToevoegen";
import { FileText, FileUp, ReceiptText, School, Plus } from "lucide-react";
import { BonScanner } from "@/components/BonScanner";
import { datumWeergave, documentCategorieLabel, documenten } from "@/lib/demo-data";
import { OuderschapsplanImport } from "@/components/OuderschapsplanImport";
import { SchoolinfoUitlezen } from "@/components/SchoolinfoUitlezen";
import { AppIcon } from "@/components/AppIcon";
import { Chevron } from "@/components/Tekens";
import { Button } from "@/components/ui/button";
import { useStart } from "@/lib/start-store";
import { bevestig } from "@/lib/feedback";
import { useNavigate } from "@tanstack/react-router";
function DocumentenWrap() {
    const st = useStart();
    if (st.eigen)
        return <EigenDocumenten />;
    return <Documenten />;
}
function EigenDocumenten() {
    const { t } = useTranslation();
    const st = useStart();
    const nav = useNavigate();
    const upload = useRef(null);
    const [lijst, setLijst] = useState([]);
    const [kind, setKind] = useState(st.kinderen[0]?.naam ?? "Hele gezin");
    const kies = (f) => {
        if (!f)
            return;
        setLijst((l) => [{ id: String(Date.now()), naam: f.name, kind, datum: t("routes.documenten.vandaag") }, ...l]);
        bevestig(t("routes.documenten.eigen.toegevoegd"), { uitleg: f.name });
    };
    return (<AppShell>
      <PageHeader titel={t("routes.documenten.titel")} subtitel={t("routes.documenten.eigen.subtitel")} actie={<button aria-label={t("routes.documenten.uploaden")} onClick={() => upload.current?.click()} className="grid size-10 place-items-center rounded-full bg-brand text-2xl leading-none text-primary-foreground"><Plus aria-hidden="true" strokeWidth={2.25} className="size-5"/></button>}/>
      <input ref={upload} type="file" className="hidden" aria-label={t("routes.documenten.kiezen")} accept=".pdf,.doc,.docx,.txt,image/*" onChange={(e) => { kies(e.target.files?.[0]); e.target.value = ""; }}/>
      {st.kinderen.length ? (<select value={kind} onChange={(e) => setKind(e.target.value)} aria-label={t("routes.documenten.eigen.voorWelkKind")} className="mt-4 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
          {st.kinderen.map((k) => <option key={k.id} value={k.naam}>{k.naam}</option>)}
          <option value="Hele gezin">{t("routes.documenten.eigen.heleGezin")}</option>
        </select>) : null}
      {!lijst.length ? (<div className="mt-10 flex flex-col items-center text-center">
          <p className="font-display text-lg font-bold">{t("routes.documenten.eigen.rustig")}</p>
          <p className="mt-1 max-w-xs text-sm text-ink-soft">{t("routes.documenten.eigen.leegUitleg")}</p>
          <button onClick={() => upload.current?.click()} className="mt-5 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-primary-foreground">{t("routes.documenten.eigen.eerste")}</button>
          <button onClick={() => nav({ to: "/meer" })} className="mt-3 min-h-11 text-sm font-semibold text-ink-soft">{t("routes.documenten.eigen.terugMenu")}</button>
        </div>) : (<ul className="mt-4 divide-y divide-border rounded-md border border-border bg-card">
          {lijst.map((d) => (<li key={d.id} className="flex items-center gap-3 px-3 py-3">
              <span className="flex-1"><span className="block text-sm font-semibold">{d.naam}</span>
                <span className="block text-xs text-ink-soft">{d.kind === "Hele gezin" ? t("routes.documenten.eigen.heleGezin") : d.kind} · {d.datum}</span></span>
            </li>))}
        </ul>)}
    </AppShell>);
}
export const Route = createFileRoute("/documenten")({
    head: () => ({
        meta: [
            { title: i18n.t("routes.documenten.meta.titel") },
            { name: "description", content: i18n.t("routes.documenten.meta.beschrijving") },
            { property: "og:title", content: i18n.t("routes.documenten.meta.titel") },
            { property: "og:description", content: i18n.t("routes.documenten.meta.ogBeschrijving") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: DocumentenWrap,
});
function Documenten() {
    const { t, i18n: taal } = useTranslation();
    const [alle, setAlle] = useState(documenten);
    const upload = useRef(null);
    const [bestand, setBestand] = useState(null);
    const [uploadNaam, setUploadNaam] = useState("");
    const [uploadKind, setUploadKind] = useState("Emma & Noah");
    const [uploadStatus, setUploadStatus] = useState("");
    const cats = ["Alles", ...Array.from(new Set(alle.map((d) => d.categorie)))];
    const [cat, setCat] = useState("Alles");
    const lijst = alle.filter((d) => cat === "Alles" || d.categorie === cat);
    const [toon, setToon] = useState(null);
    const gesorteerd = [...lijst].sort((x, y) => Number(NIEUW.has(y.id)) - Number(NIEUW.has(x.id)));
    const belangrijk = alle.filter((d) => d.categorie === "Officiële afspraken" || d.categorie === "Medisch" || /paspoort|passport/i.test(d.naam)).slice(0, 3);
    return (<AppShell>
      <div className="flex items-center gap-2.5">
        <BackButton terug="/meer"/>
        <h1 className="lora min-w-0 flex-1 text-[32px] leading-tight">{t("routes.documenten.titel")}</h1>
        <Assistent pagina={t("routes.documenten.titel")}/>
        <ContextToevoegen titel={t("routes.documenten.toevoegen.titel")} acties={[
            { titel: t("routes.documenten.uploaden"), uitleg: t("routes.documenten.toevoegen.uploadenUitleg"), icoon: FileUp, onKies: () => upload.current?.click() },
            { titel: t("routes.documenten.toevoegen.plan"), uitleg: t("routes.documenten.toevoegen.planUitleg"), icoon: FileText, onKies: () => setToon("plan") },
            { titel: t("routes.documenten.toevoegen.school"), uitleg: t("routes.documenten.toevoegen.schoolUitleg"), icoon: School, onKies: () => setToon("school") },
            { titel: t("routes.documenten.toevoegen.bon"), uitleg: t("routes.documenten.toevoegen.bonUitleg"), icoon: ReceiptText, onKies: () => setToon("bon") },
        ]}/>
      </div>
      <p className="mt-1.5 flex items-center gap-1.5 px-1 text-[13px] text-ink-soft"><AppIcon functie="slot" maat="sm" vorm="kaal"/>{t("routes.documenten.veiligGedeeld")}</p>

      {toon ? (<div className="mt-4">
          {toon === "plan" ? <OuderschapsplanImport onOpgeslagen={(d) => { setAlle((l) => [{ id: String(Date.now()), naam: d.naam, categorie: "Officiële afspraken", kind: "Emma & Noah", gewijzigd: t("routes.documenten.vandaag"), grootte: d.grootte, icoon: "documenten" }, ...l]); setToon(null); }}/> : null}
          {toon === "school" ? <SchoolinfoUitlezen /> : null}
          {toon === "bon" ? <BonScanner standaard="document" onDocument={(d) => setAlle((l) => [{ id: String(Date.now()), naam: d.naam, categorie: d.categorie, kind: d.kind, gewijzigd: t("routes.documenten.vandaag"), grootte: t("routes.documenten.foto"), icoon: d.categorie === "Bonnen" ? "bon" : "foto" }, ...l])} onKosten={(k) => setAlle((l) => [{ id: String(Date.now()), naam: t("routes.documenten.bonNaam", { omschrijving: k.omschrijving }), categorie: "Bonnen", kind: k.kind, gewijzigd: t("routes.documenten.vandaag"), grootte: t("routes.documenten.foto"), icoon: "bon" }, ...l])}/> : null}
          <button onClick={() => setToon(null)} className="mt-1 min-h-10 text-sm font-semibold text-ink-soft">{t("common.sluiten")}</button>
        </div>) : null}

      {belangrijk.length ? (<section className="mt-5">
          <h2 className="flex items-center gap-1.5 px-1 text-[13px] font-black uppercase tracking-[0.08em] text-ink-soft"><AppIcon functie="vastgezet" maat="sm" vorm="kaal"/>{t("routes.documenten.belangrijk")}</h2>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {belangrijk.map((d) => {
                const st = stijl(d.categorie);
                return (<a key={d.id} href={`#item-${d.id}`} className="rounded-[16px] border border-white/90 bg-white/60 p-2.5">
                <span className="grid size-[30px] place-items-center rounded-[10px]" style={{ background: st.tint }}><AppIcon functie={st.icoon} maat="sm" vorm="kaal"/></span>
                <span className="mt-1.5 block text-[13px] font-black leading-tight [hyphens:auto]" lang={taal.resolvedLanguage}>{korteNaam(d)}</span>
              </a>);
            })}
          </div>
        </section>) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        {cats.map((c) => <button key={c} onClick={() => setCat(c)} aria-pressed={cat === c} className={`h-[34px] rounded-full px-3.5 text-[13.5px] font-extrabold ${cat === c ? "bg-brand text-primary-foreground" : "border border-white/95 bg-white/75"}`}>{catLabel(c)}</button>)}
      </div>
      <ul className="mt-3 divide-y divide-[#E9E1D5] rounded-[22px] border border-white/85 bg-white/60 px-3.5">
        {gesorteerd.map((d) => {
            const st = stijl(d.categorie);
            return (<li key={d.id} id={`item-${d.id}`} className="zoekdoel flex min-h-14 items-center gap-3 py-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-[10px]" style={{ background: st.tint }}><AppIcon functie={st.icoon} maat="sm" vorm="kaal"/></span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[15px] font-black"><span className="truncate">{d.naam}</span>{NIEUW.has(d.id) ? <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-[11px] font-black text-primary-foreground">{t("routes.documenten.nieuw")}</span> : null}</span>
              <span className="block text-xs text-ink-soft">{d.kind.replace(" & ", ` ${t("common.en")} `)} · {datumWeergave(d.gewijzigd)}{NIEUW.has(d.id) ? t("routes.documenten.vanJoris") : ""}</span>
            </span>
            <Chevron className="size-4 text-ink-soft"/>
          </li>);
        })}
        {!gesorteerd.length ? <li className="py-4 text-sm text-ink-soft">{t("routes.documenten.leegCategorie")}</li> : null}
      </ul>
      <input ref={upload} type="file" className="hidden" aria-label={t("routes.documenten.kiezen")} accept=".pdf,.doc,.docx,.txt,image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) {
        setBestand(f);
        setUploadNaam(f.name);
        setUploadStatus("");
    } e.target.value = ""; }}/>
      {bestand ? <form className="mt-3 space-y-3 border-y border-border py-4" onSubmit={(e) => { e.preventDefault(); if (!uploadNaam.trim())
            return; setAlle((l) => [{ id: `upload-${Date.now()}`, naam: uploadNaam.trim(), categorie: "Overig", kind: uploadKind, gewijzigd: t("routes.documenten.vandaag"), grootte: `${Math.max(1, Math.round(bestand.size / 1024))} KB`, icoon: "documenten" }, ...l]); setCat("Alles"); setBestand(null); setUploadStatus(t("routes.documenten.upload.toegevoegd")); }}>
        <label className="block text-xs font-semibold">{t("routes.documenten.upload.naam")}<input aria-label={t("routes.documenten.upload.naam")} value={uploadNaam} onChange={(e) => setUploadNaam(e.target.value)} required className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"/></label>
        <label className="block text-xs font-semibold">{t("routes.documenten.upload.voorWie")}<select aria-label={t("routes.documenten.upload.voorWieLabel")} value={uploadKind} onChange={(e) => setUploadKind(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"><option value="Emma & Noah">{t("routes.documenten.upload.emmaEnNoah")}</option><option>Emma</option><option>Noah</option></select></label>
        <p className="text-xs text-ink-soft">{t("routes.documenten.upload.voorbeeld")}</p>
        <div className="flex gap-2"><Button type="submit" disabled={!uploadNaam.trim()}>{t("routes.documenten.upload.toevoegen")}</Button><Button type="button" variant="ghost" onClick={() => setBestand(null)}>{t("common.annuleren")}</Button></div>
      </form> : null}
      {uploadStatus ? <p role="status" className="mt-2 text-xs text-brand">{uploadStatus}</p> : null}
      <Link to="/exporteren" className="mt-4 flex items-center gap-3 rounded-[22px] border border-white/85 bg-white/60 px-4 py-3">
        <span className="min-w-0 flex-1"><span className="block text-[15px] font-black">{t("routes.documenten.export.titel")}</span><span className="block text-xs text-ink-soft">{t("routes.documenten.export.uitleg")}</span></span>
        <Chevron className="size-4 text-ink-soft"/>
      </Link>
    </AppShell>);
}
/** Voorbeeld: in de demo is alleen dit document nieuw (van de andere ouder). */
const NIEUW = new Set(["d2"]);
/** Korte categorienaam voor de filterknoppen; "Alles" is de vaste waarde voor geen filter. */
const catLabel = (c) => (c === "Alles" ? i18n.t("routes.documenten.categorie.alles") : c === "Officiële afspraken" ? i18n.t("routes.documenten.categorie.afspraken") : c === "Verzekeringen" ? i18n.t("routes.documenten.categorie.verzekering") : documentCategorieLabel(c));
/** Voorbeelddocumenten hebben een vaste korte naam; eigen documenten worden ingekort zoals voorheen. */
const KORT = new Set(["d1", "d2", "d3", "d4", "d5"]);
const korteNaam = (d) => (KORT.has(d.id) ? i18n.t(`routes.documenten.kort.${d.id}`) : d.naam.replace(/ 20\d\d$/, "").replace("Paspoortkopieën", "Paspoorten").replace("Allergiepaspoort ", "Allergie "));
/** Rustige tint en icoon per categorie; geen rood, oranje of geel. */
function stijl(categorie) {
    if (categorie === "School")
        return { icoon: "school", tint: "#DFE8F1" };
    if (categorie === "Medisch")
        return { icoon: "gezondheid", tint: "#DCE3D3" };
    if (categorie === "Verzekeringen")
        return { icoon: "veiligheid", tint: "#E3E0EC" };
    if (categorie === "Bonnen")
        return { icoon: "bon", tint: "#E6DED3" };
    if (categorie === "Overig")
        return { icoon: "identiteit", tint: "#DFE8F1" };
    return { icoon: "documenten", tint: "#DCE3D3" };
}
