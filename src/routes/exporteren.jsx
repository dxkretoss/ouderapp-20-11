import { createFileRoute } from "@tanstack/react-router";
import { meldFout } from "@/lib/feedback";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n, { taalLocale } from "@/i18n";
import { z } from "zod";
import { Check, Circle, Download, Eye, FileText, Share2 } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { pdfVeilig } from "@/lib/pro-pdf";
import { categorieMeta, documentCategorieLabel } from "@/lib/demo-data";
import { useDocumenten } from "@/lib/documenten-store";
import { startState, useStart } from "@/lib/start-store";
import { authState } from "@/lib/auth-store";
import { useKosten } from "@/lib/kosten-store";
import { useAgenda } from "@/lib/agenda-store";
import { useZorg } from "@/lib/zorg-store";
import { useVakanties } from "@/lib/vakantie-store";
import { useOverdracht } from "@/lib/overdracht-store";
import { wisselMomenten } from "@/lib/agenda-zorg";
import { iso, voorkomens } from "@/lib/agenda-datum";
import { laadBerichten, laadGesprekken, useBerichten } from "@/lib/berichten-store";
import { leg, soortLabel, useAudit } from "@/lib/audit-store";
import { geschiedenisDatum, useAfspraken, useBesluiten } from "@/lib/afspraken-store";
import { magAudit, magBron, magKind, vroegste } from "@/lib/export-rechten";
export const Route = createFileRoute("/exporteren")({
    // Professionals (Milestone 3) zijn in deze fase verborgen: alleen de ouderweergave.
    validateSearch: z.object({}),
    head: () => ({
        meta: [
            { title: i18n.t("routes.exporteren.meta.titel") },
            { name: "description", content: i18n.t("routes.exporteren.meta.beschrijving") },
            { property: "og:title", content: i18n.t("routes.exporteren.meta.titel") },
            { property: "og:description", content: i18n.t("routes.exporteren.meta.ogBeschrijving") },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: Exporteren,
});
const APP = "Ouderschap & Co";
const onderdeel = (id, bronnen) => ({ id, bronnen, get label() { return i18n.t(`routes.exporteren.deel.${id}`); } });
const delen = [
    onderdeel("wissel", ["agenda"]),
    onderdeel("verzoeken", ["verzoek"]),
    onderdeel("besluiten", ["agenda", "besluit"]),
    onderdeel("communicatie", ["bericht"]),
    onderdeel("kosten", ["kost"]),
    onderdeel("documenten", ["document"]),
    onderdeel("geschiedenis", "audit"),
];
/* Parsing van (Nederlandse) bronlabels; Engelse maandnamen worden ook herkend voor robuustheid. */
const maanden = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const kort = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const kortEn = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** Datums uit bronnen: ISO ("2026-03-08…") of Nederlandse labels ("8 maart", "10 mrt 20:14"). */
function parseLabel(l) {
    if (typeof l === "string" && /^\d{4}-\d{2}-\d{2}/.test(l))
        return new Date(l.length === 10 ? `${l}T12:00` : l);
    const m = String(l ?? "").toLowerCase().match(/(\d{1,2})\s+([a-z]+)(?:\s+(\d{1,2}):(\d{2}))?/);
    if (!m)
        return new Date(NaN);
    let mi = maanden.indexOf(m[2]);
    if (mi < 0)
        mi = kort.indexOf(m[2].slice(0, 3));
    if (mi < 0)
        mi = kortEn.indexOf(m[2].slice(0, 3));
    const nu = new Date();
    const jaar = mi > nu.getMonth() ? nu.getFullYear() - 1 : nu.getFullYear();
    return new Date(jaar, Math.max(mi, 0), Number(m[1]), Number(m[3] ?? 12), Number(m[4] ?? 0));
}
const d2 = (d) => d.toLocaleDateString(taalLocale(), { day: "numeric", month: "long", year: "numeric" });
const t2 = (d) => d.toLocaleTimeString(taalLocale(), { hour: "2-digit", minute: "2-digit" });
const dt = (d) => i18n.t("routes.exporteren.datumTijd", { datum: d2(d), tijd: t2(d) });
/** Naam bij een profiel-id: de ingelogde ouder of de gekoppelde andere ouder. */
function naam(id) {
    const ik = authState().gebruiker;
    if (ik && id === ik.id)
        return ik.name;
    return startState().coOuders?.find((c) => c.id === id)?.name || i18n.t("common.deAndereOuder");
}
/** Kijker-relatieve code uit de agendabronnen ("sanne" = jij, "joris" = de andere ouder) → naam. */
const ouderNaam = (code) => (code === "sanne" ? authState().gebruiker?.name || i18n.t("common.jij") : code === "joris" ? ((startState().coOuders ?? []).length === 1 && startState().coOuders[0]?.name) || i18n.t("common.deAndereOuder") : "");
const euro = (n) => (taalLocale() === "nl-NL" ? `€ ${n.toFixed(2).replace(".", ",")}` : `€${n.toFixed(2)}`);
/** Auditacties (enum) → weergave. */
const actieNl = {};
["CREATED", "UPDATED", "DELETED", "ACCEPTED", "DECLINED", "CANCELLED", "EXPORTED"].forEach((a) => Object.defineProperty(actieNl, a, { get: () => i18n.t(`routes.exporteren.actie.${a}`), enumerable: true }));
/* Vaste Nederlandse waarden uit andere bronnen (categorie, status, besluitsoort) vertaald tonen; onbekend blijft zoals het is. */
const kostCategorieLabel = (c) => i18n.t(`routes.exporteren.kostCategorie.${c}`, { defaultValue: c });
const kostStatusLabel = (s) => i18n.t(`routes.exporteren.kostStatus.${s}`, { defaultValue: s });
const besluitSoortLabel = (s) => i18n.t(`routes.exporteren.besluitSoort.${s}`, { defaultValue: s });
const besluitRegel = (type) => (type === "voorstel" ? i18n.t("routes.beslissingen.log.voorstelGedaan") : type === "gedeeld" ? i18n.t("routes.beslissingen.log.gedeeld") : type === "akkoord" ? i18n.t("common.akkoord") : type === "niet" ? i18n.t("common.nietAkkoord") : type);
const V = (k) => i18n.t(`routes.exporteren.veld.${k}`);
function Exporteren() {
    const { t } = useTranslation();
    const pro = undefined;
    const kijker = { type: "ouder", id: authState().gebruiker?.id };
    const kosten = useKosten();
    const audit = useAudit();
    const onzeAfspraken = useAfspraken();
    const besluiten = useBesluiten();
    const { lijst: documenten } = useDocumenten();
    const agendaSt = useAgenda();
    const zorg = useZorg();
    const vakanties = useVakanties();
    const overdracht = useOverdracht();
    const berichten = useBerichten();
    const st = useStart();
    const kindNamen = st.kinderen.map((k) => k.naam);
    const naamVanKind = (id) => st.kinderen.find((k) => k.id === id)?.naam;
    /** Welke kinderen een tekstveld noemt; noemt het niemand, dan geldt het voor het hele gezin. */
    const kindVan = (s) => { const l = kindNamen.filter((n) => String(s ?? "").toLowerCase().includes(n.toLowerCase())); return l.length ? l : kindNamen; };
    const kindIdsNaarNamen = (ids) => (ids?.length ? ids.map(naamVanKind).filter(Boolean) : kindNamen);
    const [stap, setStap] = useState("kies");
    const [periode, setPeriode] = useState("1j");
    // Eigen periode: standaard het afgelopen jaar tot vandaag.
    const [van, setVan] = useState(() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10); });
    const [tot, setTot] = useState(new Date().toISOString().slice(0, 10));
    const toegestaneKinderen = kindNamen.filter((k) => magKind(kijker, k));
    // Zonder kinderen (nog geen kind toegevoegd): het hele gezin, zonder kindfilter.
    const zonderKinderen = !kindNamen.length;
    const [kids, setKids] = useState(toegestaneKinderen);
    // Kinderen komen na het inloggen van de server.
    useEffect(() => { if (!kids.length && toegestaneKinderen.length)
        setKids(toegestaneKinderen); }, [toegestaneKinderen.join("|")]);
    const magDeel = (d) => d.bronnen === "audit" ? ["afspraak", "schema", "besluit", "kosten"].some((s) => magAudit(kijker, s)) : d.bronnen.some((b) => magBron(kijker, b));
    const toegestaan = delen.filter(magDeel);
    const [kies, setKies] = useState(toegestaan.filter((d) => d.id !== "communicatie" && d.id !== "documenten").map((d) => d.id));
    const [bezig, setBezig] = useState(false);
    // Communicatie: pas bij keuze alle gesprekken en berichten ophalen (alleen wat deze ouder zelf mag lezen).
    const metBerichten = kies.includes("communicatie") && magBron(kijker, "bericht");
    useEffect(() => { if (metBerichten)
        laadGesprekken(); }, [metBerichten]);
    const gesprekIds = berichten.gesprekken.map((g) => g.id).join("|");
    useEffect(() => { if (metBerichten)
        berichten.gesprekken.forEach((g) => laadBerichten(g.id)); }, [metBerichten, gesprekIds]); // eslint-disable-line react-hooks/exhaustive-deps
    const [pdf, setPdf] = useState(null);
    const [deelCheck, setDeelCheck] = useState(false);
    const bereik = () => {
        const nu = new Date();
        let s, e;
        if (periode === "eigen") {
            s = new Date(`${van}T00:00`);
            e = new Date(`${tot}T23:59`);
        }
        else {
            s = new Date(nu);
            s.setMonth(s.getMonth() - (periode === "3m" ? 3 : 12));
            e = nu;
        }
        const v = vroegste(kijker);
        if (v && s < v)
            s = v; // nooit eerder dan de toegestane periode
        return [s, e];
    };
    const gekozen = delen.filter((d) => kies.includes(d.id) && magDeel(d));
    /** Verzamelt uitsluitend feiten, gefilterd via de centrale rechtencheck. Geen interpretatie of oordeel. */
    const data = useMemo(() => {
        const [s, e] = bereik();
        const ok = (i) => !Number.isNaN(i.wanneer.getTime()) && i.wanneer >= s && i.wanneer <= e && (zonderKinderen || !i.kinderen.length || i.kinderen.some((k) => kids.includes(k) && magKind(kijker, k)));
        const sorteer = (l) => l.filter(ok).sort((a, b) => a.wanneer.getTime() - b.wanneer.getTime());
        const evs = audit.filter((g) => magAudit(kijker, g.soort));
        const evKids = (g) => (g.kinderen.length ? [...g.kinderen] : kindNamen);
        // Agenda (alleen gedeelde afspraken; privé gaat nooit mee) en wisselmomenten uit de zorgverdeling.
        const vanIso = iso(s), totIso = iso(e);
        const ag = (wissel) => {
            if (!magBron(kijker, "agenda"))
                return [];
            const afspraken = agendaSt.events.filter((a) => a.gedeeld !== false && (a.categorie === "wissel") === wissel).flatMap((a) => voorkomens(a, vanIso, totIso).map((datum) => ({
                wanneer: new Date(`${datum}T${a.tijd || "12:00"}`), titel: a.titel, kinderen: kindIdsNaarNamen(a.kindIds),
                velden: [[V("categorie"), categorieMeta[a.categorie]?.label ?? a.categorie], [V("kind"), kindIdsNaarNamen(a.kindIds).join(" & ")], ...(a.tijd ? [[V("tijd"), a.eindtijd ? `${a.tijd}–${a.eindtijd}` : a.tijd]] : []), ...(a.locatie ? [[V("locatie"), a.locatie]] : [])],
            })));
            if (!wissel)
                return afspraken;
            const dagen = Math.min(Math.max(Math.round((e.getTime() - s.getTime()) / 864e5) + 1, 0), 400);
            const momenten = wisselMomenten(zorg, vakanties, st, vanIso, dagen).filter((m) => m.datum <= iso(new Date())).map((m) => ({
                wanneer: new Date(`${m.datum}T${m.tijd || "12:00"}`), titel: t("routes.exporteren.wisselmoment"), kinderen: m.namen.length ? m.namen : kindNamen,
                velden: [[V("kind"), m.namen.join(" & ")], [V("van"), ouderNaam(m.van)], [V("naar"), ouderNaam(m.naar)], ...(m.tijd ? [[V("tijd"), m.tijd]] : []), ...(m.plek ? [[V("locatie"), m.plek]] : [])],
            }));
            const logs = [...overdracht.gedeeld, ...overdracht.ontvangen].filter((o) => o.gedeeldOp).map((o) => ({
                wanneer: new Date(o.gedeeldOp), titel: t("routes.exporteren.overdrachtGedeeld"), kinderen: kindIdsNaarNamen(o.kindIds),
                velden: [[V("kind"), kindIdsNaarNamen(o.kindIds).join(" & ")], [V("door"), ouderNaam(o.van === "ik" ? "sanne" : "joris")]],
            }));
            return [...afspraken, ...momenten, ...logs];
        };
        return {
            wissel: sorteer(ag(true)),
            verzoeken: sorteer(evs.filter((g) => g.soort === "schema").map((g) => ({
                wanneer: new Date(g.moment), titel: t("routes.exporteren.wijzigingsverzoek", { actie: actieNl[g.actie].toLowerCase() }), kinderen: evKids(g),
                velden: [[V("betreft"), g.meta['betreft'] ?? g.itemNaam], ...g.wijzigingen.map((x) => [x.veld === "status" ? V("status") : x.veld, x.veld === "status" ? x.nieuw : `${x.oud} → ${x.nieuw}`]), [g.actie === "CREATED" ? V("aangemaaktDoor") : V("door"), g.actorNaam]],
            }))),
            besluiten: sorteer([
                ...ag(false),
                // Onze afspraken: rechtstreeks uit de ene afsprakenbron (eigen geschiedenis), geen kopie in de audit.
                ...(magBron(kijker, "agenda") ? onzeAfspraken : []).flatMap((a) => a.geschiedenis.flatMap((g) => {
                    const d = g.moment ? new Date(g.moment) : geschiedenisDatum(g.datum);
                    return d ? [{ wanneer: d, titel: a.titel, kinderen: kindIdsNaarNamen(a.kindIds),
                            velden: [[V("afspraak"), a.tekst], [V("status"), a.status], [V("registratie"), g.tekst], ...(a.bron ? [[V("herkomst"), a.bron.label]] : [])] }] : [];
                })),
                ...(magBron(kijker, "besluit") ? besluiten : []).flatMap((b) => (b.history ?? []).map((l) => ({
                    wanneer: new Date(l.at), titel: b.title, kinderen: kindIdsNaarNamen(b.child_ids),
                    velden: [[V("type"), besluitSoortLabel(b.decision_kind)], [V("registratie"), besluitRegel(l.type)], [V("door"), naam(l.by)]],
                }))),
            ]),
            // Berichten uit berichten-store (manage-messages): alleen verstuurde berichten van gesprekken die deze ouder mag lezen.
            communicatie: sorteer((magBron(kijker, "bericht") ? berichten.gesprekken : []).flatMap((g) => (berichten.berichten[g.id] ?? []).filter((b) => !b.wacht && !b.mislukt && b.at).map((b) => ({
                wanneer: new Date(b.at), titel: b.van === "ik" ? naam(authState().gebruiker?.id) : naam(b.afzender), groep: g.onderwerp, tekst: b.tekst, kinderen: kindIdsNaarNamen(g.kindId ? [g.kindId] : []),
                velden: [[V("onderwerp"), g.onderwerp], [V("oorspronkelijkeTijd"), t2(new Date(b.at))]],
            })))),
            // Kosten (kosten-store): datum is ISO, betaaldDoor is "ik"/"ander", betaaldDoorId het profiel-id.
            kosten: sorteer((magBron(kijker, "kost") ? kosten : []).map((k) => ({
                wanneer: parseLabel(k.datum), titel: k.omschrijving, kinderen: kindIdsNaarNamen(k.kindIds),
                velden: [[V("bedrag"), euro(k.bedrag)], [V("categorie"), kostCategorieLabel(k.categorie)], [V("kind"), kindIdsNaarNamen(k.kindIds).join(" & ") || t("routes.exporteren.heleGezin")], [V("verdeling"), k.verdeling], [V("status"), kostStatusLabel(k.status)], [V("betaaldDoor"), naam(k.betaaldDoorId)]],
            }))),
            documenten: sorteer((magBron(kijker, "document") ? documenten.filter((d) => d.gedeeld) : []).map((d) => ({
                wanneer: new Date(d.datum), titel: d.naam, kinderen: kindIdsNaarNamen(d.kindId ? [d.kindId] : []),
                velden: [[V("categorie"), documentCategorieLabel(d.categorie)], [V("kind"), kindIdsNaarNamen(d.kindId ? [d.kindId] : []).join(" & ")], [V("laatstGewijzigd"), d2(new Date(d.datum))]],
            }))),
            geschiedenis: sorteer(evs.map((g) => ({
                wanneer: new Date(g.moment), titel: actieNl[g.actie], groep: `${soortLabel[g.soort] ?? g.soort} · ${g.itemNaam}`, kinderen: evKids(g),
                velden: [...g.wijzigingen.map((x) => [x.veld, `${x.oud} → ${x.nieuw}`]), ...Object.entries(g.meta).map(([k, v]) => [k, v]), [V("door"), `${g.actorNaam} (${g.actorRol.toLowerCase()})`]],
            }))),
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [audit, onzeAfspraken, besluiten, documenten, kosten, agendaSt, zorg, vakanties, overdracht, berichten, kids, periode, van, tot, pro, st, zonderKinderen]);
    const [s, e] = bereik();
    const periodeTekst = `${d2(s)} – ${d2(e)}`;
    const kidsTekst = zonderKinderen ? t("routes.exporteren.heleGezin") : kids.length === kindNamen.length ? kids.join(" & ") : kids.join(", ");
    async function maak() {
        setBezig(true);
        try {
            await maakPdf();
        }
        catch (e) {
            console.error("[exporteren]", e);
            meldFout(t("routes.exporteren.maakFout"));
        }
        finally {
            setBezig(false);
        }
    }
    async function maakPdf() {
        const { jsPDF } = await import("jspdf");
        const exportId = `DX-${Date.now().toString(36).toUpperCase().slice(-6)}`;
        const nu = new Date();
        const doc = pdfVeilig(new jsPDF({ unit: "mm", format: "a4" }));
        const W = 210, M = 20, B = W - 2 * M, ONDER = 272;
        const groen = [111, 127, 104], inkt = [47, 42, 38], grijs = [110, 104, 98];
        const kopjes = [];
        let sectie = "";
        let y = 0;
        // 1. Voorblad
        doc.setTextColor(...groen).setFont("helvetica", "bold").setFontSize(10).text(APP.toUpperCase(), M, 50);
        doc.setTextColor(...inkt).setFont("times", "normal").setFontSize(30).text(t("routes.exporteren.pdf.titel"), M, 66);
        doc.setFontSize(18).text(kidsTekst, M, 78);
        y = 98;
        [[t("routes.exporteren.pdf.periode"), periodeTekst], [t("routes.exporteren.pdf.gegenereerd"), dt(nu)], [t("routes.exporteren.pdf.samengesteldDoor"), kijker.type === "ouder" ? naam(kijker.id) : kijker.naam], [t("routes.exporteren.pdf.exportId"), exportId]].forEach(([l, w]) => {
            doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...groen).text(l.toUpperCase(), M, y);
            doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(...inkt).text(w, M + 45, y);
            y += 9;
        });
        doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...grijs).text(t("routes.exporteren.pdf.automatisch", { app: APP }), M, 260);
        // 2. Inhoud + Over dit document (inhoud wordt achteraf ingevuld)
        doc.addPage();
        const inhoudPagina = doc.getNumberOfPages();
        const nieuwePagina = () => {
            doc.addPage();
            y = 28;
            doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...grijs).text(`${t("routes.exporteren.pdf.titel")} · ${sectie}`, M, 14);
            doc.setDrawColor(225, 220, 212).setLineWidth(0.2).line(M, 17, W - M, 17);
        };
        const ruimte = (h) => { if (y + h > ONDER) {
            nieuwePagina();
            return true;
        } return false; };
        const hoofdstuk = (label, nr) => {
            sectie = label;
            nieuwePagina();
            kopjes.push({ label, pagina: doc.getNumberOfPages() });
            doc.setFont("times", "normal").setFontSize(20).setTextColor(...inkt).text(`${nr}. ${label}`, M, y);
            y += 4;
            doc.setDrawColor(...groen).setLineWidth(0.4).line(M, y, W - M, y);
            y += 10;
        };
        const blokHoogte = (it, breedte) => {
            const t = doc.setFont("helvetica", "bold").setFontSize(10.5).splitTextToSize(it.titel, breedte).length * 5;
            const v = it.velden.reduce((a, [l, w]) => a + doc.setFont("helvetica", "normal").setFontSize(9.5).splitTextToSize(`${l}: ${w}`, breedte).length * 4.5, 0);
            return t + v + 11;
        };
        const tekenBlok = (it, metDatum = true) => {
            const x = M + 42, br = B - 42;
            ruimte(blokHoogte(it, br));
            if (metDatum) {
                doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...inkt).text(d2(it.wanneer), M, y);
                doc.setFont("helvetica", "normal").setTextColor(...grijs).text(t2(it.wanneer), M, y + 4.5);
            }
            const t = doc.setFont("helvetica", "bold").setFontSize(10.5).setTextColor(...inkt).splitTextToSize(it.titel, br);
            doc.text(t, x, y);
            let yy = y + t.length * 5 + 1;
            it.velden.forEach(([l, w]) => {
                const r = doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(...grijs).splitTextToSize(`${l}: ${w}`, br);
                doc.text(r, x, yy);
                yy += r.length * 4.5;
            });
            y = Math.max(yy, y + 12) + 5;
            doc.setDrawColor(232, 228, 220).setLineWidth(0.2).line(M, y - 3.5, W - M, y - 3.5);
        };
        // 3. Samenvatting (alleen feitelijke aantallen)
        let nr = 1;
        hoofdstuk(t("routes.exporteren.pdf.samenvatting"), nr++);
        const regels = [[t("routes.exporteren.pdf.periode"), periodeTekst], [t("routes.exporteren.pdf.kinderen"), kidsTekst], ...gekozen.map((d) => [d.label, t("routes.exporteren.pdf.registraties", { count: data[d.id].length })])];
        regels.forEach(([l, w]) => { ruimte(8); doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(...inkt).text(l, M, y); doc.setFont("helvetica", "normal").setTextColor(...grijs).text(w, M + 75, y); y += 7; });
        y += 4;
        doc.setFontSize(9).text(doc.splitTextToSize(t("routes.exporteren.pdf.samenvattingUitleg"), B), M, y);
        // 4. Onderdelen
        gekozen.forEach((d) => {
            hoofdstuk(d.label, nr++);
            const items = data[d.id];
            if (!items.length) {
                doc.setFont("helvetica", "italic").setFontSize(10).setTextColor(...grijs).text(t("routes.exporteren.geenRegistraties"), M, y);
                return;
            }
            if (d.id === "communicatie") {
                let dag = "";
                items.forEach((it) => {
                    const r = doc.setFont("helvetica", "normal").setFontSize(10).splitTextToSize(it.tekst ?? "", B);
                    const h = r.length * 4.8 + 12;
                    if (d2(it.wanneer) !== dag) {
                        ruimte(h + 12);
                        dag = d2(it.wanneer);
                        doc.setFont("times", "normal").setFontSize(13).setTextColor(...inkt).text(dag, M, y);
                        y += 8;
                    }
                    else
                        ruimte(h);
                    doc.setFont("helvetica", "bold").setFontSize(9.5).setTextColor(...inkt).text(`${t2(it.wanneer)} · ${it.titel}`, M, y);
                    doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...grijs).text(t("routes.exporteren.pdf.onderwerpTijd", { onderwerp: it.groep, tijd: it.velden[1][1] }), M + 50, y);
                    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...inkt).text(r, M, y + 5);
                    y += h;
                });
            }
            else if (d.id === "geschiedenis") {
                const groepen = new Map();
                items.forEach((it) => groepen.set(it.groep, [...(groepen.get(it.groep) ?? []), it]));
                groepen.forEach((lijst, g) => {
                    ruimte(12 + blokHoogte(lijst[0], B - 42));
                    doc.setFont("times", "normal").setFontSize(13).setTextColor(...inkt).text(g, M, y);
                    y += 8;
                    lijst.forEach((it) => tekenBlok(it));
                    y += 3;
                });
            }
            else
                items.forEach((it) => tekenBlok(it));
        });
        // Inhoud invullen
        doc.setPage(inhoudPagina);
        y = 30;
        doc.setFont("times", "normal").setFontSize(22).setTextColor(...inkt).text(t("routes.exporteren.pdf.inhoud"), M, y);
        y += 12;
        kopjes.forEach((k, i) => {
            doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(...inkt).text(`${i + 1}. ${k.label}`, M, y);
            doc.setTextColor(...grijs).text(String(k.pagina), W - M, y, { align: "right" });
            doc.setDrawColor(225, 220, 212).setLineDashPattern([0.6, 1.2], 0).line(M + 70, y, W - M - 10, y).setLineDashPattern([], 0);
            y += 8;
        });
        y += 14;
        doc.setFont("times", "normal").setFontSize(15).setTextColor(...inkt).text(t("routes.exporteren.pdf.overDitDocument"), M, y);
        y += 7;
        doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...grijs).text(doc.splitTextToSize(t("routes.exporteren.pdf.overTekst", { app: APP }), B), M, y);
        // Footer op elke pagina na het voorblad
        const n = doc.getNumberOfPages(), vandaag = d2(nu);
        for (let i = 2; i <= n; i++) {
            doc.setPage(i);
            doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...grijs);
            doc.text(t("routes.exporteren.pdf.voettekst", { app: APP, datum: vandaag, id: exportId }), M, 287);
            doc.text(t("routes.exporteren.pdf.pagina", { i, n }), W - M, 287, { align: "right" });
        }
        const blob = doc.output("blob");
        const file = new File([blob], t("routes.exporteren.bestandsnaam", { datum: nu.toISOString().slice(0, 10) }), { type: "application/pdf" });
        if (pdf)
            URL.revokeObjectURL(pdf.url);
        setPdf({ url: URL.createObjectURL(blob), file, id: exportId });
        // Exportactie zelf vastleggen (niet naar wie het later wordt doorgestuurd)
        leg("dossier", exportId, t("routes.exporteren.dossierGegenereerd"), "EXPORTED", undefined, kijker.type === "ouder" ? naam(kijker.id) : kijker.naam, {
            kinderen: kids, meta: { periode: periodeTekst, onderdelen: gekozen.map((d) => d.label).join(", "), "export-ID": exportId },
        });
        setStap("gereed");
        setDeelCheck(false);
    }
    async function deel() {
        if (!pdf)
            return;
        const nav = navigator;
        if (nav.canShare?.({ files: [pdf.file] })) {
            try {
                await nav.share({ files: [pdf.file], title: t("routes.exporteren.pdf.titel"), text: t("routes.exporteren.delen.tekst", { kinderen: kidsTekst, app: APP }) });
                return;
            }
            catch { /* geannuleerd */ }
        }
        window.location.href = `mailto:?subject=${encodeURIComponent(t("routes.exporteren.delen.onderwerp", { kinderen: kidsTekst }))}&body=${encodeURIComponent(t("routes.exporteren.delen.mail", { app: APP }))}`;
    }
    const kop = "text-[11px] font-bold uppercase tracking-[0.14em] text-brand";
    const keuze = (aan) => `min-h-11 rounded-md border px-3 py-2 text-sm font-semibold ${aan ? "border-brand bg-brand-soft text-ink" : "border-border text-ink-soft"}`;
    const primair = "flex w-full items-center justify-center gap-2 rounded-md bg-brand py-3.5 text-sm font-semibold text-primary-foreground disabled:opacity-50";
    const secundair = "flex w-full items-center justify-center gap-2 rounded-md border border-border py-3 text-sm font-semibold";
    const toggleKind = (k) => setKids(kids.includes(k) ? kids.filter((x) => x !== k) : [...kids, k]);
    return (<AppShell>
      <PageHeader titel={t("routes.exporteren.titel")} subtitel={kijker.type === "ouder" ? t("routes.exporteren.subtitelOuder") : t("routes.exporteren.subtitelPro")} terug={kijker.type === "ouder" ? "/documenten" : "/professionals"}/>

      {stap === "kies" ? (<>
          <section className="mt-8">
            <h2 className={kop}>{t("routes.exporteren.pdf.periode")}</h2>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <button onClick={() => setPeriode("3m")} className={keuze(periode === "3m")}>{t("routes.exporteren.periode3m")}</button>
              <button onClick={() => setPeriode("1j")} className={keuze(periode === "1j")}>{t("routes.exporteren.periode1j")}</button>
              <button onClick={() => setPeriode("eigen")} className={keuze(periode === "eigen")}>{t("routes.exporteren.periodeEigen")}</button>
            </div>
            {periode === "eigen" ? (<div className="mt-3 flex gap-2">
                <label className="flex-1 text-xs text-ink-soft">{t("routes.exporteren.van")}<input type="date" value={van} onChange={(e) => setVan(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm text-ink"/></label>
                <label className="flex-1 text-xs text-ink-soft">{t("routes.exporteren.totEnMet")}<input type="date" value={tot} onChange={(e) => setTot(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm text-ink"/></label>
              </div>) : null}
          </section>

          <section className="mt-8">
            <h2 className={kop}>{t("routes.exporteren.voorWie")}</h2>
            <div className="mt-1 divide-y divide-border border-y border-border">
              {toegestaneKinderen.map((k) => (<label key={k} className="flex items-center gap-3 py-3 text-sm">
                  <input type="checkbox" checked={kids.includes(k)} onChange={() => toggleKind(k)} className="size-4 accent-[var(--color-brand)]"/>{k}
                </label>))}
              {toegestaneKinderen.length > 1 ? (<label className="flex items-center gap-3 py-3 text-sm">
                  <input type="checkbox" checked={kids.length === toegestaneKinderen.length} onChange={() => setKids(kids.length === toegestaneKinderen.length ? [] : toegestaneKinderen)} className="size-4 accent-[var(--color-brand)]"/>{t("routes.exporteren.beideKinderen")}
                </label>) : null}
            </div>
            {zonderKinderen ? <p className="py-3 text-sm text-ink-soft">{t("routes.exporteren.geenKinderen")}</p> : null}
            <p className="mt-2 text-[11px] text-ink-soft">{t("routes.exporteren.kinderenUitleg")}</p>
          </section>

          <section className="mt-8">
            <h2 className={kop}>{t("routes.exporteren.watMee")}</h2>
            <div className="mt-1 divide-y divide-border border-y border-border">
              {delen.map((d) => {
                const mag = magDeel(d);
                return (<label key={d.id} className={`flex items-center gap-3 py-3 text-sm ${mag ? "" : "text-ink-soft/60"}`}>
                    <input type="checkbox" disabled={!mag} checked={mag && kies.includes(d.id)} onChange={() => setKies(kies.includes(d.id) ? kies.filter((x) => x !== d.id) : [...kies, d.id])} className="size-4 accent-[var(--color-brand)]"/>
                    {d.label}{mag ? null : <span className="ml-auto text-[11px]">{t("routes.exporteren.geenToegang")}</span>}
                  </label>);
            })}
            </div>
            <p className="mt-2 text-[11px] text-ink-soft">{t("routes.exporteren.nooitPrive")}</p>
          </section>

          {periode === "eigen" && van > tot ? <p role="alert" className="mt-4 text-xs text-destructive">{t("routes.exporteren.periodeOngeldig")}</p> : null}
          <button onClick={() => setStap("overzicht")} disabled={!gekozen.length || (!kids.length && !zonderKinderen) || (periode === "eigen" && (!van || !tot || van > tot))} className={`mt-8 ${primair}`}>{t("routes.exporteren.verder")}</button>
        </>) : null}

      {stap === "overzicht" ? (<section className="mt-8">
          <p className="font-display text-xl">{t("routes.exporteren.samenstellen")}</p>
          <dl className="mt-4 space-y-3 text-sm">
            <div><dt className={kop}>{t("routes.exporteren.pdf.periode")}</dt><dd className="mt-0.5">{periodeTekst}</dd></div>
            <div><dt className={kop}>{t("routes.exporteren.pdf.kinderen")}</dt><dd className="mt-0.5">{kidsTekst}</dd></div>
          </dl>
          <p className={`mt-5 ${kop}`}>{t("routes.exporteren.opgenomen")}</p>
          <ul className="mt-1 divide-y divide-border border-y border-border">
            {delen.filter(magDeel).map((d) => {
                const aan = kies.includes(d.id);
                return (<li key={d.id} className={`flex items-center gap-3 py-2.5 text-sm ${aan ? "" : "text-ink-soft"}`}>
                  {aan ? <Check className="size-4 text-brand" strokeWidth={2}/> : <Circle className="size-3.5 text-ink-soft/60" strokeWidth={1.6}/>}
                  {d.label}{aan ? <span className="ml-auto text-xs text-ink-soft">{data[d.id].length}</span> : null}
                </li>);
            })}
          </ul>
          <div className="mt-6 space-y-2">
            <button onClick={() => setStap("voorbeeld")} className={secundair}><Eye className="size-4" strokeWidth={1.8}/>{t("routes.exporteren.voorbeeldBekijken")}</button>
            <button onClick={maak} disabled={bezig} className={primair}><FileText className="size-4" strokeWidth={1.8}/>{bezig ? t("routes.exporteren.bezig") : t("routes.exporteren.pdfGenereren")}</button>
            <button onClick={() => setStap("kies")} className="min-h-11 w-full py-2 text-xs font-semibold text-brand">{t("routes.exporteren.selectieAanpassen")}</button>
          </div>
        </section>) : null}

      {stap === "voorbeeld" ? (<section className="mt-6">
          <p className="font-display text-xl">{t("routes.exporteren.voorbeeldTitel")}</p>
          <p className="mt-1 text-xs text-ink-soft">{t("routes.exporteren.voorbeeldUitleg")}</p>
          <div className="mt-4 rounded-md border border-border bg-background p-4">
            <p className={kop}>{APP}</p>
            <p className="mt-1 font-display text-2xl">{t("routes.exporteren.pdf.titel")}</p>
            <p className="text-sm">{kidsTekst} · {periodeTekst}</p>
            <p className="mt-3 text-[11px] text-ink-soft">{t("routes.exporteren.deel.communicatie")}: {kies.includes("communicatie") ? t("routes.exporteren.meegenomen") : t("routes.exporteren.nietOpgenomen")} · {t("routes.exporteren.deel.geschiedenis")}: {kies.includes("geschiedenis") ? t("routes.exporteren.meegenomen") : t("routes.exporteren.nietOpgenomen")} · {t("routes.exporteren.deel.documenten")}: {kies.includes("documenten") ? t("routes.exporteren.vermeld", { n: data.documenten.length }) : t("routes.exporteren.nietOpgenomen")}</p>
            {gekozen.map((d, i) => (<div key={d.id} className="mt-5 border-t border-border pt-3">
                <p className="font-display text-lg">{i + 2}. {d.label}</p>
                {data[d.id].length === 0 ? <p className="text-xs italic text-ink-soft">{t("routes.exporteren.geenRegistraties")}</p> : null}
                <ul className="mt-1 space-y-2">
                  {data[d.id].map((it, j) => (<li key={j} className="text-xs">
                      <p className="text-ink-soft">{dt(it.wanneer)}{it.groep && d.id === "geschiedenis" ? ` · ${it.groep}` : ""}</p>
                      <p className="font-semibold text-ink">{it.titel}</p>
                      {it.tekst ? <p>{it.tekst}</p> : null}
                      {(d.id === "communicatie" ? it.velden.slice(0, 1) : it.velden).map(([l, w]) => <p key={l} className="text-ink-soft">{l}: {w}</p>)}
                    </li>))}
                </ul>
              </div>))}
          </div>
          <div className="mt-6 space-y-2">
            <button onClick={maak} disabled={bezig} className={primair}><FileText className="size-4" strokeWidth={1.8}/>{bezig ? t("routes.exporteren.bezig") : t("routes.exporteren.pdfGenereren")}</button>
            <button onClick={() => setStap("kies")} className={secundair}>{t("routes.exporteren.selectieAanpassen")}</button>
          </div>
        </section>) : null}

      {stap === "gereed" && pdf ? (<section className="mt-8">
          <p className="font-display text-xl">{t("routes.exporteren.gereed")}</p>
          <p className="text-xs text-ink-soft">{pdf.file.name} · {t("routes.exporteren.exportIdTekst", { id: pdf.id })}</p>
          <div className="mt-4 space-y-2">
            <a href={pdf.url} target="_blank" rel="noreferrer" className={secundair}><Eye className="size-4" strokeWidth={1.8}/>{t("routes.exporteren.pdfBekijken")}</a>
            <a href={pdf.url} download={pdf.file.name} className={primair}><Download className="size-4" strokeWidth={1.8}/>{t("routes.exporteren.downloadPdf")}</a>
            {deelCheck ? (<div className="rounded-md border border-border p-3">
                <p className="text-sm">{t("routes.exporteren.controleerDelen")}</p>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => setDeelCheck(false)} className="min-h-11 flex-1 rounded-full border border-border bg-card px-3 text-sm">{t("routes.exporteren.nogNiet")}</button>
                  <button onClick={deel} className="min-h-11 flex-1 rounded-full bg-brand px-3 text-sm font-semibold text-primary-foreground">{t("routes.exporteren.delenKnop")}</button>
                </div>
              </div>) : (<button onClick={() => setDeelCheck(true)} className={secundair}><Share2 className="size-4" strokeWidth={1.8}/>{t("routes.exporteren.delenKnop")}</button>)}
          </div>
          <p className="mt-4 text-[11px] text-ink-soft">{t("routes.exporteren.vastgelegd")}</p>
          <button onClick={() => setStap("kies")} className="mt-4 min-h-11 w-full py-2 text-xs font-semibold text-brand">{t("routes.exporteren.nieuwDossier")}</button>
        </section>) : null}
    </AppShell>);
}
