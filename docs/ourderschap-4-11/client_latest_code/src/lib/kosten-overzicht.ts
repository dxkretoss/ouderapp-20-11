/** Alleen presentatie: dezelfde bronitems, maximaal drie tot de ouder de rest opent. */
export function zichtbareKostenActies<T>(items: readonly T[], alles = false): readonly T[] {
  return alles ? items : items.slice(0, 3);
}