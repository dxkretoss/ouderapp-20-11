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
import { laadWeergave } from "@/components/Laden";
import { documentenBron } from "@/lib/documenten-store";
import { DOCUMENT_CATEGORIEEN, MAX_DOCUMENT_BYTES, openDocument, uploadDocument, useDocumenten, verwijderDocument, wijzigDocument } from "@/lib/documenten-store";
import { DeelLabel, DelenKeuze, deelCheck, VerwijderDialoog } from "@/components/DelenKeuze";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MoreHorizontal } from "lucide-react";
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
    const laadStatus = documentenBron.useStatus();
    const kindNaam = (id) => st.kinderen.find((k) => k.id === id)?.naam;
    const ik = g.ik?.id;
    // Weergavemodel zoals de demo: kind als tekst, "nieuw" = door de andere ouder toegevoegd in de laatste 7 dagen.
    const alle = serverLijst.map((d) => ({ ...d, kind: d.kindId ? kindNaam(d.kindId) ?? "" : st.kinderen.map((k) => k.naam).join(" & ") || t("routes.documenten.eigen.heleGezin"), nieuw: d.door !== ik && Date.now() - Date.parse(d.datum) < 7 * 864e5 }));
    const vanWie = (id) => g.coOuders.find((c) => c.id === id)?.naam || t("common.deAndereOuder");
    const NIEUW = new Set(alle.filter((d) => d.nieuw).map((d) => d.id));
    const upload = useRef(null);
    const [bestand, setBestand] = useState(null);
    const [uploadNaam, setUploadNaam] = useState("");
    const [uploadKind, setUploadKind] = useState(st.kinderen.length === 1 ? st.kinderen[0].id : "");
    const [uploadCat, setUploadCat] = useState("Overig");
    const [uploadStatus, setUploadStatus] = useState("");
    const [bezig, setBezig] = useState(false);
    // Nieuw document = standaard "Alleen jij".
    const [uploadGedeeld, setUploadGedeeld] = useState(false);
    const [uploadAnder, setUploadAnder] = useState("");
    const uploadDelen = deelCheck(g, uploadKind ? [uploadKind] : [], uploadGedeeld, uploadAnder);
    const [beheer, setBeheer] = useState(null);
    const cats = ["Alles", ...Array.from(new Set(alle.map((d) => d.categorie)))];
    const [cat, setCat] = useState("Alles");
    const lijst = alle.filter((d) => cat === "Alles" || d.categorie === cat);
    const [toon, setToon] = useState(null);
    const gesorteerd = [...lijst].sort((x, y) => Number(NIEUW.has(y.id)) - Number(NIEUW.has(x.id)));
    const belangrijk = alle.filter((d) => d.categorie === "Officiële afspraken" || d.categorie === "Medisch" || /paspoort|passport/i.test(d.naam)).slice(0, 3);
    const opslaan = async () => {
        if (!uploadNaam.trim() || !bestand || bezig || !uploadDelen.ok)
            return;
        setBezig(true);
        const doc = await uploadDocument(bestand, { naam: uploadNaam.trim(), categorie: uploadCat, kindId: uploadKind || null, bron: "upload", gedeeld: uploadDelen.gedeeld, anderId: uploadDelen.anderId });
        setBezig(false);
        if (!doc)
            return;
        setCat("Alles");
        setBestand(null);
        setUploadGedeeld(false);
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
      <p className="mt-1.5 flex items-center gap-1.5 px-1 text-[13px] text-ink-soft"><AppIcon functie="slot" maat="sm" vorm="kaal"/>{g.gekoppeld ? t("routes.documenten.veiligKeuze") : t("routes.documenten.veiligSolo")}</p>

      {toon ? (<div className="mt-4">
          {toon === "plan" ? <OuderschapsplanImport onOpgeslagen={() => { }}/> : null}
          {toon === "school" ? <SchoolinfoUitlezen /> : null}
          {toon === "bon" ? <BonScanner standaard="document" onDocument={(d) => d.foto ? uploadDocument(d.foto, { naam: d.naam, categorie: DOCUMENT_CATEGORIEEN.includes(d.categorie) ? d.categorie : "Overig", kindId: st.kinderen.find((k) => k.id === d.kind || k.naam === d.kind)?.id ?? null, bron: "bon", bestandsnaam: `${d.naam}.jpg` }) : null}/> : null}
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
            const eigen = d.door === ik;
            return (<li key={d.id} id={`item-${d.id}`} className="zoekdoel flex items-center">
            <button onClick={() => openDocument(d.id)} aria-label={t("routes.documenten.openen", { naam: d.naam })} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2.5 text-left">
            <span className="grid size-8 shrink-0 place-items-center rounded-[10px]" style={{ background: sv.tint }}><AppIcon functie={sv.icoon} maat="sm" vorm="kaal"/></span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[15px] font-black"><span className="truncate">{d.naam}</span>{NIEUW.has(d.id) ? <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-[11px] font-black text-primary-foreground">{t("routes.documenten.nieuw")}</span> : null}</span>
              <span className="block text-xs text-ink-soft">{d.kind.replace(" & ", ` ${t("common.en")} `)} · {datumTekst(d.datum)}{NIEUW.has(d.id) ? t("routes.documenten.vanNaam", { naam: vanWie(d.door) }) : ""}</span>
              {g.gekoppeld ? <DeelLabel gedeeld={!eigen || d.gedeeld} className="mt-1"/> : null}
            </span>
            {!eigen ? <Chevron className="size-4 text-ink-soft"/> : null}
            </button>
            {eigen ? <button onClick={() => setBeheer(d)} aria-label={t("routes.documenten.beheer.label", { naam: d.naam })} className="grid size-11 shrink-0 place-items-center text-ink-soft"><MoreHorizontal aria-hidden className="size-5" strokeWidth={2}/></button> : null}
          </li>);
        })}
        {!gesorteerd.length && alle.length ? <li className="py-4 text-sm text-ink-soft">{t("routes.documenten.leegCategorie")}</li> : null}
      </ul>
      {!alle.length && !bestand && !toon ? (laadWeergave(laadStatus, documentenBron.ververs) ?? <div className="mt-10 flex flex-col items-center text-center">
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
        <DelenKeuze kindIds={uploadKind ? [uploadKind] : []} gedeeld={uploadGedeeld} onGedeeld={setUploadGedeeld} anderId={uploadAnder} onAnderId={setUploadAnder}/>
        <p className="text-xs text-ink-soft">{t("routes.documenten.upload.veiligKeuze")}</p>
        <div className="flex gap-2"><Button type="submit" disabled={!uploadNaam.trim() || bezig || !uploadDelen.ok}>{t("routes.documenten.upload.toevoegen")}</Button><Button type="button" variant="ghost" onClick={() => setBestand(null)}>{t("common.annuleren")}</Button></div>
      </form> : null}
      {uploadStatus ? <p role="status" className="mt-2 text-xs text-brand">{uploadStatus}</p> : null}
      <DocumentBeheer d={beheer} onSluit={() => setBeheer(null)}/>
      <Link to="/exporteren" className="mt-4 flex items-center gap-3 rounded-[22px] border border-white/85 bg-white/60 px-4 py-3">
        <span className="min-w-0 flex-1"><span className="block text-[15px] font-black">{t("routes.documenten.export.titel")}</span><span className="block text-xs text-ink-soft">{t("routes.documenten.export.uitleg")}</span></span>
        <Chevron className="size-4 text-ink-soft"/>
      </Link>
    </AppShell>);
}
/** Eigen document beheren: naam, soort, "Alleen jij" / "Gedeeld", verwijderen. */
function DocumentBeheer({ d, onSluit }) {
    const { t } = useTranslation();
    const g = useGezin();
    const [naam, setNaam] = useState("");
    const [categorie, setCategorie] = useState("Overig");
    const [gedeeld, setGedeeld] = useState(false);
    const [ander, setAnder] = useState("");
    const [bezig, setBezig] = useState(false);
    const [weg, setWeg] = useState(false);
    const [voor, setVoor] = useState(null);
    // Velden vullen zodra een (ander) document geopend wordt.
    if (d && voor !== d.id) {
        setVoor(d.id);
        setNaam(d.naam);
        setCategorie(DOCUMENT_CATEGORIEEN.includes(d.categorie) ? d.categorie : "Overig");
        setGedeeld(!!d.gedeeld);
        setAnder(d.anderId ?? "");
        setWeg(false);
    }
    const delen = deelCheck(g, d?.kindId ? [d.kindId] : [], gedeeld, ander);
    const geldig = !!naam.trim() && delen.ok && !bezig;
    const opslaan = async () => {
        if (!d || !geldig)
            return;
        setBezig(true);
        const gelukt = await wijzigDocument(d.id, { naam: naam.trim(), categorie, gedeeld: delen.gedeeld, anderId: delen.anderId });
        setBezig(false);
        if (gelukt) {
            bevestig(t("routes.documenten.beheer.opgeslagen"));
            onSluit();
        }
    };
    const verwijder = async () => {
        if (!d)
            return;
        setWeg(false);
        onSluit();
        if (await verwijderDocument(d.id))
            bevestig(t("routes.documenten.beheer.verwijderd"), { uitleg: d.naam });
    };
    return (<Sheet open={!!d} onOpenChange={(o) => !o && onSluit()}>
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto">
        {d ? (<>
            <SheetHeader className="text-left">
              <SheetTitle className="lora text-[24px] leading-tight">{t("routes.documenten.beheer.titel")}</SheetTitle>
              <SheetDescription>{d.naam}</SheetDescription>
            </SheetHeader>
            <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); opslaan(); }}>
              <label className="block text-xs font-semibold">{t("routes.documenten.upload.naam")}<input value={naam} maxLength={200} onChange={(e) => setNaam(e.target.value)} required className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"/></label>
              <label className="block text-xs font-semibold">{t("routes.documenten.upload.categorie")}<select value={categorie} onChange={(e) => setCategorie(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">{DOCUMENT_CATEGORIEEN.map((c) => <option key={c} value={c}>{documentCategorieLabel(c)}</option>)}</select></label>
              <DelenKeuze kindIds={d.kindId ? [d.kindId] : []} gedeeld={gedeeld} onGedeeld={setGedeeld} anderId={ander} onAnderId={setAnder}/>
              <div className="sticky bottom-0 space-y-2 bg-background pb-2 pt-1">
                <Button type="submit" className="w-full" disabled={!geldig}>{t("common.opslaan")}</Button>
                <Button type="button" variant="ghost" className="w-full text-ink-soft" onClick={() => setWeg(true)}>{t("common.verwijderen")}</Button>
              </div>
            </form>
          </>) : null}
      </SheetContent>
      <VerwijderDialoog open={weg} onOpenChange={setWeg} titel={t("routes.documenten.beheer.verwijderTitel")} tekst={d?.gedeeld ? t("routes.documenten.beheer.verwijderTekstGedeeld") : t("routes.documenten.beheer.verwijderTekst")} onBevestig={verwijder}/>
    </Sheet>);
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
