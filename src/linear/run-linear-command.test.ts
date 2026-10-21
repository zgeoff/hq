import { $ } from 'bun';
import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpResponse, http } from 'msw';
import { z } from 'zod';
import { buildStubLinearIssuePages } from '../../mocks/build-stub-linear-issue-pages.ts';
import { LINEAR_GRAPHQL_URL, linearIssues, linearWorkflowStates } from '../../mocks/linear-handlers.ts';
import { server } from '../../mocks/node.ts';
import { freshDb } from '../../test/helpers.ts';
import { main } from '../cli.ts';
import { overrideEnv } from '../config/override-env.ts';
import type { RunResult, Runner } from '../runner/types.ts';
import { makeLinearCaller } from './make-linear-caller.ts';
import { resetKey } from './reset-key.ts';
import { runLinearCommand } from './run-linear-command.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'hq-linear-issues-'));
  const run = mock<Runner>(() => Promise.resolve<RunResult>({ code: 0, stdout: 'lin_api_INVENTEDkettleKEY0042\n', stderr: '' }));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  resetKey();
  onTestFinished(resetKey);
  onTestFinished(overrideEnv('OP_SERVICE_ACCOUNT_TOKEN', 'invented-token'));
  return { directory, run, call: makeLinearCaller(run), scripts: join(import.meta.dir, '../../skills/linear-triage/scripts') };
}

test('it writes two page files for 150 issues, 100 then 50, each holding only an issues array', async () => {
  const ctx = setupTest();
  const sent: unknown[] = [];
  server.events.on('request:start', async (info) => {
    const body: unknown = await info.request.clone().json();
    sent.push(body);
  });
  onTestFinished(() => server.events.removeAllListeners());
  linearWorkflowStates.push({ team: 'KET', name: 'Ready' });
  linearIssues.push(...Array.from({ length: 150 }, (_, index) => ({ identifier: `KET-${index + 1}`, team: 'KET', state: 'Ready', stateType: 'unstarted', previousIdentifiers: [], project: null, labels: [], parent: null })));

  const out = await runLinearCommand(ctx.call, { team: 'KET', state: 'Ready', out: ctx.directory });

  const pageSchema = z.object({ issues: z.array(z.unknown()) }).strict();
  const firstText = readFileSync(join(ctx.directory, 'issues-1.json'), 'utf8');
  const secondText = readFileSync(join(ctx.directory, 'issues-2.json'), 'utf8');
  const first = pageSchema.parse(JSON.parse(firstText));
  const second = pageSchema.parse(JSON.parse(secondText));
  expect(out.data).toStrictEqual({ files: [join(ctx.directory, 'issues-1.json'), join(ctx.directory, 'issues-2.json')], issues: 150 });
  expect(out.text).toBe(`${join(ctx.directory, 'issues-1.json')}\n${join(ctx.directory, 'issues-2.json')}`);
  const filter = { team: { key: { eq: 'KET' } }, state: { name: { in: ['Ready'] } } };
  expect(sent).toStrictEqual([
    { query: expect.any(String), variables: { teamKey: 'KET' } },
    { query: expect.stringContaining('issues(first: 100,'), variables: { after: null, filter } },
    { query: expect.stringContaining('issues(first: 100,'), variables: { after: '100', filter } },
  ]);
  expect(first.issues).toHaveLength(100);
  expect(second.issues).toHaveLength(50);
  expect(readdirSync(ctx.directory).toSorted()).toStrictEqual(['issues-1.json', 'issues-2.json']);
});

test('it writes one page holding an empty issues array when nothing matches', async () => {
  const ctx = setupTest();
  linearWorkflowStates.push({ team: 'KET', name: 'Ready' });

  const out = await runLinearCommand(ctx.call, { team: 'KET', state: 'Ready', out: ctx.directory });

  expect(out.data['issues']).toBe(0);
  expect(readFileSync(join(ctx.directory, 'issues-1.json'), 'utf8')).toBe('{"issues":[]}');
});

