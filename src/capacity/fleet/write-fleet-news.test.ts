import { expect, onTestFinished, test } from 'bun:test';
import { buildMockFleetView } from '../../../test/build-mock-fleet-view.ts';
import { freshDb } from '../../../test/helpers.ts';
import { writeFleetNews } from './write-fleet-news.ts';

function setupTest() {
  const fresh = freshDb();

  onTestFinished(fresh.cleanup);

  return { db: fresh.db };
}

test('it adds one news line with the pause and the safe cap when the forecast pauses', () => {
  const ctx = setupTest();
  const view = buildMockFleetView({ forecast: { switches: [], pause: { start: '2026-10-16T07:00:00Z', end: '2026-10-18T00:00:00Z', hours: 41 }, safeCap: { lanes: 2, endsAt: '2026-10-18T00:00:00Z' }, endsAt: '2026-10-18T00:00:00Z' } });

  expect(writeFleetNews(ctx.db, view)).toBe(true);
  expect(ctx.db.query('SELECT from_name, topic, text FROM news').all()).toStrictEqual([{ from_name: 'hq-capacity', topic: 'report', text: 'Fleet forecast: every Claude slot is at 95% from 16 Oct 07:00Z for 41.0 h at the current rate; a cap of 2 lanes avoids it' }]);
});

test('it adds nothing again while the pause time moves under 30 minutes and the cap stays', () => {
  const ctx = setupTest();
  const first = buildMockFleetView({ forecast: { switches: [], pause: { start: '2026-10-16T07:00:00Z', end: '2026-10-18T00:00:00Z', hours: 41 }, safeCap: { lanes: 2, endsAt: '2026-10-18T00:00:00Z' }, endsAt: '2026-10-18T00:00:00Z' } });
  const moved = buildMockFleetView({ forecast: { switches: [], pause: { start: '2026-10-16T07:29:00Z', end: '2026-10-18T00:00:00Z', hours: 40.5 }, safeCap: { lanes: 2, endsAt: '2026-10-18T00:00:00Z' }, endsAt: '2026-10-18T00:00:00Z' } });

  writeFleetNews(ctx.db, first);

  expect(writeFleetNews(ctx.db, moved)).toBe(false);
  expect(ctx.db.query('SELECT COUNT(*) AS total FROM news').get()).toStrictEqual({ total: 1 });
});

test('it adds a line again when the pause time moves by 30 minutes', () => {
  const ctx = setupTest();
  const first = buildMockFleetView({ forecast: { switches: [], pause: { start: '2026-10-16T07:00:00Z', end: '2026-10-18T00:00:00Z', hours: 41 }, safeCap: { lanes: 2, endsAt: '2026-10-18T00:00:00Z' }, endsAt: '2026-10-18T00:00:00Z' } });
  const moved = buildMockFleetView({ forecast: { switches: [], pause: { start: '2026-10-16T07:30:00Z', end: '2026-10-18T00:00:00Z', hours: 40.5 }, safeCap: { lanes: 2, endsAt: '2026-10-18T00:00:00Z' }, endsAt: '2026-10-18T00:00:00Z' } });

  writeFleetNews(ctx.db, first);

  expect(writeFleetNews(ctx.db, moved)).toBe(true);
  expect(ctx.db.query('SELECT COUNT(*) AS total FROM news').get()).toStrictEqual({ total: 2 });
});

test('it adds a line again when the safe cap changes', () => {
  const ctx = setupTest();
  const first = buildMockFleetView({ forecast: { switches: [], pause: { start: '2026-10-16T07:00:00Z', end: '2026-10-18T00:00:00Z', hours: 41 }, safeCap: { lanes: 2, endsAt: '2026-10-18T00:00:00Z' }, endsAt: '2026-10-18T00:00:00Z' } });
  const lower = buildMockFleetView({ forecast: { switches: [], pause: { start: '2026-10-16T07:00:00Z', end: '2026-10-18T00:00:00Z', hours: 41 }, safeCap: { lanes: 1, endsAt: '2026-10-18T00:00:00Z' }, endsAt: '2026-10-18T00:00:00Z' } });

  writeFleetNews(ctx.db, first);

  expect(writeFleetNews(ctx.db, lower)).toBe(true);
});

test('it says no cap avoids the pause when even 0 lanes pause', () => {
  const ctx = setupTest();
  const view = buildMockFleetView({ forecast: { switches: [], pause: { start: '2026-10-16T07:00:00Z', end: '2026-10-18T00:00:00Z', hours: 41 }, safeCap: null, endsAt: '2026-10-18T00:00:00Z' } });

  writeFleetNews(ctx.db, view);

  expect(ctx.db.query('SELECT text FROM news').all()).toStrictEqual([{ text: 'Fleet forecast: every Claude slot is at 95% from 16 Oct 07:00Z for 41.0 h at the current rate; no lane cap avoids it' }]);
});

test('it announces a later pause again after a forecast with no pause', () => {
  const ctx = setupTest();
  const pausing = buildMockFleetView({ forecast: { switches: [], pause: { start: '2026-10-16T07:00:00Z', end: '2026-10-18T00:00:00Z', hours: 41 }, safeCap: { lanes: 2, endsAt: '2026-10-18T00:00:00Z' }, endsAt: '2026-10-18T00:00:00Z' } });

  writeFleetNews(ctx.db, pausing);
  writeFleetNews(ctx.db, buildMockFleetView());

  expect(writeFleetNews(ctx.db, pausing)).toBe(true);
});

test('it adds nothing again for the same pause after a forecast that is missing', () => {
  const ctx = setupTest();
  const pausing = buildMockFleetView({ forecast: { switches: [], pause: { start: '2026-10-16T07:00:00Z', end: '2026-10-18T00:00:00Z', hours: 41 }, safeCap: { lanes: 2, endsAt: '2026-10-18T00:00:00Z' }, endsAt: '2026-10-18T00:00:00Z' } });

  writeFleetNews(ctx.db, pausing);
  writeFleetNews(ctx.db, buildMockFleetView({ forecast: null }));

  expect(writeFleetNews(ctx.db, pausing)).toBe(false);
  expect(ctx.db.query('SELECT COUNT(*) AS total FROM news').get()).toStrictEqual({ total: 1 });
});
