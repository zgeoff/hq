import { expect, test } from 'bun:test';
import { isSkillProse } from './is-skill-prose.ts';

test("it counts a skill's SKILL.md and references in every skills folder, and nothing else", () => {
  const paths = [
    'skills/kettle/SKILL.md',
    'skills/kettle/references/descaling.md',
    '.claude/skills/kettle/SKILL.md',
    '.agents/skills/kettle/references/deep/steam.md',
    'sync/skills/kettle/SKILL.md',
    'skills/kettle/scripts/boil.sh',
    'skills/kettle/testdata/SKILL.md',
    'skills/SKILL.md',
    'docs/kettle/SKILL.md',
    'src/skills.ts',
  ];

  expect(paths.map((path) => isSkillProse(path))).toStrictEqual([true, true, true, true, true, false, false, false, false, false]);
});
