import { expect, test } from 'bun:test';
import { buildGoalPointer } from './build-goal-pointer.ts';

test('it points a default brief at the playbook alone', () => {
  expect(buildGoalPointer({ issue: 'GEO-9001', playbook: { type: 'bug', path: 'agent-kit/playbooks/bug.md', command: "gh api 'x'" }, byLink: false, goalFile: null })).toBe(". First read the bug playbook: gh api 'x'");
});

test('it points a brief with no playbook at nothing', () => {
  expect(buildGoalPointer({ issue: 'GEO-9001', playbook: null, byLink: false, goalFile: null })).toBe('');
});

test('it points a link brief at the issue, then the playbook', () => {
  expect(buildGoalPointer({ issue: 'GEO-9001', playbook: { type: 'bug', path: 'agent-kit/playbooks/bug.md', command: "gh api 'x'" }, byLink: true, goalFile: null })).toBe(". First read GEO-9001 with your own Linear access, then the bug playbook: gh api 'x'");
  expect(buildGoalPointer({ issue: 'GEO-9001', playbook: null, byLink: true, goalFile: null })).toBe('. First read GEO-9001 with your own Linear access.');
});

test('it points a goal-file brief at the file', () => {
  expect(buildGoalPointer({ issue: 'GEO-9001', playbook: { type: 'bug', path: 'agent-kit/playbooks/bug.md', command: "gh api 'x'" }, byLink: false, goalFile: 'kettle-goal.md' })).toBe('. The full issue and its playbook are in kettle-goal.md; read it first.');
  expect(buildGoalPointer({ issue: 'GEO-9001', playbook: null, byLink: false, goalFile: 'kettle-goal.md' })).toBe('. The full issue is in kettle-goal.md; read it first.');
});
