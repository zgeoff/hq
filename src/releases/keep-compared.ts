// The compare answers worth carrying to the next pass: those for merges that have not shipped yet.
// A key is `repo:sha:tag`, as shipRuns builds it.
export function keepCompared(compared: ReadonlyMap<string, boolean>, waiting: ReadonlySet<string>): Record<string, boolean> {
  const kept: Record<string, boolean> = {};
  for (const [key, contained] of compared) {
    const [, sha] = key.split(':');
    if (sha !== undefined && waiting.has(sha)) {
      kept[key] = contained;
    }
  }
  return kept;
}
