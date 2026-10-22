import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, fakeAtc, freshDb } from '../../test/helpers.ts';
import { AtcClient } from '../atc/atc-client.ts';
import { addRun } from './add-run.ts';
import { ingestNotes } from './ingest-notes.ts';

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
