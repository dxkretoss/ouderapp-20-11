/** Bon/bijlage uit een bestandskiezer → { naam, data (data-URL) }. Grote foto's worden verkleind; pdf blijft zoals hij is (max. 10 MB). */
export const MAX_BESTAND = 10 * 1024 * 1024;
const lees = (f) => new Promise((ok, mis) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => mis(r.error); r.readAsDataURL(f); });
async function verklein(dataUrl, max = 1800) {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const s = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * s);
    c.height = Math.round(img.height * s);
    c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85);
}
/** Gooit "TE_GROOT" of "SOORT" bij een bestand dat niet kan; anders { naam, data }. */
export async function leesBonBestand(f) {
    if (!f)
        return null;
    const soort = (f.type || "").toLowerCase();
    if (!/^image\/(jpeg|jpg|png|webp|heic|heif)$/.test(soort) && soort !== "application/pdf")
        throw new Error("SOORT");
    if (soort === "application/pdf") {
        if (f.size > MAX_BESTAND)
            throw new Error("TE_GROOT");
        return { naam: f.name, data: await lees(f) };
    }
    const ruw = await lees(f);
    // Kleine jpeg/png/webp blijven zoals ze zijn; al het andere (groot of heic) wordt een nette jpeg.
    if (f.size <= 1.5 * 1024 * 1024 && /^image\/(jpeg|jpg|png|webp)$/.test(soort))
        return { naam: f.name, data: ruw };
    return { naam: f.name.replace(/\.[^.]+$/, "") + ".jpg", data: await verklein(ruw) };
}
