import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { addUnblock } from '../src/unblock/add-unblock.ts';
import { closeUnblock } from '../src/unblock/close-unblock.ts';
import { listUnblocks } from '../src/unblock/list-unblocks.ts';
import { markPushed } from '../src/unblock/mark-pushed.ts';
import { newSincePush } from '../src/unblock/new-since-push.ts';
import { parseUnblocks } from '../src/unblock/parse-unblocks.ts';
import { rankUnblock } from '../src/unblock/rank-unblock.ts';
import type { UnblockInput } from '../src/unblock/types.ts';
import { uptoFor } from '../src/unblock/upto-for.ts';
import { NOON_SYDNEY, at, freshDb } from './helpers.ts';

let db: Database;
let cleanup: () => void;

const item = (over: Partial<UnblockInput> = {}): UnblockInput => ({
  id: null,
  task: 'Try the new kettle',
  minutes: 10,
  unblocks: [],
  rank: undefined,
  notify: [],
  actor: 'z-refine',
  ...over,
});

beforeEach(() => {
  ({ db, cleanup } = freshDb());
  at(NOON_SYDNEY);
});
afterEach(() => cleanup());

test('parses ISSUE:priority and refuses a bad priority', () => {
  expect(parseUnblocks('GEO-1:urgent, GEO-2')).toEqual([
    { issue: 'GEO-1', priority: 'urgent' },
    { issue: 'GEO-2', priority: 'none' },
  ]);
  expect(() => parseUnblocks('GEO-1:spicy')).toThrow('priority one of');
});

test('ranks: urgent/high first, then most unblocked, then fewest minutes', () => {
  addUnblock(db, item({ id: 'many-medium', unblocks: parseUnblocks('GEO-1:medium,GEO-2:medium,GEO-3:medium') }));
  addUnblock(db, item({ id: 'one-high-slow', minutes: 30, unblocks: parseUnblocks('GEO-4:high') }));
  addUnblock(db, item({ id: 'one-high-quick', minutes: 5, unblocks: parseUnblocks('GEO-5:high') }));
  addUnblock(db, item({ id: 'two-high', minutes: 60, unblocks: parseUnblocks('GEO-6:high,GEO-7:low') }));
  addUnblock(db, item({ id: 'urgent', minutes: 90, unblocks: parseUnblocks('GEO-8:urgent') }));
  expect(listUnblocks(db).map((u) => u.id)).toEqual(['urgent', 'two-high', 'one-high-quick', 'one-high-slow', 'many-medium']);
});

test('an explicit rank comes first', () => {
  addUnblock(db, item({ id: 'urgent', unblocks: parseUnblocks('GEO-8:urgent') }));
  addUnblock(db, item({ id: 'chore' }));
  rankUnblock(db, 'chore', 1, 'z-stu');
  expect(listUnblocks(db).map((u) => u.id)).toEqual(['chore', 'urgent']);
});

test('re-adding an open id keeps its added time and push position', () => {
  addUnblock(db, item({ id: 'kettle' }));
  markPushed(db, uptoFor(newSincePush(db), db), 'z-stu');
  at('2026-10-14T02:00:00Z');
  const r = addUnblock(db, item({ id: 'kettle', minutes: 15 }));
  expect(r.result).toBe('updated');
  expect(r.item.added_at).toBe(NOON_SYDNEY);
  expect(newSincePush(db)).toEqual([]);
  expect(addUnblock(db, item({ id: 'kettle', minutes: 15 })).result).toBe('noop');
});

test('push cursor: new shows only items added since the last push', () => {
  addUnblock(db, item({ id: 'a' }));
  addUnblock(db, item({ id: 'b' }));
  expect(newSincePush(db).map((u) => u.id).sort()).toEqual(['a', 'b']);
  expect(markPushed(db, uptoFor(newSincePush(db), db), 'z-stu').covered).toBe(2);
  expect(newSincePush(db)).toEqual([]);
  addUnblock(db, item({ id: 'c' }));
  expect(newSincePush(db).map((u) => u.id)).toEqual(['c']);
});

