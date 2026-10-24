import { match } from 'ts-pattern';
import type { OwnerProbe } from './read-owner-session.ts';

// chat: has no record to check, so only the owner's own session may give it.
export function findChatRefusal(probe: OwnerProbe): string | null {
  return match(probe)
    .with({ verdict: 'owner' }, () => null)
    .with({ verdict: 'other' }, () => 'a chat: source is accepted only from the session of the owner (z-stu), as atc finds the caller; this caller is not it')
    .with({ verdict: 'unknown' }, (failed) => `a chat: source is accepted only from the session of the owner (z-stu), and atc could not say whether this caller is it: ${failed.cause}`)
    .exhaustive();
}
