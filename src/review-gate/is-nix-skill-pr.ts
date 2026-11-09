import { isNixSkillBranch } from './is-nix-skill-branch.ts';
import type { NixSkillBranchFacts } from './is-nix-skill-branch.ts';

const SKILLS_DIR = 'skills/';

export interface NixSkillPRFacts extends NixSkillBranchFacts {
  files: readonly string[];
}

export function isNixSkillPR(facts: NixSkillPRFacts): boolean {
  return isNixSkillBranch(facts) && facts.files.length > 0 && facts.files.every((file) => file.startsWith(SKILLS_DIR));
}
