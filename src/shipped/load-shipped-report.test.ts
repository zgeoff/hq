import { expect, onTestFinished, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { LinearCall } from '../linear/types.ts';
import type { RunResult, Runner } from '../runner/types.ts';
import { realRunner } from '../runner/real-runner.ts';
import { buildMergedDayOutput, buildMergedPR } from '../../test/build-merged-day-output.ts';
import { buildStubDeliveryRunner } from '../../test/build-stub-delivery-runner.ts';
import { freshDb } from '../../test/helpers.ts';
import { makeLinearFake } from '../../test/make-linear-fake.ts';
import { loadShippedReport } from './load-shipped-report.ts';
import { mergedPRsOutputSchema } from './merged-prs-output-schema.ts';
import { parseRenderedReport } from './parse-rendered-report.ts';
import type { ProjectIssue, ReportIssue } from './types.ts';

const FIXTURES = join(import.meta.dir, '../../skills/delivery-report/scripts/testdata/render-report'),
  FIXTURE_PR = z.looseObject({ repo: z.string(), number: z.number(), title: z.string(), url: z.string(), day: z.string(), issue: z.string().nullable() }),
  FIXTURE_ROW = z.looseObject({ issue: z.string(), prs: z.array(FIXTURE_PR) }),
  RENDER_INPUT = z.looseObject({ start: z.string(), totals: z.looseObject({ prs: z.number() }), byIssue: z.array(FIXTURE_ROW), prs: z.array(FIXTURE_PR) }),
  SCRIPTS = join(import.meta.dir, '../../skills/delivery-report/scripts');

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('a day: merged-prs.sh, the Linear issues and render-report.sh --json give the golden report', async () => {
  const asked: unknown[] = [],
    ctx = setupTest(),
    merged = mergedPRsOutputSchema.parse(JSON.parse(readScriptOutput('daily-prs.json'))),
    ran: string[][] = [],
    report = await loadShippedReport({ db: ctx.db, run: makeScriptRunner('daily-prs.json', ran), call: loadLinearFake([], asked), scripts: SCRIPTS }, 'today', new Date('2026-10-15T02:00:00Z'));
  expect(report.report).toStrictEqual(parseRenderedReport(readFixture('daily.json.expected')));
  expect([report.period, report.at]).toStrictEqual(['today', '2026-10-15T02:00:00Z']);
  expect(ran[0]).toStrictEqual([join(SCRIPTS, 'merged-prs.sh'), 'daily', '2026-10-15']);
  expect(asked[0]).toStrictEqual({ ids: merged.byIssue.map((entry) => entry.issue) });
});

test('a week up to Thursday, read a day at a time, renders its days and totals', async () => {
  const ctx = setupTest(),
    day14 = buildMergedPR({ number: 9401, url: 'https://github.com/zgeoff/lantern-demo/pull/9401', repo: 'lantern-demo', issue: 'GEO-9401', mergedAt: '2026-10-14T01:00:00Z', day: '2026-10-14', added: 100, removed: 20 }),
    day15 = buildMergedPR({ number: 9402, url: 'https://github.com/zgeoff/lantern-demo/pull/9402', repo: 'lantern-demo', issue: 'GEO-9402', mergedAt: '2026-10-15T01:00:00Z', day: '2026-10-15', added: 30, removed: 5 }),
    fake = buildStubDeliveryRunner({
      days: {
        '2026-10-12': buildMergedDayOutput('2026-10-12', []),
        '2026-10-13': buildMergedDayOutput('2026-10-13', []),
        '2026-10-14': buildMergedDayOutput('2026-10-14', [day14]),
        '2026-10-15': buildMergedDayOutput('2026-10-15', [day15]),
      },
      otherwise: realRunner,
    }),
    report = await loadShippedReport({ db: ctx.db, run: fake.run, call: loadLinearFake([], []), scripts: SCRIPTS }, 'week', new Date('2026-10-15T02:00:00Z'));
  expect(report.report.kind).toBe('weekly');
  expect(report.report.dateLabel).toBe('Monday 12 October');
  expect(report.report.totals).toStrictEqual({ prs: 2, repos: 1, issues: 2, added: 130, removed: 25, closed: 1 });
  expect(report.report.days).toStrictEqual([
    { date: '2026-10-14', label: 'Wednesday 14 October', prs: 1, issues: 1 },
    { date: '2026-10-15', label: 'Thursday 15 October', prs: 1, issues: 1 },
  ]);
});

test('a week read a day at a time renders in full, with each project\'s burndown', async () => {
  const ctx = setupTest(),
    fake = buildStubDeliveryRunner({
      days: {
        '2026-10-12': buildMergedDayOutput('2026-10-12', []),
        '2026-10-13': buildMergedDayOutput('2026-10-13', [
          buildMergedPR({ number: 9501, url: 'https://github.com/zgeoff/lantern-demo/pull/9501', repo: 'lantern-demo', issue: 'GEO-9401', mergedAt: '2026-10-13T01:00:00Z', day: '2026-10-13', added: 100, removed: 20 }),
        ]),
        '2026-10-14': buildMergedDayOutput('2026-10-14', [
          buildMergedPR({ number: 9502, url: 'https://github.com/zgeoff/lantern-demo/pull/9502', repo: 'lantern-demo', issue: 'GEO-9402', mergedAt: '2026-10-14T01:00:00Z', day: '2026-10-14', added: 30, removed: 5 }),
          buildMergedPR({ number: 9503, url: 'https://github.com/zgeoff/lantern-demo/pull/9503', repo: 'lantern-demo', issue: 'GEO-9403', mergedAt: '2026-10-14T02:00:00Z', day: '2026-10-14', added: 8, removed: 1 }),
        ]),
        '2026-10-15': buildMergedDayOutput('2026-10-15', []),
      },
      otherwise: realRunner,
    }),
    fixtures = ['project-array.json', 'project-object.json'].flatMap((file) => readIssues<ProjectIssue>(file)),
    report = await loadShippedReport({ db: ctx.db, run: fake.run, call: loadLinearFake(fixtures, []), scripts: SCRIPTS }, 'week', new Date('2026-10-15T02:00:00Z'));

  expect(report.report).toMatchInlineSnapshot(`
    {
      "closed": [
        {
          "count": 1,
          "type": "Bug",
        },
        {
          "count": 1,
          "type": "Chore",
        },
      ],
      "dateLabel": "Monday 12 October",
      "days": [
        {
          "date": "2026-10-13",
          "issues": 1,
          "label": "Tuesday 13 October",
          "prs": 1,
        },
        {
          "date": "2026-10-14",
          "issues": 2,
          "label": "Wednesday 14 October",
          "prs": 2,
        },
      ],
      "fetchGap": null,
      "groups": [
        {
          "burndown": {
            "done": 1,
            "total": 3,
            "triage": 1,
          },
          "issues": 2,
          "project": "Lantern Garden",
          "prs": 2,
          "rows": [
            {
              "flag": "🚨",
              "issue": "GEO-9401",
              "marker": "🐛",
              "prs": [
                {
                  "number": 9501,
                  "repo": "lantern-demo",
                  "url": "https://github.com/zgeoff/lantern-demo/pull/9501",
                },
              ],
              "state": "closed",
              "status": "Done",
              "title": "Repair the lantern latch",
              "url": "https://linear.example/issue/GEO-9401",
            },
          ],
        },
        {
          "burndown": {
            "done": 1,
            "total": 2,
            "triage": 0,
          },
          "issues": 1,
          "project": "Paper Orchard",
          "prs": 1,
          "rows": [
            {
              "flag": null,
              "issue": "GEO-9403",
              "marker": "🧹",
              "prs": [
                {
                  "number": 9503,
                  "repo": "lantern-demo",
                  "url": "https://github.com/zgeoff/lantern-demo/pull/9503",
                },
              ],
              "state": "closed",
              "status": "Done",
              "title": "Sweep the paper leaves",
              "url": "https://linear.example/issue/GEO-9403",
            },
          ],
        },
      ],
      "kind": "weekly",
      "missing": [],
      "noIssue": [],
      "stillOpen": [
        {
          "issues": 1,
          "project": "Lantern Garden",
          "top": [
            {
              "issue": "GEO-9402",
              "title": "Add the dusk path",
              "url": "https://linear.example/issue/GEO-9402",
            },
          ],
        },
      ],
      "totals": {
        "added": 138,
        "closed": 2,
        "issues": 3,
        "prs": 3,
        "removed": 26,
        "repos": 1,
      },
    }
  `);
});

test('a week whose Monday GitHub capped at 1,000 of 1,200 PRs keeps the fetch-gap warning, with the week\'s sums', async () => {
  const ctx = setupTest(),
    fake = buildStubDeliveryRunner({
      days: {
        '2026-10-12': buildMergedDayOutput(
          '2026-10-12',
          Array.from({ length: 1000 }, (_unused, n) => buildMergedPR({ number: n, day: '2026-10-12', mergedAt: '2026-10-12T01:00:00Z', issue: null })),
          1200,
        ),
        '2026-10-13': buildMergedDayOutput(
          '2026-10-13',
          Array.from({ length: 10 }, (_unused, n) => buildMergedPR({ number: 2000 + n, day: '2026-10-13', mergedAt: '2026-10-13T01:00:00Z', issue: null })),
        ),
        '2026-10-14': buildMergedDayOutput('2026-10-14', []),
        '2026-10-15': buildMergedDayOutput('2026-10-15', []),
      },
      otherwise: realRunner,
    }),
    report = await loadShippedReport({ db: ctx.db, run: fake.run, call: loadLinearFake([], []), scripts: SCRIPTS }, 'week', new Date('2026-10-15T02:00:00Z'));

  expect(report.report.fetchGap).toStrictEqual({ searchCount: 1210, fetched: 1010 });
});

test('a day carries each project\'s burndown beside its heading when Linear gives the projects\' issues', async () => {
  const fixtures = ['project-array.json', 'project-object.json'].flatMap((file) => readIssues<ProjectIssue>(file)),
    report = await loadShippedReport({ db: setupTest().db, run: makeScriptRunner('daily-prs.json', []), call: loadLinearFake(fixtures, []), scripts: SCRIPTS }, 'today', new Date('2026-10-15T02:00:00Z'));
  expect(report.report.groups.slice(0, 2).map((group) => [group.project, group.burndown])).toStrictEqual([
    ['Lantern Garden', { total: 3, done: 1, triage: 1 }],
    ['Paper Orchard', { total: 2, done: 1, triage: 0 }],
  ]);
});

test('a script that fails says which and why, in one line', async () => {
  await expect(loadShippedReport({ db: setupTest().db, run: runFailingScript, call: loadLinearFake([], []), scripts: SCRIPTS }, 'today', new Date())).rejects.toThrow('merged-prs.sh exited 1: gh: not logged in');
});

// merged-prs.sh prints the fixture, as it would print GitHub's answer; render-report.sh runs.
function makeScriptRunner(prsFile: string, ran: string[][]): Runner {
  return async (cmd, opts) => {
    ran.push(cmd.slice(1));
    if (cmd[1]?.endsWith('merged-prs.sh') === true) {
      return { code: 0, stdout: readScriptOutput(prsFile), stderr: '' };
    }
    return await realRunner(cmd, opts);
  };
}

test('merged-prs.sh output in another shape is refused, naming the fields', async () => {
  await expect(loadShippedReport({ db: setupTest().db, run: runOddShapeScript, call: loadLinearFake([], []), scripts: SCRIPTS }, 'today', new Date())).rejects.toThrow(/^merged-prs\.sh printed an unexpected shape: .*byIssue\.0\.issue/u);
});

function runOddShapeScript(): Promise<RunResult> {
  return Promise.resolve({ code: 0, stdout: JSON.stringify({ totals: {}, byIssue: [{ issue: 9401 }] }), stderr: '' });
}

function runFailingScript(): Promise<RunResult> {
  return Promise.resolve({ code: 1, stdout: '', stderr: 'gh: not logged in\nrun gh auth login' });
}

// A render-report.sh fixture as merged-prs.sh prints it: the fields the fixture leaves out, which
// render-report.sh does not read for a day, are filled in, and fetched is every PR listed.
function readScriptOutput(file: string): string {
  const fixture = RENDER_INPUT.parse(JSON.parse(readFixture(file)));
  return JSON.stringify({
    ...fixture,
    end: `${fixture.start.slice(0, 10)}T23:59:59Z`,
    fetched: fixture.totals.prs,
    byRepo: [],
    byIssue: fixture.byIssue.map((row) => ({ issue: row.issue, repos: [...new Set(row.prs.map((pr) => pr.repo))].toSorted(), added: 0, removed: 0, prs: row.prs })),
    prs: fixture.prs.map((pr) => buildMergedPR(pr)),
    workflow: [],
  });
}

function readFixture(file: string): string {
  return readFileSync(join(FIXTURES, file), 'utf8');
}

function readIssues<T>(file: string): T[] {
  const parsed = JSON.parse(readFixture(file)) as T[] | { issues: T[] };
  return Array.isArray(parsed) ? parsed : parsed.issues;
}

// Linear over the report fixtures' issues, read from their files.
function loadLinearFake(projectIssues: readonly ProjectIssue[], asked: unknown[]): LinearCall {
  return makeLinearFake([...readIssues<ReportIssue>('issues-array.json'), ...readIssues<ReportIssue>('issues-object.json')], projectIssues, asked);
}
