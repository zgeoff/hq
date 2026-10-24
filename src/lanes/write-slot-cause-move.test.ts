import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { getMeta } from '../db/get-meta.ts';
import { CAUSE_SINCE_KEY } from './cause-since-key.ts';
import { writeSlotCauseMove } from './write-slot-cause-move.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('it stores a cause that began, then the cause it changed to with the time of the change', () => {
  const ctx = setupTest();
  writeSlotCauseMove(ctx.db, 'cause-began', 'triage', new Date('2026-10-14T01:00:00Z'));

  writeSlotCauseMove(ctx.db, 'cause-changed', 'supply', new Date('2026-10-14T01:05:00Z'));

  expect(getMeta(ctx.db, CAUSE_SINCE_KEY)).toBe('{"cause":"supply","since":"2026-10-14T01:05:00Z"}');
});

test('it clears the stored cause when the cause ends', () => {
  const ctx = setupTest();
  writeSlotCauseMove(ctx.db, 'cause-began', 'delivery', new Date('2026-10-14T01:00:00Z'));

  writeSlotCauseMove(ctx.db, 'cause-ended', 'none', new Date('2026-10-14T01:05:00Z'));

  expect(getMeta(ctx.db, CAUSE_SINCE_KEY)).toBeNull();
});

test('it refuses to end a cause while none is stored, and writes nothing', () => {
  const ctx = setupTest();

  expect(() => writeSlotCauseMove(ctx.db, 'cause-ended', 'none', new Date('2026-10-14T01:00:00Z'))).toThrow(
    expect.objectContaining({ code: 'bad_state', message: 'the slot cause is none: cause-ended needs delivery or triage or supply or unknown' }),
  );
  expect(getMeta(ctx.db, CAUSE_SINCE_KEY)).toBeNull();
});

test('it refuses a cause that begins while another is stored, and keeps the stored one', () => {
  const ctx = setupTest();
  writeSlotCauseMove(ctx.db, 'cause-began', 'triage', new Date('2026-10-14T01:00:00Z'));

  expect(() => writeSlotCauseMove(ctx.db, 'cause-began', 'supply', new Date('2026-10-14T01:05:00Z'))).toThrow(expect.objectContaining({ code: 'bad_state', message: 'the slot cause is triage: cause-began needs none' }));
  expect(getMeta(ctx.db, CAUSE_SINCE_KEY)).toBe('{"cause":"triage","since":"2026-10-14T01:00:00Z"}');
});

test('it refuses a change to none, which only an ending makes', () => {
  const ctx = setupTest();
  writeSlotCauseMove(ctx.db, 'cause-began', 'triage', new Date('2026-10-14T01:00:00Z'));

  expect(() => writeSlotCauseMove(ctx.db, 'cause-changed', 'none', new Date('2026-10-14T01:05:00Z'))).toThrow(expect.objectContaining({ code: 'bad_state', message: 'the slot cause is triage: cause-changed cannot go to none' }));
  expect(getMeta(ctx.db, CAUSE_SINCE_KEY)).toBe('{"cause":"triage","since":"2026-10-14T01:00:00Z"}');
});
