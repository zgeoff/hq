import { expect, onTestFinished, test } from 'bun:test';
import { at, freshDb } from '../../test/helpers.ts';
import { setMeta } from '../db/set-meta.ts';
import { DEFAULT_TARGETS } from './default-targets.ts';
import { GOAL_KEYS } from './goal-keys.ts';
import { goalTargets } from './goal-targets.ts';
import { targetLine } from './target-line.ts';

function setupTest() {
  const base = freshDb();
  onTestFinished(base.cleanup);
  at('2026-10-16T01:00:00Z');
  return { db: base.db };
}

test('the defaults are the agreed targets, and nothing is overridden', () => {
  const ctx = setupTest();
  expect(goalTargets(ctx.db)).toStrictEqual({ targets: DEFAULT_TARGETS, overridden: [] });
  expect(GOAL_KEYS).toHaveLength(7);
  expect(targetLine('bugs', DEFAULT_TARGETS.bugs)).toBe('<20% by 2 Nov');
  expect(targetLine('downtime', DEFAULT_TARGETS.downtime)).toBe('<15 min a week, each outage caught within 5 min');
  expect(targetLine('cost', DEFAULT_TARGETS.cost)).toBe('<=$50 a month on Actions');
  expect(targetLine('cost', null)).toBe('none yet');
});

test('unreadable stored targets fall back to the defaults', () => {
  const ctx = setupTest();
  setMeta(ctx.db, 'goal_targets', '{not json');
  expect(goalTargets(ctx.db).targets).toStrictEqual(DEFAULT_TARGETS);
  setMeta(ctx.db, 'goal_targets', JSON.stringify({ bugs: { op: 'DROP', value: 1 }, deploys: 'x', features: { op: '>', value: 70 } }));
  const stored = goalTargets(ctx.db);
  expect(stored.targets.bugs).toStrictEqual(DEFAULT_TARGETS.bugs);
  expect(stored.targets.features).toStrictEqual({ op: '>', value: 70 });
  expect(stored.overridden).toStrictEqual(['features']);
});

test.each([
  { name: 'a value that is not a number', target: { op: '<', value: 'high' } },
  { name: 'an until that is not text', target: { op: '>', value: 70, until: 4 } },
])('it falls back to the default for a stored target with $name', ({ target }) => {
  const ctx = setupTest();
  setMeta(ctx.db, 'goal_targets', JSON.stringify({ features: target }));

  const stored = goalTargets(ctx.db);

  expect(stored).toStrictEqual({ targets: DEFAULT_TARGETS, overridden: [] });
});

test('it falls back to the defaults for a stored list of targets', () => {
  const ctx = setupTest();
  setMeta(ctx.db, 'goal_targets', '[1, 2]');

  expect(goalTargets(ctx.db)).toStrictEqual({ targets: DEFAULT_TARGETS, overridden: [] });
});
