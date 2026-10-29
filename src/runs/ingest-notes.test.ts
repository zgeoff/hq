import { expect, onTestFinished, test } from 'bun:test';
import { z } from 'zod';
import { NOON_SYDNEY, fakeAtc, freshDb } from '../../test/helpers.ts';
import { AtcClient } from '../atc/atc-client.ts';
import { buildStubFinalGH } from '../../test/build-stub-final-gh.ts';
import { buildMockSha } from '../../test/build-mock-sha.ts';
import { addPr } from './add-pr.ts';
import { addRun } from './add-run.ts';
import { FROM_START } from './from-start.ts';
import { listRuns } from './list-runs.ts';
import { ingestNotes } from './ingest-notes.ts';
import { setState } from './set-state.ts';

const KETTLE = '00000031-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

// One open run on KETTLE, a fake atc whose feed holds one note from it, and a stored cursor in the
// keyed form of atc 5.
function setupTest() {
  const fresh = freshDb(),
    stub = fakeAtc(fresh.dir, [{ id: KETTLE, name: 'kettle', alive: true, state: 'running' }]);
  onTestFinished(() => {
    stub.stop();
    fresh.cleanup();
  });
  addRun(fresh.db, { issue: 'GEO-9731', title: 'Invented kettle work', place: 'local', session: KETTLE, next: 'Agent working.', gate: null, geoffChat: false, actor: 'z-delivery' });
  stub.feed.push({ at: new Date(NOON_SYDNEY).getTime(), session: KETTLE, name: 'kettle', kind: 'note', detail: 'descaled the kettle', label: 'progress' });
  fresh.db.query("INSERT INTO meta (key, value) VALUES ('atc_events_cursor', ?)").run(Buffer.from(JSON.stringify({ k: 'ev', i: 0 })).toString('base64url'));
  const eventData = () =>
    z
      .array(z.object({ data: z.string() }))
      .parse(fresh.db.query(`SELECT data FROM events WHERE action = 'final'`).all())
      .map((event) => z.record(z.string(), z.unknown()).parse(JSON.parse(event.data)));
  return { db: fresh.db, stub, eventData };
}

async function openClient(): Promise<AtcClient> {
  const client = await AtcClient.open();
  onTestFinished(() => client.close());
  return client;
}

test('it resets a cursor in the keyed form of atc 5', async () => {
  const app = setupTest();
  const client = await openClient();

  const first = await ingestNotes(app.db, client, { run: buildStubFinalGH({ commits: [] }, []) });

  expect(first.reset).toBe(true);
});

test('it keeps the notes on the read after a keyed cursor resets, and resets no more', async () => {
  const app = setupTest();
  const client = await openClient();
  await ingestNotes(app.db, client, { run: buildStubFinalGH({ commits: [] }, []) });

  const second = await ingestNotes(app.db, client, { run: buildStubFinalGH({ commits: [] }, []) });

  expect(second).toMatchObject({ reset: false, notes: 1 });
});

test('it reads the commits of a PR once for several FINAL notes on it', async () => {
  const app = setupTest();
  const client = await openClient();
  const head = `44238662${buildMockSha(2).slice(8)}`;
  const early = `1a2b3c4${buildMockSha(1).slice(7)}`;
  const calls: string[] = [];
  const run = buildStubFinalGH({ commits: [early, head] }, calls);
  const base = new Date(NOON_SYDNEY).getTime();
  addPr(app.db, 'GEO-9731', 'kettle#714', 'z-delivery');
  await ingestNotes(app.db, client, { run });
  app.stub.feed.push(
    { at: base + 1000, session: KETTLE, name: 'kettle', kind: 'note', detail: 'FINAL kettle#714 44238662', label: 'progress' },
    { at: base + 2000, session: KETTLE, name: 'kettle', kind: 'note', detail: 'kettle#714 is final again at 1a2b3c4', label: 'progress' },
  );

  await ingestNotes(app.db, client, { run });

  expect(calls).toStrictEqual(['gh api repos/zgeoff/kettle/pulls/714/commits --paginate --jq .[].sha']);
});

