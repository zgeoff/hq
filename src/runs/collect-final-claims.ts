import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { collectMentionedPRs } from './collect-mentioned-prs.ts';
import { FINAL_MARK } from './final-mark.ts';
import { FINAL_PHRASE } from './final-phrase.ts';
import { parseMarkedRef } from './parse-marked-ref.ts';
import type { FinalClaim } from './types.ts';

const OpenRefsSchema = z.array(z.object({ ref: z.string() }));

// The PR and sha pairs a note may mark final. A phrase's PR is only settled once the note's own PRs
// are attached, so every PR it could mean is a claim; the sha is the same for each.
export function collectFinalClaims(db: Database, issue: string, text: string): FinalClaim[] {
  const mark = FINAL_MARK.exec(text);
  if (mark) {
    const ref = parseMarkedRef(mark[1] ?? '');
    return ref === null ? [] : [{ ref, sha: mark[2] ?? '' }];
  }
  const phrase = FINAL_PHRASE.exec(text);
  if (!phrase) {
    return [];
  }
  const mentioned = collectMentionedPRs(text);
  const refs = mentioned.length > 0 ? mentioned : OpenRefsSchema.parse(db.query(`SELECT ref FROM run_prs WHERE issue = ? AND state = 'open'`).all(issue)).map((pr) => pr.ref);
  return refs.map((ref) => ({ ref, sha: String(phrase[1]) }));
}
