import { useMemo, useSyncExternalStore } from "react";
import { useVoorkeuren, zetVoorkeur } from "@/lib/voorkeuren-store";
/**
 * Check-in op de wisseldag. Aan/uit is een voorkeur van je account (`checkinAan`, standaard aan) en geldt
 * op elk apparaat. "Al getoond" is alleen voor deze sessie (pure UI-status).
 */
let getoond = false;
const listeners = new Set();
const meld = () => listeners.forEach((l) => l());
export const setCheckinAan = (aan) => zetVoorkeur("checkinAan", !!aan);
export const markeerCheckinGetoond = () => { getoond = true; meld(); };
export function useCheckin() {
    const vk = useVoorkeuren();
    const g = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => getoond, () => getoond);
    const aan = vk.checkinAan !== false;
    return useMemo(() => ({ aan, getoond: g }), [aan, g]);
}
