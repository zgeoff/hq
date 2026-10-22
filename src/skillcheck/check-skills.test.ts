import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HELP } from '../cli.ts';
import { checkSkills } from './check-skills.ts';

test('it passes a skill that writes hq open with a word-like id', () => {
  const root = mkdtempSync(join(tmpdir(), 'hq-skillcheck-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'skills', 'kettle'), { recursive: true });
  writeFileSync(join(root, 'skills', 'kettle', 'SKILL.md'), 'Open the next call: `hq open kettle-12`.\n');

  expect(checkSkills(root, HELP)).toStrictEqual({ uses: 1, problems: [] });
});
