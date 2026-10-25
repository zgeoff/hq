import type { Database } from 'bun:sqlite';
import { expect, mock, onTestFinished, test } from 'bun:test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { HttpResponse, http } from 'msw';
import { z } from 'zod';
import { ANTHROPIC_MESSAGES_URL, slotUsage } from '../../mocks/anthropic-handlers.ts';
import { LINEAR_GRAPHQL_URL, linearDocuments, linearIssues } from '../../mocks/linear-handlers.ts';
import { server } from '../../mocks/node.ts';
import { buildFiledNode } from '../../test/build-filed-node.ts';
import { buildStubProgramRunner } from '../../test/build-stub-program-runner.ts';
import { createCapacitySample } from '../../test/create-capacity-sample.ts';
import { createStubOp } from '../../test/create-stub-op.ts';
import { createTreeCheckout } from '../../test/create-tree-checkout.ts';
import { freshDb } from '../../test/helpers.ts';
import { readReadyByLane } from '../areas/read-ready-by-lane.ts';
import { readOptionalFile } from '../capacity/fleet/read-optional-file.ts';
import { runFleetStep } from '../capacity/fleet/run-fleet-step.ts';
import { setCapacitySetting } from '../capacity/set-capacity-setting.ts';
import { now } from '../clock/now.ts';
import { overrideEnv } from '../config/override-env.ts';
import { metaJson } from '../db/meta-json.ts';
import { setMeta } from '../db/set-meta.ts';
import { loadActionsSpend } from '../goals/load-actions-spend.ts';
import { runGrantMarksTick } from '../grants/run-grant-marks-tick.ts';
import { PROMOTABLE_FOCUS } from '../lanes/promotable-focus.ts';
import { PROMOTABLE_FOCUS_KEY } from '../lanes/promotable-focus-key.ts';
import { addRun } from '../runs/add-run.ts';
import { addUnblock } from '../unblock/add-unblock.ts';
import { getUnblock } from '../unblock/get-unblock.ts';
import { makePRStateGh } from '../../test/make-pr-state-gh.ts';
import { waitFor } from '../../test/wait-for.ts';
import { resetKey } from '../linear/reset-key.ts';
import { realRunner } from '../runner/real-runner.ts';
import type { RunResult, Runner } from '../runner/types.ts';
import { watchTick } from './watch-tick.ts';

// A database, a home with no live checkout or usage cache, quiet notices, a clean Linear key cache,
// and a 1Password token.
function setupTest() {
  const fresh = freshDb(),
    xdg = process.env['XDG_CACHE_HOME'];
  onTestFinished(fresh.cleanup);
  onTestFinished(overrideEnv('HOME', fresh.dir));
  delete process.env['XDG_CACHE_HOME'];
  onTestFinished(() => xdg !== undefined && (process.env['XDG_CACHE_HOME'] = xdg));
  onTestFinished(overrideEnv('HQ_NOTIFY', 'off'));
  onTestFinished(overrideEnv('HQ_LINEAR_OP_REF', 'op://kettle/teapot-key/credential'));
  resetKey();
  onTestFinished(resetKey);
  process.env['OP_SERVICE_ACCOUNT_TOKEN'] = 'invented-token';
  onTestFinished(() => delete process.env['OP_SERVICE_ACCOUNT_TOKEN']);
  return { db: fresh.db, directory: fresh.dir };
}

// At 07:00 Sydney, with the goals sync fresh and the kinds sync last run 10 hours earlier, so only
// the kinds sync and its Linear side are due. GitHub finds no merged PRs and Linear no closed issues.
test('a due kinds sync reads the Linear key from 1Password once and records that read for the weekly audit', async () => {
  const answers: Record<string, RunResult> = {
      bash: { code: 0, stdout: JSON.stringify({ imp: { freeMib: 0, room: false }, providers: { claude: { room: false, unattended: true, target: 'imp' } } }), stderr: '' },
      gh: { code: 0, stdout: '[]', stderr: '' },
      op: { code: 0, stdout: 'lin_api_INVENTEDkettleKEY0042\n', stderr: '' },
    },
    ctx = setupTest(),
    run = mock<Runner>((cmd) => Promise.resolve(answers[cmd[0] ?? ''] ?? { code: 1, stdout: '', stderr: 'invented: no answer for this command' }));
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-15T20:00:00Z'));
  for (const key of ['goals_synced_at', 'goals_ok_at', 'linear_synced_at']) {
    setMeta(ctx.db, key, '2026-10-15T20:00:00Z');
  }
  setMeta(ctx.db, 'kinds_synced_at', '2026-10-15T10:00:00Z');
  server.use(http.post('https://api.linear.app/graphql', () => HttpResponse.json({ data: { issues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } })));

  await expect(
    watchTick(ctx.db, { me: 'hq-lanes', run, log: () => {}, stepMs: 200, steps: { runs: () => Promise.resolve(), weekly: () => Promise.resolve(false), health: () => Promise.resolve({ opened: [], cleared: [] }) } }).then(() => ({
      keyReads: run.mock.calls.map(([cmd]) => cmd).filter((cmd) => cmd[0] === 'op'),
      events: ctx.db.query("SELECT actor, data FROM events WHERE subject = 'hq' AND subject_id = 'op' AND action = 'read'").all(),
    })),
  ).resolves.toStrictEqual({ keyReads: [['op', 'read', 'op://kettle/teapot-key/credential']], events: [{ actor: 'linear', data: '{"consumer":"linear","requests":3}' }] });
});

