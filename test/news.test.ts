import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { addNews } from '../src/news/add-news.ts';
import { digest } from '../src/news/digest.ts';
import { listNews } from '../src/news/list-news.ts';
import { newsTagged } from '../src/news/news-tagged.ts';
import { readNews } from '../src/news/read-news.ts';
import { NOON_SYDNEY, at, freshDb } from './helpers.ts';

let db: Database;
let cleanup: () => void;
beforeEach(() => {
  ({ db, cleanup } = freshDb());
  at(NOON_SYDNEY);
});
afterEach(() => cleanup());

const item = (over: Partial<Parameters<typeof addNews>[1]> = {}) =>
  addNews(db, { from: 'z-delivery', topic: 'merge', text: 'Merged widgets#12: the kettle whistles once.', issue: 'GEO-9001', link: null, needsGeoff: false, ...over });
const outbox = () => db.query('SELECT target, text FROM outbox').all() as { target: string; text: string }[];

test('adding news sends nothing; the digest groups unread items by topic', () => {
  item();
  item({ topic: 'deploy', text: 'Deployed gadgets 1.4 to the lab.', issue: null, link: 'https://example.com/run/7' });
  item({ topic: 'merge', from: 'z-steward', text: 'Merged a skill tidy-up.', issue: null });
  expect(outbox()).toHaveLength(0);
  const d = digest(listNews(db, { all: false, limit: 200 }));
  expect(d).toBe(
    [
      'merge:',
      '  1 z-delivery: Merged widgets#12: the kettle whistles once. [GEO-9001]',
      '  3 z-steward: Merged a skill tidy-up.',
      'deploy:',
      '  2 z-delivery: Deployed gadgets 1.4 to the lab. https://example.com/run/7',
      '(hq news read --upto 3 marks these read)',
    ].join('\n'),
  );
});

test('read --upto marks only items up to that id; a later item stays unread', () => {
  item();
  item();
  expect(readNews(db, 1, 'z-stu')).toBe(1);
  expect(listNews(db, { all: false, limit: 200 }).map((n) => n.id)).toEqual([2]);
  expect(listNews(db, { all: true, limit: 200 }).map((n) => n.id)).toEqual([1, 2]);
  expect(readNews(db, 1, 'z-stu')).toBe(0);
  expect(digest([])).toBe('No unread news.');
});

test('--needs-geoff tells z-stu at once, unless z-stu filed it', () => {
  item({ topic: 'fix', text: 'The teapot fix needs a yes before deploy.', needsGeoff: true });
  expect(outbox()).toEqual([{ target: 'z-stu', text: 'News 1 needs the owner, from z-delivery: The teapot fix needs a yes before deploy. [GEO-9001]' }]);
  item({ from: 'z-stu', needsGeoff: true });
  expect(outbox()).toHaveLength(1);
});

test.each(['gossip', 'Report', 'REPORT', 'report ', '', 'reports', '__proto__', 'constructor', 'toString'])('the topic %p is refused', (topic) => expect(() => item({ topic })).toThrow('--topic must be one of'));

test('report is a topic', () => expect(() => item({ topic: 'report' })).not.toThrow());

test('bad input is refused', () => {
  expect(() => item({ topic: 'gossip' })).toThrow('--topic must be one of');
  expect(() => item({ text: 'two\nlines' })).toThrow('one line');
  expect(() => item({ text: 'x'.repeat(401) })).toThrow('400');
  expect(() => item({ issue: 'geo-1' })).toThrow('GEO-123');
  expect(() => item({ link: 'ftp://x' })).toThrow('http(s)');
  expect(() => readNews(db, 0, 'z-stu')).toThrow('--upto');
});

test('a limited digest shows the oldest unread, so its read hint covers only what it showed', () => {
  item();
  item();
  item();
  const shown = listNews(db, { all: false, limit: 2 });
  expect(shown.map((n) => n.id)).toEqual([1, 2]);
  expect(digest(shown, { more: 1 })).toContain('(hq news read --upto 2 marks these read; 1 more unread after them)');
  readNews(db, 2, 'z-stu');
  expect(listNews(db, { all: false, limit: 2 }).map((n) => n.id)).toEqual([3]);
  expect(digest(listNews(db, { all: true, limit: 2 }), { all: true })).not.toContain('read --upto');
});

test('--tag is stored and shown in the digest', () => {
  const n = item({ tag: 'weekly-flag' });
  expect(n.tag).toBe('weekly-flag');
  expect(item().tag).toBeNull();
  const d = digest(listNews(db, { all: false, limit: 200 }));
  expect(d).toContain('  1 #weekly-flag z-delivery: Merged widgets#12');
  expect(d).toContain('  2 z-delivery: Merged widgets#12');
  expect(listNews(db, { all: true, limit: 200 })[0]!.tag).toBe('weekly-flag');
});

test.each(['Weekly', 'weekly flag', 'weekly_flag', '-weekly', 'weekly-', 'weekly--flag', '', 'x'.repeat(33), "a'; DROP TABLE news", 'wëekly'])('the tag %p is refused', (tag) => expect(() => item({ tag })).toThrow('--tag must be a lowercase slug'));

test('a 32 character tag is allowed', () => expect(item({ tag: 'a'.repeat(32) }).tag).toBe('a'.repeat(32)));

test('newsTagged filters by tag and by the time added', () => {
  at('2026-10-14T01:00:00Z');
  item({ tag: 'weekly-flag', text: 'Old flag.' });
  at('2026-10-15T01:00:00Z');
  item({ tag: 'weekly-flag', text: 'New flag.' });
  item({ tag: 'other-tag', text: 'Another tag.' });
  item({ text: 'No tag.' });
  expect(newsTagged(db, 'weekly-flag', '2026-10-14T00:00:00Z').map((n) => n.text)).toEqual(['Old flag.', 'New flag.']);
  expect(newsTagged(db, 'weekly-flag', new Date('2026-10-15T00:00:00Z')).map((n) => n.text)).toEqual(['New flag.']);
  expect(newsTagged(db, 'weekly-flag', '2026-10-16T00:00:00Z')).toEqual([]);
  expect(newsTagged(db, 'nothing', '2026-10-01T00:00:00Z')).toEqual([]);
});

test('the digest marks an item that needs the owner', () => {
  item({ needsGeoff: true });

  expect(digest(listNews(db, { all: false, limit: 200 }))).toContain('  1 (needs the owner) z-delivery: Merged widgets#12: the kettle whistles once. [GEO-9001]');
});
