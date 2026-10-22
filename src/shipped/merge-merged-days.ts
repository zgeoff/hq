import { TZ } from '../clock/tz.ts';
import type { MergedPRsOutput } from './merged-prs-output-schema.ts';

const DATE_LENGTH = 10;

// The week merged-prs.sh weekly prints, made from the days of that week that have happened, Monday
// first: every list and total comes from the days' PRs, in the order the script gives them.
export function mergeMergedDays(days: readonly MergedPRsOutput[]): MergedPRsOutput {
  const monday = days[0]?.start.slice(0, DATE_LENGTH) ?? '',
    prs = sortBy(
      days.flatMap((day) => day.prs),
      (pr) => `${pr.repo}\0${pr.mergedAt}`,
    ),
    sunday = buildSunday(monday),
    withIssue = prs.filter((pr) => pr.issue !== null);
  return {
    kind: 'weekly',
    start: days[0]?.start ?? `${monday}T00:00:00${buildOffset(monday)}`,
    end: `${sunday}T23:59:59${buildOffset(sunday)}`,
    searchCount: buildSum(days, (day) => day.searchCount),
    fetched: buildSum(days, (day) => day.fetched),
    totals: {
      prs: prs.length,
      issues: new Set(withIssue.map((pr) => pr.issue)).size,
      repos: new Set(prs.map((pr) => pr.repo)).size,
      added: buildSum(prs, (pr) => pr.added),
      removed: buildSum(prs, (pr) => pr.removed),
    },
    byRepo: sortBy(
      splitByKey(prs, (pr) => pr.repo).map((group) => ({ repo: group[0]?.repo ?? '', prs: group.length, added: buildSum(group, (pr) => pr.added), removed: buildSum(group, (pr) => pr.removed) })),
      (row) => -row.prs,
    ),
    byIssue: sortBy(
      splitByKey(withIssue, (pr) => pr.issue ?? '').map((group) => ({
        issue: group[0]?.issue ?? '',
        repos: [...new Set(group.map((pr) => pr.repo))].toSorted(),
        added: buildSum(group, (pr) => pr.added),
        removed: buildSum(group, (pr) => pr.removed),
        prs: group.map((pr) => ({ repo: pr.repo, number: pr.number, url: pr.url })),
      })),
      (row) => -row.prs.length,
    ),
    noIssue: prs.filter((pr) => pr.issue === null).map((pr) => ({ repo: pr.repo, number: pr.number, title: pr.title, url: pr.url })),
    prs,
    workflow: sortBy(
      days.flatMap((day) => day.workflow),
      (pr) => pr.mergedAt,
    ),
  };
}

function buildSum<T>(items: readonly T[], valueOf: (item: T) => number): number {
  return items.reduce((total, item) => total + valueOf(item), 0);
}

// A stable sort by a number or a string, like jq's sort_by.
function sortBy<T>(items: readonly T[], keyOf: (item: T) => number | string): T[] {
  return items.toSorted((a, b) => {
    const left = keyOf(a),
      right = keyOf(b);
    if (left === right) {
      return 0;
    }
    return left < right ? -1 : 1;
  });
}

// The groups of items that share a key, ordered by key, like jq's group_by.
function splitByKey<T>(items: readonly T[], keyOf: (item: T) => string): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const label = keyOf(item),
      members = groups.get(label);
    if (members === undefined) {
      groups.set(label, [item]);
    } else {
      members.push(item);
    }
  }
  return sortBy([...groups.entries()], ([key]) => key).map(([, group]) => group);
}

// Sydney's UTC offset at the end of a date, such as +11:00, as merged-prs.sh prints it.
function buildOffset(day: string): string {
  const noon = buildNoon(day),
    parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' }).formatToParts(noon);
  return (parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT+00:00').replace('GMT', '') || '+00:00';
}

function buildNoon(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, date ?? 1, 12));
}

function buildSunday(monday: string): string {
  const WEEK_LAST = 6,
    noon = buildNoon(monday);
  noon.setUTCDate(noon.getUTCDate() + WEEK_LAST);
  return noon.toISOString().slice(0, DATE_LENGTH);
}
