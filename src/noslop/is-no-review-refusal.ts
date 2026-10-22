const NO_REVIEW = 'no noslop review for this commit';

export function isNoReviewRefusal(why: string | null): boolean {
  return why !== null && why.includes(NO_REVIEW);
}
