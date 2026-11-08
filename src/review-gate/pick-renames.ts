import { buildRenameKey } from './build-rename-key.ts';

export function pickRenames(pairs: readonly [string, string][], baseEntries: ReadonlyMap<string, string | null>, logged: readonly [string, string][]): Set<string> {
  const wanted = new Set(pairs.filter(([from]) => (baseEntries.get(from) ?? null) === null).map(([from, to]) => buildRenameKey(from, to)));
  return new Set(logged.map(([from, to]) => buildRenameKey(from, to)).filter((key) => wanted.has(key)));
}
