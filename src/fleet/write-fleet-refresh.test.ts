import { expect, onTestFinished, test } from 'bun:test';
import { getMeta } from '../db/get-meta.ts';
import { setMeta } from '../db/set-meta.ts';
import type { RefreshMap } from './refresh-schema.ts';
import { writeFleetRefresh } from './write-fleet-refresh.ts';
import { freshDb } from '../../test/helpers.ts';

function setupTest() {
  const base = freshDb();
  onTestFinished(base.cleanup);

  return { db: base.db };
}

test.each<[string, RefreshMap, RefreshMap]>([
  ['no entry to asked', {}, { 'z-kettle': { sessionId: 'id-kettle', phase: 'asked', askedAt: '2026-10-14T03:01:00Z', eventSeq: 7, skips: 0 } }],
  ['idle to asked', { 'z-kettle': { sessionId: 'id-kettle', phase: 'idle', skips: 1, retryAt: '2026-10-14T04:00:00Z' } }, { 'z-kettle': { sessionId: 'id-kettle', phase: 'asked', askedAt: '2026-10-14T04:01:00Z', eventSeq: 8, skips: 1 } }],
  ['asked to restarting', { 'z-kettle': { sessionId: 'id-kettle', phase: 'asked', askedAt: '2026-10-14T03:01:00Z', eventSeq: 7, skips: 0 } }, { 'z-kettle': { sessionId: 'id-kettle', phase: 'restarting', askedAt: '2026-10-14T03:01:00Z', eventSeq: 7, skips: 0 } }],
  ['asked to idle', { 'z-kettle': { sessionId: 'id-kettle', phase: 'asked', askedAt: '2026-10-14T03:01:00Z', eventSeq: 7, skips: 0 } }, { 'z-kettle': { sessionId: 'id-kettle', phase: 'idle', skips: 1, retryAt: '2026-10-14T04:11:00Z' } }],
  ['restarting to idle', { 'z-kettle': { sessionId: 'id-kettle', phase: 'restarting', skips: 0 } }, { 'z-kettle': { sessionId: 'id-kettle', phase: 'idle', skips: 1, retryAt: '2026-10-14T04:11:00Z' } }],
  ['restarting to no entry', { 'z-kettle': { sessionId: 'id-kettle', phase: 'restarting', skips: 0 } }, {}],
  ['an unchanged restarting entry', { 'z-kettle': { sessionId: 'id-kettle', phase: 'restarting', skips: 0 } }, { 'z-kettle': { sessionId: 'id-kettle', phase: 'restarting', skips: 0 } }],
])('it writes the move from %s', (_, stored, next) => {
  const ctx = setupTest();
  setMeta(ctx.db, 'fleet_refresh', JSON.stringify(stored));

  writeFleetRefresh(ctx.db, next);

  expect(JSON.parse(getMeta(ctx.db, 'fleet_refresh') ?? '{}')).toStrictEqual(next);
});

test.each<[string, RefreshMap, RefreshMap]>([
  ['no entry to restarting', {}, { 'z-kettle': { sessionId: 'id-kettle', phase: 'restarting', skips: 0 } }],
  ['no entry to idle', {}, { 'z-kettle': { sessionId: 'id-kettle', phase: 'idle', skips: 1 } }],
  ['idle to restarting', { 'z-kettle': { sessionId: 'id-kettle', phase: 'idle', skips: 1 } }, { 'z-kettle': { sessionId: 'id-kettle', phase: 'restarting', skips: 1 } }],
  ['restarting to asked', { 'z-kettle': { sessionId: 'id-kettle', phase: 'restarting', skips: 0 } }, { 'z-kettle': { sessionId: 'id-kettle', phase: 'asked', eventSeq: 9, skips: 0 } }],
  ['asked to asked again', { 'z-kettle': { sessionId: 'id-kettle', phase: 'asked', eventSeq: 7, skips: 0 } }, { 'z-kettle': { sessionId: 'id-kettle', phase: 'asked', eventSeq: 8, skips: 0 } }],
  ['asked for another session id to restarting', { 'z-kettle': { sessionId: 'id-kettle', phase: 'asked', eventSeq: 7, skips: 0 } }, { 'z-kettle': { sessionId: 'id-kettle-2', phase: 'restarting', eventSeq: 7, skips: 0 } }],
])('it refuses the move from %s and keeps the stored map', (_, stored, next) => {
  const ctx = setupTest();
  setMeta(ctx.db, 'fleet_refresh', JSON.stringify(stored));

  expect(() => writeFleetRefresh(ctx.db, next)).toThrow(expect.objectContaining({ code: 'bad_refresh_move' }));
  expect(JSON.parse(getMeta(ctx.db, 'fleet_refresh') ?? '{}')).toStrictEqual(stored);
});
