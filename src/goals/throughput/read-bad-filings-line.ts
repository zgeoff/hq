import type { Database } from 'bun:sqlite';
import { getMeta } from '../../db/get-meta.ts';
import { roleName } from '../../roles/role-name.ts';
import { buildUnreadLine } from './build-unread-line.ts';
import { formatItemList } from './format-item-list.ts';
import { readFiledIssues } from './read-filed-issues.ts';
import type { ThroughputLine } from './types.ts';

const NAME = 'Bad filings';

// Issues filed today that point at a PR, but that z-review did not record as a follow-up. Target 0.
export function readBadFilingsLine(db: Database, from: Date, at: Date): ThroughputLine {
  if (getMeta(db, 'linear_throughput_at') === null) {
    return buildUnreadLine(NAME, '0');
  }
  const bad = readFiledIssues(db, from, at).flatMap((filed) => (filed.prRef !== null && filed.source !== 'review' ? [{ issue: filed.issue, prRef: filed.prRef }] : []));
  const reviewer = roleName('reviewer');
  return {
    name: NAME,
    detail: `today ${bad.length}${formatItemList(bad.map((filing) => `${filing.issue} from ${filing.prRef}`))}`,
    target: '0',
    verdict: bad.length === 0 ? 'green' : 'red',
    alerts: bad.map((filing) => ({
      key: `bad-filing:${filing.issue}`,
      text: `Bad filing: ${filing.issue} points at ${filing.prRef}, but ${reviewer} has no follow-up record for it. If it came from that PR's review, record it: hq followup add ${filing.issue} --from ${filing.prRef}`,
    })),
  };
}
