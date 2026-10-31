import { join } from 'node:path';

// The delivery log, its old archive, and every monthly archive that hq state trim writes, from the
// names in the state folder.
export function collectLogFiles(directory: string, names: string[]): string[] {
  const monthly = names.filter((name) => /^delivery-archive-\d{4}-\d{2}\.md$/u.test(name)).toSorted();
  return [join(directory, 'delivery-archive.md'), ...monthly.map((name) => join(directory, name)), join(directory, 'delivery.md')];
}
