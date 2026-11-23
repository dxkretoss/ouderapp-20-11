import type { ProLog } from "./pro-journaal-store";

/** Read-only projection of the existing professional log, within accessible dossiers. */
export function recenteProGebeurtenissen(log: readonly ProLog[], dossierIds: readonly string[]): ProLog[] {
  return log.filter((l) => dossierIds.includes(l.dossier)).sort((a, b) => b.moment.localeCompare(a.moment)).slice(0, 3);
}