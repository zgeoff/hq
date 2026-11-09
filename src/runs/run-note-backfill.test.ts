import { expect, onTestFinished, test } from 'bun:test';
import { updateEnv } from '@zgeoff/testing/helpers';
import { NOON_SYDNEY, fakeAtc, freshDb } from '../../test/helpers.ts';
import { buildMockSha } from '../../test/build-mock-sha.ts';
import { buildStubFinalGH } from '../../test/build-stub-final-gh.ts';
import { AtcClient } from '../atc/atc-client.ts';
import { setMeta } from '../db/set-meta.ts';
import { addPR } from './add-pr.ts';
import { addRun } from './add-run.ts';
import { FROM_START } from './from-start.ts';
import { ingestNotes } from './ingest-notes.ts';
import { listRuns } from './list-runs.ts';
import type { BackfillAttach } from './pick-backfill-start.ts';
import { runNoteBackfill } from './run-note-backfill.ts';
import { setSession } from './set-session.ts';
import { setState } from './set-state.ts';

function setupTest() {
  const kettle = '00000031-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const noonMs = new Date(NOON_SYDNEY).getTime();
  const hourMs = 60 * 60 * 1000;
  const fresh = freshDb();
  const stub = fakeAtc(fresh.dir, [{ id: kettle, name: 'kettle', alive: true, state: 'running' }]);
  onTestFinished(() => {
    stub.stop();
    fresh.cleanup();
  });
  const head = `44238662${buildMockSha(2).slice(8)}`;
  const run = buildStubFinalGH({ commits: [head] }, []);
  return {
    db: fresh.db,
    stub,
    run,
    kettle,
    noonMs,
    hourMs,
    head,
    backfill: (attach: BackfillAttach) => runNoteBackfill(fresh.db, { issue: 'GEO-9731', session: kettle, attach, run, openClient: () => AtcClient.open() }),
    addRunWithoutSession: (startedAt: string) => {
      updateEnv('HQ_NOW', startedAt);
      addRun(fresh.db, { issue: 'GEO-9731', title: 'Invented kettle work', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, actor: 'z-delivery' });
      addPR(fresh.db, 'GEO-9731', 'kettle#714', 'z-delivery');
    },
    attach: () => setSession(fresh.db, 'GEO-9731', kettle, 'z-delivery', 'add'),
    finalNote: (at: number) => ({ at, session: kettle, name: 'kettle', kind: 'note', detail: 'FINAL kettle#714 44238662', label: 'progress' }),
    readFinalMessages: () => fresh.db.query(`SELECT text FROM outbox WHERE target = 'z-review'`).all(),
  };
}

test('it marks the PR final and queues one Final message for a FINAL sent before the session joined', async () => {
  const ctx = setupTest();
  ctx.addRunWithoutSession(new Date(ctx.noonMs - ctx.hourMs).toISOString());
  ctx.stub.feed.push(ctx.finalNote(ctx.noonMs));
  ctx.attach();

  const result = await ctx.backfill('session-add');

  expect(result).toStrictEqual({ kind: 'read', notes: 1, finals: ['kettle#714'] });
  expect(listRuns(ctx.db)[0]?.prs[0]?.final_sha).toBe(`44238662${buildMockSha(2).slice(8)}`);
  expect(ctx.readFinalMessages()).toStrictEqual([{ text: 'Final: GEO-9731 (kettle#714 at 4423866). Review it, then merge.' }]);
});

test('it marks the PR final for a FINAL the session sent before hq run add gave it a new run', async () => {
  const ctx = setupTest();
  ctx.stub.feed.push(ctx.finalNote(ctx.noonMs - ctx.hourMs));
  updateEnv('HQ_NOW', NOON_SYDNEY);
  addRun(ctx.db, { issue: 'GEO-9731', title: 'Invented kettle work', place: 'local', session: ctx.kettle, next: 'Agent working.', gate: null, geoffChat: false, actor: 'z-delivery' });

  const result = await ctx.backfill('run-add');

  expect(result).toStrictEqual({ kind: 'read', notes: 1, finals: ['kettle#714'] });
  expect(listRuns(ctx.db)[0]?.prs[0]?.final_sha).toBe(`44238662${buildMockSha(2).slice(8)}`);
});

