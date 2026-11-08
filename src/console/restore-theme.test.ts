import { expect, test } from 'bun:test';
import { buildMockStorage } from '../test-utils/build-mock-storage.ts';
import { restoreTheme } from './restore-theme.ts';
import { writeTheme } from './write-theme.ts';

function readBlockedStorage(): Storage {
  throw new Error('SecurityError: storage is blocked');
}

test('a picked theme comes back on the next page, as a tab change loads one', () => {
  const kept = buildMockStorage();
  const picked: Pick<HTMLElement, 'dataset'> = { dataset: {} };
  const reloaded: Pick<HTMLElement, 'dataset'> = { dataset: {} };
  writeTheme(picked, () => kept, 'dark');
  restoreTheme(reloaded, () => kept);
  expect([picked.dataset['theme'], reloaded.dataset['theme']]).toStrictEqual(['dark', 'dark']);
});

test('with no theme kept, or storage that refuses, the page follows the system theme and still shows a pick', () => {
  const blocked: Pick<HTMLElement, 'dataset'> = { dataset: {} };
  const fresh: Pick<HTMLElement, 'dataset'> = { dataset: {} };
  const picked: Pick<HTMLElement, 'dataset'> = { dataset: {} };
  restoreTheme(fresh, () => buildMockStorage());
  restoreTheme(blocked, readBlockedStorage);
  writeTheme(picked, readBlockedStorage, 'light');
  expect([fresh.dataset['theme'], blocked.dataset['theme'], picked.dataset['theme']]).toStrictEqual([undefined, undefined, 'light']);
});
