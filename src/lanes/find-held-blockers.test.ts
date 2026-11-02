import { expect, test } from 'bun:test';
import { buildKettleIssueText } from '../../test/build-kettle-issue-text.ts';
import { findHeldBlockers } from './find-held-blockers.ts';

test('it names the done-but-open blockers that alone hold an otherwise promotable issue', () => {
  const issue = { description: buildKettleIssueText(), labels: ['Feature'], blockerStates: [], moreRelations: false };
  const blockers = [
    { identifier: 'GEO-9870', state: 'completed' },
    { identifier: 'GEO-9871', state: 'started' },
  ];

  expect(findHeldBlockers(issue, blockers, new Map([['GEO-9871', '2026-10-13T01:00:00Z']]))).toStrictEqual([{ identifier: 'GEO-9871', lastMergedAt: '2026-10-13T01:00:00Z' }]);
});

test('it gives no held blockers when every blocker is completed', () => {
  const issue = { description: buildKettleIssueText(), labels: ['Feature'], blockerStates: [], moreRelations: false };

  expect(findHeldBlockers(issue, [{ identifier: 'GEO-9870', state: 'completed' }], new Map([['GEO-9871', '2026-10-13T01:00:00Z']]))).toBeNull();
});

test('it gives no held blockers when another blocker is not done', () => {
  const issue = { description: buildKettleIssueText(), labels: ['Feature'], blockerStates: [], moreRelations: false };
  const blockers = [
    { identifier: 'GEO-9871', state: 'started' },
    { identifier: 'GEO-9872', state: 'started' },
  ];

  expect(findHeldBlockers(issue, blockers, new Map([['GEO-9871', '2026-10-13T01:00:00Z']]))).toBeNull();
});

test.each([
  { name: 'is parked', labels: ['parked'], moreRelations: false, description: buildKettleIssueText() },
  { name: 'needs design', labels: ['needs-design'], moreRelations: false, description: buildKettleIssueText() },
  { name: 'has unread relations', labels: ['Feature'], moreRelations: true, description: buildKettleIssueText() },
  { name: 'lacks sections', labels: ['Feature'], moreRelations: false, description: '## Outcome\n\nTBD\n' },
])('it gives no held blockers when the issue $name', (row) => {
  const issue = { description: row.description, labels: [...row.labels], blockerStates: [], moreRelations: row.moreRelations };

  expect(findHeldBlockers(issue, [{ identifier: 'GEO-9871', state: 'started' }], new Map([['GEO-9871', '2026-10-13T01:00:00Z']]))).toBeNull();
});