test('it matches state names without regard to case and reads only those states', async () => {
  const ctx = setupTest();
  linearWorkflowStates.push({ team: 'KET', name: 'Ready' }, { team: 'KET', name: 'In Review' }, { team: 'KET', name: 'Backlog' });
  linearIssues.push(
    { identifier: 'KET-1', team: 'KET', state: 'Ready', stateType: 'unstarted', previousIdentifiers: [], project: null, labels: [], parent: null },
    { identifier: 'KET-2', team: 'KET', state: 'In Review', stateType: 'started', previousIdentifiers: [], project: null, labels: [], parent: null },
    { identifier: 'KET-3', team: 'KET', state: 'Backlog', stateType: 'backlog', previousIdentifiers: [], project: null, labels: [], parent: null },
  );

  await runLinearCommand(ctx.call, { team: 'KET', state: 'ready, IN REVIEW', out: ctx.directory, fields: 'id,status' });

  const page = readFileSync(join(ctx.directory, 'issues-1.json'), 'utf8');
  expect(JSON.parse(page)).toStrictEqual({
    issues: [
      { id: 'KET-1', status: 'Ready' },
      { id: 'KET-2', status: 'In Review' },
    ],
  });
});

test('it refuses a state the team lacks as bad_args, listing the team states, and writes nothing', () => {
  const ctx = setupTest();
  linearWorkflowStates.push({ team: 'KET', name: 'Backlog' }, { team: 'KET', name: 'Ready' }, { team: 'KET', name: 'In Review' });

  const failed = runLinearCommand(ctx.call, { team: 'KET', state: 'Ready,Steeping', out: ctx.directory });

  expect(failed).rejects.toMatchObject({ code: 'bad_args', message: 'unknown state "Steeping" in team KET; its states are Backlog, Ready, In Review' });
  expect(readdirSync(ctx.directory)).toStrictEqual([]);
});

test('it refuses a team that holds no states as bad_args', () => {
  const ctx = setupTest();

  const failed = runLinearCommand(ctx.call, { team: 'TEA', state: 'Ready', out: ctx.directory });

  expect(failed).rejects.toMatchObject({ code: 'bad_args', message: 'Linear has no workflow states for team TEA: check the team key' });
});

test('it sends --updated-since as a filter, so only issues updated at or after the time come back', async () => {
  const ctx = setupTest();
  const sent: unknown[] = [];
  linearWorkflowStates.push({ team: 'KET', name: 'Ready' });
  linearIssues.push(
    { identifier: 'KET-1', team: 'KET', state: 'Ready', stateType: 'unstarted', previousIdentifiers: [], project: null, labels: [], parent: null, updatedAt: '2026-10-14T23:59:59.000Z' },
    { identifier: 'KET-2', team: 'KET', state: 'Ready', stateType: 'unstarted', previousIdentifiers: [], project: null, labels: [], parent: null, updatedAt: '2026-10-15T00:00:00.000Z' },
    { identifier: 'KET-3', team: 'KET', state: 'Ready', stateType: 'unstarted', previousIdentifiers: [], project: null, labels: [], parent: null, updatedAt: '2026-10-20T08:30:00.000Z' },
  );
  server.events.on('request:start', async (info) => {
    const body: unknown = await info.request.clone().json();
    sent.push(body);
  });
  onTestFinished(() => server.events.removeAllListeners());

  await runLinearCommand(ctx.call, { team: 'KET', state: 'Ready', out: ctx.directory, 'updated-since': '2026-10-15T00:00:00Z', fields: 'id' });

  const page = readFileSync(join(ctx.directory, 'issues-1.json'), 'utf8');
  expect(sent).toStrictEqual([
    { query: expect.any(String), variables: { teamKey: 'KET' } },
    { query: expect.any(String), variables: { after: null, filter: { team: { key: { eq: 'KET' } }, state: { name: { in: ['Ready'] } }, updatedAt: { gte: '2026-10-15T00:00:00.000Z' } } } },
  ]);
  expect(JSON.parse(page)).toStrictEqual({ issues: [{ id: 'KET-2' }, { id: 'KET-3' }] });
});

test.each(['last tuesday-ish', '2026-10-15T00:00:00', '2026-10-15 08:30', '15/10/2026'])('it refuses an --updated-since of %p as bad_args', (raw) => {
  const ctx = setupTest();

  const failed = runLinearCommand(ctx.call, { team: 'KET', state: 'Ready', out: ctx.directory, 'updated-since': raw });

  expect(failed).rejects.toMatchObject({ code: 'bad_args', message: `--updated-since must be an ISO date-time with an offset or Z, or a date YYYY-MM-DD, not "${raw}"` });
});

