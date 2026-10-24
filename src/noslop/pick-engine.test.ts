import { expect, test } from 'bun:test';
import type { Engine } from './pick-engine.ts';
import { pickEngine } from './pick-engine.ts';

test.each<[string, { listed: boolean; pinned: string | null }, Engine]>([
  ['an unlisted repo', { listed: false, pinned: 'abc1234' }, 'codex'],
  ['an unlisted repo with no pin', { listed: false, pinned: null }, 'codex'],
  ['a listed repo', { listed: true, pinned: 'abc1234' }, 'noslop'],
])('it picks the engine for %s', (_label, input, engine) => {
  expect(pickEngine({ repo: 'widgets', ...input })).toBe(engine);
});

test('it refuses noslop for a listed repo with no pinned commit', () => {
  expect(() => pickEngine({ repo: 'widgets', listed: true, pinned: null })).toThrow('noslop is on for widgets but no commit is pinned: hq noslop pin <sha>');
});
