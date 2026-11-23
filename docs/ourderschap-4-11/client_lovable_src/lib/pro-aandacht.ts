/** Read-only dashboard ordering; keeps original source objects. */
export function ordenAandacht<T extends { rang: number; datum?: string | undefined }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.rang - b.rang || (a.datum ?? "9999").localeCompare(b.datum ?? "9999"));
}