test.each([
  ['2026-10-15', '2026-10-15T00:00:00.000Z'],
  ['2026-10-15T02:00:00+02:00', '2026-10-15T00:00:00.000Z'],
])('it sends an --updated-since of %p as %p', async (raw, gte) => {
  const ctx = setupTest();
  const sent: unknown[] = [];
  linearWorkflowStates.push({ team: 'KET', name: 'Ready' });
  server.events.on('request:start', async (info) => {
    const body: unknown = await info.request.clone().json();
    sent.push(body);
  });
  onTestFinished(() => server.events.removeAllListeners());

  await runLinearCommand(ctx.call, { team: 'KET', state: 'Ready', out: ctx.directory, 'updated-since': raw });

  expect(sent).toStrictEqual([
    { query: expect.any(String), variables: { teamKey: 'KET' } },
    { query: expect.any(String), variables: { after: null, filter: { team: { key: { eq: 'KET' } }, state: { name: { in: ['Ready'] } }, updatedAt: { gte } } } },
  ]);
});

test('it writes only the fields --fields names, in the connector order', async () => {
  const ctx = setupTest();
  linearWorkflowStates.push({ team: 'KET', name: 'Ready' });
  linearIssues.push({ identifier: 'KET-1', team: 'KET', state: 'Ready', stateType: 'unstarted', previousIdentifiers: [], project: null, labels: [], parent: null, title: 'Descale the kettle' });

  await runLinearCommand(ctx.call, { team: 'KET', state: 'Ready', out: ctx.directory, fields: 'updatedAt, title,id' });

  const page = readFileSync(join(ctx.directory, 'issues-1.json'), 'utf8');
  expect(JSON.parse(page)).toStrictEqual({ issues: [{ id: 'KET-1', title: 'Descale the kettle', updatedAt: '2026-10-01T00:00:00.000Z' }] });
});

test('it refuses an unknown field as bad_args', () => {
  const ctx = setupTest();

  const failed = runLinearCommand(ctx.call, { team: 'KET', state: 'Ready', out: ctx.directory, fields: 'id,colour' });

  expect(failed).rejects.toMatchObject({ code: 'bad_args', message: expect.stringContaining('unknown field "colour"') });
});

test('it writes each issue in the connector shape with all 14 fields', async () => {
  const ctx = setupTest();
  linearWorkflowStates.push({ team: 'KET', name: 'Done' });
  linearIssues.push(
    {
      identifier: 'KET-7',
      team: 'KET',
      state: 'Done',
      stateType: 'completed',
      previousIdentifiers: [],
      project: 'Teapot works',
      labels: ['Bug', 'M', 'kettle'],
      parent: 'KET-1',
      title: 'Mend the teapot spout',
      priority: { value: 2, name: 'High' },
      createdAt: '2026-10-02T03:04:05.000Z',
      updatedAt: '2026-10-09T03:04:05.000Z',
      completedAt: '2026-10-09T03:04:05.000Z',
      description: 'The spout drips.',
    },
    { identifier: 'KET-8', team: 'KET', state: 'Done', stateType: 'canceled', previousIdentifiers: [], project: null, labels: [], parent: null, canceledAt: '2026-10-03T00:00:00.000Z' },
  );

  await runLinearCommand(ctx.call, { team: 'KET', state: 'Done', out: ctx.directory });

  const page = readFileSync(join(ctx.directory, 'issues-1.json'), 'utf8');
  expect(JSON.parse(page)).toStrictEqual({
    issues: [
      {
        id: 'KET-7',
        title: 'Mend the teapot spout',
        url: 'https://linear.invalid/issue/KET-7',
        status: 'Done',
        statusType: 'completed',
        project: { name: 'Teapot works' },
        priority: { value: 2, name: 'High' },
        labels: [{ name: 'Bug' }, { name: 'M' }, { name: 'kettle' }],
        parentId: 'KET-1',
        createdAt: '2026-10-02T03:04:05.000Z',
        updatedAt: '2026-10-09T03:04:05.000Z',
        completedAt: '2026-10-09T03:04:05.000Z',
        canceledAt: null,
        description: 'The spout drips.',
      },
      {
        id: 'KET-8',
        title: 'Descale the KET-8 kettle',
        url: 'https://linear.invalid/issue/KET-8',
        status: 'Done',
        statusType: 'canceled',
        project: null,
        priority: { value: 0, name: 'No priority' },
        labels: [],
        parentId: null,
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
        completedAt: null,
        canceledAt: '2026-10-03T00:00:00.000Z',
        description: null,
      },
    ],
  });
});