test('it reads GitHub nothing for a FINAL note read again after the feed rewinds', async () => {
  const app = setupTest();
  const client = await openClient();
  const head = `44238662${buildMockSha(2).slice(8)}`;
  const calls: string[] = [];
  const run = buildStubFinalGH({ commits: [head] }, calls);
  addPr(app.db, 'GEO-9731', 'kettle#714', 'z-delivery');
  await ingestNotes(app.db, client, { run });
  app.stub.feed.push({ at: new Date(NOON_SYDNEY).getTime() + 1000, session: KETTLE, name: 'kettle', kind: 'note', detail: 'FINAL kettle#714 44238662', label: 'progress' });
  await ingestNotes(app.db, client, { run });
  app.db.query("UPDATE meta SET value = ? WHERE key = 'atc_events_cursor'").run(FROM_START);

  await ingestNotes(app.db, client, { run });

  expect(calls).toStrictEqual(['gh api repos/zgeoff/kettle/pulls/714/commits --paginate --jq .[].sha']);
});

test('it records the sha as given and unresolved when the commit list read fails', async () => {
  const app = setupTest();
  const client = await openClient();
  const run = buildStubFinalGH({ commits: 'fault' }, []);
  addPr(app.db, 'GEO-9731', 'kettle#714', 'z-delivery');
  await ingestNotes(app.db, client, { run });
  app.stub.feed.push({ at: new Date(NOON_SYDNEY).getTime() + 1000, session: KETTLE, name: 'kettle', kind: 'note', detail: 'FINAL kettle#714 44238662', label: 'progress' });

  await ingestNotes(app.db, client, { run });

  expect(listRuns(app.db)[0]?.prs[0]?.final_sha).toBe('44238662');
  expect(app.eventData()).toStrictEqual([
    {
      ref: 'kettle#714',
      sha: '44238662',
      source: 'marker:atc:00000031',
      note: expect.any(Number),
      given: '44238662',
      resolved: false,
      reason: 'gh: Bad Gateway (HTTP 502)',
    },
  ]);
});

test('it keeps a FINAL note that names no commit, marks nothing, and tells the orchestrator both shas', async () => {
  const app = setupTest();
  const client = await openClient();
  const head = `44238662${buildMockSha(2).slice(8)}`;
  const run = buildStubFinalGH({ commits: [head] }, []);
  addPr(app.db, 'GEO-9731', 'kettle#714', 'z-delivery');
  await ingestNotes(app.db, client, { run });
  app.stub.feed.push({ at: new Date(NOON_SYDNEY).getTime() + 1000, session: KETTLE, name: 'kettle', kind: 'note', detail: 'FINAL kettle#714 4423866e', label: 'progress' });

  await ingestNotes(app.db, client, { run });

  expect(app.db.query('SELECT text FROM run_notes ORDER BY id').all()).toStrictEqual([{ text: 'descaled the kettle' }, { text: 'FINAL kettle#714 4423866e' }]);
  expect(listRuns(app.db)[0]?.prs[0]?.final_sha).toBeNull();
  expect(app.db.query(`SELECT target, text FROM outbox WHERE target != 'z-review'`).all()).toStrictEqual([
    {
      target: 'z-delivery',
      text: 'GEO-9731: the FINAL names 4423866e, which is no commit of zgeoff/kettle#714; its head is 44238662 - send the FINAL again at that sha',
    },
  ]);
});

