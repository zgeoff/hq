import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { decideUmbrellaBoxes } from './decide-umbrella-boxes.ts';
import { listUmbrellaBoxes, recordUmbrellaBox } from './umbrella-boxes.ts';

const AT = new Date('2026-10-20T12:00:00Z');
const RECENT = '2026-10-20T06:00:00Z';

function setupTest() {
  const fresh = freshDb();

  onTestFinished(fresh.cleanup);

  const asked: unknown[] = [];

  return {
    db: fresh.db,
    asked,
    // A Linear stand-in that returns the given descriptions, keyed by issue id.
    linearWith: (descriptions: Record<string, string>) => (_query: string, variables: Record<string, unknown>) => {
      asked.push(variables['ids']);
      const ids = variables['ids'] as string[];
      return Promise.resolve({ issues: { nodes: ids.filter((id) => id in descriptions).map((id) => ({ identifier: id, description: descriptions[id] })) } });
    },
    newsLines: () => fresh.db.query('SELECT from_name, topic, text, issue, link, needs_geoff FROM news ORDER BY id').all(),
    outcomes: () => listUmbrellaBoxes(fresh.db).map((box) => `${box.repo}#${box.number} ${box.issue} ${box.outcome}`),
    eventCount: () => (fresh.db.query("SELECT COUNT(*) AS n FROM events WHERE action = 'umbrella-box'").get() as { n: number }).n,
  };
}

test('it posts one news line for a single unticked box, and none on a second run', async () => {
  const ctx = setupTest();
  recordUmbrellaBox(ctx.db, 'tools', 7, 'GEO-9001', RECENT);
  const call = ctx.linearWith({ 'GEO-9001': 'Rollout\n- [x] cloud\n- [ ] tools: wire the sync\n' });

  expect(await decideUmbrellaBoxes(ctx.db, call, AT)).toBe(1);
  expect(await decideUmbrellaBoxes(ctx.db, call, AT)).toBe(0);

  expect(ctx.newsLines()).toStrictEqual([{ from_name: 'hq', topic: 'merge', text: 'tools#7 merged: tick the tools box on GEO-9001', issue: 'GEO-9001', link: 'https://github.com/zgeoff/tools/pull/7', needs_geoff: 0 }]);
  expect(ctx.outcomes()).toStrictEqual(['tools#7 GEO-9001 news']);
  expect(ctx.asked).toStrictEqual([['GEO-9001']]);
  expect(ctx.eventCount()).toBe(1);
});

test.each([
  ['a ticked box', '* [X] vers done', 'ticked'],
  ['no box for the repo', '- [ ] cloud', 'no_box'],
  ['a longer repo name', '- [ ] vers-extra', 'no_box'],
  ['a different case', '- [ ] Vers', 'no_box'],
  ['two boxes for the repo', '- [ ] vers one\n- [x] vers two', 'ambiguous'],
  ['an empty description', '', 'no_box'],
])('it decides %s as %s with no news line', async (_name, description, outcome) => {
  const ctx = setupTest();
  recordUmbrellaBox(ctx.db, 'vers', 3, 'GEO-9001', RECENT);

  const posted = await decideUmbrellaBoxes(ctx.db, ctx.linearWith({ 'GEO-9001': description }), AT);

  expect(posted).toBe(outcome === 'news' ? 1 : 0);
  expect(ctx.outcomes()).toStrictEqual([`vers#3 GEO-9001 ${outcome}`]);
  expect(ctx.newsLines()).toStrictEqual([]);
  expect(ctx.eventCount()).toBe(1);
});

test('it decides an issue Linear does not return as gone, with no news line', async () => {
  const ctx = setupTest();
  recordUmbrellaBox(ctx.db, 'vers', 3, 'GEO-9404', RECENT);

  await decideUmbrellaBoxes(ctx.db, ctx.linearWith({}), AT);

  expect(ctx.outcomes()).toStrictEqual(['vers#3 GEO-9404 gone']);
  expect(ctx.newsLines()).toStrictEqual([]);
});

test('it decides a row older than 48 hours as gone without asking Linear', async () => {
  const ctx = setupTest();
  recordUmbrellaBox(ctx.db, 'vers', 3, 'GEO-9001', '2026-10-18T11:59:59Z');

  const call = ctx.linearWith({ 'GEO-9001': '- [ ] vers' });
  await decideUmbrellaBoxes(ctx.db, call, AT);

  expect(ctx.asked).toStrictEqual([]);
  expect(ctx.outcomes()).toStrictEqual(['vers#3 GEO-9001 gone']);
  expect(ctx.newsLines()).toStrictEqual([]);
});

test('it records nothing when Linear fails, so a later run decides the row', async () => {
  const ctx = setupTest();
  recordUmbrellaBox(ctx.db, 'vers', 3, 'GEO-9001', RECENT);

  await expect(decideUmbrellaBoxes(ctx.db, () => Promise.reject(new Error('invented outage')), AT)).rejects.toThrow('invented outage');
  expect(ctx.outcomes()).toStrictEqual(['vers#3 GEO-9001 null']);

  await decideUmbrellaBoxes(ctx.db, ctx.linearWith({ 'GEO-9001': '- [ ] vers' }), AT);
  expect(ctx.outcomes()).toStrictEqual(['vers#3 GEO-9001 news']);
});