test('it refuses an --out that is missing as bad_args', () => {
  const ctx = setupTest();

  const failed = runLinearCommand(ctx.call, { team: 'KET', state: 'Ready', out: join(ctx.directory, 'missing') });

  expect(failed).rejects.toMatchObject({ code: 'bad_args', message: `--out must be an existing directory: ${join(ctx.directory, 'missing')}` });
});

test('it refuses an --out that is a file as bad_args', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.directory, 'afile'), '');

  const failed = runLinearCommand(ctx.call, { team: 'KET', state: 'Ready', out: join(ctx.directory, 'afile') });

  expect(failed).rejects.toMatchObject({ code: 'bad_args' });
});

test('it refuses an --out that already holds an issue page as bad_args, keeping every file', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.directory, 'issues-3.json'), '{"issues":[]}');
  writeFileSync(join(ctx.directory, 'notes.txt'), 'brew at 90 degrees');

  const failed = runLinearCommand(ctx.call, { team: 'KET', state: 'Ready', out: ctx.directory });

  expect(failed).rejects.toMatchObject({ code: 'bad_args', message: `${ctx.directory} already holds issue pages; use an empty directory` });
  expect(readdirSync(ctx.directory).toSorted()).toStrictEqual(['issues-3.json', 'notes.txt']);
});

test('it writes into an --out that holds only files that are not issue pages', async () => {
  const ctx = setupTest();
  linearWorkflowStates.push({ team: 'KET', name: 'Ready' });
  writeFileSync(join(ctx.directory, 'issues-final.json'), '{}');

  await runLinearCommand(ctx.call, { team: 'KET', state: 'Ready', out: ctx.directory });

  expect(readdirSync(ctx.directory).toSorted()).toStrictEqual(['issues-1.json', 'issues-final.json']);
});

test.each([
  ['--team', { state: 'Ready', out: tmpdir() }],
  ['--state', { team: 'KET', out: tmpdir() }],
  ['--out', { team: 'KET', state: 'Ready' }],
])('it refuses a call without %s as bad_args', (flag, flags) => {
  const ctx = setupTest();

  const failed = runLinearCommand(ctx.call, flags);

  expect(failed).rejects.toMatchObject({ code: 'bad_args', message: `hq linear issues needs ${flag}` });
});

