import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { at, freshDb } from '../../test/helpers.ts';
import { setMeta } from '../db/set-meta.ts';
import { DEFAULT_TARGETS } from './default-targets.ts';
import { GOAL_KEYS } from './goal-keys.ts';
import { goalTargets } from './goal-targets.ts';
import { targetLine } from './target-line.ts';

let cleanup: () => void, db: Database;
beforeEach(() => {
  ({ db, cleanup } = freshDb());
  at('2026-10-16T01:00:00Z');
});
afterEach(() => cleanup());

test('the defaults are the agreed targets, and nothing is overridden', () => {
  expect(goalTargets(db)).toEqual({ targets: DEFAULT_TARGETS, overridden: [] });
  expect(GOAL_KEYS).toHaveLength(7);
  expect(targetLine('bugs', DEFAULT_TARGETS.bugs)).toBe('<20% by 2 Nov');
  expect(targetLine('downtime', DEFAULT_TARGETS.downtime)).toBe('<15 min a week, each outage caught within 5 min');
  expect(targetLine('cost', DEFAULT_TARGETS.cost)).toBe('<=$50 a month on Actions');
  expect(targetLine('cost', null)).toBe('none yet');
});

test('unreadable stored targets fall back to the defaults', () => {
  setMeta(db, 'goal_targets', '{not json');
  expect(goalTargets(db).targets).toEqual(DEFAULT_TARGETS);
  setMeta(db, 'goal_targets', JSON.stringify({ bugs: { op: 'DROP', value: 1 }, deploys: 'x', features: { op: '>', value: 70 } }));
  const { targets, overridden } = goalTargets(db);
  expect(targets.bugs).toEqual(DEFAULT_TARGETS.bugs);
  expect(targets.features).toEqual({ op: '>', value: 70 });
  expect(overridden).toEqual(['features']);
});
