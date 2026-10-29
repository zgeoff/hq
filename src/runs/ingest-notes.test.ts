import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, fakeAtc, freshDb } from '../../test/helpers.ts';
import { AtcClient } from '../atc/atc-client.ts';
import { addPr } from './add-pr.ts';
import { addRun } from './add-run.ts';
import { FROM_START } from './from-start.ts';
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
  return { db: fresh.db };
}

async function openClient(): Promise<AtcClient> {
  const client = await AtcClient.open();
  onTestFinished(() => client.close());
  return client;
}

test('a cursor in the keyed form of atc 5 resets once, then the next read keeps the notes', async () => {
  const app = setupTest(),
    client = await openClient(),
    first = await ingestNotes(app.db, client),
    second = await ingestNotes(app.db, client);

  expect([first.reset, second]).toMatchObject([true, { reset: false, notes: 1 }]);
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

  const ingested = await ingestNotes(fresh.db, client);

  expect([ingested.notes, ingested.finals]).toStrictEqual([1, []]);
  expect(fresh.db.query("SELECT final_sha FROM run_prs WHERE ref = 'kettle#32'").get()).toStrictEqual({ final_sha: null });
});
