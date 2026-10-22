import { expect, onTestFinished, test } from 'bun:test';
import { readScheduledRestarts } from './read-scheduled-restarts.ts';
import type { FleetEntry, FleetSession } from './types.ts';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';

function setupTest(compactions: number) {
  const base = freshDb();
  onTestFinished(base.cleanup);
  at(NOON_SYDNEY);
  const read: string[] = [];
  const delivery: FleetEntry = { name: 'z-delivery', cwd: '/work', model: 'opus', prompt: 'main:skills/kettle/references/session-prompt.md', wake: false, roles: ['orchestrator'] };
  return {
    db: base.db,
    delivery,
    read,
    transcripts: {
      compactions: (session: FleetSession, fallbackCwd: string) => {
        read.push(`${session.id} ${fallbackCwd}`);
        return Promise.resolve(compactions);
      },
    },
  };
}

test('it reads no transcript for a session whose age alone makes it due', async () => {
  const ctx = setupTest(3);
  const session = { id: 'id-delivery', name: 'z-delivery', alive: true, createdAt: Date.parse(NOON_SYDNEY) - 21_600_000 };

  const due = await readScheduledRestarts({ db: ctx.db, transcripts: ctx.transcripts }, [ctx.delivery], { 'z-delivery': session }, Date.parse(NOON_SYDNEY));

  expect(due).toStrictEqual({ 'z-delivery': '6 h since start' });
  expect(ctx.read).toStrictEqual([]);
});

test('it reads the transcript of a younger session and counts its compactions', async () => {
  const ctx = setupTest(3);
  const session = { id: 'id-delivery', name: 'z-delivery', alive: true, createdAt: Date.parse(NOON_SYDNEY) - 3_600_000 };

  const due = await readScheduledRestarts({ db: ctx.db, transcripts: ctx.transcripts }, [ctx.delivery], { 'z-delivery': session }, Date.parse(NOON_SYDNEY));

  expect(due).toStrictEqual({ 'z-delivery': '3 compactions since start' });
  expect(ctx.read).toStrictEqual(['id-delivery /work']);
});

test('it reads no transcript for a session of an unscheduled role', async () => {
  const ctx = setupTest(3);
  const session = { id: 'id-dev', name: 'z-dev', alive: true, createdAt: Date.parse(NOON_SYDNEY) - 3_600_000 };

  const due = await readScheduledRestarts({ db: ctx.db, transcripts: ctx.transcripts }, [{ ...ctx.delivery, name: 'z-dev', roles: ['developer'] }], { 'z-dev': session }, Date.parse(NOON_SYDNEY));

  expect(due).toStrictEqual({});
  expect(ctx.read).toStrictEqual([]);
});