test('it stores and applies nothing more when the backfill runs twice', async () => {
  const ctx = setupTest();
  ctx.addRunWithoutSession(new Date(ctx.noonMs - ctx.hourMs).toISOString());
  ctx.stub.feed.push(ctx.finalNote(ctx.noonMs));
  ctx.attach();
  await ctx.backfill('session-add');

  const second = await ctx.backfill('session-add');

  expect(second).toStrictEqual({ kind: 'read', notes: 0, finals: [] });
  expect(ctx.db.query('SELECT count(*) AS total FROM run_notes').get()).toStrictEqual({ total: 1 });
  expect(ctx.readFinalMessages()).toHaveLength(1);
});

test('it skips a note the live ingest stored before a feed reset changed its event key', async () => {
  const ctx = setupTest();
  ctx.addRunWithoutSession(new Date(ctx.noonMs - ctx.hourMs).toISOString());
  ctx.attach();
  setMeta(ctx.db, 'atc_events_cursor', FROM_START);
  ctx.stub.feed.push(ctx.finalNote(ctx.noonMs));
  const client = await AtcClient.open();
  onTestFinished(() => client.close());
  await ingestNotes(ctx.db, client, { run: ctx.run });
  setMeta(ctx.db, 'atc_events_cursor', Buffer.from('{"k":"ev","i":0}').toString('base64url'));
  await ingestNotes(ctx.db, client, { run: ctx.run });

  const result = await ctx.backfill('session-add');

  expect(result).toStrictEqual({ kind: 'read', notes: 0, finals: [] });
  expect(ctx.readFinalMessages()).toHaveLength(1);
});

test('it skips a note older than the run started', async () => {
  const ctx = setupTest();
  ctx.addRunWithoutSession(NOON_SYDNEY);
  ctx.stub.feed.push(ctx.finalNote(ctx.noonMs - ctx.hourMs));
  ctx.attach();

  const result = await ctx.backfill('session-add');

  expect(result).toStrictEqual({ kind: 'read', notes: 0, finals: [] });
  expect(listRuns(ctx.db)[0]?.prs[0]?.final_sha).toBeNull();
});

test('it skips a note from more than a day before now on a run that started earlier', async () => {
  const ctx = setupTest();
  ctx.addRunWithoutSession(new Date(ctx.noonMs - 72 * ctx.hourMs).toISOString());
  ctx.stub.feed.push(ctx.finalNote(ctx.noonMs - 30 * ctx.hourMs));
  updateEnv('HQ_NOW', NOON_SYDNEY);
  ctx.attach();

  const result = await ctx.backfill('session-add');

  expect(result).toStrictEqual({ kind: 'read', notes: 0, finals: [] });
});

test('it keeps a design pass note and applies no signal from it', async () => {
  const ctx = setupTest();
  updateEnv('HQ_NOW', new Date(ctx.noonMs - 2 * ctx.hourMs).toISOString());
  addRun(ctx.db, { issue: 'GEO-9731', title: 'Design the kettle spout', place: 'local', session: ctx.kettle, next: 'Agent working.', gate: null, geoffChat: false, design: 'agent', actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9731', 'done', { note: 'design settled' }, 'z-delivery');
  updateEnv('HQ_NOW', new Date(ctx.noonMs - ctx.hourMs).toISOString());
  addRun(ctx.db, { issue: 'GEO-9731', title: 'Build the kettle spout', place: 'local', session: null, next: 'Building.', gate: null, geoffChat: false, actor: 'z-delivery' });
  ctx.stub.feed.push(ctx.finalNote(ctx.noonMs));

  const result = await ctx.backfill('session-add');

  expect(result).toStrictEqual({ kind: 'read', notes: 1, finals: [] });
  expect(listRuns(ctx.db)[0]?.prs).toStrictEqual([]);
});

test('it reports an atc read failure and leaves the session attached', async () => {
  const ctx = setupTest();
  ctx.addRunWithoutSession(NOON_SYDNEY);
  ctx.attach();
  ctx.stub.stop();

  const result = await ctx.backfill('session-add');

  expect(result).toStrictEqual({ kind: 'unread', reason: expect.any(String) });
  expect(listRuns(ctx.db)[0]?.sessions.map((row) => [row.session_id, row.active])).toStrictEqual([[ctx.kettle, 1]]);
});
