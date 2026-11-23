import { useSyncExternalStore } from "react";
import i18n from "@/i18n";
export const regioLabel = {
    get noord() { return i18n.t("lib.schoolvakanties.regio.noord"); },
    get midden() { return i18n.t("lib.schoolvakanties.regio.midden"); },
    get zuid() { return i18n.t("lib.schoolvakanties.regio.zuid"); },
};
export const regioUitleg = {
    get noord() { return i18n.t("lib.schoolvakanties.uitleg.noord"); },
    get midden() { return i18n.t("lib.schoolvakanties.uitleg.midden"); },
    get zuid() { return i18n.t("lib.schoolvakanties.uitleg.zuid"); },
};
const alle = (van, tot) => ({ noord: [van, tot], midden: [van, tot], zuid: [van, tot] });
const tabel = [
    { id: "herfst", noord: ["2025-10-18", "2025-10-26"], midden: ["2025-10-18", "2025-10-26"], zuid: ["2025-10-11", "2025-10-19"] },
    { id: "kerst", ...alle("2025-12-20", "2026-01-04") },
    { id: "voorjaar", noord: ["2026-02-21", "2026-03-01"], midden: ["2026-02-14", "2026-02-22"], zuid: ["2026-02-14", "2026-02-22"] },
    { id: "mei", ...alle("2026-04-25", "2026-05-03") },
    { id: "zomer", noord: ["2026-07-04", "2026-08-16"], midden: ["2026-07-18", "2026-08-30"], zuid: ["2026-07-11", "2026-08-23"] },
    { id: "herfst", noord: ["2026-10-10", "2026-10-18"], midden: ["2026-10-17", "2026-10-25"], zuid: ["2026-10-17", "2026-10-25"] },
    { id: "kerst", ...alle("2026-12-19", "2027-01-03") },
    { id: "voorjaar", noord: ["2027-02-20", "2027-02-28"], midden: ["2027-02-20", "2027-02-28"], zuid: ["2027-02-13", "2027-02-21"] },
    { id: "mei", ...alle("2027-04-24", "2027-05-02") },
    { id: "zomer", noord: ["2027-07-10", "2027-08-22"], midden: ["2027-07-17", "2027-08-29"], zuid: ["2027-07-24", "2027-09-05"] },
    { id: "herfst", noord: ["2027-10-16", "2027-10-24"], midden: ["2027-10-16", "2027-10-24"], zuid: ["2027-10-23", "2027-10-31"] },
    { id: "kerst", ...alle("2027-12-25", "2028-01-09") },
    { id: "voorjaar", noord: ["2028-02-19", "2028-02-27"], midden: ["2028-02-26", "2028-03-05"], zuid: ["2028-02-26", "2028-03-05"] },
    { id: "mei", ...alle("2028-04-29", "2028-05-07") },
    { id: "zomer", noord: ["2028-07-15", "2028-08-27"], midden: ["2028-07-08", "2028-08-20"], zuid: ["2028-07-22", "2028-09-03"] },
];
let regio = "midden";
const luisteraars = new Set();
export function zetRegio(r) { regio = r; luisteraars.forEach((l) => l()); }
export function useRegio() {
    return useSyncExternalStore((l) => { luisteraars.add(l); return () => luisteraars.delete(l); }, () => regio, () => regio);
}
export const vakantiesVoor = (r) => tabel.map((t) => {
    const jaar = Number(t[r][0].slice(0, 4)) - (Number(t[r][0].slice(5, 7)) < 8 ? 1 : 0);
    return { id: t.id, naam: i18n.t(`lib.schoolvakanties.vakantie.${t.id}`), van: t[r][0], tot: t[r][1], advies: t.id === "herfst" || t.id === "voorjaar", schooljaar: `${jaar}-${jaar + 1}`, bron: `https://www.rijksoverheid.nl/themas/onderwijs/schoolvakanties/overzicht-schoolvakanties-per-schooljaar/overzicht-schoolvakanties-${jaar}-${jaar + 1}` };
});
export const vakantieOp = (r, iso) => vakantiesVoor(r).find((v) => iso >= v.van && iso <= v.tot);
export const vakantiesTussen = (r, van, tot) => vakantiesVoor(r).filter((v) => v.tot >= van && v.van <= tot);
