import type { ParsedRepo } from '../noslop/parse-lower-repo.ts';
import type { ReadFiles } from './check-skill-proof.ts';
import { isNixSkillBranch, isNixSkillPR } from './is-nix-skill-pr.ts';
import type { GateFacts } from './read-gate-facts.ts';

export async function probeNixSkillPR(parsed: ParsedRepo, facts: GateFacts, readFiles: ReadFiles): Promise<boolean> {
  const branch = { owner: parsed.owner, repo: parsed.repo, headRefName: facts.headRefName };
  return isNixSkillBranch(branch) && isNixSkillPR({ ...branch, files: await readFiles() });
}