// At 18:00 Sydney with the kinds sync last run 10 hours earlier, so the kinds sync and its Linear
// side are due. Linear holds one issue filed today that points at a PR with no follow-up record.
test('a due Linear sync tells triage about a bad filing once across two passes', async () => {
  const answers: Record<string, RunResult> = {
    bash: { code: 0, stdout: JSON.stringify({ imp: { freeMib: 0, room: false }, providers: { claude: { room: false, unattended: true, target: 'imp' } } }), stderr: '' },
    gh: { code: 0, stdout: '[]', stderr: '' },
    op: { code: 0, stdout: 'lin_api_INVENTEDkettleKEY0042\n', stderr: '' },
  };
  const ctx = setupTest();
  const run: Runner = (cmd) => Promise.resolve(answers[cmd[0] ?? ''] ?? { code: 1, stdout: '', stderr: 'invented: no answer for this command' });
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-16T07:00:00Z'));
  for (const key of ['goals_synced_at', 'goals_ok_at', 'linear_synced_at']) {
    setMeta(ctx.db, key, '2026-10-16T07:00:00Z');
  }
  const filed = [buildFiledNode('GEO-9801', 'From widgets#7\n\nThe widget drops a retry.')];
  server.use(
    http.post('https://api.linear.app/graphql', async (resolver) => {
      const json = await resolver.request.json();
      const body = z.object({ query: z.string() }).parse(json);
      const nodes = body.query.includes('createdAt: {') ? filed : [];
      return HttpResponse.json({ data: { issues: { nodes, pageInfo: { hasNextPage: false, endCursor: null } } } });
    }),
  );
  const pass = () => {
    setMeta(ctx.db, 'kinds_synced_at', '2026-10-15T21:00:00Z');
    return watchTick(ctx.db, { me: 'hq-lanes', run, log: () => {}, stepMs: 10_000, steps: { runs: () => Promise.resolve(), weekly: () => Promise.resolve(false), health: () => Promise.resolve({ opened: [], cleared: [] }) } });
  };

  await pass();
  await pass();

  expect({
    alerted: ctx.db.query("SELECT subject_id FROM events WHERE subject = 'hq' AND action = 'alerted'").all(),
    outbox: ctx.db.query("SELECT target, text FROM outbox WHERE topic LIKE 'goals-alert:%'").all(),
  }).toStrictEqual({
    alerted: [{ subject_id: 'goals-alert:bad-filing:GEO-9801' }],
    outbox: [{ target: 'z-triage', text: "Bad filing: GEO-9801 points at widgets#7, but z-review has no follow-up record for it. If it came from that PR's review, record it: hq followup add GEO-9801 --from widgets#7" }],
  });
});

// At 18:00 Sydney with the kinds sync fresh and the goals sync never run, so the goals sync is due.
// gh answers the billing usage call with `billing` and every other call with an empty list.
function makeGoalsRunner(billing: RunResult): Runner {
  return (cmd) => {
    if (cmd[0] === 'gh' && cmd.some((arg) => arg.includes('settings/billing/usage'))) {
      return Promise.resolve(billing);
    }
    if (cmd[0] === 'gh') {
      return Promise.resolve({ code: 0, stdout: '[]', stderr: '' });
    }
    return Promise.resolve({ code: 1, stdout: '', stderr: 'invented: no answer for this command' });
  };
}

function runGoalsTick(db: Database, run: Runner): Promise<boolean> {
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-16T07:00:00Z'));
  for (const key of ['kinds_synced_at', 'kinds_ok_at', 'linear_synced_at']) {
    setMeta(db, key, '2026-10-16T06:55:00Z');
  }
  return watchTick(db, { me: 'hq-lanes', run, log: () => {}, stepMs: 10_000, steps: { runs: () => Promise.resolve(), weekly: () => Promise.resolve(false), health: () => Promise.resolve({ opened: [], cleared: [] }) } });
}

test("the watcher's goals sync stores the month's Actions spend from GitHub billing", async () => {
  const ctx = setupTest();
  await runGoalsTick(ctx.db, makeGoalsRunner({ code: 0, stdout: JSON.stringify({ usageItems: [{ product: 'actions', netAmount: 12.5 }] }), stderr: '' }));

  expect(loadActionsSpend(ctx.db, new Date('2026-10-16T07:00:00Z'))).toBe(12.5);
});

