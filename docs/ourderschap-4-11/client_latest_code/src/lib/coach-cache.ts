/** Ephemeral conversation-local cache: exact input/context/style, never persisted. */
export function maakCoachCache<T>(nu: () => number = Date.now) {
  const waarden = new Map<string, { tot: number; resultaat: Promise<T> }>();
  return {
    vraag(sleutel: string, laad: () => Promise<T>): Promise<T> {
      const bekend = waarden.get(sleutel);
      if (bekend && bekend.tot > nu()) return bekend.resultaat;
      if (waarden.size >= 12) waarden.delete(waarden.keys().next().value ?? "");
      const resultaat = laad().catch((fout) => { waarden.delete(sleutel); throw fout; });
      waarden.set(sleutel, { tot: nu() + 60000, resultaat });
      return resultaat;
    },
    wis() { waarden.clear(); },
  };
}