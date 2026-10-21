import { readOldestContaining } from './read-oldest-containing.ts';
import type { Release } from './types.ts';

export async function readPackageRelease(list: Release[], prefixes: string[], contains: (tag: string) => Promise<boolean | 'cap'>): Promise<Release | null | 'cap'> {
  let latest: Release | null = null;
  for (const prefix of prefixes) {
    const found = await readOldestContaining(
      list.filter((release) => release.tag.startsWith(prefix)),
      contains,
    );
    if (found === 'cap' || found === null) {
      return found;
    }
    if (!latest || Date.parse(found.at ?? '') > Date.parse(latest.at ?? '')) {
      latest = found;
    }
  }
  return latest;
}
