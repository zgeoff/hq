import type { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { getMeta } from '../src/db/get-meta.ts';
import { createListedReview } from './create-listed-review.ts';
import { freshDb } from './helpers.ts';

function setupTest(): Database {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return fresh.db;
}

test('it lists the repo for noslop and records one lens round at the head', () => {
  const db = setupTest();

  createListedReview(db, { repo: 'widgets', pr: 7, head: 'aaaa000000000000000000000000000000000001' });

  expect(JSON.parse(getMeta(db, 'noslop') ?? 'null')).toStrictEqual({ repos: ['widgets'], sha: '0123456789abcdef0123456789abcdef01234567' });
  expect(db.query('SELECT repo, pr, kind, head, ok FROM noslop_rounds').all()).toStrictEqual([{ repo: 'widgets', pr: 7, kind: 'review', head: 'aaaa000000000000000000000000000000000001', ok: 1 }]);
});
