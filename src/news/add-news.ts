// hq news: one-line items for the owner, read as a digest. Adding one sends
// nothing, unless it needs the owner, which tells z-stu at once.
import { ok } from 'node:assert/strict';
import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import { logEvent } from '../log-event.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { owner } from '../owner.ts';
import { getNews } from './get-news.ts';
import { line } from './line.ts';
import { NEWS_TOPICS } from './news-topics.ts';
import { TAG_RE } from './tag-re.ts';
import type { AddNewsInput, NewsItem } from './types.ts';

export function addNews(db: Database, input: AddNewsInput): NewsItem {
  if (!(NEWS_TOPICS as readonly string[]).includes(input.topic)) throw new HqError('bad_args', `--topic must be one of ${NEWS_TOPICS.join(', ')}`);
  const text = input.text.trim();
  if (!text) throw new HqError('bad_args', '--text is empty');
  if (/[\r\n]/.test(text)) throw new HqError('bad_args', '--text must be one line');
  if (text.length > 400) throw new HqError('bad_args', '--text is over 400 characters: keep it to one line');
  if (input.issue !== null && !/^[A-Z][A-Z0-9]*-\d+$/.test(input.issue)) throw new HqError('bad_args', '--issue must look like GEO-123');
  if (input.link !== null && !/^https?:\/\/\S+$/.test(input.link)) throw new HqError('bad_args', '--link must be an http(s) URL');
  if (input.tag != null && (input.tag.length > 32 || !TAG_RE.test(input.tag))) throw new HqError('bad_args', '--tag must be a lowercase slug of up to 32 characters, such as weekly-flag');
  if (!input.from.trim()) throw new HqError('bad_args', '--from is empty');
  return db
    .transaction(() => {
      const t = iso(now());
      const id = Number(
        db
          .query('INSERT INTO news (from_name, topic, text, issue, link, needs_geoff, added_at, tag) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(input.from.trim(), input.topic, text, input.issue, input.link, input.needsGeoff ? 1 : 0, t, input.tag ?? null).lastInsertRowid,
      );
      const seq = logEvent(db, 'hq', `news:${id}`, 'news-added', input.from.trim(), null, null, { topic: input.topic, needsGeoff: input.needsGeoff, tag: input.tag ?? null });
      // z-stu filing its own item needs no message to itself.
      const news = getNews(db, id);
      ok(news, `news ${id} is missing inside the transaction that inserted it`);
      if (input.needsGeoff && input.from.trim() !== owner()) {
        enqueue(db, seq, owner(), `News ${id} needs the owner, from ${input.from.trim()}: ${line(news)}`);
      }
      return news;
    })
    .immediate();
}
