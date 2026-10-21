import { expect, test } from 'bun:test';
import { countChurn } from './count-churn.ts';

test('it counts no repeat-class when a later finding cites another taste rule under the same criterion', () => {
  expect(
    countChurn([
      { counted: true, findings: [{ id: 'aaaa', lens: 'taste', severity: 'low', title: 'Spout drips', criterion: 'taste-rule', rule: 'spout-pours-clean' }] },
      { counted: true, findings: [{ id: 'bbbb', lens: 'taste', severity: 'low', title: 'Handle is hot', criterion: 'taste-rule', rule: 'handle-stays-cool' }] },
    ]).repeatClass,
  ).toBe(0);
});

test('it counts a repeat-class when a later finding cites the same taste rule', () => {
  expect(
    countChurn([
      { counted: true, findings: [{ id: 'aaaa', lens: 'taste', severity: 'low', title: 'Spout drips', criterion: 'taste-rule', rule: 'spout-pours-clean' }] },
      { counted: true, findings: [{ id: 'bbbb', lens: 'taste', severity: 'low', title: 'Spout dribbles', criterion: 'taste-rule', rule: 'spout-pours-clean' }] },
    ]).repeatClass,
  ).toBe(1);
});

test('it counts no repeat-class when a later finding cites the same criterion under another lens', () => {
  expect(
    countChurn([
      { counted: true, findings: [{ id: 'aaaa', lens: 'correctness', severity: 'high', title: 'Kettle never boils', criterion: 'boil-check' }] },
      { counted: true, findings: [{ id: 'bbbb', lens: 'style', severity: 'low', title: 'Boil light is dim', criterion: 'boil-check' }] },
    ]).repeatClass,
  ).toBe(0);
});

test('it counts a later finding with no criterion and no rule as class unknown', () => {
  expect(
    countChurn([
      { counted: true, findings: [{ id: 'aaaa', lens: 'taste', severity: 'low', title: 'Spout drips', criterion: 'taste-rule', rule: 'spout-pours-clean' }] },
      { counted: true, findings: [{ id: 'bbbb', lens: 'taste', severity: 'low', title: 'Lid is loose', criterion: null, rule: null }] },
    ]),
  ).toStrictEqual({ roundsWithNew: 2, repeatClass: 0, classUnknown: 1, late: { n: 0, of: 0 }, lateUnknown: 1, mainMerge: 0, mergeUnknown: 2 });
});

test('it counts no repeat-class and no unknown when a later finding shares a lens and criterion but cites no rule', () => {
  expect(
    countChurn([
      { counted: true, findings: [{ id: 'aaaa', lens: 'tests', severity: 'medium', title: 'No test for the boil timer', criterion: 'untested-change', rule: null }] },
      { counted: true, findings: [{ id: 'bbbb', lens: 'tests', severity: 'medium', title: 'No test for the lid latch', criterion: 'untested-change', rule: null }] },
    ]),
  ).toMatchObject({ repeatClass: 0, classUnknown: 0 });
});
