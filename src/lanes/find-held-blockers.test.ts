import { expect, test } from 'bun:test';
import { findHeldBlockers } from './find-held-blockers.ts';

function setupTest() {
  const description =
    '## Outcome\n\nThe kettle boils.\n\n## Context\n\n- Project: kitchen\n\n## Scope\n\nIn: the element.\nOut: none stated.\n\n## Acceptance\n\n- [ ] The kettle boils in a test (unit test)\n\n## Actions\n\nCode delivery\n';
  return {
    issue: { description, labels: ['Feature'], blockerStates: [], moreRelations: false },
    doneOpen: new Map([['GEO-9871', '2026-10-13T01:00:00Z']]),
    started: [{ identifier: 'GEO-9871', state: 'started' }],
  };
}

test('it names the done-but-open blockers that alone hold an otherwise promotable issue', () => {
  const app = setupTest();

  expect(findHeldBlockers(app.issue, [{ identifier: 'GEO-9870', state: 'completed' }, ...app.started], app.doneOpen)).toStrictEqual([{ identifier: 'GEO-9871', lastMergedAt: '2026-10-13T01:00:00Z' }]);
});

test('it gives no held blockers when every blocker is completed', () => {
  const app = setupTest();

  expect(findHeldBlockers(app.issue, [{ identifier: 'GEO-9870', state: 'completed' }], app.doneOpen)).toBeNull();
});

test('it gives no held blockers when another blocker is not done', () => {
  const app = setupTest();

  expect(findHeldBlockers(app.issue, [...app.started, { identifier: 'GEO-9872', state: 'started' }], app.doneOpen)).toBeNull();
});

test('it gives no held blockers when the issue is parked, needs design, has unread relations or lacks sections', () => {
  const app = setupTest();
  const reasons = [{ labels: ['parked'] }, { labels: ['needs-design'] }, { moreRelations: true }, { description: '## Outcome\n\nTBD\n' }];

  expect(reasons.map((reason) => findHeldBlockers({ ...app.issue, ...reason }, app.started, app.doneOpen))).toStrictEqual([null, null, null, null]);
});
