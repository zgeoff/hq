import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { accountLabels } from '../src/accounts/account-labels.ts';
import { accountName } from '../src/accounts/account-name.ts';
import { setAccountLabel } from '../src/accounts/set-account-label.ts';
import { setMeta } from '../src/db/set-meta.ts';
import { freshDb } from './helpers.ts';

let db: Database;
let cleanup: () => void;
beforeEach(() => ({ db, cleanup } = freshDb()));
afterEach(() => cleanup());

const KEY = 'abcdef012345';

test('a name is shown for a key, else the first 6 characters of it', () => {
  expect(accountName(accountLabels(db), KEY)).toBe('abcdef');
  expect(setAccountLabel(db, KEY, 'work', 'z-stu')).toBe('work');
  expect(accountName(accountLabels(db), KEY)).toBe('work');
  expect(accountName(accountLabels(db), 'active')).toBe('active');
  expect(db.query("SELECT action, from_state, to_state FROM events WHERE action = 'account'").all()).toEqual([{ action: 'account', from_state: null, to_state: 'work' }]);
  expect(setAccountLabel(db, KEY, 'none', 'z-stu')).toBeNull();
  expect(accountLabels(db)).toEqual({});
});

test.each([
  ['', 'work'],
  ['ABCDEF012345', 'work'],
  ['abcdef01234', 'work'],
  ['abcdef0123456', 'work'],
  ['abcdef01234g', 'work'],
  ['geoff@example.com', 'work'],
  ['abcdef012345\n', 'work'],
  ['abcdef012345 ', 'work'],
  ["abcdef012345'; DROP TABLE meta;--", 'work'],
  ['../../etc/passwd', 'work'],
  [KEY, ''],
  [KEY, 'Work'],
  [KEY, 'two words'],
  [KEY, 'a'.repeat(25)],
  [KEY, 'geoff@example.com'],
  [KEY, 'work\nnext'],
  [KEY, 'work|pipe'],
  [KEY, '-work'],
  [KEY, 'work-'],
  [KEY, 'wor--k'],
  [KEY, '<b>x</b>'],
  [KEY, 'wörk'],
  [KEY, '日本'],
  [KEY, "x'); DROP TABLE meta;--"],
])('a hostile key %j or name %j is refused', (key, name) => {
  expect(() => setAccountLabel(db, key, name, 'z-stu')).toThrow();
  expect(accountLabels(db)).toEqual({});
});

test.each([[KEY, 'a'], [KEY, 'a'.repeat(24)], [KEY, 'work-2'], ['000000000000', 'x1']])('key %j name %j is accepted', (key, name) => {
  expect(setAccountLabel(db, key, name, 'z-stu')).toBe(name);
});

test('a stored map with bad entries shows only the good ones', () => {
  setMeta(db, 'usage_accounts', JSON.stringify({ [KEY]: 'ok', 'geoff@example.com': 'bad', '111111111111': 'Bad Name', '222222222222': 7 }));
  expect(accountLabels(db)).toEqual({ [KEY]: 'ok' });
  setMeta(db, 'usage_accounts', '[1,2]');
  expect(accountLabels(db)).toEqual({});
  setMeta(db, 'usage_accounts', 'not json');
  expect(accountLabels(db)).toEqual({});
});
