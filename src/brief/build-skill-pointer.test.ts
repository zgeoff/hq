import { expect, test } from 'bun:test';
import { buildSkillPointer } from './build-skill-pointer.ts';

test('it points a design brief at the tickets skill, pinned to the sha', () => {
  const sha = 'a'.repeat(40);

  expect(buildSkillPointer('design', sha)).toStrictEqual({
    name: 'tickets',
    path: 'skills/tickets/SKILL.md',
    command: `gh api 'repos/zgeoff/hq/contents/skills/tickets/SKILL.md?ref=${sha}' -H 'Accept: application/vnd.github.raw'`,
  });
});

test('it points a PR-walk brief at the fix-it-here skill, pinned to the sha', () => {
  const sha = 'b'.repeat(40);

  expect(buildSkillPointer('pr-walk', sha)).toStrictEqual({
    name: 'fix-it-here',
    path: 'skills/fix-it-here/SKILL.md',
    command: `gh api 'repos/zgeoff/hq/contents/skills/fix-it-here/SKILL.md?ref=${sha}' -H 'Accept: application/vnd.github.raw'`,
  });
});
