import { expect, test } from 'bun:test';
import { buildKettleIssueText } from './build-kettle-issue-text.ts';

test('it builds a description with the six sections of a ready issue', () => {
  expect(buildKettleIssueText()).toBe(
    '## Outcome\n\nA kettle that boils.\n\n## Context\n\nIt leaks at the lid.\n\n## Scope\n\nIn: the lid.\nOut: none stated.\n\n## Acceptance\n\n- [ ] it boils\n\n## Actions\n\nCode delivery\n\n## Agent notes\n\nMind the seal.\n',
  );
});

test('it replaces the body of each part it is given', () => {
  const text = buildKettleIssueText({ context: 'C', scope: 'S', actions: 'Deploy: x' });

  expect(text).toContain('## Context\n\nC\n\n## Scope\n\nS\n\n');
  expect(text).toContain('## Actions\n\nDeploy: x\n\n');
});
