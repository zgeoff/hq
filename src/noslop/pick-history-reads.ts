// The claimed moves whose rename only the base branch history can show: those whose old path is
// absent at the merge base. A move whose old path is still there needs no history read.
export function pickHistoryReads(pairs: readonly [string, string][], baseEntries: ReadonlyMap<string, string | null>): [string, string][] {
  return pairs.filter(([from]) => (baseEntries.get(from) ?? null) === null);
}
