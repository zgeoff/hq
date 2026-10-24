import { expect, test } from 'bun:test';
import { buildFocusKey } from './build-focus-key.ts';

test('it gives no focus and a focus with no terms the same key', () => {
  const empty = { terms: [], reserves: [], setAt: '2026-10-14T01:00:00Z', setBy: 'kettle-owner' };

  expect(buildFocusKey(empty)).toBe(buildFocusKey(null));
});

test('it keeps the key when only the reserves or who set the focus change', () => {
  const terms = [{ text: 'bug', filters: [{ kind: 'type' as const, value: 'bug' as const }] }];
  const before = { terms, reserves: [], setAt: '2026-10-14T01:00:00Z', setBy: 'kettle-owner' };
  const after = { terms, reserves: [{ area: 'atc', slots: 1 }], setAt: '2026-10-14T02:00:00Z', setBy: 'teapot-owner' };

  expect(buildFocusKey(after)).toBe(buildFocusKey(before));
});

test('it changes the key when the terms change order', () => {
  const bug = { text: 'bug', filters: [{ kind: 'type' as const, value: 'bug' as const }] };
  const atc = { text: 'atc', filters: [{ kind: 'area' as const, value: 'atc' }] };
  const first = { terms: [bug, atc], reserves: [], setAt: '2026-10-14T01:00:00Z', setBy: 'kettle-owner' };
  const second = { terms: [atc, bug], reserves: [], setAt: '2026-10-14T01:00:00Z', setBy: 'kettle-owner' };

  expect([buildFocusKey(first), buildFocusKey(second)]).toStrictEqual(['["bug","atc"]', '["atc","bug"]']);
});
