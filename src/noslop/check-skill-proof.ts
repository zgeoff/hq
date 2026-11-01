import { match } from 'ts-pattern';
import { HqError } from '../errors.ts';
import { readHeadExemption } from '../pr-status/read-head-exemption.ts';
import { readHeadMechanical } from '../pr-status/read-head-mechanical.ts';
import { OWNER } from '../releases/owner.ts';
import { collectMissingProof } from './collect-missing-proof.ts';
import { isBotAuthor } from './is-bot-author.ts';
import type { ParsedRepo } from './parse-lower-repo.ts';
import { pickSkillProofVerdict } from './pick-skill-proof-verdict.ts';
import type { SkillProofFacts } from './pick-skill-proof-verdict.ts';
import type { GateFacts } from './read-gate-facts.ts';
import type { PRRequest } from './types.ts';

export type ReadFiles = () => Promise<string[]>;

export async function checkSkillProof(request: PRRequest, parsed: ParsedRepo, facts: GateFacts, readFiles: ReadFiles): Promise<void> {
  if (parsed.owner !== OWNER) {
    return;
  }
  const head = facts.headRefOid;
  const proof: SkillProofFacts = {
    bot: isBotAuthor(facts.author),
    recorded: readHeadExemption(request.db, parsed.repo, request.pr, head) !== null || readHeadMechanical(request.db, parsed.repo, request.pr, head) !== null,
    missing: collectMissingProof(facts.body),
    files: null,
  };
  const first = pickSkillProofVerdict(proof);
  const verdict = first.kind === 'needs-files' ? pickSkillProofVerdict({ ...proof, files: await readFiles() }) : first;
  match(verdict)
    .with({ kind: 'pass' }, () => null)
    .with({ kind: 'needs-files' }, () => {
      throw new HqError('merge_blocked', 'hq did not read the changed files for the skill proof check', { repo: parsed.repo, pr: request.pr });
    })
    .with({ kind: 'blocked' }, (blocked) => {
      throw new HqError('merge_blocked', blocked.reason, { repo: parsed.repo, pr: request.pr });
    })
    .exhaustive();
}
