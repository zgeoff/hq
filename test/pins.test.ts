import { expect, test } from 'bun:test';
import { buildPins } from '../src/pins/build-pins.ts';
import { fmtIdle } from '../src/pins/fmt-idle.ts';
import { pinState } from '../src/pins/pin-state.ts';

const at = new Date('2026-10-14T12:00:00Z');
const t = (iso: string) => new Date(iso).getTime();

test('maps atc state and lifecycle to the five pin states', () => {
  expect(pinState({ id: 'a', name: 'a', state: 'running', alive: true })).toBe('working');
  expect(pinState({ id: 'a', name: 'a', state: 'done', alive: true })).toBe('idle');
  expect(pinState({ id: 'a', name: 'a', state: 'needs_you', alive: true })).toBe('needs_you');
  expect(pinState({ id: 'a', name: 'a', state: 'exited', alive: false })).toBe('exited');
  expect(pinState({ id: 'a', name: 'a', state: 'exited', alive: false, lifecycle: { vm: 'asleep' } })).toBe('asleep');
});

test('lists only pinned sessions, longest idle first, working last', () => {
  const raw = [
    { id: 'w', name: 'busy', state: 'running', alive: true, pinned: true },
    { id: 'i', name: 'helper', state: 'done', alive: true, pinned: true },
    { id: 'n', name: 'asker', state: 'needs_you', alive: true, pinned: true },
    { id: 'u', name: 'unpinned', state: 'done', alive: true, pinned: false },
  ];
  const activity = new Map([
    ['w', t('2026-10-14T11:59:00Z')],
    ['i', t('2026-10-14T01:00:00Z')],
    ['n', t('2026-10-14T11:00:00Z')],
  ]);
  const pins = buildPins(raw, activity, at);
  expect(pins.map((p) => p.id)).toEqual(['i', 'n', 'w']);
  expect(pins[0]).toMatchObject({ state: 'idle', idleMs: 11 * 3_600_000, lastActivityAt: '2026-10-14T01:00:00Z' });
  expect(pins[2]!.idleMs).toBeNull();
});

test('formats idle time', () => {
  expect(fmtIdle(null)).toBe('-');
  expect(fmtIdle(5 * 60_000)).toBe('5m');
  expect(fmtIdle(11 * 3_600_000 + 7 * 60_000)).toBe('11h07m');
  expect(fmtIdle(3 * 86_400_000)).toBe('3d0h');
});
