import { expect, onTestFinished, test } from 'bun:test';
import { buildFiledNode } from '../../../test/build-filed-node.ts';
import { fetchedDays, freshDb } from '../../../test/helpers.ts';
import { makeThroughputLinearCall } from '../../../test/make-throughput-linear-call.ts';
import { main } from '../../cli.ts';
import { overrideEnv } from '../../config/override-env.ts';
import { setMeta } from '../../db/set-meta.ts';
import { addFollowup } from '../../followups/add-followup.ts';
import { syncLinear } from '../../kinds/sync-linear.ts';
import type { LinearCall } from '../../linear/types.ts';
import { addRun } from '../../runs/add-run.ts';
import { dailyText } from '../daily/daily-text.ts';
import { sendThroughputAlerts } from './send-throughput-alerts.ts';

// A database at 18:00 on Fri 16 Oct in Sydney (07:00Z; the Sydney day began at 13:00Z on 15 Oct),
// with the goals data fresh and HOME in its folder.
function setupTest() {
  const fresh = freshDb();
  const home = process.env['HOME'];
  const now = '2026-10-16T07:00:00Z';
  onTestFinished(fresh.cleanup);
  onTestFinished(overrideEnv('HQ_NOW', now));
  onTestFinished(overrideEnv('HQ_NOTIFY', 'off'));
  process.env['HOME'] = fresh.dir;
  onTestFinished(() => {
    process.env['HOME'] = home;
  });
  fetchedDays(fresh.db);
  for (const key of ['goals_ok_at', 'kinds_ok_at', 'linear_synced_at']) {
    setMeta(fresh.db, key, '2026-10-16T06:50:00Z');
  }
  return {
    db: fresh.db,
    now,
    readOutbox: () => fresh.db.query('SELECT target, text FROM outbox ORDER BY id').all(),
    findLine: (name: string) =>
      dailyText(fresh.db, new Date(now))
        .split('\n')
        .find((line) => line.startsWith(`- ${name}:`)),
  };
}

test('hq goals daily --dry-run prints the issues, bad filings and stale lines with their targets and colours', async () => {
  const ctx = setupTest();
  ctx.db.query(`INSERT INTO linear_issues (issue, type, title, state, closed_at, fetched_at) VALUES ('GEO-9810', 'Bug', 't', 'completed', '2026-10-16T02:00:00Z', '${ctx.now}')`).run();
  await syncLinear(ctx.db, makeThroughputLinearCall([buildFiledNode('GEO-9801', 'From widgets#7\n\nThe widget drops a retry.'), buildFiledNode('GEO-9802', 'Descale the kettle.')]), new Date('2026-10-14T00:00:00Z'), new Date(ctx.now));
  const printed: string[] = [];
  const log = console.log;
  console.log = (text: string) => printed.push(text);
  onTestFinished(() => {
    console.log = log;
  });

  await main(['goals', 'daily', '--dry-run', '--by', 'z-kettle']);

  expect(printed.join('\n').split('\n').slice(8, 11)).toStrictEqual([
    '- Issues: today 2 filed (owner 2, design 0, agent 0, review 0, live check 0, bot 0), 1 closed; target none –',
    '- Bad filings: today 1 (GEO-9801 from widgets#7); target 0 🔴 red',
    '- Stale: 0 older than 24h, 0 in all; target 0 older than 24h 🟢 green',
  ]);
  expect(ctx.readOutbox()).toStrictEqual([]);
});

test('the lines carry no count and no colour before hq has read Linear', () => {
  const ctx = setupTest();

  expect(ctx.findLine('Bad filings')).toBe('- Bad filings: Linear not read yet; target 0 –');
});

test('a filing that points at a PR with no follow-up record is counted, and triage hears once per issue across two passes', async () => {
  const ctx = setupTest();
  await syncLinear(
    ctx.db,
    makeThroughputLinearCall([
      buildFiledNode('GEO-9801', 'From widgets#7\n\nThe widget drops a retry.'),
      buildFiledNode('GEO-9802', '* Found by the GEO-9700 agent on kettle#3: a stale comment.'),
      buildFiledNode('GEO-9803', 'No PR here.'),
    ]),
    new Date('2026-10-14T00:00:00Z'),
    new Date(ctx.now),
  );

  const first = sendThroughputAlerts(ctx.db, 'hq-lanes', new Date('2026-10-14T00:00:00Z'), new Date(ctx.now));
  const second = sendThroughputAlerts(ctx.db, 'hq-lanes', new Date('2026-10-14T00:00:00Z'), new Date('2026-10-16T07:30:00Z'));

  expect({ first, second, line: ctx.findLine('Bad filings') }).toStrictEqual({
    first: ['bad-filing:GEO-9801', 'bad-filing:GEO-9802'],
    second: [],
    line: '- Bad filings: today 2 (GEO-9801 from widgets#7, GEO-9802 from kettle#3); target 0 🔴 red',
  });
  expect(ctx.readOutbox()).toStrictEqual([
    { target: 'z-triage', text: 'Bad filing: GEO-9801 points at widgets#7, but z-review has no follow-up record for it. If it came from that PR\'s review, record it: hq followup add GEO-9801 --from widgets#7' },
    { target: 'z-triage', text: 'Bad filing: GEO-9802 points at kettle#3, but z-review has no follow-up record for it. If it came from that PR\'s review, record it: hq followup add GEO-9802 --from kettle#3' },
  ]);
});

