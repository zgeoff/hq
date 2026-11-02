import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function readTranscriptList(directory: string): { path: string; size: number; mtimeMs: number }[] {
  let names: string[];
  try {
    names = readdirSync(directory, { recursive: true, encoding: 'utf8' });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
  const out: { path: string; size: number; mtimeMs: number }[] = [];
  for (const name of names) {
    if (!name.endsWith('.jsonl')) {
      continue;
    }
    const path = join(directory, name);
    try {
      const stat = statSync(path);
      if (stat.isFile()) {
        out.push({ path, size: stat.size, mtimeMs: stat.mtimeMs });
      }
    } catch {
      // gone since the listing
    }
  }
  return out.toSorted((newer, older) => older.mtimeMs - newer.mtimeMs);
}
