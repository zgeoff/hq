import type { RecordedFinding } from '../record-round.ts';

export interface ReviewRound {
  repo: string;
  pr: number;
  head: string;
  ok?: boolean;
  findings?: RecordedFinding[];
  error?: string | null;
}

export function buildMockReviewRound(overrides: Partial<ReviewRound> = {}): ReviewRound {
  return { repo: 'widgets', pr: 7, head: 'abc1234abc1234abc1234abc1234abc1234abc12', ...overrides };
}