test('a filing z-review recorded is a review issue, not a bad filing, and sends nothing', async () => {
  const ctx = setupTest();
  await syncLinear(ctx.db, makeThroughputLinearCall([buildFiledNode('GEO-9801', null, { attachments: { nodes: [{ url: 'https://github.com/zgeoff/widgets/pull/7' }] } })]), new Date('2026-10-14T00:00:00Z'), new Date(ctx.now));
  addFollowup(ctx.db, { issue: 'GEO-9801', fromRef: 'widgets#7', actor: 'z-review' });

  expect({ sent: sendThroughputAlerts(ctx.db, 'hq-lanes', new Date('2026-10-14T00:00:00Z'), new Date(ctx.now)), issues: ctx.findLine('Issues'), bad: ctx.findLine('Bad filings') }).toStrictEqual({
    sent: [],
    issues: '- Issues: today 1 filed (owner 0, design 0, agent 0, review 1, live check 0, bot 0), 0 closed; target none –',
    bad: '- Bad filings: today 0; target 0 🟢 green',
  });
});

test('the issues line splits filings by source', async () => {
  const ctx = setupTest();
  await syncLinear(
    ctx.db,
    makeThroughputLinearCall([
      buildFiledNode('GEO-9801', 'From design https://linear.app/kettle/document/descale-plan-1a2b\n\nThe first part.'),
      buildFiledNode('GEO-9802', 'Found by the GEO-9700 agent while it descaled.'),
      buildFiledNode('GEO-9803', null, { title: 'Live check: the kettle boils' }),
      buildFiledNode('GEO-9804', null, { labels: { nodes: [{ name: 'live check' }] } }),
      buildFiledNode('GEO-9805', 'Filed by an integration.', { creator: null }),
      buildFiledNode('GEO-9806', 'Filed by an app user.', { creator: { app: true } }),
      buildFiledNode('GEO-9807', 'Descale the kettle.'),
      buildFiledNode('GEO-9808', 'Filed yesterday in Sydney.', { createdAt: '2026-10-15T12:59:00Z' }),
    ]),
    new Date('2026-10-14T00:00:00Z'),
    new Date(ctx.now),
  );

  expect(ctx.findLine('Issues')).toBe('- Issues: today 7 filed (owner 1, design 1, agent 1, review 0, live check 2, bot 2), 0 closed; target none –');
});

test('an In Progress issue with no run, or an open run on a closed issue, is stale after 24 hours, and triage hears once each', async () => {
  const ctx = setupTest();
  const run = (issue: string) => addRun(ctx.db, { issue, title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, actor: 'z-delivery' });
  run('GEO-9803');
  run('GEO-9804');
  run('GEO-9805');
  const closed = ctx.db.query(`INSERT INTO linear_issues (issue, type, title, state, closed_at, fetched_at) VALUES (?, 'Bug', 't', ?, ?, '${ctx.now}')`);
  closed.run('GEO-9804', 'completed', '2026-10-14T07:00:00Z');
  closed.run('GEO-9805', 'canceled', '2026-10-16T01:00:00Z');
  const started = [
    { identifier: 'GEO-9801', startedAt: '2026-10-14T07:00:00Z' },
    { identifier: 'GEO-9802', startedAt: '2026-10-16T01:00:00Z' },
    { identifier: 'GEO-9803', startedAt: '2026-10-10T01:00:00Z' },
  ];
  await syncLinear(ctx.db, makeThroughputLinearCall([], started), new Date('2026-10-14T00:00:00Z'), new Date(ctx.now));

  const first = sendThroughputAlerts(ctx.db, 'hq-lanes', new Date('2026-10-14T00:00:00Z'), new Date(ctx.now));
  const second = sendThroughputAlerts(ctx.db, 'hq-lanes', new Date('2026-10-14T00:00:00Z'), new Date(ctx.now));

  expect({ first, second, line: ctx.findLine('Stale') }).toStrictEqual({
    first: ['stale:in-progress:GEO-9801', 'stale:open-run:GEO-9804'],
    second: [],
    line: '- Stale: 2 older than 24h (GEO-9801 In Progress, no run, GEO-9804 run open, issue completed), 4 in all; target 0 older than 24h 🔴 red',
  });
  expect(ctx.readOutbox()).toStrictEqual([
    { target: 'z-triage', text: 'Stale: GEO-9801 has been In Progress in Linear since 2026-10-14T07:00:00Z with no hq run and no session. Start its run, or move it out of In Progress.' },
    { target: 'z-triage', text: "Stale: GEO-9804's hq run is still open, but Linear marked the issue completed at 2026-10-14T07:00:00Z. Close the run, or reopen the issue." },
  ]);
});

