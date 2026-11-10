import type { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { listEvents } from '../src/list-events.ts';
import { getRun } from '../src/runs/get-run.ts';
import { createMergedRun } from './create-merged-run.ts';
import { freshDb } from './helpers.ts';

function setupTest(): Database {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return fresh.db;
}

test('it writes a merged run whose every PR merged', () => {
  const db = setupTest();

  createMergedRun(db, 'GEO-9901', ['tools#3', 'tools#4']);

  expect(getRun(db, 'GEO-9901')?.state).toBe('merged');
  expect(db.query('SELECT ref, state FROM run_prs ORDER BY ref').all()).toStrictEqual([
    { ref: 'tools#3', state: 'merged' },
    { ref: 'tools#4', state: 'merged' },
  ]);
});

test('it logs one move of the run to merged', () => {
  const db = setupTest();

  createMergedRun(db, 'GEO-9902', ['tools#5']);

  const moves = listEvents(db, 'state').filter((event) => event.subject_id === 'GEO-9902' && event.to_state === 'merged');
  expect(moves).toHaveLength(1);
});
