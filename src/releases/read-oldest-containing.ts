import { ok } from 'node:assert/strict';
import type { Release } from './types.ts';

// A binary search assumes a linear release history, so the releases holding the merge are a prefix
// of the newest-first list: a patch release cut later from an older line could hide an older tag.
export async function readOldestContaining(list: Release[], contains: (tag: string) => Promise<boolean | 'cap'>): Promise<Release | null | 'cap'> {
  let low = 0;
  let high = list.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const release = list[middle];
    ok(release, 'the search index stays inside the list');
    const contained = await contains(release.tag);
    if (contained === 'cap') {
      return 'cap';
    }
    if (contained) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return list[low - 1] ?? null;
}
