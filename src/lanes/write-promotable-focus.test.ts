import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { getMeta } from '../db/get-meta.ts';
import { PROMOTABLE_FOCUS_KEY } from './promotable-focus-key.ts';
import { writePromotableFocus } from './write-promotable-focus.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('it stores the count with the time the caller gives and the focus the count used', () => {
  const ctx = setupTest();

  writePromotableFocus(ctx.db, { count: 4, focus: '["bug"]', at: new Date('2026-10-14T01:00:00Z') });

  expect(getMeta(ctx.db, PROMOTABLE_FOCUS_KEY)).toBe(String.raw`{"at":"2026-10-14T01:00:00Z","count":4,"focus":"[\"bug\"]"}`);
});
