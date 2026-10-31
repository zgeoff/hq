import { readdirSync } from 'node:fs';
import { join } from 'node:path';

// The delivery log, its old archive, and every monthly archive that hq state trim writes.
export function readLogFiles(directory: string): string[] {
  const monthly = readdirSync(directory)
    .filter((name) => /^delivery-archive-\d{4}-\d{2}\.md$/u.test(name))
    .toSorted();
  return [join(directory, 'delivery-archive.md'), ...monthly.map((name) => join(directory, name)), join(directory, 'delivery.md')];
}
