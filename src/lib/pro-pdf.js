import i18n, { taalLocale } from "@/i18n";
/**
 * jsPDF's standaardfonts (helvetica/times) kennen alleen WinAnsi: pijlen en emoji worden daar
 * onleesbare tekens. Pijlen worden platte tekst ("->"), pictogrammen/emoji vallen weg.
 */
const PIJLEN = { "\u2192": "->", "\u2190": "<-", "\u2194": "<->", "\u21D2": "=>", "\u2713": "", "\u2714": "", "\u2715": "x", "\u2716": "x" };
export function pdfTekst(s) {
    if (Array.isArray(s))
        return s.map(pdfTekst);
    if (typeof s !== "string")
        return s;
    return s
        .replace(/[\u2192\u2190\u2194\u21D2\u2713-\u2716]/g, (c) => PIJLEN[c])
        .replace(/\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\uFE0F\u200D\u20E3]/gu, "")
        .replace(/ {2,}/g, " ")
        .replace(/^ (?=\S)/, "");
}
/** Laat text() en splitTextToSize() van een jsPDF-document altijd pdf-veilige tekst gebruiken. */
export function pdfVeilig(doc) {
    const text = doc.text.bind(doc);
    const split = doc.splitTextToSize.bind(doc);
    doc.text = (s, ...rest) => text(pdfTekst(s), ...rest);
    doc.splitTextToSize = (s, ...rest) => split(pdfTekst(s), ...rest);
    return doc;
}
export async function maakProPdf({ titel, dossier, periode, secties, bestand }) {
    const { jsPDF } = await import("jspdf");
    const doc = pdfVeilig(new jsPDF({ unit: "mm", format: "a4" }));
    const L = 20, B = 170, H = 297;
    let y = 30;
    const nieuweRegel = (hoogte) => { if (y + hoogte > H - 22) {
        doc.addPage();
        y = 22;
    } };
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(titel, L, y);
    y += 9;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(90);
    doc.text(`${dossier} · ${periode}`, L, y);
    y += 5;
    doc.text(i18n.t("lib.proPdf.geexporteerdOp", { moment: new Date().toLocaleString(taalLocale()) }), L, y);
    y += 10;
    doc.setTextColor(0);
    for (const s of secties) {
        nieuweRegel(16);
        doc.setDrawColor(200);
        doc.line(L, y, L + B, y);
        y += 7;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text(s.titel, L, y);
        y += 7;
        if (!s.regels.length) {
            doc.setFont("helvetica", "italic");
            doc.setFontSize(9);
            doc.text(i18n.t("lib.proPdf.geenGegevens"), L, y);
            y += 7;
            continue;
        }
        for (const r of s.regels) {
            const tekst = doc.splitTextToSize(r.tekst, B);
            nieuweRegel(6 + tekst.length * 4.5 + (r.meta ? 4.5 : 0) + (r.kop ? 5 : 0));
            if (r.meta) {
                doc.setFont("helvetica", "normal");
                doc.setFontSize(8);
                doc.setTextColor(110);
                doc.text(r.meta, L, y);
                y += 4.5;
                doc.setTextColor(0);
            }
            if (r.kop) {
                doc.setFont("helvetica", "bold");
                doc.setFontSize(10);
                doc.text(r.kop, L, y);
                y += 5;
            }
            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            doc.text(tekst, L, y);
            y += tekst.length * 4.5 + 3;
        }
    }
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(120);
        doc.text(i18n.t("lib.proPdf.gegenereerd", { datum: new Date().toLocaleDateString(taalLocale()) }), L, H - 10);
        doc.text(i18n.t("lib.proPdf.pagina", { i, n }), L + B, H - 10, { align: "right" });
    }
    doc.save(bestand);
}
