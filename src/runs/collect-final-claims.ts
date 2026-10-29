import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { collectMentionedPRs } from './collect-mentioned-prs.ts';
import { FINAL_MARK } from './final-mark.ts';
import { FINAL_PHRASE } from './final-phrase.ts';
import { parseMarkedRef } from './parse-marked-ref.ts';
import type { FinalClaim } from './types.ts';

const RefsSchema = z.array(z.object({ ref: z.string(), state: z.string() }));

export function collectFinalClaims(db: Database, issue: string, text: string): FinalClaim[] {
  const mark = FINAL_MARK.exec(text);
  if (mark) {
    const ref = parseMarkedRef(mark[1] ?? '');
    return ref === null || isOwnedElsewhere(db, issue, ref) ? [] : [{ ref, sha: mark[2] ?? '' }];
  }
  const phrase = FINAL_PHRASE.exec(text);
  if (!phrase) {
    return [];
  }
  const owned = RefsSchema.parse(db.query('SELECT ref, state FROM run_prs WHERE issue = ?').all(issue));
  const mentioned = collectMentionedPRs(text);
  const refs = mentioned.length > 0 ? mentioned.filter((ref) => owned.some((pr) => pr.ref === ref)) : owned.filter((pr) => pr.state === 'open').map((pr) => pr.ref);
  return refs.map((ref) => ({ ref, sha: String(phrase[1]) }));
}

const OwnerSchema = z.object({ issue: z.string() }).nullable();

function isOwnedElsewhere(db: Database, issue: string, ref: string): boolean {
  const owner = OwnerSchema.parse(db.query('SELECT issue FROM run_prs WHERE ref = ?').get(ref));
  return owner !== null && owner.issue !== issue;
}
