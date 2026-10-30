import { expect, onTestFinished, test } from 'bun:test';
import { buildStubLinearDescriptions } from '../../test/build-stub-linear-descriptions.ts';
import { freshDb } from '../../test/helpers.ts';
import { recordUmbrellaBox } from '../linear/record-umbrella-box.ts';
import { listNews } from '../news/list-news.ts';
import { syncLinear } from './sync-linear.ts';

function setupTest() {
  const fresh = freshDb();

  onTestFinished(fresh.cleanup);

  return { db: fresh.db };
}

test('it posts one news line for a recent merge that contributes to an issue with one unticked box for its repo', async () => {
  const ctx = setupTest();
  recordUmbrellaBox(ctx.db, { repo: 'tools', number: 7, issue: 'GEO-9001', mergedAt: '2026-10-20T06:00:00Z' });
  const linear = buildStubLinearDescriptions({ 'GEO-9001': 'Rollout\n- [x] cloud\n- [ ] tools: wire the widget sync\n' });

  await syncLinear(ctx.db, linear.call, new Date('2026-10-13T00:00:00Z'), new Date('2026-10-20T12:00:00Z'));

  expect(listNews(ctx.db, { all: true, limit: 100 }).map((item) => ({ from: item.from_name, topic: item.topic, text: item.text, issue: item.issue, link: item.link }))).toStrictEqual([
    { from: 'hq', topic: 'merge', text: 'tools#7 merged: tick the tools box on GEO-9001', issue: 'GEO-9001', link: 'https://github.com/zgeoff/tools/pull/7' },
  ]);
});
