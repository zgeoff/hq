// The cap keeps a typo from holding a PR's round lock for hours.
const MAX_MINUTES = 60;

export function findReviewTimeoutRefusal(raw: string | undefined): string | null {
  if (raw === undefined) {
    return null;
  }
  const minutes = /^\d+$/u.test(raw) ? Number(raw) : Number.NaN;
  if (minutes >= 1 && minutes <= MAX_MINUTES) {
    return null;
  }
  return `--timeout takes whole minutes from 1 to ${MAX_MINUTES}, not "${raw}"`;
}