test("the watcher's goals sync replaces an earlier good Actions spend with unknown when gh fails", async () => {
  const ctx = setupTest();
  setMeta(ctx.db, 'actions_spend', JSON.stringify({ at: '2026-10-16T06:30:00Z', month: '2026-10', net: 4 }));
  await runGoalsTick(ctx.db, makeGoalsRunner({ code: 1, stdout: '', stderr: 'invented: HTTP 403' }));

  expect(loadActionsSpend(ctx.db, new Date('2026-10-16T07:00:00Z'))).toBeNull();
});

// At 20:00 UTC with every other sync fresh, so only the Ready pass is due. pacing.json gives only slot
// caps, so the lane rules stand on their own. Linear holds three
// Ready issues and one in Todo.
test('a due Ready pass writes the counts before the lanes tick, and the logged eligible shows them', async () => {
  const ctx = setupTest();
  mkdirSync(`${ctx.directory}/scripts`, { recursive: true });
  writeFileSync(`${ctx.directory}/pacing.json`, JSON.stringify({ slots: { imp: 7, local: 6 } }));
  onTestFinished(overrideEnv('HQ_CAPACITY', `${ctx.directory}/scripts/capacity.sh`));
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-15T20:00:00Z'));
  const capacity = JSON.stringify({ imp: { freeMib: 16_384, room: true }, providers: { claude: { room: true, unattended: true, target: 'imp' } } });
  const run: Runner = (command) => {
    const stdout = command[0] === 'op' ? 'lin_api_INVENTED\n' : capacity;
    return Promise.resolve({ code: 0, stdout, stderr: '' });
  };
  linearIssues.push(
    { identifier: 'GEO-1', team: 'GEO', state: 'Ready', stateType: 'unstarted', previousIdentifiers: [], project: 'atc roadmap', labels: [], parent: null },
    { identifier: 'GEO-2', team: 'GEO', state: 'Ready', stateType: 'unstarted', previousIdentifiers: [], project: 'atc maintenance', labels: [], parent: null },
    { identifier: 'GEO-3', team: 'GEO', state: 'Ready', stateType: 'unstarted', previousIdentifiers: [], project: 'imp roadmap', labels: [], parent: null },
    { identifier: 'GEO-4', team: 'GEO', state: 'Todo', stateType: 'unstarted', previousIdentifiers: [], project: 'atc roadmap', labels: [], parent: null },
  );
  const received = mock<(body: unknown) => void>();
  server.use(
    http.post(LINEAR_GRAPHQL_URL, async (info) => {
      const body: unknown = await info.request.clone().json();
      received(body);
    }),
  );
  setCapacitySetting(ctx.db, 'nonnixMaxMib', '65536', 'z-delivery');
  setCapacitySetting(ctx.db, 'nonnixMaxVcpus', '1000', 'z-delivery');
  for (let minutes = -5; minutes <= 105; minutes += 5) {
    createCapacitySample(ctx.db, { at: new Date(Date.parse('2026-10-15T20:00:00Z') + minutes * 60_000).toISOString().replace('.000Z', 'Z'), nonnixAwakeMib: 0 });
  }
  for (const key of ['kinds_synced_at', 'goals_synced_at', 'goals_ok_at', 'kinds_ok_at', 'linear_synced_at']) {
    setMeta(ctx.db, key, '2026-10-15T20:00:00Z');
  }
  const logs: string[] = [];

  await watchTick(ctx.db, { me: 'hq-lanes', run, log: (line) => logs.push(line), stepMs: 2000, steps: { runs: () => Promise.resolve(), weekly: () => Promise.resolve(false), health: () => Promise.resolve({ opened: [], cleared: [] }) } });

  const counts = readReadyByLane(ctx.db, 30);
  expect([counts['atc']?.n, counts['imp']?.n]).toStrictEqual([2, 1]);
  expect(logs.find((line) => line.includes('slots='))).toContain('eligible=3');
  expect(received.mock.calls).toMatchObject([[{ variables: { team: 'GEO', state: 'Ready' } }], [{ variables: { team: 'GEO', state: 'Backlog' } }]]);
  expect(metaJson(ctx.db, PROMOTABLE_FOCUS_KEY, PROMOTABLE_FOCUS, null)).toStrictEqual({ at: '2026-10-15T20:00:00Z', count: 0, focus: '[]', error: null });
});

