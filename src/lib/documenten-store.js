import { useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import { leesAlsDataUrl, meldFout, serverBron } from "@/lib/praktisch-sync";
/**
 * Documenten van het eigen gezin — bron: edge function manage-documents (tabel documents + privé-bucket "documents").
 * Bestanden gaan via de function naar de server (max 10 MB) en komen alleen terug als tijdelijke link (1 uur).
 * Model: { id, naam, categorie (vaste Nederlandse waarde), kindId (null = hele gezin), door (profiel-id), datum (ISO),
 *          grootte (bytes), type, gedeeld, bron }.
 */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
/** Vaste categorieën (opgeslagen waarden; weergave via documentCategorieLabel). */
export const DOCUMENT_CATEGORIEEN = ["Officiële afspraken", "School", "Medisch", "Verzekeringen", "Bonnen", "Overig"];
let state = { lijst: [], geladen: false };
const listeners = new Set();
const zet = (p) => { state = { ...state, ...p }; listeners.forEach((l) => l()); };
const vanServer = (d) => ({ id: d.id, naam: d.title, categorie: d.category, kindId: d.child_id ?? null, door: d.uploaded_by, datum: d.created_at, grootte: d.file_size ?? 0, type: d.mime_type, bestand: d.file_name, gedeeld: d.is_shared !== false, bron: d.source });
const sync = serverBron({
    laad: async () => {
        const r = await api("manage-documents", "list");
        zet({ lijst: (r.documents ?? []).map(vanServer), geladen: true });
    },
    wis: () => zet({ lijst: [], geladen: false }),
});
export function useDocumenten() {
    sync.zorg();
    return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state, () => state);
}
export const documentenState = () => { sync.zorg(); return state; };
/** Type van een bestand, ook als de browser het leeg laat (.docx/.doc/.txt). */
export function bestandType(file) {
    if (file.type && DOCUMENT_TYPES.includes(file.type))
        return file.type;
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    return { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", txt: "text/plain", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }[ext] ?? file.type ?? "";
}
/**
 * Upload: `bron` is een File of een data-URL (bijv. een foto uit de bonnenscanner). Geeft het document of null.
 * { naam, categorie, kindId, bron: "upload"|"ouderschapsplan"|"bon"|"school", gedeeld }
 */
export async function uploadDocument(bestand, { naam, categorie = "Overig", kindId = null, bron = "upload", gedeeld = true, bestandsnaam } = {}) {
    try {
        let data, type, fileName = bestandsnaam;
        if (typeof bestand === "string") {
            data = bestand;
            type = /^data:([^;,]+)/.exec(bestand)?.[1] ?? "";
        }
        else {
            if (bestand.size > MAX_DOCUMENT_BYTES)
                throw { code: "VALIDATION" };
            type = bestandType(bestand);
            data = await leesAlsDataUrl(bestand);
            fileName = fileName ?? bestand.name;
        }
        const r = await api("manage-documents", "upload", { title: naam, category: categorie, child_id: kindId, file_base64: data, mime_type: type, file_name: fileName ?? null, source: bron, is_shared: gedeeld });
        const doc = vanServer(r.document);
        zet({ lijst: [doc, ...state.lijst.filter((x) => x.id !== doc.id)] });
        return doc;
    }
    catch (e) {
        meldFout(e, "documenten-fout");
        return null;
    }
}
/** Tijdelijke link (1 uur) om het document te bekijken of te downloaden. */
export async function documentLink(id, download = false) {
    try {
        return (await api("manage-documents", "get-url", { document_id: id, download })).url;
    }
    catch (e) {
        meldFout(e, "documenten-fout");
        return null;
    }
}
/** Opent het document in een nieuw tabblad (venster eerst openen: pop-upblokkers). */
export async function openDocument(id) {
    const w = typeof window !== "undefined" ? window.open("", "_blank") : null;
    let url = await documentLink(id);
    // Lokale mock geeft een data-URL; browsers openen die niet als pagina.
    if (url?.startsWith("data:"))
        url = URL.createObjectURL(await (await fetch(url)).blob());
    if (!url) {
        w?.close();
        return;
    }
    if (w)
        w.location.href = url;
    else
        window.location.href = url;
}
export async function verwijderDocument(id) {
    const vorig = state.lijst;
    zet({ lijst: state.lijst.filter((x) => x.id !== id) });
    try {
        await api("manage-documents", "delete", { document_id: id });
    }
    catch (e) {
        zet({ lijst: vorig });
        meldFout(e, "documenten-fout");
    }
}
