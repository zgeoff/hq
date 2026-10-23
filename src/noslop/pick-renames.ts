import { buildRenameKey } from './build-rename-key.ts';

// The renames that count for the claimed moves: a logged rename of exactly a claimed old path to
// its claimed new path, where the old path is absent at the merge base. Any other rename the log
// shows proves nothing.
export function pickRenames(pairs: readonly [string, string][], baseEntries: ReadonlyMap<string, string | null>, logged: readonly [string, string][]): Set<string> {
  const wanted = new Set(pairs.filter(([from]) => (baseEntries.get(from) ?? null) === null).map(([from, to]) => buildRenameKey(from, to)));
  return new Set(logged.map(([from, to]) => buildRenameKey(from, to)).filter((key) => wanted.has(key)));
}
