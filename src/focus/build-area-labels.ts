import type { AreaLabels, StoredAreaLabels } from './area-labels-schema.ts';

// A read that checks no repo keeps what an earlier check found for the labels still there.
export function buildAreaLabels(stored: AreaLabels, names: readonly string[], at: string): StoredAreaLabels {
  const kept = Object.entries(stored.repoExists).filter(([name]) => names.includes(name));
  return { at, names: [...names], repoExists: Object.fromEntries(kept) };
}
