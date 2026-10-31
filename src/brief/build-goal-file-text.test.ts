import { expect, test } from 'bun:test';
import { buildGoalFileText } from './build-goal-file-text.ts';

test('it gives the issue sections whole, then the playbook after a rule', () => {
  expect(buildGoalFileText('GEO-9001', [{ name: 'Outcome', text: '## Outcome\n\nBoil.' }, { name: 'Context', text: '## Context\n\nLeaky.' }], '# Bug playbook\n\nReproduce first.\n')).toBe(
    '# GEO-9001\n\n## Outcome\n\nBoil.\n\n## Context\n\nLeaky.\n\n---\n\n# Bug playbook\n\nReproduce first.\n',
  );
});

test('it gives the issue alone when there is no playbook', () => {
  expect(buildGoalFileText('GEO-9001', [{ name: 'Outcome', text: '## Outcome\n\nBoil.' }], null)).toBe('# GEO-9001\n\n## Outcome\n\nBoil.\n');
});
