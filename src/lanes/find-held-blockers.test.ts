import { expect, test } from 'bun:test';
import { findHeldBlockers } from './find-held-blockers.ts';

const description =
  '## Outcome\n\nThe kettle boils.\n\n## Context\n\n- Project: kitchen\n\n## Scope\n\nIn: the element.\nOut: none stated.\n\n## Acceptance\n\n- [ ] The kettle boils in a test (unit test)\n\n## Actions\n\nCode delivery\n';
const issue = { description, labels: ['Feature'], blockerStates: [], moreRelations: false };
const doneOpen = new Map([['GEO-9871', '2026-10-13T01:00:00Z']]);

test('it names the done-but-open blockers that alone hold an otherwise promotable issue', () => {
  const blockers = [
    { identifier: 'GEO-9870', state: 'completed' },
    { identifier: 'GEO-9871', state: 'started' },
  ];

  expect(findHeldBlockers(issue, blockers, doneOpen)).toStrictEqual([{ identifier: 'GEO-9871', lastMergedAt: '2026-10-13T01:00:00Z' }]);
});

test.each([
  ['every blocker completed', [{ identifier: 'GEO-9870', state: 'completed' }], issue],
  ['another blocker is not done', [{ identifier: 'GEO-9871', state: 'started' }, { identifier: 'GEO-9872', state: 'started' }], issue],
  ['the issue is parked', [{ identifier: 'GEO-9871', state: 'started' }], { ...issue, labels: ['parked'] }],
  ['the issue needs design', [{ identifier: 'GEO-9871', state: 'started' }], { ...issue, labels: ['needs-design'] }],
  ['the issue has more relations than were read', [{ identifier: 'GEO-9871', state: 'started' }], { ...issue, moreRelations: true }],
  ['the description is incomplete', [{ identifier: 'GEO-9871', state: 'started' }], { ...issue, description: '## Outcome\n\nTBD\n' }],
])('it gives no held blockers when %s', (_case, blockers, subject) => {
  expect(findHeldBlockers(subject, blockers, doneOpen)).toBeNull();
});
