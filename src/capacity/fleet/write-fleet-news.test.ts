import { expect, onTestFinished, test } from 'bun:test';
import { buildMockFleetView } from '../../../test/build-mock-fleet-view.ts';
import { freshDb } from '../../../test/helpers.ts';
import { writeFleetNews } from './write-fleet-news.ts';

function setupTest() {
  const fresh = freshDb();

  onTestFinished(fresh.cleanup);

  return { db: fresh.db };
}

test('it adds the news line and stores the fingerprint when the forecast pauses', () => {
  const ctx = setupTest();
  const view = buildMockFleetView({ forecast: { switches: [], pause: { start: '2026-10-16T07:00:00Z', end: '2026-10-18T00:00:00Z', hours: 41 }, safeCap: { lanes: 2, endsAt: '2026-10-18T00:00:00Z' }, endsAt: '2026-10-18T00:00:00Z' } });

  expect(writeFleetNews(ctx.db, view)).toBe(true);
  expect(ctx.db.query('SELECT from_name, topic, text FROM news').all()).toStrictEqual([{ from_name: 'hq-capacity', topic: 'report', text: 'Fleet forecast: every Claude slot is at 95% from 16 Oct 07:00Z for 41.0 h at the current rate; a cap of 2 lanes avoids it' }]);
  expect(ctx.db.query("SELECT value FROM meta WHERE key = 'fleet_forecast_fingerprint'").get()).toStrictEqual({ value: '{"pauseStart":"2026-10-16T07:00:00Z","cap":2}' });
});

test('it adds nothing again for the stored fingerprint', () => {
  const ctx = setupTest();
  const view = buildMockFleetView({ forecast: { switches: [], pause: { start: '2026-10-16T07:00:00Z', end: '2026-10-18T00:00:00Z', hours: 41 }, safeCap: { lanes: 2, endsAt: '2026-10-18T00:00:00Z' }, endsAt: '2026-10-18T00:00:00Z' } });

  writeFleetNews(ctx.db, view);

  expect(writeFleetNews(ctx.db, view)).toBe(false);
  expect(ctx.db.query('SELECT COUNT(*) AS total FROM news').get()).toStrictEqual({ total: 1 });
});

test('it announces a later pause again after a forecast with no pause clears the fingerprint', () => {
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
