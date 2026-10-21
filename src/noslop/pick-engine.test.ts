import { expect, test } from 'bun:test';
import type { PriorRounds } from './get-prior-rounds.ts';
import type { Engine } from './pick-engine.ts';
import { pickEngine } from './pick-engine.ts';

test.each<[string, PriorRounds & { listed: boolean; pinned: string | null }, Engine]>([
  ['an unlisted repo', { listed: false, codexBefore: false, noslopBefore: false, pinned: 'abc1234' }, 'codex'],
  ['an unlisted repo with no pin', { listed: false, codexBefore: false, noslopBefore: false, pinned: null }, 'codex'],
  ['an unlisted repo whose PR had a noslop round', { listed: false, codexBefore: false, noslopBefore: true, pinned: 'abc1234' }, 'codex'],
  ['a listed repo with a fresh PR', { listed: true, codexBefore: false, noslopBefore: false, pinned: 'abc1234' }, 'noslop'],
  ['a listed repo whose PR already had a Codex round', { listed: true, codexBefore: true, noslopBefore: false, pinned: 'abc1234' }, 'codex'],
  ['a listed repo whose PR already had a Codex round and no pin', { listed: true, codexBefore: true, noslopBefore: false, pinned: null }, 'codex'],
  ['a listed repo whose PR already had a noslop round', { listed: true, codexBefore: false, noslopBefore: true, pinned: 'abc1234' }, 'noslop'],
  ['a listed repo whose PR had both rounds', { listed: true, codexBefore: true, noslopBefore: true, pinned: 'abc1234' }, 'noslop'],
])('it picks the engine for %s', (_label, input, engine) => {
  expect(pickEngine({ repo: 'widgets', ...input })).toBe(engine);
});

test('it refuses noslop for a listed repo with no pinned commit', () => {
  expect(() => pickEngine({ repo: 'widgets', listed: true, codexBefore: false, noslopBefore: false, pinned: null })).toThrow('noslop is on for widgets but no commit is pinned: hq noslop pin <sha>');
});
