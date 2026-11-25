import { useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import { meldFout, serverBron } from "@/lib/praktisch-sync";
/**
 * Evaluatiemomenten — bron: manage-agreements (evaluation-list / evaluation-save, tabel evaluations).
 * De inhoud is alleen voor de ouder zelf; delen gebeurt alleen via een bericht dat de ouder zelf verstuurt.
 * Model: { id, datum (YYYY-MM-DD), goed, anders, werkt, nodig, zelf, loslaten }, nieuwste eerst.
 */
let lijst = [];
const listeners = new Set();
const zet = (l) => { lijst = l; listeners.forEach((f) => f()); };
const vanServer = (e) => ({ id: e.id, datum: e.date, ...(e.answers ?? {}) });
const sync = serverBron({
    laad: async () => {
        const r = await api("manage-agreements", "evaluation-list");
        zet((r.evaluations ?? []).map(vanServer));
    },
    wis: () => zet([]),
});
/** Laadstatus voor de schermen (useStatus / ververs). */
export const evaluatieBron = sync;
/** Huidige lijst (van de server; leeg zolang er niets is geladen). */
export function leesEvaluaties() {
    sync.zorg();
    return lijst;
}
export function useEvaluaties() {
    sync.zorg();
    return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => lijst, () => lijst);
}
/** Eén evaluatie bewaren (alleen voor jezelf). Geeft (async) true bij succes. */
export async function bewaarEvaluatie(e) {
    try {
        const r = await api("manage-agreements", "evaluation-save", { answers: { goed: e.goed ?? "", anders: e.anders ?? "", werkt: e.werkt ?? "", nodig: e.nodig ?? "", zelf: e.zelf ?? "", loslaten: e.loslaten ?? "" } });
        zet([vanServer(r.evaluation), ...lijst]);
        return true;
    }
    catch (err) {
        meldFout(err, "evaluatie-fout");
        return false;
    }
}
/** @deprecated oude aanroep (lijst wegschrijven): bewaart alleen de nieuwste evaluatie. */
export function schrijfEvaluaties(l) {
    if (l?.[0])
        bewaarEvaluatie(l[0]);
}
/** Tijd voor een nieuwe evaluatie: de laatste is een half jaar (182 dagen) of langer geleden. */
export function evaluatieNodig(l, nu = new Date()) {
    const laatste = l[0];
    if (!laatste)
        return false;
    return (nu.getTime() - new Date(laatste.datum).getTime()) / 864e5 >= 182;
}
