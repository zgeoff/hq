import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, fakeAtc, freshDb } from '../../test/helpers.ts';
import { AtcClient } from '../atc/atc-client.ts';
import { buildStubFinalGH } from '../../test/build-stub-final-gh.ts';
import { buildMockSha } from '../../test/build-mock-sha.ts';
import { addPr } from './add-pr.ts';
import { addRun } from './add-run.ts';
import { listRuns } from './list-runs.ts';
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
  return { db: fresh.db, stub };
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

test('it reads the PR commits once for several FINAL notes on one PR and keeps the pass going on a lookup fault', async () => {
  const app = setupTest();
  const client = await openClient();
  const head = `44238662${buildMockSha(2).slice(8)}`;
  const early = `1a2b3c4${buildMockSha(1).slice(7)}`;
  const calls: string[] = [];
  const run = buildStubFinalGH({ commits: [early, head], lookupFault: true }, calls);
  const base = new Date(NOON_SYDNEY).getTime();
  addPr(app.db, 'GEO-9731', 'kettle#714', 'z-delivery');
  addPr(app.db, 'GEO-9731', 'kettle#715', 'z-delivery');
  await ingestNotes(app.db, client, { run });
  app.stub.feed.push(
    { at: base + 1000, session: KETTLE, name: 'kettle', kind: 'note', detail: 'FINAL kettle#714 44238662', label: 'progress' },
    { at: base + 2000, session: KETTLE, name: 'kettle', kind: 'note', detail: 'kettle#714 is final again at 1a2b3c4', label: 'progress' },
    { at: base + 3000, session: KETTLE, name: 'kettle', kind: 'note', detail: 'FINAL kettle#715 deadbee', label: 'progress' },
  );

  const result = await ingestNotes(app.db, client, { run });

  // the three above and the note setupTest feeds
  expect(result.notes).toBe(4);
  expect(calls.filter((line) => line.includes('/kettle/pulls/714/commits'))).toHaveLength(1);
  expect(listRuns(app.db)[0]?.prs.map((pr) => pr.final_sha)).toStrictEqual([early, 'deadbee']);
});
