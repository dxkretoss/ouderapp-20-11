import { useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import { serverBron } from "@/lib/praktisch-sync";
/**
 * Servermeldingen (send-notification list): ontstaan server-side als de andere ouder iets doet (een verzoek,
 * een antwoord, een reactie). Plus de leesmarkeringen van Activiteiten, per gebruiker op de server bewaard.
 * Melding: { id, actor_id, actor_name, type, category (actie|wijziging|info), key, params, audit_id, link, created_at }.
 */
let state = { meldingen: [], gelezen: [], geladen: false };
const listeners = new Set();
const zet = (p) => { state = { ...state, ...p }; listeners.forEach((l) => l()); };
const wachtend = new Set();
const sync = serverBron({
    laad: async () => {
        const r = await api("send-notification", "list");
        // Lokaal al gelezen maar nog niet op de server: bewaren.
        zet({ meldingen: r.notifications ?? [], gelezen: [...new Set([...(r.read_ids ?? []), ...wachtend])], geladen: true });
    },
    wis: () => { wachtend.clear(); zet({ meldingen: [], gelezen: [], geladen: false }); },
});
export function useMeldingen() {
    sync.zorg();
    return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state, () => state);
}
export const meldingenState = () => { sync.zorg(); return state; };
export const verversMeldingen = () => sync.ververs();
/** Markeert activiteiten als gelezen (direct zichtbaar; daarna op de server). Lezen regelt nooit een verzoek. */
export function markeerGelezen(ids) {
    const nieuw = ids.filter((id) => !state.gelezen.includes(id));
    if (!nieuw.length)
        return;
    nieuw.forEach((id) => wachtend.add(id));
    zet({ gelezen: [...state.gelezen, ...nieuw] });
    for (let i = 0; i < nieuw.length; i += 500) {
        const deel = nieuw.slice(i, i + 500);
        api("send-notification", "mark-read", { item_ids: deel }).then(() => deel.forEach((id) => wachtend.delete(id))).catch(() => { });
    }
}
