import type { ConsoleReview } from './record-console-review.ts';

export const REVIEW_LABELS: Record<ConsoleReview, string> = { lgtm: 'lgtm', changes: 'Changes', later: 'Later', reject: 'Reject' };
