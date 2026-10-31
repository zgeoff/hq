import { expect, test } from 'bun:test';
import { parseIssueActions } from './parse-issue-actions.ts';

test('it names the action of each line of the Actions section, before its colon', () => {
  const actions = parseIssueActions([{ name: 'Actions', text: '## Actions\n\nCode delivery\nDeploy: kettle-prod, after CI passes on main\n' }]);

  expect(actions).toStrictEqual(['Code delivery', 'Deploy']);
});

test('it names the action before a comma that adds its detail', () => {
  const actions = parseIssueActions([{ name: 'Actions', text: '## Actions\n\nCode delivery, in zgeoff/kettle.\nDesign session, then the decision record as a Linear document\n' }]);

  expect(actions).toStrictEqual(['Code delivery', 'Design session']);
});

test('it strips list marks, backticks and a closing full stop', () => {
  const actions = parseIssueActions([{ name: 'Actions', text: '## Actions\n\n- `Code delivery`\n* Infra: the kettle stack\n1. Post.\n' }]);

  expect(actions).toStrictEqual(['Code delivery', 'Infra', 'Post']);
});

test('it finds the section whatever its case, and gives nothing when there is none', () => {
  expect(parseIssueActions([{ name: 'ACTIONS', text: '## ACTIONS\n\nData: kettle db' }])).toStrictEqual(['Data']);
  expect(parseIssueActions([{ name: 'Outcome', text: '## Outcome\n\nBoil.' }])).toStrictEqual([]);
});
