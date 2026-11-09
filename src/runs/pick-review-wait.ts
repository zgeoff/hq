import { match } from 'ts-pattern';
import type { RunPR } from './types.ts';

export type ReviewWaitRequest = { kind: 'clear' } | { kind: 'set'; until: string; reason: string | null };

export type ReviewWaitWrite = { ok: true; until: string | null; sha: string | null; reason: string | null } | { ok: false; refusal: string };

// until is already parsed and in the future; a clear needs no FINAL, since a stale wait may be cleared.
export function pickReviewWait(pr: Pick<RunPR, 'ref' | 'state' | 'final_sha'>, request: ReviewWaitRequest): ReviewWaitWrite {
  if (pr.state !== 'open') {
    return { ok: false, refusal: `${pr.ref} is ${pr.state}, not open` };
  }
  return match(request)
    .with({ kind: 'clear' }, (): ReviewWaitWrite => ({ ok: true, until: null, sha: null, reason: null }))
    .with({ kind: 'set' }, (set): ReviewWaitWrite => {
      if (pr.final_sha === null) {
        return { ok: false, refusal: `${pr.ref} has no FINAL, so no review to wait on: hq run final first` };
      }
      const reason = set.reason?.trim() ?? '';
      if (reason === '') {
        return { ok: false, refusal: '--reason is required: say why the review waits' };
      }
      return { ok: true, until: set.until, sha: pr.final_sha, reason };
    })
    .exhaustive();
}
