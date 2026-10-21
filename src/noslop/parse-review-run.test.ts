import { expect, test } from 'bun:test';
import { parseReviewRun } from './parse-review-run.ts';

test('it keeps the criterion, the anchor and the written-by-change flag of a finding', () => {
  const stdout = JSON.stringify({
    version: 6,
    head: 'h1',
    base: 'main',
    depth: 'standard',
    findings: [{ id: 'aaaa', lens: 'correctness', severity: 'high', title: 'Kettle never boils', criterion: 'boil-check', anchor: { path: 'src/kettle.ts', startLine: 4, endLine: 9 }, writtenByChange: true }],
    failedCalls: [],
    notReviewed: [],
  });

  expect(parseReviewRun(0, stdout, '', 1000).value?.findings).toStrictEqual([{ id: 'aaaa', lens: 'correctness', severity: 'high', title: 'Kettle never boils', criterion: 'boil-check', anchor: { path: 'src/kettle.ts', startLine: 4, endLine: 9 }, writtenByChange: true }]);
});

test('it keeps the taste rule a finding cites', () => {
  const stdout = JSON.stringify({
    version: 6,
    head: 'h1',
    base: 'main',
    depth: 'standard',
    findings: [{ id: 'aaaa', lens: 'taste', severity: 'low', title: 'Spout drips', criterion: 'taste-rule', rule: 'spout-pours-clean', anchor: { path: 'src/kettle.ts', startLine: 4, endLine: 9 }, writtenByChange: true }],
    failedCalls: [],
    notReviewed: [],
  });

  expect(parseReviewRun(0, stdout, '', 1000).value?.findings).toStrictEqual([{ id: 'aaaa', lens: 'taste', severity: 'low', title: 'Spout drips', criterion: 'taste-rule', rule: 'spout-pours-clean', anchor: { path: 'src/kettle.ts', startLine: 4, endLine: 9 }, writtenByChange: true }]);
});

test('it reads a finding that has none of the three fields', () => {
  const stdout = JSON.stringify({ version: 4, head: 'h1', base: 'main', depth: 'standard', findings: [{ id: 'aaaa', lens: 'style', severity: 'low', title: 'Lid is loose' }], failedCalls: [] });

  expect(parseReviewRun(0, stdout, '', 1000).value?.findings).toStrictEqual([{ id: 'aaaa', lens: 'style', severity: 'low', title: 'Lid is loose' }]);
});

test('it rejects an anchor that has no end line', () => {
  const stdout = JSON.stringify({ version: 4, head: 'h1', base: 'main', depth: 'standard', findings: [{ id: 'aaaa', lens: 'style', severity: 'low', title: 'Lid is loose', anchor: { path: 'a.ts', startLine: 1 } }], failedCalls: [] });

  expect(parseReviewRun(0, stdout, '', 1000).why).toContain('findings.0.anchor.endLine');
});

test('it reads a version 7 result with its fix checks, and tolerates the keys it does not use', () => {
  const stdout = JSON.stringify({ version: 7, head: 'h1', base: 'main', depth: 'standard', findings: [], failedCalls: [], notReviewed: [], notReviewedByLens: [{ lens: 'style', path: 'a.ts', reason: 'data' }], fixChecks: [{ findingID: '00112233445566aa', fixed: false, reason: 'the lid still leaks' }] });

  expect(parseReviewRun(0, stdout, '', 1000).value?.fixChecks).toStrictEqual([{ findingID: '00112233445566aa', fixed: false, reason: 'the lid still leaks' }]);
});

test('it gives an empty list of fix checks for a version 7 result that has none', () => {
  const stdout = JSON.stringify({ version: 7, head: 'h1', base: 'main', depth: 'standard', findings: [], failedCalls: [], notReviewed: [], notReviewedByLens: [] });

  expect(parseReviewRun(0, stdout, '', 1000).value?.fixChecks).toStrictEqual([]);
});

test('it rejects a fix check with no reason', () => {
  const stdout = JSON.stringify({ version: 7, head: 'h1', base: 'main', depth: 'standard', findings: [], failedCalls: [], notReviewed: [], fixChecks: [{ findingID: '00112233445566aa', fixed: true }] });

  expect(parseReviewRun(0, stdout, '', 1000).why).toContain('fixChecks.0.reason');
});

test('it rejects version 8, and names the versions it reads', () => {
  expect(parseReviewRun(0, JSON.stringify({ version: 8 }), '', 1000).why).toBe('output version 8, hq reads versions 4, 5, 6 and 7');
});
