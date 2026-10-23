import { expect, test } from 'bun:test';
import { isInstructionFile } from './is-instruction-file.ts';

test.each([
  ['AGENTS.md', true],
  ['packages/kettle/AGENTS.md', true],
  ['skills/kettle/SKILL.md', true],
  ['.claude/skills/kettle/references/descale.md', true],
  ['skills/kettle/scripts/boil.test.ts', false],
  ['skills/kettle/testdata/steam.md', false],
  ['skills/kettle/__tests__/steam.md', false],
  ['src/kettle.ts', false],
  ['docs/AGENTS.md.bak', false],
])('it says %s is an instruction file: %p', (path, expected) => {
  expect(isInstructionFile(path)).toBe(expected);
});
