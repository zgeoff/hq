import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeGoalFile } from './write-goal-file.ts';

function setupTest() {
  const root = mkdtempSync(join(tmpdir(), 'hq-brief-write-'));

  onTestFinished(() => rmSync(root, { recursive: true, force: true }));

  return { root };
}

test('it writes the issue sections whole, then the playbook after a rule', () => {
  const ctx = setupTest();

  writeGoalFile(join(ctx.root, 'goal.md'), 'GEO-9001', [{ name: 'Outcome', text: '## Outcome\n\nBoil.' }, { name: 'Context', text: '## Context\n\nLeaky.' }], '# Bug playbook\n\nReproduce first.\n');

  expect(readFileSync(join(ctx.root, 'goal.md'), 'utf8')).toBe('# GEO-9001\n\n## Outcome\n\nBoil.\n\n## Context\n\nLeaky.\n\n---\n\n# Bug playbook\n\nReproduce first.\n');
});

test('it writes the issue alone when there is no playbook, and replaces an older file', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.root, 'goal.md'), 'older text that is longer than the new one will be, to prove the file is replaced');

  writeGoalFile(join(ctx.root, 'goal.md'), 'GEO-9001', [{ name: 'Outcome', text: '## Outcome\n\nBoil.' }], null);

  expect(readFileSync(join(ctx.root, 'goal.md'), 'utf8')).toBe('# GEO-9001\n\n## Outcome\n\nBoil.\n');
});