test('it records a FINAL phrase for a PR an earlier note in the same page attached as given and not resolved', async () => {
  const app = setupTest();
  const client = await openClient();
  const calls: string[] = [];
  const run = buildStubFinalGH({ commits: [`44238662${buildMockSha(2).slice(8)}`] }, calls);
  const base = new Date(NOON_SYDNEY).getTime();
  await ingestNotes(app.db, client, { run });
  app.stub.feed.push(
    { at: base + 1000, session: KETTLE, name: 'kettle', kind: 'note', detail: 'opened kettle#714 for the descaler', label: 'progress' },
    { at: base + 2000, session: KETTLE, name: 'kettle', kind: 'note', detail: 'the descaler is final at 44238662', label: 'progress' },
  );

  await ingestNotes(app.db, client, { run });

  expect(app.eventData()).toStrictEqual([
    {
      ref: 'kettle#714',
      sha: '44238662',
      source: 'phrase:atc:00000031',
      note: expect.any(Number),
      given: '44238662',
      resolved: false,
      reason: 'not resolved in this pass',
    },
  ]);
});

test('it keeps a late note from the design pass session but marks no build PR final from it', async () => {
  const fresh = freshDb();
  const stub = fakeAtc(fresh.dir, [{ id: KETTLE, name: 'kettle', alive: true, state: 'running' }]);
  onTestFinished(() => {
    stub.stop();
    fresh.cleanup();
  });
  addRun(fresh.db, { issue: 'GEO-9732', title: 'Design the kettle spout', place: 'local', session: KETTLE, next: 'Agent working.', gate: null, geoffChat: false, design: 'agent', actor: 'z-delivery' });
  setState(fresh.db, 'GEO-9732', 'done', { note: 'design settled' }, 'z-delivery');
  addRun(fresh.db, { issue: 'GEO-9732', title: 'Build the kettle spout', place: 'local', session: null, next: 'Building.', gate: null, geoffChat: false, actor: 'z-delivery' });
  addPr(fresh.db, 'GEO-9732', 'kettle#32', 'z-delivery');
  stub.feed.push({ at: new Date(NOON_SYDNEY).getTime(), session: KETTLE, name: 'kettle', kind: 'note', detail: 'the spout sketch is final at 39f05fe', label: 'progress' });
  fresh.db.query("INSERT INTO meta (key, value) VALUES ('atc_events_cursor', ?)").run(FROM_START);
  const client = await openClient();

  const ingested = await ingestNotes(fresh.db, client, { run: buildStubFinalGH({ commits: [] }, []) });

  expect([ingested.notes, ingested.finals]).toStrictEqual([1, []]);
  expect(fresh.db.query("SELECT final_sha FROM run_prs WHERE ref = 'kettle#32'").get()).toStrictEqual({ final_sha: null });
});

test('it asks GitHub nothing about a FINAL in a late note from the design pass session', async () => {
  const fresh = freshDb();
  const stub = fakeAtc(fresh.dir, [{ id: KETTLE, name: 'kettle', alive: true, state: 'running' }]);
  onTestFinished(() => {
    stub.stop();
    fresh.cleanup();
  });
  addRun(fresh.db, { issue: 'GEO-9732', title: 'Design the kettle spout', place: 'local', session: KETTLE, next: 'Agent working.', gate: null, geoffChat: false, design: 'agent', actor: 'z-delivery' });
  setState(fresh.db, 'GEO-9732', 'done', { note: 'design settled' }, 'z-delivery');
  addRun(fresh.db, { issue: 'GEO-9732', title: 'Build the kettle spout', place: 'local', session: null, next: 'Building.', gate: null, geoffChat: false, actor: 'z-delivery' });
  addPr(fresh.db, 'GEO-9732', 'kettle#32', 'z-delivery');
  stub.feed.push({ at: new Date(NOON_SYDNEY).getTime(), session: KETTLE, name: 'kettle', kind: 'note', detail: 'the spout sketch is final at 39f05fe', label: 'progress' });
  fresh.db.query("INSERT INTO meta (key, value) VALUES ('atc_events_cursor', ?)").run(FROM_START);
  const client = await openClient();
  const calls: string[] = [];

  await ingestNotes(fresh.db, client, { run: buildStubFinalGH({ commits: [`39f05fe${buildMockSha(3).slice(7)}`] }, calls) });

  expect(calls).toStrictEqual([]);
});