test('done notifies the listed sessions; drop does not', () => {
  addUnblock(db, item({ id: 'a', unblocks: parseUnblocks('GEO-9:high'), notify: ['z-delivery'] }));
  addUnblock(db, item({ id: 'b', notify: ['z-delivery'] }));
  closeUnblock(db, 'a', 'done', 'all good', 'z-stu');
  closeUnblock(db, 'b', 'dropped', null, 'z-stu');
  const msgs = db.query('SELECT target, text FROM outbox').all() as { target: string; text: string }[];
  expect(msgs).toEqual([{ target: 'z-delivery', text: expect.stringContaining('unblocks GEO-9') }]);
  expect(() => closeUnblock(db, 'a', 'done', null, 'z-stu')).toThrow('not open');
});

test('a closed id re-added comes back as new for the push cursor', () => {
  addUnblock(db, item({ id: 'a' }));
  markPushed(db, uptoFor(newSincePush(db), db), 'z-stu');
  closeUnblock(db, 'a', 'dropped', null, 'z-stu');
  expect(addUnblock(db, item({ id: 'a' })).result).toBe('reopened');
  expect(newSincePush(db).map((u) => u.id)).toEqual(['a']);
});

test('an item added after the list was read stays new after the push', () => {
  addUnblock(db, item({ id: 'a' }));
  const seen = newSincePush(db);
  const upto = uptoFor(seen, db);
  addUnblock(db, item({ id: 'b' })); // another session, between read and push
  expect(markPushed(db, upto, 'z-stu').covered).toBe(1);
  expect(newSincePush(db).map((u) => u.id)).toEqual(['b']);
  expect(markPushed(db, upto, 'z-stu').covered).toBe(0); // a repeat push is a no-op
});

test('a re-add without --rank keeps the rank z-stu set', () => {
  addUnblock(db, item({ id: 'kettle', rank: undefined }));
  rankUnblock(db, 'kettle', 1, 'z-stu');
  expect(addUnblock(db, item({ id: 'kettle', rank: undefined })).item.rank).toBe(1);
  expect(addUnblock(db, item({ id: 'kettle', rank: null })).item.rank).toBeNull();
});

test('a new item warns about a closed item for the same issue, and is still added', () => {
  addUnblock(db, item({ id: 'kettle-check', unblocks: parseUnblocks('GEO-36:high') }));
  closeUnblock(db, 'kettle-check', 'done', null, 'z-stu');
  addUnblock(db, item({ id: 'old-toaster', unblocks: parseUnblocks('GEO-40:low') }));
  closeUnblock(db, 'old-toaster', 'dropped', null, 'z-stu');
  const r = addUnblock(db, item({ id: 'kettle-again', task: 'Check the kettle once more', unblocks: parseUnblocks('geo-36:high,GEO-40,GEO-41') }));
  expect(r.result).toBe('added');
  expect(r.warnings.map((w) => [w.issue, w.id, w.state])).toEqual([
    ['GEO-36', 'kettle-check', 'done'],
    ['GEO-40', 'old-toaster', 'dropped'],
  ]);
  expect(listUnblocks(db).map((u) => u.id)).toEqual(['kettle-again']);
});

test('no warning for an open item, a refresh, or an item without issues', () => {
  addUnblock(db, item({ id: 'kettle', unblocks: parseUnblocks('GEO-36:high') }));
  expect(addUnblock(db, item({ id: 'kettle-2', unblocks: parseUnblocks('GEO-36:high') })).warnings).toEqual([]);
  closeUnblock(db, 'kettle', 'done', null, 'z-stu');
  expect(addUnblock(db, item({ id: 'kettle-2', minutes: 20, unblocks: parseUnblocks('GEO-36:high') })).warnings).toEqual([]);
  expect(addUnblock(db, item({ id: 'chore' })).warnings).toEqual([]);
});

test('a reopened item warns about other closed items, not itself', () => {
  addUnblock(db, item({ id: 'kettle', unblocks: parseUnblocks('GEO-36:high') }));
  closeUnblock(db, 'kettle', 'done', null, 'z-stu');
  const r = addUnblock(db, item({ id: 'kettle', unblocks: parseUnblocks('GEO-36:high') }));
  expect(r.result).toBe('reopened');
  expect(r.warnings).toEqual([]);
});
