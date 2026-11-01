import { HqError } from '../errors.ts';
import { readHeadExemption } from '../pr-status/read-head-exemption.ts';
import { readHeadMechanical } from '../pr-status/read-head-mechanical.ts';
import { OWNER } from '../releases/owner.ts';
import { collectMissingProof } from './collect-missing-proof.ts';
import { isBotAuthor } from './is-bot-author.ts';
import { isSkillProse } from './is-skill-prose.ts';
import type { ParsedRepo } from './parse-lower-repo.ts';
import type { GateFacts } from './read-gate-facts.ts';
import type { PRRequest } from './types.ts';

export type ReadFiles = () => Promise<string[]>;

// A PR that changes a skill's text carries its proof in the body: the chex output, the cold-read
// findings with their answers, and the deslop changes. Cheap facts first, so the changed files are
// read only for a body that lacks a section.
export async function checkSkillProof(request: PRRequest, parsed: ParsedRepo, facts: GateFacts, readFiles: ReadFiles): Promise<void> {
  if (parsed.owner !== OWNER || isBotAuthor(facts.author)) {
    return;
  }
  const missing = collectMissingProof(facts.body);
  if (missing.length === 0) {
    return;
  }
  const head = facts.headRefOid;
  if (readHeadExemption(request.db, parsed.repo, request.pr, head) !== null || readHeadMechanical(request.db, parsed.repo, request.pr, head) !== null) {
    return;
  }
  const files = await readFiles();
  const prose = [...new Set(files.filter((file) => isSkillProse(file)))];
  if (prose.length === 0) {
    return;
  }
  const shown = prose.length > 3 ? `${prose.slice(0, 3).join(', ')} and ${prose.length - 3} more` : prose.join(', ');
  const headings = missing.map((section) => `"## ${section}"`).join(', ');
  throw new HqError('merge_blocked', `the PR changes skill text (${shown}) and its description lacks the proof: add ${headings}, each with text under it (the chex output, each cold-read finding with its answer, the deslop changes or "none")`, { repo: parsed.repo, pr: request.pr });
}
