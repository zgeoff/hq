import { OWNER } from '../releases/owner.ts';

const NIX_REPO = 'nixie-definitions';
const NIX_SKILL_BRANCH = 'nixie/skill/';

export interface NixSkillBranchFacts {
  owner: string;
  repo: string;
  headRefName: string;
  isCrossRepository: boolean;
}

export function isNixSkillBranch(facts: NixSkillBranchFacts): boolean {
  return facts.owner === OWNER && facts.repo === NIX_REPO && !facts.isCrossRepository && facts.headRefName.startsWith(NIX_SKILL_BRANCH);
}
