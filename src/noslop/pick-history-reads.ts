export function pickHistoryReads(pairs: readonly [string, string][], baseEntries: ReadonlyMap<string, string | null>): [string, string][] {
  return pairs.filter(([from]) => (baseEntries.get(from) ?? null) === null);
}
