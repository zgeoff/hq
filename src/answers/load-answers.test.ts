import type { Database } from 'bun:sqlite';
import { expect, onTestFinished, spyOn, test } from 'bun:test';
import { createUnblockItems } from '../../test/create-unblock-items.ts';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import { answerAsk } from '../asks/answer-ask.ts';
import { applyAskItem } from '../apply-ask-item.ts';
import { main } from '../cli.ts';
import { openAsk } from '../asks/open-ask.ts';
import { parseItemInput } from '../parse-item-input.ts';
import { recordConsoleAnswer } from '../record-console-answer.ts';
import { recordConsoleReview } from '../record-console-review.ts';
import { addTyped } from '../typed/add-typed.ts';
import { loadAnswers } from './load-answers.ts';

function setupTest(): Database {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  return fresh.db;
}

test('the window lists ask answers, console reviews and typed lines, oldest first, each with its source', () => {
  const db = setupTest(),
    item = parseItemInput('call', JSON.stringify({ title: 'Descale the kettle', question: 'Descale it now?', options: [{ label: 'Descale it', effect: 'It gets descaled.', recommended: true }, { label: 'Leave it', effect: 'Nothing changes.' }] }));
  applyAskItem(db, { kind: 'call', id: 'kettle-descale', issues: ['GEO-9001'], forSession: 'kettle-bot', actor: 'kettle-bot' }, item, 'Descale it now?');
  at('2026-10-14T01:01:00Z');
  recordConsoleAnswer(db, { id: 'kettle-descale', option: 'Descale it', note: 'Use the citric acid.', actor: 'console' });
  createUnblockItems(db, { 'review-4': { task: 'Review kettle#4 and say lgtm', links: [{ label: 'kettle#4', url: 'https://github.com/kettle-co/kettle/pull/4', subject: true }] } });
  at('2026-10-14T01:02:00Z');
  recordConsoleReview(db, { id: 'review-4', review: 'changes', note: 'Shorter spout.', actor: 'console' });
  at('2026-10-14T01:03:00Z');
  addTyped(db, { to: 'kettle-bot', toId: null, toName: null, text: 'Descale it, with the citric acid.', source: { kind: 'call', ref: 'kettle-descale', at: null }, actor: 'teapot-bot' });

  expect(loadAnswers(db, { from: NOON_SYDNEY, to: '2026-10-14T02:00:00Z' })).toStrictEqual([
    { source: 'ask', id: 'kettle-descale', kind: 'call', title: 'Descale the kettle', issues: ['GEO-9001'], session: 'kettle-bot', picked: 'Descale it', stuPick: true, words: 'Use the citric acid.', ref: null, via: 'console', at: '2026-10-14T01:01:00Z' },
    { source: 'review', id: 'review-4', kind: 'review', title: 'Review kettle#4 and say lgtm', issues: [], session: 'kettle-triage', picked: 'Changes', stuPick: null, words: 'Shorter spout.', ref: 'https://github.com/kettle-co/kettle/pull/4', via: 'console', at: '2026-10-14T01:02:00Z' },
    { source: 'typed', id: '1', kind: 'call', title: null, issues: [], session: 'kettle-bot', picked: null, stuPick: null, words: 'Descale it, with the citric acid.', ref: 'call:kettle-descale', via: 'teapot-bot', at: '2026-10-14T01:03:00Z' },
  ]);
});

const CRACKED_OPTIONS = [
    { label: 'The red one', effect: 'Red.', recommended: true },
    { label: 'A new one', effect: 'Buy one.' },
  ],
  TEAPOT_OPTIONS = [
    { label: 'The blue one', effect: 'Blue.' },
    { label: 'The red one', effect: 'Red.' },
  ];

test('a re-asked call lists each round\'s answer once, read against that round\'s options, and an answer outside the window is left out', () => {
  const db = setupTest(),
    item = parseItemInput('call', JSON.stringify({ title: 'Pick a teapot', question: 'Which teapot?', options: TEAPOT_OPTIONS }));
  applyAskItem(db, { kind: 'call', id: 'teapot-pick', issues: [], forSession: null, actor: 'kettle-bot' }, item, 'Which teapot?');
  openAsk(db, { id: 'teapot-pick', force: true, actor: 'kettle-bot' });
  answerAsk(db, { id: 'teapot-pick', kind: 'call', answer: 'The blue one', actor: 'teapot-bot' });
  at('2026-10-14T03:00:00Z');
  applyAskItem(db, { kind: 'call', id: 'teapot-pick', issues: [], forSession: null, actor: 'kettle-bot' }, parseItemInput('call', JSON.stringify({ title: 'Pick a teapot', question: 'Which teapot, now the blue one cracked?', options: CRACKED_OPTIONS })), 'Which teapot, now the blue one cracked?');
  recordConsoleAnswer(db, { id: 'teapot-pick', option: 'The red one', note: '', actor: 'console' });

  expect(loadAnswers(db, { from: NOON_SYDNEY, to: '2026-10-14T04:00:00Z' }).map((a) => [a.at, a.picked, a.stuPick, a.words, a.via])).toStrictEqual([
    [NOON_SYDNEY, 'The blue one', false, null, 'teapot-bot'],
    ['2026-10-14T03:00:00Z', 'The red one', true, null, 'console'],
  ]);
  expect(loadAnswers(db, { from: '2026-10-14T02:00:00Z', to: '2026-10-14T04:00:00Z' }).map((a) => a.at)).toStrictEqual(['2026-10-14T03:00:00Z']);
});

test('hq answers --json lists the last 7 days by default, and --since sets the window', async () => {
  const db = createTwoTypedLines(setupTest()),
    log = spyOn(console, 'log').mockImplementation((line: string) => printed.push(line)),
    printed: string[] = [],
    runDefault = await main(['answers', '--json']),
    runSince = await main(['answers', '--since', '10d', '--json']);
  onTestFinished(() => log.mockRestore());
  expect([db.query('SELECT COUNT(*) AS n FROM typed').get(), runDefault, runSince]).toStrictEqual([{ n: 2 }, 0, 0]);
  expect(printed.map((p) => JSON.parse(p) as { window: { from: string }; answers: { words: string }[] }).map((j) => [j.window.from, j.answers.map((a) => a.words)])).toStrictEqual([
    ['2026-10-07T01:00:00Z', ['Descale it.']],
    ['2026-10-04T01:00:00Z', ['Old news.', 'Descale it.']],
  ]);
});

// One typed line 8 days before noon on 14 Oct and one a day before, then the clock back at noon.
function createTwoTypedLines(db: Database): Database {
  at('2026-10-06T01:00:00Z');
  addTyped(db, { to: 'kettle-bot', toId: null, toName: null, text: 'Old news.', source: { kind: 'chat', ref: 'kettle-bot', at: '2026-10-06T00:59:00Z' }, actor: 'teapot-bot' });
  at('2026-10-13T01:00:00Z');
  addTyped(db, { to: 'kettle-bot', toId: null, toName: null, text: 'Descale it.', source: { kind: 'chat', ref: 'kettle-bot', at: '2026-10-13T00:59:00Z' }, actor: 'teapot-bot' });
  at(NOON_SYDNEY);
  return db;
}
