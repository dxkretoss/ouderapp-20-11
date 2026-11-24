import { Link } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n, { taalLocale } from "@/i18n";
import { AppShell, BackButton } from "@/components/AppShell";
import { Assistent } from "@/components/Assistent";
import { ContextToevoegen } from "@/components/ContextToevoegen";
import { FileText, FileUp, ReceiptText, School } from "lucide-react";
import { BonScanner } from "@/components/BonScanner";
import { documentCategorieLabel } from "@/lib/demo-data";
import { DOCUMENT_CATEGORIEEN, MAX_DOCUMENT_BYTES, openDocument, uploadDocument, useDocumenten } from "@/lib/documenten-store";
import { useGezin } from "@/lib/gezin";
import { OuderschapsplanImport } from "@/components/OuderschapsplanImport";
import { SchoolinfoUitlezen } from "@/components/SchoolinfoUitlezen";
import { AppIcon } from "@/components/AppIcon";
import { Chevron } from "@/components/Tekens";
import { Button } from "@/components/ui/button";
import { useStart } from "@/lib/start-store";
import { bevestig } from "@/lib/feedback";
import { useNavigate } from "@tanstack/react-router";

// Eigen gezin (altijd, na inloggen): documenten van de server (manage-documents), volledige weergave.
function DocumentenWrap() {
    return <Documenten />;
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
    const st = useStart();
    const g = useGezin();
    const nav = useNavigate();
    const { lijst: serverLijst } = useDocumenten();
    const kindNaam = (id) => st.kinderen.find((k) => k.id === id)?.naam;
    const ik = g.ik?.id;
    // Weergavemodel zoals de demo: kind als tekst, "nieuw" = door de andere ouder toegevoegd in de laatste 7 dagen.
    const alle = serverLijst.map((d) => ({ ...d, kind: d.kindId ? kindNaam(d.kindId) ?? "" : st.kinderen.map((k) => k.naam).join(" & ") || t("routes.documenten.eigen.heleGezin"), nieuw: d.door !== ik && Date.now() - Date.parse(d.datum) < 7 * 864e5 }));
    const NIEUW = new Set(alle.filter((d) => d.nieuw).map((d) => d.id));
    const upload = useRef(null);
    const [bestand, setBestand] = useState(null);
    const [uploadNaam, setUploadNaam] = useState("");
    const [uploadKind, setUploadKind] = useState(st.kinderen.length === 1 ? st.kinderen[0].id : "");
    const [uploadCat, setUploadCat] = useState("Overig");
    const [uploadStatus, setUploadStatus] = useState("");
    const [bezig, setBezig] = useState(false);
    const cats = ["Alles", ...Array.from(new Set(alle.map((d) => d.categorie)))];
    const [cat, setCat] = useState("Alles");
    const lijst = alle.filter((d) => cat === "Alles" || d.categorie === cat);
    const [toon, setToon] = useState(null);
    const gesorteerd = [...lijst].sort((x, y) => Number(NIEUW.has(y.id)) - Number(NIEUW.has(x.id)));
    const belangrijk = alle.filter((d) => d.categorie === "Officiële afspraken" || d.categorie === "Medisch" || /paspoort|passport/i.test(d.naam)).slice(0, 3);
    const opslaan = async () => {
        if (!uploadNaam.trim() || !bestand || bezig)
            return;
        setBezig(true);
        const doc = await uploadDocument(bestand, { naam: uploadNaam.trim(), categorie: uploadCat, kindId: uploadKind || null, bron: "upload" });
        setBezig(false);
        if (!doc)
            return;
        setCat("Alles");
        setBestand(null);
        setUploadStatus(t("routes.documenten.upload.toegevoegd"));
        bevestig(t("routes.documenten.eigen.toegevoegd"), { uitleg: doc.naam });
    };
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
      <p className="mt-1.5 flex items-center gap-1.5 px-1 text-[13px] text-ink-soft"><AppIcon functie="slot" maat="sm" vorm="kaal"/>{g.ander ? t("routes.documenten.veiligGedeeldMet", { naam: g.ander.naam || t("common.deAndereOuder") }) : t("routes.documenten.veiligSolo")}</p>

      {toon ? (<div className="mt-4">
          {toon === "plan" ? <OuderschapsplanImport onOpgeslagen={() => { }}/> : null}
          {toon === "school" ? <SchoolinfoUitlezen /> : null}
          {toon === "bon" ? <BonScanner standaard="document" onDocument={(d) => { if (d.foto)
                uploadDocument(d.foto, { naam: d.naam, categorie: DOCUMENT_CATEGORIEEN.includes(d.categorie) ? d.categorie : "Overig", kindId: st.kinderen.find((k) => k.id === d.kind || k.naam === d.kind)?.id ?? null, bron: "bon", bestandsnaam: `${d.naam}.jpg` }); }} onKosten={() => { }}/> : null}
          <button onClick={() => setToon(null)} className="mt-1 min-h-10 text-sm font-semibold text-ink-soft">{t("common.sluiten")}</button>
        </div>) : null}

      {belangrijk.length ? (<section className="mt-5">
          <h2 className="flex items-center gap-1.5 px-1 text-[13px] font-black uppercase tracking-[0.08em] text-ink-soft"><AppIcon functie="vastgezet" maat="sm" vorm="kaal"/>{t("routes.documenten.belangrijk")}</h2>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {belangrijk.map((d) => {
                const sv = stijl(d.categorie);
                return (<a key={d.id} href={`#item-${d.id}`} className="rounded-[16px] border border-white/90 bg-white/60 p-2.5">
                <span className="grid size-[30px] place-items-center rounded-[10px]" style={{ background: sv.tint }}><AppIcon functie={sv.icoon} maat="sm" vorm="kaal"/></span>
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
            const sv = stijl(d.categorie);
            return (<li key={d.id} id={`item-${d.id}`} className="zoekdoel">
            <button onClick={() => openDocument(d.id)} aria-label={t("routes.documenten.openen", { naam: d.naam })} className="flex min-h-14 w-full items-center gap-3 py-2.5 text-left">
            <span className="grid size-8 shrink-0 place-items-center rounded-[10px]" style={{ background: sv.tint }}><AppIcon functie={sv.icoon} maat="sm" vorm="kaal"/></span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[15px] font-black"><span className="truncate">{d.naam}</span>{NIEUW.has(d.id) ? <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-[11px] font-black text-primary-foreground">{t("routes.documenten.nieuw")}</span> : null}</span>
              <span className="block text-xs text-ink-soft">{d.kind.replace(" & ", ` ${t("common.en")} `)} · {datumTekst(d.datum)}{NIEUW.has(d.id) ? t("routes.documenten.vanNaam", { naam: g.ander?.naam || t("common.deAndereOuder") }) : ""}</span>
            </span>
            <Chevron className="size-4 text-ink-soft"/>
            </button>
          </li>);
        })}
        {!gesorteerd.length && alle.length ? <li className="py-4 text-sm text-ink-soft">{t("routes.documenten.leegCategorie")}</li> : null}
      </ul>
      {!alle.length && !bestand && !toon ? (<div className="mt-10 flex flex-col items-center text-center">
          <p className="font-display text-lg font-bold">{t("routes.documenten.eigen.rustig")}</p>
          <p className="mt-1 max-w-xs text-sm text-ink-soft">{t("routes.documenten.eigen.leegUitleg")}</p>
          <button onClick={() => upload.current?.click()} className="mt-5 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-primary-foreground">{t("routes.documenten.eigen.eerste")}</button>
          <button onClick={() => nav({ to: "/meer" })} className="mt-3 min-h-11 text-sm font-semibold text-ink-soft">{t("routes.documenten.eigen.terugMenu")}</button>
        </div>) : null}
      <input ref={upload} type="file" className="hidden" aria-label={t("routes.documenten.kiezen")} accept=".pdf,.doc,.docx,.txt,image/jpeg,image/png,image/webp" onChange={(e) => { const f = e.target.files?.[0]; if (f) {
        if (f.size > MAX_DOCUMENT_BYTES) {
            setUploadStatus(t("routes.documenten.upload.teGroot"));
        }
        else {
            setBestand(f);
            setUploadNaam(f.name.replace(/\.[a-z0-9]+$/i, ""));
            setUploadStatus("");
        }
    } e.target.value = ""; }}/>
      {bestand ? <form className="mt-3 space-y-3 border-y border-border py-4" onSubmit={(e) => { e.preventDefault(); opslaan(); }}>
        <label className="block text-xs font-semibold">{t("routes.documenten.upload.naam")}<input aria-label={t("routes.documenten.upload.naam")} value={uploadNaam} onChange={(e) => setUploadNaam(e.target.value)} required className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"/></label>
        <label className="block text-xs font-semibold">{t("routes.documenten.upload.voorWie")}<select aria-label={t("routes.documenten.upload.voorWieLabel")} value={uploadKind} onChange={(e) => setUploadKind(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">{st.kinderen.map((k) => <option key={k.id} value={k.id}>{k.naam}</option>)}<option value="">{t("routes.documenten.eigen.heleGezin")}</option></select></label>
        <label className="block text-xs font-semibold">{t("routes.documenten.upload.categorie")}<select aria-label={t("routes.documenten.upload.categorie")} value={uploadCat} onChange={(e) => setUploadCat(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">{DOCUMENT_CATEGORIEEN.map((c) => <option key={c} value={c}>{documentCategorieLabel(c)}</option>)}</select></label>
        <p className="text-xs text-ink-soft">{t("routes.documenten.upload.veilig")}</p>
        <div className="flex gap-2"><Button type="submit" disabled={!uploadNaam.trim() || bezig}>{t("routes.documenten.upload.toevoegen")}</Button><Button type="button" variant="ghost" onClick={() => setBestand(null)}>{t("common.annuleren")}</Button></div>
      </form> : null}
      {uploadStatus ? <p role="status" className="mt-2 text-xs text-brand">{uploadStatus}</p> : null}
      <Link to="/exporteren" className="mt-4 flex items-center gap-3 rounded-[22px] border border-white/85 bg-white/60 px-4 py-3">
        <span className="min-w-0 flex-1"><span className="block text-[15px] font-black">{t("routes.documenten.export.titel")}</span><span className="block text-xs text-ink-soft">{t("routes.documenten.export.uitleg")}</span></span>
        <Chevron className="size-4 text-ink-soft"/>
      </Link>
    </AppShell>);
}
const datumTekst = (iso) => new Date(iso).toLocaleDateString(taalLocale(), { day: "numeric", month: "long", year: "numeric" });
/** Korte categorienaam voor de filterknoppen; "Alles" is de vaste waarde voor geen filter. */
const catLabel = (c) => (c === "Alles" ? i18n.t("routes.documenten.categorie.alles") : c === "Officiële afspraken" ? i18n.t("routes.documenten.categorie.afspraken") : c === "Verzekeringen" ? i18n.t("routes.documenten.categorie.verzekering") : documentCategorieLabel(c));
/** Korte naam voor de tegels: jaartal eraf, lange woorden ingekort. */
const korteNaam = (d) => d.naam.replace(/ 20\d\d$/, "").replace("Paspoortkopieën", "Paspoorten").replace("Allergiepaspoort ", "Allergie ");
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
