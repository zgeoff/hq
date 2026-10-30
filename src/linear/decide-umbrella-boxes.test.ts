import { expect, onTestFinished, test } from 'bun:test';
import { buildStubLinearDescriptions } from '../../test/build-stub-linear-descriptions.ts';
import { freshDb } from '../../test/helpers.ts';
import { listEvents } from '../list-events.ts';
import { listNews } from '../news/list-news.ts';
import { decideUmbrellaBoxes } from './decide-umbrella-boxes.ts';
import { listUmbrellaBoxes } from './list-umbrella-boxes.ts';
import { recordUmbrellaBox } from './record-umbrella-box.ts';

function setupTest() {
  const fresh = freshDb();

  onTestFinished(fresh.cleanup);

  return {
    db: fresh.db,
    newsLines: () => listNews(fresh.db, { all: true, limit: 100 }).map((item) => ({ from: item.from_name, topic: item.topic, text: item.text, issue: item.issue, link: item.link, needsGeoff: item.needs_geoff })),
    outcomes: () => listUmbrellaBoxes(fresh.db).map((box) => `${box.repo}#${box.number} ${box.issue} ${box.outcome}`),
    eventCount: () => listEvents(fresh.db, 'umbrella-box').length,
  };
}

test('it posts one news line for a single unticked box, and none on a second run', async () => {
  const ctx = setupTest();
  const at = new Date('2026-10-20T12:00:00Z');
  const mergedAt = '2026-10-20T06:00:00Z';
  recordUmbrellaBox(ctx.db, { repo: 'tools', number: 7, issue: 'GEO-9001', mergedAt });
  const linear = buildStubLinearDescriptions({ 'GEO-9001': 'Rollout\n- [x] cloud\n- [ ] tools: wire the sync\n' });

  const first = await decideUmbrellaBoxes(ctx.db, linear.call, at);
  const second = await decideUmbrellaBoxes(ctx.db, linear.call, at);

  expect(first).toBe(1);
  expect(second).toBe(0);

  expect(ctx.newsLines()).toStrictEqual([{ from: 'hq', topic: 'merge', text: 'tools#7 merged: tick the tools box on GEO-9001', issue: 'GEO-9001', link: 'https://github.com/zgeoff/tools/pull/7', needsGeoff: 0 }]);
  expect(ctx.outcomes()).toStrictEqual(['tools#7 GEO-9001 news']);
  expect(linear.asked).toStrictEqual([['GEO-9001']]);
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
  const at = new Date('2026-10-20T12:00:00Z');
  const mergedAt = '2026-10-20T06:00:00Z';
  recordUmbrellaBox(ctx.db, { repo: 'vers', number: 3, issue: 'GEO-9001', mergedAt });

  const posted = await decideUmbrellaBoxes(ctx.db, buildStubLinearDescriptions({ 'GEO-9001': description }).call, at);

  expect(posted).toBe(0);
  expect(ctx.outcomes()).toStrictEqual([`vers#3 GEO-9001 ${outcome}`]);
  expect(ctx.newsLines()).toStrictEqual([]);
  expect(ctx.eventCount()).toBe(1);
});

test('it decides an issue Linear does not return as gone, with no news line', async () => {
  const ctx = setupTest();
  const at = new Date('2026-10-20T12:00:00Z');
  const mergedAt = '2026-10-20T06:00:00Z';
  recordUmbrellaBox(ctx.db, { repo: 'vers', number: 3, issue: 'GEO-9404', mergedAt });

  await decideUmbrellaBoxes(ctx.db, buildStubLinearDescriptions({}).call, at);

  expect(ctx.outcomes()).toStrictEqual(['vers#3 GEO-9404 gone']);
  expect(ctx.newsLines()).toStrictEqual([]);
});

test('it decides a row older than 48 hours as gone without asking Linear', async () => {
  const ctx = setupTest();
  const at = new Date('2026-10-20T12:00:00Z');
  recordUmbrellaBox(ctx.db, { repo: 'vers', number: 3, issue: 'GEO-9001', mergedAt: '2026-10-18T11:59:59Z' });

  const linear = buildStubLinearDescriptions({ 'GEO-9001': '- [ ] vers' });
  await decideUmbrellaBoxes(ctx.db, linear.call, at);

  expect(linear.asked).toStrictEqual([]);
  expect(ctx.outcomes()).toStrictEqual(['vers#3 GEO-9001 gone']);
  expect(ctx.newsLines()).toStrictEqual([]);
});

