import { HqError } from '../errors.ts';
import { REVIEW_TIMEOUT_MS } from './review-timeout-ms.ts';

// The cap keeps a typo from holding a PR's round lock for hours.
const MAX_MINUTES = 60;

export function parseReviewTimeout(raw: string | undefined): number {
  if (raw === undefined) {
    return REVIEW_TIMEOUT_MS;
  }
  const minutes = /^\d+$/u.test(raw) ? Number(raw) : Number.NaN;
  if (!(minutes >= 1 && minutes <= MAX_MINUTES)) {
    throw new HqError('bad_args', `--timeout takes whole minutes from 1 to ${MAX_MINUTES}, not "${raw}"`);
  }
  return minutes * 60_000;
}
