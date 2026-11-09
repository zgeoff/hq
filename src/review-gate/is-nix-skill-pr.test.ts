import { expect, test } from 'bun:test';
import { isNixSkillPR } from './is-nix-skill-pr.ts';

test.each([
  { name: 'a skill-only PR on her branch', owner: 'zgeoff', repo: 'nixie-definitions', headRefName: 'nixie/skill/descale', files: ['skills/kettle/SKILL.md', 'skills/kettle/references/steam.md'], expected: true },
  { name: 'a PR that also changes persona.md', owner: 'zgeoff', repo: 'nixie-definitions', headRefName: 'nixie/skill/descale', files: ['skills/kettle/SKILL.md', 'persona.md'], expected: false },
  { name: 'a PR that also changes nixie.yaml', owner: 'zgeoff', repo: 'nixie-definitions', headRefName: 'nixie/skill/descale', files: ['nixie.yaml', 'skills/kettle/SKILL.md'], expected: false },
  { name: 'a branch without the prefix', owner: 'zgeoff', repo: 'nixie-definitions', headRefName: 'feat/descale', files: ['skills/kettle/SKILL.md'], expected: false },
  { name: 'a branch that only contains the prefix', owner: 'zgeoff', repo: 'nixie-definitions', headRefName: 'fix/nixie/skill/descale', files: ['skills/kettle/SKILL.md'], expected: false },
  { name: 'another repo', owner: 'zgeoff', repo: 'widgets', headRefName: 'nixie/skill/descale', files: ['skills/kettle/SKILL.md'], expected: false },
  { name: 'another owner', owner: 'kettlecorp', repo: 'nixie-definitions', headRefName: 'nixie/skill/descale', files: ['skills/kettle/SKILL.md'], expected: false },
  { name: 'an empty file list', owner: 'zgeoff', repo: 'nixie-definitions', headRefName: 'nixie/skill/descale', files: [], expected: false },
])('it decides $name is Nix skill PR: $expected', (row) => {
  expect(isNixSkillPR({ owner: row.owner, repo: row.repo, headRefName: row.headRefName, files: row.files })).toBe(row.expected);
});
