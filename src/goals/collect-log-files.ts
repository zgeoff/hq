import { join } from 'node:path';

export function collectLogFiles(directory: string, names: string[]): string[] {
  const monthly = names.filter((name) => /^delivery-archive-\d{4}-\d{2}\.md$/u.test(name)).toSorted();
  return [join(directory, 'delivery-archive.md'), ...monthly.map((name) => join(directory, name)), join(directory, 'delivery.md')];
}