// At 20:00 UTC with every other sync fresh. The open item waits on an issue, whose Linear read
// fails with a 500, and on a PR that GitHub reports merged.
test('it closes an item whose PR merged as done in a due unblock pass, and logs it and the failed issue read by item', async () => {
  const ctx = setupTest();
  const logs: string[] = [];
  const capacity = JSON.stringify({ imp: { freeMib: 0, room: false }, providers: { claude: { room: false, unattended: true, target: 'imp' } } });
  const fallback: Runner = (command) => Promise.resolve({ code: 0, stdout: command[0] === 'op' ? 'lin_api_INVENTED\n' : capacity, stderr: '' });
  const run = makePRStateGh({ states: { 'kettle-co/kettle#4': 'MERGED' }, fallback });
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-15T20:00:00Z'));
  for (const key of ['kinds_synced_at', 'goals_synced_at', 'goals_ok_at', 'kinds_ok_at', 'linear_synced_at', 'lanes_ready_linear_at']) {
    setMeta(ctx.db, key, '2026-10-15T20:00:00Z');
  }
  addUnblock(ctx.db, {
    id: 'approve-kettle',
    task: 'Approve the invented kettle app',
    minutes: null,
    unblocks: [],
    notify: [],
    actor: 'kettle-triage',
    doneWhen: [
      { kind: 'issue', ref: 'GEO-9' },
      { kind: 'pr', ref: 'kettle-co/kettle#4' },
    ],
  });
  server.use(http.post(LINEAR_GRAPHQL_URL, () => HttpResponse.json({ errors: [{ message: 'invented: Linear is unwell' }] }, { status: 500 })));

  await watchTick(ctx.db, { me: 'hq-lanes', run, log: (line) => logs.push(line), stepMs: 2000, steps: { runs: () => Promise.resolve(), weekly: () => Promise.resolve(false), health: () => Promise.resolve({ opened: [], cleared: [] }) } });

  expect(getUnblock(ctx.db, 'approve-kettle')?.state).toBe('done');
  expect(logs.filter((line) => line.includes('unblock conditions'))).toStrictEqual([
    '2026-10-15T20:00:00Z unblock conditions: closed approve-kettle as done',
    "2026-10-15T20:00:00Z unblock conditions: approve-kettle: can't read issue:GEO-9: Linear answered 500: invented: Linear is unwell",
  ]);
  expect(ctx.db.query("SELECT actor, data FROM events WHERE subject = 'hq' AND subject_id = 'op' AND action = 'read'").all()).toStrictEqual([{ actor: 'linear', data: '{"consumer":"linear","requests":3}' }]);
});

// At 20:00 UTC with every other sync fresh. Linear holds the issue as Done and the decision record
// as decided, and answers both over HTTP.
test('it closes the items whose Linear issue is Done and whose document is decided in a due unblock pass', async () => {
  const ctx = setupTest();
  const logs: string[] = [];
  const capacity = JSON.stringify({ imp: { freeMib: 0, room: false }, providers: { claude: { room: false, unattended: true, target: 'imp' } } });
  const run: Runner = (command) => Promise.resolve({ code: 0, stdout: command[0] === 'op' ? 'lin_api_INVENTED\n' : capacity, stderr: '' });
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-15T20:00:00Z'));
  for (const key of ['kinds_synced_at', 'goals_synced_at', 'goals_ok_at', 'kinds_ok_at', 'linear_synced_at', 'lanes_ready_linear_at']) {
    setMeta(ctx.db, key, '2026-10-15T20:00:00Z');
  }
  linearIssues.push({ identifier: 'KET-7', team: 'KET', state: 'Done', stateType: 'completed', previousIdentifiers: [], project: null, labels: [], parent: null });
  linearDocuments.push({ id: '5d6f1a52-8c3e-4b1f-9a77-0c2e4d6b8a10', slugID: 'abc123def456', content: 'Status: decided on 3 Mar 2026. The board approved the invented descaling plan.' });
  addUnblock(ctx.db, { id: 'steam-test', task: 'Run the steam test', minutes: null, unblocks: [], notify: [], actor: 'kettle-triage', doneWhen: [{ kind: 'issue', ref: 'KET-7' }] });
  addUnblock(ctx.db, { id: 'descale-plan', task: 'Approve the descaling plan', minutes: null, unblocks: [], notify: [], actor: 'kettle-triage', doneWhen: [{ kind: 'doc', ref: 'descaling-plan-abc123def456' }] });

  await watchTick(ctx.db, { me: 'hq-lanes', run, log: (line) => logs.push(line), stepMs: 2000, steps: { runs: () => Promise.resolve(), weekly: () => Promise.resolve(false), health: () => Promise.resolve({ opened: [], cleared: [] }) } });

  expect(getUnblock(ctx.db, 'steam-test')?.note).toBe('settled: issue:KET-7 Done');
  expect(getUnblock(ctx.db, 'descale-plan')?.note).toBe('settled: doc:descaling-plan-abc123def456 decided');
  expect(logs.filter((line) => line.includes('unblock conditions'))).toStrictEqual(['2026-10-15T20:00:00Z unblock conditions: closed steam-test, descale-plan as done']);
});

