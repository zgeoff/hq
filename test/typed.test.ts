import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { addAsk } from '../src/asks/add-ask.ts';
import { addTyped } from '../src/typed/add-typed.ts';
import { listTyped } from '../src/typed/list-typed.ts';
import { parseSource } from '../src/typed/parse-source.ts';
import { typedSource } from '../src/typed/typed-source.ts';
import { addUnblock } from '../src/unblock/add-unblock.ts';
import { at, freshDb } from './helpers.ts';

let db: Database;
let cleanup: () => void;
const STU = '474e1f60-0000-4000-8000-000000000001';
const TRIAGE = '2a33c24b-0000-4000-8000-000000000002';

beforeEach(() => {
  ({ db, cleanup } = freshDb());
  at('2026-10-16T01:00:00Z');
  addAsk(db, { kind: 'call', id: 'kettle-colour', title: 'Kettle colour', question: 'Red or blue?', body: 'Invented.', issues: [], forSession: null, actor: 'z-triage' });
  addAsk(db, { kind: 'proposal', id: 'teapot-lid', title: 'Teapot lid', question: 'Hinge it?', body: 'Invented.', issues: [], forSession: null, actor: 'z-steward' });
});
afterEach(() => cleanup());

test('a console answer is a source when hq holds its call, proposal or unblock item, and is logged as one', () => {
  addUnblock(db, { id: 'descale-kettle', task: 'Descale the kettle', minutes: null, unblocks: [], notify: [], actor: 'z-triage' });
  expect([parseSource(db, 'console:kettle-colour'), parseSource(db, 'console:descale-kettle')]).toStrictEqual([
    { kind: 'console', ref: 'kettle-colour', at: null },
    { kind: 'console', ref: 'descale-kettle', at: null },
  ]);
  expect(() => parseSource(db, 'console:no-such-kettle')).toThrow('no call, proposal or unblock item no-such-kettle in hq');
  const typed = addTyped(db, { to: 'z-triage', toId: null, toName: null, text: 'Descale it.', source: parseSource(db, 'console:descale-kettle'), actor: 'z-stu' });
  expect([typed.source_kind, typed.source_ref, typedSource(typed)]).toStrictEqual(['console', 'descale-kettle', 'console:descale-kettle']);
});

test('a source is a known call, a known proposal, or a chat pointer with a time', () => {
  expect(parseSource(db, 'call:kettle-colour')).toEqual({ kind: 'call', ref: 'kettle-colour', at: null });
  expect(parseSource(db, 'proposal:teapot-lid')).toEqual({ kind: 'proposal', ref: 'teapot-lid', at: null });
  expect(parseSource(db, `chat:${STU.toUpperCase()}@2026-10-16T00:58:30+11:00`)).toEqual({ kind: 'chat', ref: STU, at: '2026-10-15T13:58:30Z' });
});

// Every source the log must refuse: an unknown form is denied, never stored.
const HOSTILE: [string, string][] = [
  ['', '--source must be'],
  ['call:', '--source must be'],
  ['call:no-such-call', 'no call no-such-call'],
  ['proposal:kettle-colour', 'is a call, not a proposal'],
  ['call:teapot-lid', 'is a proposal, not a call'],
  ['call:kettle-colour; DROP TABLE typed', '--source must be'],
  ['call:../asks', '--source must be'],
  ['CALL:kettle-colour', '--source must be'],
  ['geoff', '--source must be'],
  ['chat:z-stu@2026-10-16T00:00:00Z', '--source must be'],
  [`chat:${STU}`, '--source must be'],
  [`chat:${STU}@yesterday`, 'must be a time'],
  [`chat:${STU}@10/16/2026`, 'must be a time'],
  [`chat:${STU}@2026-10-17T00:00:00Z`, 'in the future'],
  ['https://example.com/kettle', '--source must be'],
  ['console:', '--source must be'],
  ['console:../asks', '--source must be'],
];

test.each(HOSTILE)('refuses the source %p', (raw, why) => {
  expect(() => parseSource(db, raw)).toThrow(why);
});

test('logs the full text, target and source; lists newest first, by name, id or id prefix', () => {
  const text = 'Yes to the red kettle.\nAnd hinge the lid.';
  addTyped(db, { to: 'z-triage', toId: TRIAGE, toName: 'z-triage', text, source: parseSource(db, 'call:kettle-colour'), actor: 'z-stu' });
  at('2026-10-16T01:05:00Z');
  const b = addTyped(db, { to: 'z-delivery', toId: null, toName: null, text: 'Ship it.', source: parseSource(db, `chat:${STU}@2026-10-16T01:04:00Z`), actor: 'z-stu' });
  expect(b).toMatchObject({ to_session: 'z-delivery', to_id: null, source_kind: 'chat', source_ref: STU, source_at: '2026-10-16T01:04:00Z', typed_by: 'z-stu', at: '2026-10-16T01:05:00Z' });
  expect(typedSource(b)).toBe(`chat:${STU}@2026-10-16T01:04:00Z`);
  expect(listTyped(db, { session: null, limit: 50 }).map((t) => t.id)).toEqual([2, 1]);
  for (const s of ['z-triage', 'Z-TRIAGE', TRIAGE, '2a33c24b']) expect(listTyped(db, { session: s, limit: 50 })).toEqual([expect.objectContaining({ id: 1, text })]);
  expect(listTyped(db, { session: 'z-delivery', limit: 50 }).map((t) => t.id)).toEqual([2]);
  expect(listTyped(db, { session: '%', limit: 50 })).toEqual([]);
  expect(listTyped(db, { session: null, limit: 1 })).toHaveLength(1);
  expect(() => listTyped(db, { session: null, limit: 0 })).toThrow('--limit');
  expect(() => listTyped(db, { session: null, limit: -5 })).toThrow('--limit');
  // atc couldn't resolve this target: it is kept as the id it was given as, and found by prefix.
  const lost = '9f8e7d6c-0000-4000-8000-000000000003';
  addTyped(db, { to: lost, toId: null, toName: null, text: 'Invented.', source: parseSource(db, 'call:kettle-colour'), actor: 'z-stu' });
  expect(listTyped(db, { session: '9f8e7d6c', limit: 50 })).toEqual([expect.objectContaining({ id: 3, to_session: lost })]);
  const ev = db.query(`SELECT actor, data FROM events WHERE action = 'typed' ORDER BY seq`).all() as { actor: string; data: string }[];
  expect(ev.slice(0, 2).map((e) => JSON.parse(e.data))).toEqual([{ to: 'z-triage', source: 'call:kettle-colour' }, { to: 'z-delivery', source: `chat:${STU}` }]);
});

test('an empty target or text is refused', () => {
  const source = parseSource(db, 'call:kettle-colour');
  expect(() => addTyped(db, { to: ' ', toId: null, toName: null, text: 'x', source, actor: 'z-stu' })).toThrow('--to');
  expect(() => addTyped(db, { to: 'z-triage', toId: null, toName: null, text: '  \n', source, actor: 'z-stu' })).toThrow('--text');
});
