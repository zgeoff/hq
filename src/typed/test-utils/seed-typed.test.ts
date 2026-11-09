import { expect, onTestFinished, test } from 'bun:test';
import { at, freshDb } from '../../../test/helpers.ts';
import { seedTyped } from './seed-typed.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  at('2026-10-15T01:00:00Z');
  return { db: fresh.db, readTyped: () => fresh.db.query('SELECT id, to_session, text, source_kind, source_ref, typed_by, at FROM typed ORDER BY id').all() };
}

test('#seedTyped stores a typed message, and input overrides apply', () => {
  const ctx = setupTest();

  seedTyped(ctx, { text: 'Hinge it.', source: { kind: 'call', ref: 'teapot-lid', at: null } });

  expect(ctx.readTyped()).toStrictEqual([{ id: 1, to_session: 'z-invented', text: 'Hinge it.', source_kind: 'call', source_ref: 'teapot-lid', typed_by: 'z-stu', at: '2026-10-15T01:00:00Z' }]);
});

test('#seedTyped numbers each message in order', () => {
  const ctx = setupTest();

  seedTyped(ctx);
  seedTyped(ctx);

  expect(ctx.readTyped()).toMatchObject([{ id: 1 }, { id: 2 }]);
});