test('hq followup add GEO-n --from repo#n records a review follow-up without --backfill', async () => {
  const ctx = setupTest();
  const log = console.log;
  console.log = () => {};
  onTestFinished(() => {
    console.log = log;
  });

  await main(['followup', 'add', 'GEO-9807', '--from', 'widgets#7', '--by', 'z-review']);

  expect(ctx.db.query('SELECT issue, from_ref, filed_at, source, added_by FROM followups').all()).toStrictEqual([{ issue: 'GEO-9807', from_ref: 'widgets#7', filed_at: ctx.now, source: 'review', added_by: 'z-review' }]);
});

test('the Linear sync stamps the filed and In Progress issues with the time it was given, not the clock', async () => {
  const ctx = setupTest();
  const at = '2026-10-16T05:00:00Z';

  await syncLinear(ctx.db, makeThroughputLinearCall([buildFiledNode('GEO-9801', 'Descale the kettle.')], [{ identifier: 'GEO-9802', startedAt: '2026-10-16T01:00:00Z' }]), new Date('2026-10-14T00:00:00Z'), new Date(at));

  expect({
    filed: ctx.db.query('SELECT issue, fetched_at FROM linear_filed').all(),
    started: ctx.db.query('SELECT issue, fetched_at FROM linear_started').all(),
  }).toStrictEqual({ filed: [{ issue: 'GEO-9801', fetched_at: at }], started: [{ issue: 'GEO-9802', fetched_at: at }] });
});

test('a failed read of the filed issues leaves the lines unavailable, with no colour and no alerts, until a read succeeds', async () => {
  const ctx = setupTest();
  const filed = [buildFiledNode('GEO-9801', 'From widgets#7\n\nThe widget drops a retry.')];
  await syncLinear(ctx.db, makeThroughputLinearCall([]), new Date('2026-10-14T00:00:00Z'), new Date('2026-10-16T06:00:00Z'));
  const working = makeThroughputLinearCall(filed);
  const failing: LinearCall = (query, variables) => (query.includes('createdAt: {') ? Promise.reject(new Error('Linear answered 502: invented outage')) : working(query, variables));

  const error = await syncLinear(ctx.db, failing, new Date('2026-10-14T00:00:00Z'), new Date(ctx.now)).catch((caught: unknown) => caught);
  const failed = { line: ctx.findLine('Bad filings'), sent: sendThroughputAlerts(ctx.db, 'hq-lanes', new Date('2026-10-14T00:00:00Z'), new Date(ctx.now)) };
  await syncLinear(ctx.db, working, new Date('2026-10-14T00:00:00Z'), new Date(ctx.now));

  expect({ error, failed, recovered: ctx.findLine('Bad filings') }).toStrictEqual({
    error: new Error('Linear answered 502: invented outage'),
    failed: { line: '- Bad filings: Linear read failed, last read 2026-10-16T06:00:00Z; target 0 –', sent: [] },
    recovered: '- Bad filings: today 1 (GEO-9801 from widgets#7); target 0 🔴 red',
  });
});

test('a filing read just after Sydney midnight but filed just before it still alerts, and stays off the line for today', async () => {
  const ctx = setupTest();
  await syncLinear(ctx.db, makeThroughputLinearCall([buildFiledNode('GEO-9801', 'From widgets#7\n\nThe widget drops a retry.', { createdAt: '2026-10-15T12:55:00Z' })]), new Date('2026-10-14T00:00:00Z'), new Date(ctx.now));

  expect({ sent: sendThroughputAlerts(ctx.db, 'hq-lanes', new Date('2026-10-14T07:00:00Z'), new Date(ctx.now)), line: ctx.findLine('Bad filings') }).toStrictEqual({
    sent: ['bad-filing:GEO-9801'],
    line: '- Bad filings: today 0; target 0 🟢 green',
  });
});
