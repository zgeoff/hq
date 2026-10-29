import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { collectMentionedPRs } from './collect-mentioned-prs.ts';
import { FINAL_MARK } from './final-mark.ts';
import { FINAL_PHRASE } from './final-phrase.ts';
import { parseMarkedRef } from './parse-marked-ref.ts';
import { pickFinalClaims } from './pick-final-claims.ts';
import type { FinalClaim, FinalClaimFacts } from './types.ts';

export function readFinalClaims(db: Database, issue: string, text: string): FinalClaim[] {
  return pickFinalClaims(readFacts(db, issue, text));
}

const OwnerSchema = z.object({ issue: z.string() }).nullable();
const OwnedSchema = z.array(z.object({ ref: z.string(), state: z.string() }));

function readFacts(db: Database, issue: string, text: string): FinalClaimFacts {
  const mark = FINAL_MARK.exec(text);
  if (mark) {
    const ref = parseMarkedRef(mark[1] ?? '');
    const owner = ref === null ? null : (OwnerSchema.parse(db.query('SELECT issue FROM run_prs WHERE ref = ?').get(ref))?.issue ?? null);
    return { issue, mark: { ref, sha: mark[2] ?? '', owner }, phrase: null, owned: [] };
  }
  const phrase = FINAL_PHRASE.exec(text);
  if (!phrase) {
    return { issue, mark: null, phrase: null, owned: [] };
  }
  const owned = OwnedSchema.parse(db.query('SELECT ref, state FROM run_prs WHERE issue = ?').all(issue));
  return { issue, mark: null, phrase: { sha: String(phrase[1]), mentioned: collectMentionedPRs(text) }, owned };
}
