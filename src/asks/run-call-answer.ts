import type { Database } from 'bun:sqlite';
import { match } from 'ts-pattern';
import { HqError } from '../errors.ts';
import { owner } from '../owner.ts';
import type { OwnerProbe } from '../pr-status/read-owner-session.ts';
import { answerAsk } from './answer-ask.ts';
import type { AnswerAskInput } from './answer-ask.ts';
import type { Ask } from './types.ts';

export async function runCallAnswer(db: Database, input: Omit<AnswerAskInput, 'ownerSession'>, readProbe: () => Promise<OwnerProbe>): Promise<Ask> {
  const probe = await readProbe();
  const ownerSession = match(probe)
    .with({ verdict: 'owner' }, () => true)
    .with({ verdict: 'other' }, () => false)
    .with({ verdict: 'unknown' }, (failed) => {
      throw new HqError('atc_unreachable', `atc could not say whether this caller is the owner's session (${owner()}), so the answer is not saved: ${failed.cause}. Run it again once atc answers, or answer in the console`);
    })
    .exhaustive();
  return answerAsk(db, { ...input, ownerSession });
}
