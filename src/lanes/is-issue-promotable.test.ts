import { expect, test } from 'bun:test';
import { isIssuePromotable } from './is-issue-promotable.ts';

test('it passes a complete issue whose blockers are completed', () => {
  const description =
    '## Outcome\n\nThe kettle boils.\n\n## Context\n\n- Project: kitchen\n\n## Scope\n\nIn: the element.\nOut: none stated.\n\n## Acceptance\n\n- [ ] The kettle boils in a test (unit test)\n\n## Actions\n\nCode delivery\n';

  const promotable = isIssuePromotable({ description, labels: ['Feature'], blockerStates: ['completed'], moreRelations: false });

  expect(promotable).toBe(true);
});

test('it holds back an issue with a blocker in Todo', () => {
  const description =
    '## Outcome\n\nThe tea pours.\n\n## Context\n\n- Project: kitchen\n\n## Scope\n\nIn: the spout.\nOut: none stated.\n\n## Acceptance\n\n- [ ] The tea pours in a test (unit test)\n\n## Actions\n\nCode delivery\n';

  const promotable = isIssuePromotable({ description, labels: [], blockerStates: ['completed', 'unstarted'], moreRelations: false });

  expect(promotable).toBe(false);
});

test('it holds back a parked issue', () => {
  const description =
    '## Outcome\n\nThe widgets shine.\n\n## Context\n\n- Project: workshop\n\n## Scope\n\nIn: the polish.\nOut: none stated.\n\n## Acceptance\n\n- [ ] The widgets shine in a test (unit test)\n\n## Actions\n\nCode delivery\n';

  const promotable = isIssuePromotable({ description, labels: ['Feature', 'parked'], blockerStates: [], moreRelations: false });

  expect(promotable).toBe(false);
});

test('it holds back an issue with more relations than one page shows', () => {
  const description =
    '## Outcome\n\nThe widgets ship.\n\n## Context\n\n- Project: workshop\n\n## Scope\n\nIn: the crate.\nOut: none stated.\n\n## Acceptance\n\n- [ ] The widgets ship in a test (unit test)\n\n## Actions\n\nCode delivery\n';

  const promotable = isIssuePromotable({ description, labels: [], blockerStates: ['completed'], moreRelations: true });

  expect(promotable).toBe(false);
});

test('it holds back an issue with no Acceptance section', () => {
  const description = '## Outcome\n\nThe widgets stack.\n\n## Context\n\n- Project: workshop\n\n## Scope\n\nIn: the shelf.\nOut: none stated.\n\n## Actions\n\nCode delivery\n';

  const promotable = isIssuePromotable({ description, labels: [], blockerStates: [], moreRelations: false });

  expect(promotable).toBe(false);
});

test('it holds back an issue whose Acceptance holds only a placeholder', () => {
  const description = '## Outcome\n\nThe widgets add up.\n\n## Context\n\n- Project: workshop\n\n## Scope\n\nIn: the tally.\nOut: none stated.\n\n## Acceptance\n\n- [ ] TBD\n\n## Actions\n\nCode delivery\n';

  const promotable = isIssuePromotable({ description, labels: [], blockerStates: [], moreRelations: false });

  expect(promotable).toBe(false);
});

test('it takes Questions to settle in place of Scope', () => {
  const description =
    '## Outcome\n\nThe kettle has a design.\n\n## Context\n\n- Project: kitchen\n\n## Questions to settle\n\n- Which spout?\n\n## Acceptance\n\n- [ ] The design names a spout (review)\n\n## Actions\n\nDesign\n';

  const promotable = isIssuePromotable({ description, labels: [], blockerStates: [], moreRelations: false });

  expect(promotable).toBe(true);
});

test('it holds back an issue whose Scope keeps the empty In and Out fields of the template', () => {
  const description = '## Outcome\n\nThe kettle has a scope.\n\n## Context\n\n- Project: kitchen\n\n## Scope\n\nIn:\nOut:\n\n## Acceptance\n\n- [ ] The kettle boils in a test (unit test)\n\n## Actions\n\nCode delivery\n';

  const promotable = isIssuePromotable({ description, labels: [], blockerStates: [], moreRelations: false });

  expect(promotable).toBe(false);
});

test('it takes In and Out fields whose items sit on the lines below them', () => {
  const description =
    '## Outcome\n\nThe widgets have a list.\n\n## Context\n\n- Project: workshop\n\n## Scope\n\nIn:\n- the element\nOut:\n- the lid\n\n## Acceptance\n\n- [ ] The list holds every widget (unit test)\n\n## Actions\n\nCode delivery\n';

  const promotable = isIssuePromotable({ description, labels: [], blockerStates: [], moreRelations: false });

  expect(promotable).toBe(true);
});
