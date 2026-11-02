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
