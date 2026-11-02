import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { getMeta } from '../db/get-meta.ts';
import { PROMOTABLE_TOP, PROMOTABLE_TOP_KEY } from './promotable-top.ts';
import { writePromotableTop } from './write-promotable-top.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('it keeps the first 5 issues in list order with the time and focus', () => {
  const ctx = setupTest();
  const issues = Array.from({ length: 7 }, (_unused, index) => ({ identifier: `GEO-970${index}`, title: `fix part ${index}` }));

  writePromotableTop(ctx.db, { issues, focus: '[]', at: new Date('2026-10-14T01:00:00Z') });

  const stored = PROMOTABLE_TOP.parse(JSON.parse(getMeta(ctx.db, PROMOTABLE_TOP_KEY) ?? 'null'));

  expect(stored).toStrictEqual({ at: '2026-10-14T01:00:00Z', focus: '[]', issues: issues.slice(0, 5) });
});

test('it removes the stored list when the read failed', () => {
  const ctx = setupTest();
  writePromotableTop(ctx.db, { issues: [{ identifier: 'GEO-9701', title: 'fix part' }], focus: '[]', at: new Date('2026-10-14T01:00:00Z') });

  writePromotableTop(ctx.db, { issues: null, focus: '[]', at: new Date('2026-10-14T01:10:00Z') });

  expect(getMeta(ctx.db, PROMOTABLE_TOP_KEY)).toBeNull();
});
