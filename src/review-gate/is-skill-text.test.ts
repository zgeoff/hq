import { expect, test } from 'bun:test';
import { isSkillText } from './is-skill-text.ts';

test.each([
  ['skills/kettle/SKILL.md', true],
  ['skills/kettle/references/descale.md', true],
  ['.claude/skills/kettle/SKILL.md', true],
  ['skills/readme.md', true],
  ['skills/kettle/scripts/boil.sh', false],
  ['skills/kettle/references/table.json', false],
  ['modules/skills/README.md', false],
  ['modules/skills/src/read-kettle-skill.ts', false],
  ['skills/kettle/testdata/steam.md', false],
  ['skills/kettle/fixtures/steam.md', false],
])('it says whether %s is skill text: %p', (path, expected) => {
  expect(isSkillText(path)).toBe(expected);
});
