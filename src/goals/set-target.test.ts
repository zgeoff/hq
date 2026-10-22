import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { at, freshDb } from '../../test/helpers.ts';
import { DEFAULT_TARGETS } from './default-targets.ts';
import { goalTargets } from './goal-targets.ts';
import { setTarget } from './set-target.ts';

let db: Database;
let cleanup: () => void;
beforeEach(() => {
  ({ db, cleanup } = freshDb());
  at('2026-10-16T01:00:00Z');
});
afterEach(() => cleanup());

test('an override moves the value and keeps the deadline and the detection limit', () => {
  setTarget(db, 'bugs', '<=', '15', 'z-stu');
  setTarget(db, 'downtime', '<', '10', 'z-stu');
  const { targets, overridden } = goalTargets(db);
  expect(targets.bugs).toEqual({ op: '<=', value: 15, until: '2026-11-02' });
  expect(targets.downtime).toEqual({ op: '<', value: 10, detectMax: 5 });
  expect(targets.features).toEqual(DEFAULT_TARGETS.features);
  expect(overridden).toEqual(['bugs', 'downtime']);
});

test('none clears a target, and a cost target can be set', () => {
  setTarget(db, 'ciwaste', 'none', undefined, 'z-stu');
  expect(goalTargets(db).targets.ciwaste).toBeNull();
  setTarget(db, 'cost', '<', '80', 'z-stu');
  expect(goalTargets(db).targets.cost).toEqual({ op: '<', value: 80 });
  setTarget(db, 'cost', 'none', undefined, 'z-stu');
  expect(goalTargets(db).targets.cost).toBeNull();
});

test('a cleared target set again gets its deadline and detection limit back from the default', () => {
  setTarget(db, 'downtime', 'none', undefined, 'z-stu');
  setTarget(db, 'downtime', '<', '20', 'z-stu');
  expect(goalTargets(db).targets.downtime).toEqual({ op: '<', value: 20, detectMax: 5 });
  setTarget(db, 'bugs', 'none', undefined, 'z-stu');
  setTarget(db, 'bugs', '<', '25', 'z-stu');
  expect(goalTargets(db).targets.bugs).toEqual({ op: '<', value: 25, until: '2026-11-02' });
});

test('every change logs an event with the old and the new target', () => {
  setTarget(db, 'features', '>=', '65', 'z-stu');
  setTarget(db, 'features', 'none', undefined, 'z-stu');
  expect(db.query("SELECT actor, from_state, to_state FROM events WHERE subject = 'hq' AND subject_id = 'goals' AND action = 'target' ORDER BY seq").all()).toEqual([
    { actor: 'z-stu', from_state: '>=60', to_state: '>=65' },
    { actor: 'z-stu', from_state: '>=65', to_state: 'none' },
  ]);
});

// Input the command must refuse: [key, op, value, why].
const HOSTILE: [string, string, string | undefined, string][] = [
  ['moon', '<', '5', 'unknown goal'],
  ['', '<', '5', 'unknown goal'],
  ['__proto__', '<', '5', 'unknown goal'],
  ['constructor', '<', '5', 'unknown goal'],
  ['bugs; DROP TABLE meta', '<', '5', 'unknown goal'],
  ['bugs', '=', '5', 'operator must be one of'],
  ['bugs', '<>', '5', 'operator must be one of'],
  ['bugs', '', '5', 'operator must be one of'],
  ['bugs', 'None', undefined, 'operator must be one of'],
  ['bugs', '<', undefined, 'value must be a number'],
  ['bugs', '<', '', 'value must be a number'],
  ['bugs', '<', '-1', 'value must be a number'],
  ['bugs', '<', '101', 'value must be a number'],
  ['bugs', '<', '1e2', 'value must be a number'],
  ['bugs', '<', 'NaN', 'value must be a number'],
  ['bugs', '<', 'Infinity', 'value must be a number'],
  ['bugs', '<', '0x10', 'value must be a number'],
  ['bugs', '<', '5%', 'value must be a number'],
  ['downtime', '<', '10081', 'value must be a number'],
  ['cost', '<=', '10001', 'value must be a number from 0 to 10000 (US dollars a month of GitHub Actions)'],
  ['cost', '<=', undefined, 'value must be a number from 0 to 10000 (US dollars a month of GitHub Actions)'],
  ['bugs', 'none', '5', 'none takes no value'],
];
test.each(HOSTILE)('hq goals target %p %p %p is refused', (key, op, value, why) => {
  expect(() => setTarget(db, key, op, value, 'z-stu')).toThrow(why);
  expect(goalTargets(db).overridden).toEqual([]);
  expect(db.query("SELECT COUNT(*) AS n FROM events WHERE action = 'target'").get()).toEqual({ n: 0 });
});

test('it takes a cost target in dollars a month, over 100', () => {
  expect(setTarget(db, 'cost', '<=', '250', 'z-stu')).toStrictEqual({ op: '<=', value: 250 });
});

test('downtime takes minutes up to a week, other goals up to 100', () => {
  expect(() => setTarget(db, 'downtime', '<', '10080', 'z-stu')).not.toThrow();
  expect(() => setTarget(db, 'bugs', '<', '100', 'z-stu')).not.toThrow();
  expect(() => setTarget(db, 'bugs', '>', '0.5', 'z-stu')).not.toThrow();
});
