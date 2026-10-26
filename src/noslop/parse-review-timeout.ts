import { REVIEW_TIMEOUT_MS } from './review-timeout-ms.ts';

export function parseReviewTimeout(raw: string | undefined): number {
  return raw === undefined ? REVIEW_TIMEOUT_MS : Number(raw) * 60_000;
}
