import { expect, test } from 'bun:test';
import { buildMockFleetView } from '../../../test/build-mock-fleet-view.ts';
import { pickFleetNews } from './pick-fleet-news.ts';

test('it adds a news line with the pause and the safe cap, and its fingerprint, when the forecast first pauses', () => {
  const view = buildMockFleetView({ forecast: { switches: [], pause: { start: '2026-10-16T07:00:00Z', end: '2026-10-18T00:00:00Z', hours: 41 }, safeCap: { lanes: 2, endsAt: '2026-10-18T00:00:00Z' }, endsAt: '2026-10-18T00:00:00Z' } });

  expect(pickFleetNews(view, null)).toStrictEqual({
    kind: 'add-news',
    text: 'Fleet forecast: every Claude slot is at 95% from 16 Oct 07:00Z for 41.0 h at the current rate; a cap of 2 lanes avoids it',
    fingerprint: { pauseStart: '2026-10-16T07:00:00Z', cap: 2 },
  });
});

test('it says lane, not lanes, for a safe cap of one', () => {
  const view = buildMockFleetView({ forecast: { switches: [], pause: { start: '2026-10-16T07:00:00Z', end: '2026-10-18T00:00:00Z', hours: 41 }, safeCap: { lanes: 1, endsAt: '2026-10-18T00:00:00Z' }, endsAt: '2026-10-18T00:00:00Z' } });

  expect(pickFleetNews(view, null)).toMatchObject({ text: 'Fleet forecast: every Claude slot is at 95% from 16 Oct 07:00Z for 41.0 h at the current rate; a cap of 1 lane avoids it' });
});

test('it says no cap avoids the pause when even 0 lanes pause', () => {
  const view = buildMockFleetView({ forecast: { switches: [], pause: { start: '2026-10-16T07:00:00Z', end: '2026-10-18T00:00:00Z', hours: 41 }, safeCap: null, endsAt: '2026-10-18T00:00:00Z' } });

  expect(pickFleetNews(view, null)).toStrictEqual({
    kind: 'add-news',
    text: 'Fleet forecast: every Claude slot is at 95% from 16 Oct 07:00Z for 41.0 h at the current rate; no lane cap avoids it',
    fingerprint: { pauseStart: '2026-10-16T07:00:00Z', cap: null },
  });
});

test('it does nothing while the pause time moves under 30 minutes and the cap stays', () => {
  const view = buildMockFleetView({ forecast: { switches: [], pause: { start: '2026-10-16T07:29:00Z', end: '2026-10-18T00:00:00Z', hours: 40.5 }, safeCap: { lanes: 2, endsAt: '2026-10-18T00:00:00Z' }, endsAt: '2026-10-18T00:00:00Z' } });

  expect(pickFleetNews(view, { pauseStart: '2026-10-16T07:00:00Z', cap: 2 })).toStrictEqual({ kind: 'nothing' });
});

test('it adds a line again when the pause time moves by 30 minutes', () => {
  const view = buildMockFleetView({ forecast: { switches: [], pause: { start: '2026-10-16T07:30:00Z', end: '2026-10-18T00:00:00Z', hours: 40.5 }, safeCap: { lanes: 2, endsAt: '2026-10-18T00:00:00Z' }, endsAt: '2026-10-18T00:00:00Z' } });

  expect(pickFleetNews(view, { pauseStart: '2026-10-16T07:00:00Z', cap: 2 })).toMatchObject({ kind: 'add-news', fingerprint: { pauseStart: '2026-10-16T07:30:00Z', cap: 2 } });
});

test('it adds a line again when the safe cap changes', () => {
  const view = buildMockFleetView({ forecast: { switches: [], pause: { start: '2026-10-16T07:00:00Z', end: '2026-10-18T00:00:00Z', hours: 41 }, safeCap: { lanes: 1, endsAt: '2026-10-18T00:00:00Z' }, endsAt: '2026-10-18T00:00:00Z' } });

  expect(pickFleetNews(view, { pauseStart: '2026-10-16T07:00:00Z', cap: 2 })).toMatchObject({ kind: 'add-news', fingerprint: { pauseStart: '2026-10-16T07:00:00Z', cap: 1 } });
});

test('it clears the fingerprint when the forecast has no pause', () => {
  const view = buildMockFleetView({ forecast: { switches: [], pause: null, safeCap: null, endsAt: '2026-10-18T00:00:00Z' } });

  expect(pickFleetNews(view, { pauseStart: '2026-10-16T07:00:00Z', cap: 2 })).toStrictEqual({ kind: 'clear-fingerprint' });
});

test('it does nothing, and keeps the fingerprint, when the forecast is missing', () => {
  const view = buildMockFleetView({ forecast: null });

  expect(pickFleetNews(view, { pauseStart: '2026-10-16T07:00:00Z', cap: 2 })).toStrictEqual({ kind: 'nothing' });
});
