import { RULE_REF } from './rule-ref.ts';
import type { ReviewStats } from './types.ts';

export function reviewText(s: ReviewStats): string[] {
  const head = 'Review follow-ups (the steward and z-delivery act: is the #135 rule cutting follow-up issues?)';
  if (!s.mark) return [head, `  no mark for ${RULE_REF}: add one with hq mark add --kind skills --ref ${RULE_REF}`];
  const day = (t: string) => t.slice(5, 10);
  const b = s.baseline;
  return [
    head,
    `  rule: mark ${s.mark.id} at ${s.mark.at}, ${s.mark.text}`,
    `  baseline, the 2 weeks before: ${b.followupsPerWeek} follow-ups a week${b.backfilled ? ` (${b.backfilled} counted by hand from Linear, "linear backfill")` : ''}; same-PR fixes: ${b.fixed === 'none' ? 'no baseline (not recorded before the rule)' : `${b.fixed} a week`}`,
    ...s.weeks.map((w) => {
      const label = `week ${w.week > 0 ? `+${w.week}` : w.week} ${day(w.from)}→${day(w.to)}${w.partialDays !== null ? ` (${w.partialDays}d so far)` : ''}`;
      return `  ${label.padEnd(30)} follow-ups ${w.followups}${w.followupsBackfilled ? ` (${w.followupsBackfilled} backfill)` : ''}; same-PR fixes ${w.tallied ? `${w.fixed} across ${w.tallied} PRs` : '–'}`;
    }),
  ];
}
