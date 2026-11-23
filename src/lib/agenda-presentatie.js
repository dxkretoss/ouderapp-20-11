import { taalLocale } from "@/i18n";
import { dt, plusDagen } from "./agenda-datum";
import { wachtOpJou } from "./openstaande-voorstellen";
/** Read-only selection; Costs keeps ownership of financial proposals. */
export const agendaReacties = (voorstellen) => wachtOpJou(voorstellen).filter((v) => v.bron !== "budget" && v.bron !== "kost");
export function weekBereik(start) {
    const van = dt(start), tot = dt(plusDagen(start, 6));
    const zelfdeMaand = van.getMonth() === tot.getMonth() && van.getFullYear() === tot.getFullYear();
    const begin = zelfdeMaand ? String(van.getDate()) : van.toLocaleDateString(taalLocale(), { day: "numeric", month: "long", ...(van.getFullYear() !== tot.getFullYear() ? { year: "numeric" } : {}) });
    return `${begin}–${tot.toLocaleDateString(taalLocale(), { day: "numeric", month: "long", ...(van.getFullYear() !== tot.getFullYear() ? { year: "numeric" } : {}) })}`;
}