test('it records nothing when Linear fails, so a later run decides the row', async () => {
  const ctx = setupTest();
  const at = new Date('2026-10-20T12:00:00Z');
  const mergedAt = '2026-10-20T06:00:00Z';
  recordUmbrellaBox(ctx.db, { repo: 'vers', number: 3, issue: 'GEO-9001', mergedAt });

  const failed = await decideUmbrellaBoxes(
    ctx.db,
    () => {
      throw new Error('invented outage');
    },
    at,
  ).then(
    () => null,
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );
  const between = ctx.outcomes();
  await decideUmbrellaBoxes(ctx.db, buildStubLinearDescriptions({ 'GEO-9001': '- [ ] vers' }).call, at);

  expect({ failed, between, after: ctx.outcomes() }).toStrictEqual({ failed: 'invented outage', between: ['vers#3 GEO-9001 null'], after: ['vers#3 GEO-9001 news'] });
});

test('it posts one news line and one event when two overlapping syncs read the same undecided row', async () => {
  const ctx = setupTest();
  const at = new Date('2026-10-20T12:00:00Z');
  const mergedAt = '2026-10-20T06:00:00Z';
  recordUmbrellaBox(ctx.db, { repo: 'tools', number: 7, issue: 'GEO-9001', mergedAt });
  const linear = buildStubLinearDescriptions({ 'GEO-9001': '- [ ] tools' });

  const posted = await Promise.all([decideUmbrellaBoxes(ctx.db, linear.call, at), decideUmbrellaBoxes(ctx.db, linear.call, at)]);

  expect(posted.toSorted()).toStrictEqual([0, 1]);
  expect(linear.asked).toStrictEqual([['GEO-9001'], ['GEO-9001']]);
  expect(ctx.newsLines()).toHaveLength(1);
  expect(ctx.outcomes()).toStrictEqual(['tools#7 GEO-9001 news']);
  expect(ctx.eventCount()).toBe(1);
});

test('it leaves the box undecided, with no news line and no event, when its event cannot be written', async () => {
  const ctx = setupTest();
  const at = new Date('2026-10-20T12:00:00Z');
  const mergedAt = '2026-10-20T06:00:00Z';
  recordUmbrellaBox(ctx.db, { repo: 'tools', number: 7, issue: 'GEO-9001', mergedAt });

  // Setup only: makes the umbrella event's insert fail after the outcome and the news line are written.
  ctx.db.exec("CREATE TRIGGER refuse_umbrella_event BEFORE INSERT ON events WHEN NEW.action = 'umbrella-box' BEGIN SELECT RAISE(ABORT, 'invented refusal'); END;");

  await expect(decideUmbrellaBoxes(ctx.db, buildStubLinearDescriptions({ 'GEO-9001': '- [ ] tools' }).call, at)).rejects.toThrow('invented refusal');

  expect(ctx.outcomes()).toStrictEqual(['tools#7 GEO-9001 null']);
  expect(ctx.newsLines()).toStrictEqual([]);
  expect(ctx.eventCount()).toBe(0);
});

test('it reads 51 issues from Linear in a query of 50 and a query of 1, and decides every box', async () => {
  const ctx = setupTest();
  const at = new Date('2026-10-20T12:00:00Z');
  const mergedAt = '2026-10-20T06:00:00Z';
  const issues = Array.from({ length: 51 }, (_, index) => `GEO-${9100 + index}`);
  for (const [index, issue] of issues.entries()) {
    recordUmbrellaBox(ctx.db, { repo: 'vers', number: index + 1, issue, mergedAt });
  }
  const linear = buildStubLinearDescriptions(Object.fromEntries(issues.map((issue) => [issue, '- [x] vers'])));

  await decideUmbrellaBoxes(ctx.db, linear.call, at);

  expect(linear.asked).toStrictEqual([issues.slice(0, 50), issues.slice(50)]);
  expect(ctx.outcomes()).toStrictEqual(issues.map((issue, index) => `vers#${index + 1} ${issue} ticked`));
});
