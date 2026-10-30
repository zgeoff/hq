import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { listEvents } from '../list-events.ts';
import { listNews } from '../news/list-news.ts';
import { decideUmbrellaBoxes } from './decide-umbrella-boxes.ts';
import { listUmbrellaBoxes } from './list-umbrella-boxes.ts';
import { recordUmbrellaBox } from './record-umbrella-box.ts';

function setupTest() {
  const fresh = freshDb();

  onTestFinished(fresh.cleanup);

  const asked: unknown[] = [];

  return {
    db: fresh.db,
    asked,
    at: new Date('2026-10-20T12:00:00Z'),
    recent: '2026-10-20T06:00:00Z',
    linearWith: (descriptions: Record<string, string>) => (_query: string, variables: Record<string, unknown>) => {
      asked.push(variables['ids']);
      const ids = Array.isArray(variables['ids']) ? variables['ids'] : [];
      const requested = ids.filter((id) => typeof id === 'string' && id in descriptions);
      return Promise.resolve({ issues: { nodes: requested.map((id) => ({ identifier: id, description: descriptions[id] })) } });
    },
    newsLines: () => listNews(fresh.db, { all: true, limit: 100 }).map((item) => ({ from: item.from_name, topic: item.topic, text: item.text, issue: item.issue, link: item.link, needsGeoff: item.needs_geoff })),
    outcomes: () => listUmbrellaBoxes(fresh.db).map((box) => `${box.repo}#${box.number} ${box.issue} ${box.outcome}`),
    eventCount: () => listEvents(fresh.db, 'umbrella-box').length,
  };
}

test('it posts one news line for a single unticked box, and none on a second run', async () => {
  const ctx = setupTest();
  recordUmbrellaBox(ctx.db, { repo: 'tools', number: 7, issue: 'GEO-9001', mergedAt: ctx.recent });
  const call = ctx.linearWith({ 'GEO-9001': 'Rollout\n- [x] cloud\n- [ ] tools: wire the sync\n' });

  const first = await decideUmbrellaBoxes(ctx.db, call, ctx.at);
  const second = await decideUmbrellaBoxes(ctx.db, call, ctx.at);

  expect(first).toBe(1);
  expect(second).toBe(0);

  expect(ctx.newsLines()).toStrictEqual([{ from: 'hq', topic: 'merge', text: 'tools#7 merged: tick the tools box on GEO-9001', issue: 'GEO-9001', link: 'https://github.com/zgeoff/tools/pull/7', needsGeoff: 0 }]);
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
  recordUmbrellaBox(ctx.db, { repo: 'vers', number: 3, issue: 'GEO-9001', mergedAt: ctx.recent });

  const posted = await decideUmbrellaBoxes(ctx.db, ctx.linearWith({ 'GEO-9001': description }), ctx.at);

  expect(posted).toBe(0);
  expect(ctx.outcomes()).toStrictEqual([`vers#3 GEO-9001 ${outcome}`]);
  expect(ctx.newsLines()).toStrictEqual([]);
  expect(ctx.eventCount()).toBe(1);
});

test('it decides an issue Linear does not return as gone, with no news line', async () => {
  const ctx = setupTest();
  recordUmbrellaBox(ctx.db, { repo: 'vers', number: 3, issue: 'GEO-9404', mergedAt: ctx.recent });

  await decideUmbrellaBoxes(ctx.db, ctx.linearWith({}), ctx.at);

  expect(ctx.outcomes()).toStrictEqual(['vers#3 GEO-9404 gone']);
  expect(ctx.newsLines()).toStrictEqual([]);
});

test('it decides a row older than 48 hours as gone without asking Linear', async () => {
  const ctx = setupTest();
  recordUmbrellaBox(ctx.db, { repo: 'vers', number: 3, issue: 'GEO-9001', mergedAt: '2026-10-18T11:59:59Z' });

  const call = ctx.linearWith({ 'GEO-9001': '- [ ] vers' });
  await decideUmbrellaBoxes(ctx.db, call, ctx.at);

  expect(ctx.asked).toStrictEqual([]);
  expect(ctx.outcomes()).toStrictEqual(['vers#3 GEO-9001 gone']);
  expect(ctx.newsLines()).toStrictEqual([]);
});

test('it records nothing when Linear fails, so a later run decides the row', async () => {
  const ctx = setupTest();
  recordUmbrellaBox(ctx.db, { repo: 'vers', number: 3, issue: 'GEO-9001', mergedAt: ctx.recent });

  await expect(decideUmbrellaBoxes(ctx.db, () => Promise.reject(new Error('invented outage')), ctx.at)).rejects.toThrow('invented outage');
  expect(ctx.outcomes()).toStrictEqual(['vers#3 GEO-9001 null']);

  await decideUmbrellaBoxes(ctx.db, ctx.linearWith({ 'GEO-9001': '- [ ] vers' }), ctx.at);
  expect(ctx.outcomes()).toStrictEqual(['vers#3 GEO-9001 news']);
});

test('it posts one news line and one event when two overlapping syncs read the same undecided row', async () => {
  const ctx = setupTest();
  recordUmbrellaBox(ctx.db, { repo: 'tools', number: 7, issue: 'GEO-9001', mergedAt: ctx.recent });
  const call = ctx.linearWith({ 'GEO-9001': '- [ ] tools' });

  const posted = await Promise.all([decideUmbrellaBoxes(ctx.db, call, ctx.at), decideUmbrellaBoxes(ctx.db, call, ctx.at)]);

  expect(posted.toSorted()).toStrictEqual([0, 1]);
  expect(ctx.asked).toStrictEqual([['GEO-9001'], ['GEO-9001']]);
  expect(ctx.newsLines()).toHaveLength(1);
  expect(ctx.outcomes()).toStrictEqual(['tools#7 GEO-9001 news']);
  expect(ctx.eventCount()).toBe(1);
});
