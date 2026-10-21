import type { ConsoleReview } from './record-console-review.ts';

// The console's label for each review answer, as the owner's message and the close note carry it.
export const REVIEW_LABELS: Record<ConsoleReview, string> = { lgtm: 'lgtm', changes: 'Changes', later: 'Later', reject: 'Reject' };
