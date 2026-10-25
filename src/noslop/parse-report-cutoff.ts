import { HqError } from '../errors.ts';

// The report's --since as the UTC text the rounds are stored in, '' for every round. Rounds are
// stored in UTC: a cutoff with an offset compares right only once it is UTC too.
export function parseReportCutoff(since: string | undefined): string {
  if (since === undefined) {
    return '';
  }
  if (Number.isNaN(Date.parse(since))) {
    throw new HqError('bad_args', `--since must be an ISO time, got '${since}'`);
  }
  return new Date(since).toISOString();
}
