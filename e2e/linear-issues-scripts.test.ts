import { $ } from 'bun';
import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { linearIssues, linearWorkflowStates } from '../mocks/linear-handlers.ts';
import { makeLinearCaller } from '../src/linear/make-linear-caller.ts';
import { resetKey } from '../src/linear/reset-key.ts';
import { runLinearCommand } from '../src/linear/run-linear-command.ts';
import type { RunResult, Runner } from '../src/runner/types.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'hq-linear-scripts-'));
  const run = mock<Runner>(() => Promise.resolve<RunResult>({ code: 0, stdout: 'lin_api_INVENTEDkettleKEY0042\n', stderr: '' }));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  resetKey();
  onTestFinished(resetKey);
  process.env['OP_SERVICE_ACCOUNT_TOKEN'] = 'invented-token';
  onTestFinished(() => delete process.env['OP_SERVICE_ACCOUNT_TOKEN']);
  return { directory, call: makeLinearCaller(run), scripts: join(import.meta.dir, '../skills/linear-triage/scripts') };
}

test('it runs each triage script to exit 0 over every issue on the pages hq linear issues wrote', async () => {
  const ctx = setupTest();
  const states = ['Backlog', 'Ready', 'In Review', 'Done'];
  linearWorkflowStates.push(...states.map((name) => ({ team: 'GEO', name })));

  // 120 open issues, each in a project of its own with a type, size, area and priority, so the audit
  // finds no gap; GEO-3 and GEO-110 are the one pair, and they sit on different pages.
  const open = Array.from({ length: 120 }, (_, index) => {
    const paired = index === 2 || index === 109;
    return {
      identifier: `GEO-${index + 1}`,
      team: 'GEO',
      state: states[index % 3] ?? 'Ready',
      stateType: 'unstarted',
      previousIdentifiers: [],
      project: paired ? 'Teapot works' : `Kettle works ${index + 1}`,
      labels: ['Bug', 'M', 'kettle'],
      parent: null,
      title: paired ? 'Replace teapot lid hinge gasket' : `kettlezq${(index + 1).toString(36)}`,
      priority: { value: 2, name: 'High' },
      createdAt: '2026-10-05T00:00:00.000Z',
      updatedAt: '2026-10-20T00:00:00.000Z',
    };
  });
  const done = [121, 122, 123].map((number) => ({
    identifier: `GEO-${number}`,
    team: 'GEO',
    state: 'Done',
    stateType: 'completed',
    previousIdentifiers: [],
    project: 'Teapot works',
    labels: ['Chore', 'S', 'kettle'],
    parent: null,
    createdAt: '2026-10-05T00:00:00.000Z',
    updatedAt: '2026-10-12T00:00:00.000Z',
    completedAt: '2026-10-12T00:00:00.000Z',
  }));
  linearIssues.push(...open, ...done);
  const written = await runLinearCommand(ctx.call, { team: 'GEO', state: states.join(','), out: ctx.directory });
  const files = [join(ctx.directory, 'issues-1.json'), join(ctx.directory, 'issues-2.json')];

  const audit = await $`bash ${ctx.scripts}/audit-issues.sh --now 2026-10-22T00:00:00Z ${files}`.nothrow().quiet();
  const inflow = await $`bash ${ctx.scripts}/inflow.sh --since 2026-10-01T00:00:00Z --until 2026-10-22T00:00:00Z ${files}`.nothrow().quiet();
  const overlap = await $`bash ${ctx.scripts}/overlap-candidates.sh ${files}`.nothrow().quiet();

  expect(written.data).toStrictEqual({ files, issues: 123 });
  expect(audit.exitCode).toBe(0);
  expect(inflow.exitCode).toBe(0);
  expect(overlap.exitCode).toBe(0);
  const auditOut = JSON.parse(audit.stdout.toString());
  expect(auditOut.open).toBe(120);
  expect(auditOut.counts).toStrictEqual({ inTriage: 0, missingProject: 0, missingType: 0, missingPriority: 0, missingSize: 0, missingArea: 0, stale: 0, needsGeoff: 0 });
  expect(JSON.parse(inflow.stdout.toString())).toStrictEqual({ since: '2026-10-01T00:00:00Z', until: '2026-10-22T00:00:00Z', filed: 123, planned: 0, reactive: 123, closed: 3, flag: true, fromPR: [] });
  expect(overlap.stdout.toString()).toBe('GEO-3\tGEO-110\t1\tgasket, hinge, lid, replace, teapot\n');
  expect(overlap.stderr.toString()).toBe('1 pair(s) above the threshold\n');
});