// At 20:00 UTC with every other sync fresh: a watch whose deadline passed at 19:00 waits on nothing hq reads.
test('it logs the items a due unblock pass found overdue', async () => {
  const ctx = setupTest();
  const logs: string[] = [];
  const run = buildStubProgramRunner({
    bash: { code: 0, stdout: JSON.stringify({ imp: { freeMib: 0, room: false }, providers: { claude: { room: false, unattended: true, target: 'imp' } } }), stderr: '' },
    gh: { code: 0, stdout: '[]', stderr: '' },
  });
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-15T20:00:00Z'));
  for (const key of ['kinds_synced_at', 'goals_synced_at', 'goals_ok_at', 'kinds_ok_at', 'linear_synced_at', 'lanes_ready_linear_at']) {
    setMeta(ctx.db, key, '2026-10-15T20:00:00Z');
  }
  addUnblock(ctx.db, { id: 'kettle-watch', task: 'Live-check the kettle once it ships', minutes: null, unblocks: [], notify: ['kettle-qa'], actor: 'kettle-triage', kind: 'watch', deadline: '2026-10-15T19:00:00Z' });

  await watchTick(ctx.db, { me: 'hq-lanes', run, log: (line) => logs.push(line), stepMs: 2000, steps: { runs: () => Promise.resolve(), weekly: () => Promise.resolve(false), health: () => Promise.resolve({ opened: [], cleared: [] }) } });

  expect(logs.filter((line) => line.includes('unblock conditions'))).toStrictEqual(['2026-10-15T20:00:00Z unblock conditions: overdue, sessions told: kettle-watch']);
});

test('a goals sync the deadline gave up on is not started again until it stops', async () => {
  const ctx = setupTest();
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-16T07:00:00Z'));
  for (const key of ['kinds_synced_at', 'kinds_ok_at', 'linear_synced_at']) {
    setMeta(ctx.db, key, '2026-10-16T06:55:00Z');
  }
  const held = Promise.withResolvers<void>();
  const goals = makeGoalsRunner({ code: 0, stdout: JSON.stringify({ usageItems: [] }), stderr: '' });
  const repoLists: string[][] = [];
  const run: Runner = async (cmd, opts) => {
    if (cmd[0] === 'gh' && cmd[1] === 'repo' && cmd[2] === 'list') {
      repoLists.push(cmd);
      await held.promise;
    }
    return goals(cmd, opts);
  };
  const logs: string[] = [];
  const deps = { me: 'hq-lanes', run, log: (line: string) => logs.push(line), stepMs: 50, steps: { runs: () => Promise.resolve(), weekly: () => Promise.resolve(false), health: () => Promise.resolve({ opened: [], cleared: [] }) } };

  await watchTick(ctx.db, deps);
  setMeta(ctx.db, 'goals_synced_at', '1970-01-01T00:00:00Z');
  await watchTick(ctx.db, deps);
  const whileHeld = repoLists.length;
  held.resolve();
  await waitFor('the given-up goals sync to stop', () => logs.some((line) => line.endsWith('team goals from an earlier pass stopped')));
  setMeta(ctx.db, 'goals_synced_at', '1970-01-01T00:00:00Z');
  await watchTick(ctx.db, deps);

  expect({ whileHeld, after: repoLists.length, skipped: logs.some((line) => line.endsWith('team goals failed: team goals from an earlier pass is still running')) }).toStrictEqual({ whileHeld: 1, after: 2, skipped: true });
});

