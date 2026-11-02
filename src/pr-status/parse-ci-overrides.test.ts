import { expect, test } from 'bun:test';
import { parseCIOverrides } from './parse-ci-overrides.ts';

test('it reads a CI check override row and skips an open-findings override', () => {
  const rows = [
    { seq: 1, at: '2026-10-14T01:00:00Z', data: JSON.stringify({ head: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', source: 'chat:kettle-1', note: 'Findings.', scope: 'open-findings' }) },
    { seq: 2, at: '2026-10-14T01:05:00Z', data: JSON.stringify({ head: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', source: 'chat:kettle-2', note: 'An intended infra change.', scope: 'ci-check', check: 'preview' }) },
  ];

  expect(parseCIOverrides(rows)).toStrictEqual([{ seq: 2, at: '2026-10-14T01:05:00Z', head: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', source: 'chat:kettle-2', note: 'An intended infra change.', check: 'preview' }]);
});

test('it skips a CI check override whose source is not an answer source', () => {
  const rows = [{ seq: 1, at: '2026-10-14T01:00:00Z', data: JSON.stringify({ head: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', source: 'kettle said so', note: 'Ship it.', scope: 'ci-check', check: 'preview' }) }];

  expect(parseCIOverrides(rows)).toStrictEqual([]);
});

test.each([
  ['text that is not JSON', '{'],
  ['JSON with no head', JSON.stringify({ source: 'chat:kettle-9', note: 'Ship it.', scope: 'ci-check', check: 'lint' })],
  ['a CI check override with no check', JSON.stringify({ head: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', source: 'chat:kettle-9', note: 'Ship it.', scope: 'ci-check' })],
  ['a CI check override with an empty check', JSON.stringify({ head: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', source: 'chat:kettle-9', note: 'Ship it.', scope: 'ci-check', check: '' })],
])('it voids every CI override when a later row holds %s', (_case, data) => {
  const rows = [
    { seq: 1, at: '2026-10-14T01:00:00Z', data: JSON.stringify({ head: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', source: 'chat:kettle-1', note: 'An intended infra change.', scope: 'ci-check', check: 'preview' }) },
    { seq: 2, at: '2026-10-14T01:05:00Z', data },
  ];

  expect(parseCIOverrides(rows)).toStrictEqual([]);
});
