import { expect, test } from 'bun:test';
import { restoreTheme } from './restore-theme.ts';
import { writeTheme } from './write-theme.ts';

function buildRoot(): HTMLElement {
  return { dataset: {} } as HTMLElement;
}

function buildStorage(): Storage {
  const kept = new Map<string, string>();
  return { getItem: (key: string) => kept.get(key) ?? null, setItem: (key: string, value: string) => kept.set(key, value) } as unknown as Storage;
}

function readBlockedStorage(): Storage {
  throw new Error('SecurityError: storage is blocked');
}

test('a picked theme comes back on the next page, as a tab change loads one', () => {
  const kept = buildStorage(),
    picked = buildRoot(),
    reloaded = buildRoot();
  writeTheme(picked, () => kept, 'dark');
  restoreTheme(reloaded, () => kept);
  expect([picked.dataset['theme'], reloaded.dataset['theme']]).toStrictEqual(['dark', 'dark']);
});

test('with no theme kept, or storage that refuses, the page follows the system theme and still shows a pick', () => {
  const blocked = buildRoot(),
    fresh = buildRoot(),
    picked = buildRoot();
  restoreTheme(fresh, () => buildStorage());
  restoreTheme(blocked, readBlockedStorage);
  writeTheme(picked, readBlockedStorage, 'light');
  expect([fresh.dataset['theme'], blocked.dataset['theme'], picked.dataset['theme']]).toStrictEqual([undefined, undefined, 'light']);
});