// At 20:00 UTC with every other sync fresh and the GitHub pass due, where gh finds no PRs. Linear
// holds the run's issue as canceled at 19:00, and the run has no PR.
test('a due run-issue pass drops a run whose issue Linear canceled, tells z-delivery, and waits 10 minutes before the next read', async () => {
  const ctx = setupTest();
  const logs: string[] = [];
  const capacity = JSON.stringify({ imp: { freeMib: 0, room: false }, providers: { claude: { room: false, unattended: true, target: 'imp' } } });
  const answers: Record<string, string> = { op: 'lin_api_INVENTED\n', gh: '[]' };
  const run: Runner = (command) => Promise.resolve({ code: 0, stdout: answers[command[0] ?? ''] ?? capacity, stderr: '' });
  const variables = z.object({ ids: z.array(z.string()).optional() });
  const readIds = z.object({ variables: variables.optional() });
  const runIssueReads: string[] = [];
  const deps = { me: 'hq-lanes', run, log: (line: string) => logs.push(line), stepMs: 2000, steps: { runs: () => Promise.resolve(), weekly: () => Promise.resolve(false), health: () => Promise.resolve({ opened: [], cleared: [] }) } };
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-15T20:00:00Z'));
  for (const key of ['kinds_synced_at', 'goals_synced_at', 'goals_ok_at', 'kinds_ok_at', 'linear_synced_at', 'lanes_ready_linear_at']) {
    setMeta(ctx.db, key, '2026-10-15T20:00:00Z');
  }
  addRun(ctx.db, { issue: 'KET-8', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  linearIssues.push({ identifier: 'KET-8', team: 'KET', state: 'Canceled', stateType: 'canceled', canceledAt: '2026-10-15T19:00:00.000Z', previousIdentifiers: [], project: null, labels: [], parent: null });
  addRun(ctx.db, { issue: 'KET-9', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  server.use(
    http.post(LINEAR_GRAPHQL_URL, async (info) => {
      const raw: unknown = await info.request.clone().json();
      const body = readIds.parse(raw);
      if (body.variables?.ids?.includes('KET-9')) {
        runIssueReads.push(process.env['HQ_NOW'] ?? '');
      }
    }),
  );

  await watchTick(ctx.db, deps);
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-15T20:05:00Z'));
  await watchTick(ctx.db, deps);

  expect(ctx.db.query("SELECT state, close_note FROM runs WHERE issue = 'KET-8'").get()).toStrictEqual({ state: 'dropped', close_note: 'Linear canceled the issue before any PR merged' });
  expect(ctx.db.query('SELECT target FROM outbox').all()).toStrictEqual([{ target: 'z-delivery' }]);
  expect(logs.filter((line) => line.includes('run issues'))).toStrictEqual(['2026-10-15T20:00:00Z run issues: dropped KET-8, canceled in Linear before any merge']);
  expect(runIssueReads).toStrictEqual(['2026-10-15T20:00:00Z']);
});

// At 20:00 UTC with every other sync fresh and the GitHub pass due, where every gh call fails.
// Linear holds the run's issue as canceled at 19:00.
test('a run-issue pass drops nothing when this tick\'s GitHub pass did not read every PR', async () => {
  const ctx = setupTest();
  const capacity = JSON.stringify({ imp: { freeMib: 0, room: false }, providers: { claude: { room: false, unattended: true, target: 'imp' } } });
  const answers: Record<string, RunResult> = { gh: { code: 1, stdout: '', stderr: 'invented: GitHub is down' }, op: { code: 0, stdout: 'lin_api_INVENTED\n', stderr: '' } };
  const run: Runner = (command) => Promise.resolve(answers[command[0] ?? ''] ?? { code: 0, stdout: capacity, stderr: '' });
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-15T20:00:00Z'));
  for (const key of ['kinds_synced_at', 'goals_synced_at', 'goals_ok_at', 'kinds_ok_at', 'linear_synced_at', 'lanes_ready_linear_at']) {
    setMeta(ctx.db, key, '2026-10-15T20:00:00Z');
  }
  setMeta(ctx.db, 'run_prs_merged_since', '2026-10-15T19:59:00Z');
  addRun(ctx.db, { issue: 'KET-10', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  linearIssues.push({ identifier: 'KET-10', team: 'KET', state: 'Canceled', stateType: 'canceled', canceledAt: '2026-10-15T19:00:00.000Z', previousIdentifiers: [], project: null, labels: [], parent: null });

  await watchTick(ctx.db, { me: 'hq-lanes', run, log: () => {}, stepMs: 2000, steps: { runs: () => Promise.resolve(), weekly: () => Promise.resolve(false), health: () => Promise.resolve({ opened: [], cleared: [] }) } });

  expect(ctx.db.query("SELECT state FROM runs WHERE issue = 'KET-10'").get()).toStrictEqual({ state: 'working' });
  expect(ctx.db.query("SELECT state FROM linear_issues WHERE issue = 'KET-10'").get()).toStrictEqual({ state: 'canceled' });
});

test('it logs the Claude slot read, each problem it met and the news line it added', async () => {
  const ctx = setupTest();
  const capacity = JSON.stringify({ imp: { freeMib: 0, room: false }, providers: { claude: { room: false, unattended: true, target: 'imp' } } });
  const answers: Record<string, RunResult> = { op: { code: 0, stdout: 'lin_api_INVENTED\n', stderr: '' } };
  const run: Runner = (command) => Promise.resolve(answers[command[0] ?? ''] ?? { code: 0, stdout: capacity, stderr: '' });
  const logs: string[] = [];
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-15T20:00:00Z'));
  for (const key of ['kinds_synced_at', 'goals_synced_at', 'goals_ok_at', 'kinds_ok_at', 'linear_synced_at', 'lanes_ready_linear_at']) {
    setMeta(ctx.db, key, '2026-10-15T20:00:00Z');
  }

  await watchTick(ctx.db, {
    me: 'hq-lanes',
    run,
    log: (line) => logs.push(line),
    stepMs: 2000,
    steps: { runs: () => Promise.resolve(), weekly: () => Promise.resolve(false), health: () => Promise.resolve({ opened: [], cleared: [] }), slots: () => Promise.resolve({ read: { kind: 'read', readings: [], problems: ['slot 3: op read gave no token'] }, news: true }) },
  });

  expect(logs.filter((line) => line.includes('Claude slots'))).toStrictEqual([
    '2026-10-15T20:00:00Z Claude slots: read, 1 problem(s)',
    '2026-10-15T20:00:00Z Claude slots: slot 3: op read gave no token',
    '2026-10-15T20:00:00Z Claude slots: fleet forecast news line added',
  ]);
});

test('it hands the Claude slots step the signal its deadline aborts', async () => {
  const ctx = setupTest();
  const capacity = JSON.stringify({ imp: { freeMib: 0, room: false }, providers: { claude: { room: false, unattended: true, target: 'imp' } } });
  const answers: Record<string, RunResult> = { op: { code: 0, stdout: 'lin_api_INVENTED\n', stderr: '' } };
  const run: Runner = (command) => Promise.resolve(answers[command[0] ?? ''] ?? { code: 0, stdout: capacity, stderr: '' });
  const slots = mock<(signal: AbortSignal) => Promise<never>>(() => new Promise<never>(() => {}));
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-15T20:00:00Z'));
  for (const key of ['kinds_synced_at', 'goals_synced_at', 'goals_ok_at', 'kinds_ok_at', 'linear_synced_at', 'lanes_ready_linear_at']) {
    setMeta(ctx.db, key, '2026-10-15T20:00:00Z');
  }

  await watchTick(ctx.db, {
    me: 'hq-lanes',
    run,
    log: () => {},
    stepMs: 200,
    steps: { runs: () => Promise.resolve(), weekly: () => Promise.resolve(false), health: () => Promise.resolve({ opened: [], cleared: [] }), slots },
  });

  expect(slots.mock.calls[0]?.[0].aborted).toBe(true);
});

test('it logs a failing Claude slots step without stopping the tick', async () => {
  const ctx = setupTest();
  const capacity = JSON.stringify({ imp: { freeMib: 0, room: false }, providers: { claude: { room: false, unattended: true, target: 'imp' } } });
  const answers: Record<string, RunResult> = { op: { code: 0, stdout: 'lin_api_INVENTED\n', stderr: '' } };
  const run: Runner = (command) => Promise.resolve(answers[command[0] ?? ''] ?? { code: 0, stdout: capacity, stderr: '' });
  const logs: string[] = [];
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-15T20:00:00Z'));
  for (const key of ['kinds_synced_at', 'goals_synced_at', 'goals_ok_at', 'kinds_ok_at', 'linear_synced_at', 'lanes_ready_linear_at']) {
    setMeta(ctx.db, key, '2026-10-15T20:00:00Z');
  }

  await watchTick(ctx.db, {
    me: 'hq-lanes',
    run,
    log: (line) => logs.push(line),
    stepMs: 2000,
    steps: { runs: () => Promise.resolve(), weekly: () => Promise.resolve(false), health: () => Promise.resolve({ opened: [], cleared: [] }), slots: () => Promise.reject(new Error('invented: 1Password is down')) },
  });

  expect(logs.filter((line) => line.includes('Claude slots'))).toStrictEqual(['2026-10-15T20:00:00Z Claude slots failed: invented: 1Password is down']);
});

test('it marks a grant that a fetched hq-private PR added, and logs each grant it refused', async () => {
  const ctx = setupTest();
  const capacity = JSON.stringify({ imp: { freeMib: 0, room: false }, providers: { claude: { room: false, unattended: true, target: 'imp' } } });
  const answers: Record<string, RunResult> = { op: { code: 0, stdout: 'lin_api_INVENTED\n', stderr: '' } };
  const run: Runner = (command) => Promise.resolve(answers[command[0] ?? ''] ?? { code: 0, stdout: capacity, stderr: '' });
  const logs: string[] = [];
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-15T20:00:00Z'));
  onTestFinished(overrideEnv('HQ_PRIVATE_DIR', `${ctx.directory}/hq-private`));
  for (const key of ['kinds_synced_at', 'goals_synced_at', 'goals_ok_at', 'kinds_ok_at', 'linear_synced_at', 'lanes_ready_linear_at']) {
    setMeta(ctx.db, key, '2026-10-15T20:00:00Z');
  }
  const tree = createTreeCheckout(ctx.directory, 'private', { 'grants/z-kettle.yaml': '[]\n' });
  tree.writeCommit(
    { 'grants/z-kettle.yaml': '- id: pour\n  label: "Pour"\n  outcome: allow\n- id: pour-the-water-slowly-into-the-pot\n  label: "Pour slowly"\n  outcome: allow\n' },
    { subject: 'feat(grants): let z-kettle pour (#12)', at: '2026-10-13T09:00:00Z' },
  );

  await watchTick(ctx.db, {
    me: 'hq-lanes',
    run,
    log: (line) => logs.push(line),
    stepMs: 2000,
    steps: {
      runs: () => Promise.resolve(),
      weekly: () => Promise.resolve(false),
      health: () => Promise.resolve({ opened: [], cleared: [] }),
      grantMarks: () => runGrantMarksTick(ctx.db, { directory: tree.dir, exists: existsSync }, 'hq-lanes'),
    },
  });

  expect(ctx.db.query("SELECT at, ref, grant_name, added_by FROM marks WHERE kind = 'grant'").all()).toStrictEqual([{ at: '2026-10-13T09:00:00Z', ref: 'hq-private#12', grant_name: 'z-kettle-pour', added_by: 'hq-lanes' }]);
  expect(logs.filter((line) => line.includes('grant marks'))).toStrictEqual([
    '2026-10-15T20:00:00Z grant marks: added mark 1 for z-kettle-pour (hq-private#12)',
    '2026-10-15T20:00:00Z grant marks: refused z-kettle-pour-the-water-slowly-into-the-pot: a grant name must be a slug of lowercase letters, digits and single hyphens, 40 characters at most',
  ]);
});

test('it logs no slot token and no profile token when op, a slot request and a slot answer name them', async () => {
  const ctx = setupTest();
  const capacity = JSON.stringify({ imp: { freeMib: 0, room: false }, providers: { claude: { room: false, unattended: true, target: 'imp' } } });
  const answers: Record<string, RunResult> = { op: { code: 0, stdout: 'lin_api_INVENTED\n', stderr: '' } };
  const run: Runner = (command) => Promise.resolve(answers[command[0] ?? ''] ?? { code: 0, stdout: capacity, stderr: '' });
  const settings = `${ctx.directory}/settings.local.json`;
  const logs: string[] = [];
  const op = createStubOp({
    directory: ctx.directory,
    answers: {
      'op://claude-slots/claude-setup-token-2/credential': 'kettle-slot-credential-2',
      'op://claude-slots/claude-setup-token-3/credential': 'kettle-slot-credential-3',
      'op://claude-slots/claude-setup-token-4/credential': 'kettle-slot-credential-4',
    },
    failures: { 'op://claude-slots/claude-setup-token-1/credential': '[ERROR] invented: kettle-slot-credential-1 is held back from kettle-profile-credential' },
  });
  const slotAnswers: Record<string, () => Response> = {
    'Bearer kettle-slot-credential-2': () => {
      // The interceptor turns only an error with code and errno, as a Node socket error has, into a fetch rejection.
      throw Object.assign(new Error('invented proxy dropped kettle-slot-credential-2 minted by kettle-profile-credential'), { code: 'ECONNRESET', errno: -104 });
    },
    'Bearer kettle-slot-credential-3': () =>
      HttpResponse.json(
        { type: 'error', error: { type: 'api_error', message: 'invented outage for kettle-slot-credential-3 minted by kettle-profile-credential' } },
        { status: 500, headers: { 'x-invented-echo': 'kettle-slot-credential-3 kettle-profile-credential' } },
      ),
  };
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-15T20:00:00Z'));
  onTestFinished(overrideEnv('PATH', `${op.bin}:${process.env['PATH']}`));
  for (const key of ['kinds_synced_at', 'goals_synced_at', 'goals_ok_at', 'kinds_ok_at', 'linear_synced_at', 'lanes_ready_linear_at']) {
    setMeta(ctx.db, key, '2026-10-15T20:00:00Z');
  }
  writeFileSync(settings, JSON.stringify({ env: { OP_SERVICE_ACCOUNT_TOKEN: 'kettle-profile-credential' } }));
  slotUsage.set('Bearer kettle-slot-credential-4', { seven: { utilization: 0.4, reset: 1_792_540_800 } });
  server.use(http.post(ANTHROPIC_MESSAGES_URL, (info) => slotAnswers[info.request.headers.get('authorization') ?? '']?.()));

  await watchTick(ctx.db, {
    me: 'hq-lanes',
    run,
    log: (line) => logs.push(line),
    stepMs: 10_000,
    steps: {
      runs: () => Promise.resolve(),
      weekly: () => Promise.resolve(false),
      health: () => Promise.resolve({ opened: [], cleared: [] }),
      slots: (signal) => runFleetStep(ctx.db, { run: realRunner, httpClient: fetch, settings: { path: settings, readFile: readOptionalFile } }, now(), { force: false, signal }),
    },
  });

  expect(logs.filter((line) => line.includes('Claude slots'))).toStrictEqual([
    '2026-10-15T20:00:00Z Claude slots: read, 3 problem(s)',
    '2026-10-15T20:00:00Z Claude slots: slot 1: op read failed (exit 1)',
    '2026-10-15T20:00:00Z Claude slots: slot 2: invented proxy dropped [redacted] minted by [redacted]',
    '2026-10-15T20:00:00Z Claude slots: slot 3: the messages API answered 500',
  ]);
  expect(logs.filter((line) => line.includes('kettle-slot-credential') || line.includes('kettle-profile-credential'))).toStrictEqual([]);
});
