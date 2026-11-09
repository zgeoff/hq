import { expect, test } from 'bun:test';
import { isNixSkillBranch } from './is-nix-skill-branch.ts';

test.each([
  { name: 'her skill branch', owner: 'zgeoff', repo: 'nixie-definitions', headRefName: 'nixie/skill/descale', isCrossRepository: false, expected: true },
  { name: 'a branch without the prefix', owner: 'zgeoff', repo: 'nixie-definitions', headRefName: 'feat/descale', isCrossRepository: false, expected: false },
  { name: 'a branch that only contains the prefix', owner: 'zgeoff', repo: 'nixie-definitions', headRefName: 'fix/nixie/skill/descale', isCrossRepository: false, expected: false },
  { name: 'a fork branch with the prefix', owner: 'zgeoff', repo: 'nixie-definitions', headRefName: 'nixie/skill/descale', isCrossRepository: true, expected: false },
  { name: 'another repo', owner: 'zgeoff', repo: 'widgets', headRefName: 'nixie/skill/descale', isCrossRepository: false, expected: false },
  { name: 'another owner', owner: 'kettlecorp', repo: 'nixie-definitions', headRefName: 'nixie/skill/descale', isCrossRepository: false, expected: false },
])('it decides $name is a Nix skill branch: $expected', (row) => {
  expect(isNixSkillBranch({ owner: row.owner, repo: row.repo, headRefName: row.headRefName, isCrossRepository: row.isCrossRepository })).toBe(row.expected);
});