test('it writes no page file when the second page is not what Linear promises', () => {
  const ctx = setupTest();
  const good = { identifier: 'KET-1', title: 'Descale the kettle', url: 'https://linear.invalid/issue/KET-1', state: { name: 'Ready', type: 'unstarted' }, project: null, priority: 0, priorityLabel: 'No priority', labels: { nodes: [] }, parent: null, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', completedAt: null, canceledAt: null, description: null };
  linearWorkflowStates.push({ team: 'KET', name: 'Ready' });
  server.use(
    buildStubLinearIssuePages([
      { issues: { nodes: [good], pageInfo: { hasNextPage: true, endCursor: 'c1' } } },
      { issues: { nodes: [{ identifier: 'KET-2' }], pageInfo: { hasNextPage: false, endCursor: null } } },
    ]),
  );

  const failed = runLinearCommand(ctx.call, { team: 'KET', state: 'Ready', out: ctx.directory });

  expect(failed).rejects.toMatchObject({ code: 'linear_failed', message: "Linear's issues answer has an unexpected shape: issues.nodes.0.title" });
  expect(readdirSync(ctx.directory)).toStrictEqual([]);
});

test('it stops at 200 pages, asks Linear for no page past them and writes no file', () => {
  const ctx = setupTest();
  const sent: unknown[] = [];
  server.events.on('request:start', async (info) => {
    const body: unknown = await info.request.clone().json();
    sent.push(body);
  });
  onTestFinished(() => server.events.removeAllListeners());
  linearWorkflowStates.push({ team: 'KET', name: 'Ready' });
  server.use(buildStubLinearIssuePages(Array.from({ length: 200 }, (_, index) => ({ issues: { nodes: [], pageInfo: { hasNextPage: true, endCursor: `c${index + 1}` } } }))));

  const failed = runLinearCommand(ctx.call, { team: 'KET', state: 'Ready', out: ctx.directory });

  expect(failed).rejects.toMatchObject({ code: 'linear_failed', message: 'more than 20000 issues match; hq reads no further' });
  expect(sent).toHaveLength(201);
  expect(readdirSync(ctx.directory)).toStrictEqual([]);
});

test('it fails as linear_failed when Linear says another page follows but gives no cursor', () => {
  const ctx = setupTest();
  linearWorkflowStates.push({ team: 'KET', name: 'Ready' });
  server.use(buildStubLinearIssuePages([{ issues: { nodes: [], pageInfo: { hasNextPage: true, endCursor: null } } }]));

  const failed = runLinearCommand(ctx.call, { team: 'KET', state: 'Ready', out: ctx.directory });

  expect(failed).rejects.toMatchObject({ code: 'linear_failed', message: 'Linear says another page follows but gave no cursor' });
  expect(readdirSync(ctx.directory)).toStrictEqual([]);
});

test('it fails as linear_failed when the workflow states answer is not what Linear promises', () => {
  const ctx = setupTest();
  server.use(http.post(LINEAR_GRAPHQL_URL, () => HttpResponse.json({ data: { workflowStates: { nodes: [{ label: 'Ready' }] } } })));

  const failed = runLinearCommand(ctx.call, { team: 'KET', state: 'Ready', out: ctx.directory });

  expect(failed).rejects.toMatchObject({ code: 'linear_failed', message: "Linear's workflow states answer has an unexpected shape: workflowStates.nodes.0.name" });
});

test.each(['Ready,', 'Ready, ,Done'])('it refuses a --state of %p, which names an empty state, as bad_args', (state) => {
  const ctx = setupTest();

  const failed = runLinearCommand(ctx.call, { team: 'KET', state, out: ctx.directory });

  expect(failed).rejects.toMatchObject({ code: 'bad_args', message: '--state is a comma-separated list of state names, with none empty' });
});

test('it fails with the error and writes no file when Linear answers 500', () => {
  const ctx = setupTest();
  server.use(http.post(LINEAR_GRAPHQL_URL, () => HttpResponse.json({ errors: [{ message: 'invented: Linear is unwell' }] }, { status: 500 })));

  const failed = runLinearCommand(ctx.call, { team: 'KET', state: 'Ready', out: ctx.directory });

  expect(failed).rejects.toMatchObject({ code: 'linear_failed', message: 'Linear answered 500: invented: Linear is unwell' });
  expect(readdirSync(ctx.directory)).toStrictEqual([]);
});

test('it prints the files and the issue count for hq linear issues --json', async () => {
  const ctx = setupTest();
  const fresh = freshDb();
  const log = console.log;
  const printed: string[] = [];
  onTestFinished(fresh.cleanup);
  console.log = (line: string) => void printed.push(line);
  onTestFinished(() => (console.log = log));
  linearWorkflowStates.push({ team: 'KET', name: 'Ready' });
  linearIssues.push({ identifier: 'KET-1', team: 'KET', state: 'Ready', stateType: 'unstarted', previousIdentifiers: [], project: null, labels: [], parent: null });

  const code = await main(['linear', 'issues', '--team', 'KET', '--state', 'ready', '--out', ctx.directory, '--fields', 'id', '--json'], ctx.run);

  expect(code).toBe(0);
  expect(JSON.parse(printed.join(''))).toStrictEqual({ ok: true, files: [join(ctx.directory, 'issues-1.json')], issues: 1 });
});

test('it runs each triage script to exit 0 over every issue on the pages hq linear issues wrote', async () => {
  const ctx = setupTest();
  const states = ['Backlog', 'Ready', 'In Review', 'Done'];
  linearWorkflowStates.push(...states.map((name) => ({ team: 'GEO', name })));

  // The triage scripts sort issue ids by the number after "GEO-", so these issues carry GEO ids.
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
