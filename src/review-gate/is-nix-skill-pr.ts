const NIX_REPO = 'nixie-definitions';
const NIX_SKILL_BRANCH = 'nixie/skill/';
const SKILLS_DIR = 'skills/';

export interface NixSkillPRFacts {
  owner: string;
  repo: string;
  headRefName: string;
  files: readonly string[];
}

// Nix owns her own skills: a PR on her skill branch that changes nothing outside skills/.
export function isNixSkillPR(facts: NixSkillPRFacts): boolean {
  return isNixSkillBranch(facts) && facts.files.length > 0 && facts.files.every((file) => file.startsWith(SKILLS_DIR));
}

// The two conditions that need no file read, so a caller reads the files only when they hold.
export function isNixSkillBranch(facts: Pick<NixSkillPRFacts, 'owner' | 'repo' | 'headRefName'>): boolean {
  return facts.owner === 'zgeoff' && facts.repo === NIX_REPO && facts.headRefName.startsWith(NIX_SKILL_BRANCH);
}
