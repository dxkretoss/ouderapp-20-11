import { useSyncExternalStore } from "react";

/** Gedeelde status van de "Actie vereist"-lijst op de homepagina. */
let verwerkt = new Set<string>();
const listeners = new Set<() => void>();

export function verwerkActie(id: string) {
  if (verwerkt.has(id)) return;
  verwerkt = new Set(verwerkt).add(id);
  listeners.forEach((l) => l());
}

export function useActiesVerwerkt() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => verwerkt,
    () => verwerkt,
  );
}
