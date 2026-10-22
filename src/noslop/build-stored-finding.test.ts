import { expect, test } from 'bun:test';
import { buildStoredFinding } from './build-stored-finding.ts';

test('it keeps the taste rule a recorded finding cites', () => {
  expect(
    buildStoredFinding({ id: 'aaaa', lens: 'taste', severity: 'low', title: 'Spout drips', criterion: 'taste-rule', rule: 'spout-pours-clean', anchor: { path: 'src/kettle.ts', startLine: 4, endLine: 9 }, writtenByChange: true, late: false }),
  ).toStrictEqual({ id: 'aaaa', lens: 'taste', severity: 'low', title: 'Spout drips', criterion: 'taste-rule', rule: 'spout-pours-clean', path: 'src/kettle.ts', startLine: 4, endLine: 9, writtenByChange: true, late: false });
});

test('it stores null for each detail a recorded finding does not report', () => {
  expect(buildStoredFinding({ id: 'bbbb', lens: 'style', severity: 'low', title: 'Lid is loose' })).toStrictEqual({ id: 'bbbb', lens: 'style', severity: 'low', title: 'Lid is loose', criterion: null, rule: null, path: null, startLine: null, endLine: null, writtenByChange: null, late: null });
});
