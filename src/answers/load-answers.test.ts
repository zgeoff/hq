import type { Database } from 'bun:sqlite';
import { expect, onTestFinished, spyOn, test } from 'bun:test';
import { createUnblockItems } from '../../test/create-unblock-items.ts';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import { addAsk } from '../asks/add-ask.ts';
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

test("it lists an earlier round's answer with the title, issues and session that round had", () => {
  const db = setupTest();
  addAsk(db, { kind: 'call', id: 'kettle-spout', title: 'Pick a spout', question: 'Long or short?', body: 'Long or short?', issues: ['GEO-9001'], forSession: 'kettle-bot', actor: 'kettle-bot' });
  openAsk(db, { id: 'kettle-spout', force: true, actor: 'kettle-bot' });
  answerAsk(db, { id: 'kettle-spout', kind: 'call', answer: 'Long', actor: 'teapot-bot' });
  at('2026-10-14T03:00:00Z');
  addAsk(db, { kind: 'call', id: 'kettle-spout', title: 'Pick a lid', question: 'Hinged or loose?', body: 'Hinged or loose?', issues: ['GEO-9002'], forSession: 'teapot-bot', actor: 'kettle-bot' });
  openAsk(db, { id: 'kettle-spout', force: true, actor: 'kettle-bot' });
  answerAsk(db, { id: 'kettle-spout', kind: 'call', answer: 'Hinged', actor: 'teapot-bot' });

  expect(loadAnswers(db, { from: NOON_SYDNEY, to: '2026-10-14T04:00:00Z' }).map((answer) => [answer.title, answer.issues, answer.session, answer.words])).toStrictEqual([
    ['Pick a spout', ['GEO-9001'], 'kettle-bot', 'Long'],
    ['Pick a lid', ['GEO-9002'], 'teapot-bot', 'Hinged'],
  ]);
});

test('it reads a free-text answer to a re-asked call as words, not as a pick from the options the earlier round had', () => {
  const db = setupTest();
  applyAskItem(db, { kind: 'call', id: 'kettle-boil', issues: [], forSession: null, actor: 'kettle-bot' }, parseItemInput('call', JSON.stringify({ title: 'Boil the kettle', question: 'Boil it now?', options: [{ label: 'Yes', effect: 'It boils.', recommended: true }, { label: 'No', effect: 'It waits.' }] })), 'Boil it now?');
  openAsk(db, { id: 'kettle-boil', force: true, actor: 'kettle-bot' });
  answerAsk(db, { id: 'kettle-boil', kind: 'call', answer: 'No', actor: 'teapot-bot' });
  at('2026-10-14T03:00:00Z');
  addAsk(db, { kind: 'call', id: 'kettle-boil', title: 'Boil the kettle', question: 'Boil it twice?', body: 'Boil it twice?', issues: [], forSession: null, actor: 'kettle-bot' });
  openAsk(db, { id: 'kettle-boil', force: true, actor: 'kettle-bot' });
  answerAsk(db, { id: 'kettle-boil', kind: 'call', answer: 'Yes', actor: 'teapot-bot' });

  expect(loadAnswers(db, { from: NOON_SYDNEY, to: '2026-10-14T04:00:00Z' }).map((answer) => [answer.picked, answer.stuPick, answer.words])).toStrictEqual([
    ['No', false, null],
    [null, null, 'Yes'],
  ]);
});

test('it reads an answer as words once new text cleared the options of a call still in line', () => {
  const db = setupTest();
  applyAskItem(db, { kind: 'call', id: 'kettle-fill', issues: [], forSession: null, actor: 'kettle-bot' }, parseItemInput('call', JSON.stringify({ title: 'Fill the kettle', question: 'Fill it?', options: [{ label: 'Yes', effect: 'It fills.', recommended: true }, { label: 'No', effect: 'It stays empty.' }] })), 'Fill it?');
  addAsk(db, { kind: 'call', id: 'kettle-fill', title: 'Fill the kettle halfway', question: 'Fill it?', body: 'Fill it?', issues: [], forSession: null, actor: 'kettle-bot' });
  openAsk(db, { id: 'kettle-fill', force: true, actor: 'kettle-bot' });
  answerAsk(db, { id: 'kettle-fill', kind: 'call', answer: 'Yes', actor: 'teapot-bot' });

  expect(loadAnswers(db, { from: NOON_SYDNEY, to: '2026-10-14T04:00:00Z' }).map((answer) => [answer.picked, answer.stuPick, answer.words])).toStrictEqual([[null, null, 'Yes']]);
});

test("it lists an earlier round's answer with that round's title, issues and session when its change events hold none of them", () => {
  const db = setupTest();
  addAsk(db, { kind: 'call', id: 'kettle-handle', title: 'Pick a handle', question: 'Wood or steel?', body: 'Wood or steel?', issues: ['GEO-9003'], forSession: 'kettle-bot', actor: 'kettle-bot' });
  db.run("UPDATE events SET data = json_remove(data, '$.title', '$.issues', '$.forSession') WHERE subject = 'ask'");
  openAsk(db, { id: 'kettle-handle', force: true, actor: 'kettle-bot' });
  answerAsk(db, { id: 'kettle-handle', kind: 'call', answer: 'Wood', actor: 'teapot-bot' });
  at('2026-10-14T03:00:00Z');
  addAsk(db, { kind: 'call', id: 'kettle-handle', title: 'Pick a base', question: 'Flat or round?', body: 'Flat or round?', issues: ['GEO-9004'], forSession: 'teapot-bot', actor: 'kettle-bot' });

  expect(loadAnswers(db, { from: NOON_SYDNEY, to: '2026-10-14T04:00:00Z' }).map((answer) => [answer.title, answer.issues, answer.session, answer.words])).toStrictEqual([['Pick a handle', ['GEO-9003'], 'kettle-bot', 'Wood']]);
});

test('it lists a review answer with the PR it was about, after its id comes back for another PR', () => {
  const db = setupTest();
  createUnblockItems(db, { 'review-5': { task: 'Review kettle#5 and say lgtm', links: [{ label: 'kettle#5', url: 'https://github.com/kettle-co/kettle/pull/5', subject: true }] } });
  recordConsoleReview(db, { id: 'review-5', review: 'lgtm', note: '', actor: 'console' });
  at('2026-10-14T03:00:00Z');
  createUnblockItems(db, { 'review-5': { task: 'Review kettle#6 and say lgtm', links: [{ label: 'kettle#6', url: 'https://github.com/kettle-co/kettle/pull/6', subject: true }] } });

  expect(loadAnswers(db, { from: NOON_SYDNEY, to: '2026-10-14T04:00:00Z' }).map((answer) => [answer.title, answer.ref])).toStrictEqual([['Review kettle#5 and say lgtm', 'https://github.com/kettle-co/kettle/pull/5']]);
});

test('it reads a review answer from before its facts were kept against the item as it stands', () => {
  const db = setupTest();
  createUnblockItems(db, { 'review-6': { task: 'Review kettle#7 and say lgtm', links: [{ label: 'kettle#7', url: 'https://github.com/kettle-co/kettle/pull/7', subject: true }] } });
  recordConsoleReview(db, { id: 'review-6', review: 'changes', note: 'Wider lid.', actor: 'console' });
  db.run("UPDATE events SET data = json_remove(data, '$.facts') WHERE action = 'console-review'");

  expect(loadAnswers(db, { from: NOON_SYDNEY, to: '2026-10-14T04:00:00Z' }).map((answer) => [answer.title, answer.ref, answer.words])).toStrictEqual([['Review kettle#7 and say lgtm', 'https://github.com/kettle-co/kettle/pull/7', 'Wider lid.']]);
});

test("it lists an earlier round's answer with no title, issues or session when no event kept them and the ask changed after", () => {
  const db = setupTest();
  addAsk(db, { kind: 'call', id: 'kettle-spout', title: 'Pick a spout', question: 'Long or short?', body: 'Long or short?', issues: ['GEO-9005'], forSession: 'kettle-bot', actor: 'kettle-bot' });
  openAsk(db, { id: 'kettle-spout', force: true, actor: 'kettle-bot' });
  answerAsk(db, { id: 'kettle-spout', kind: 'call', answer: 'Long', actor: 'teapot-bot' });
  at('2026-10-14T03:00:00Z');
  addAsk(db, { kind: 'call', id: 'kettle-spout', title: 'Pick a lid', question: 'Flat or domed?', body: 'Flat or domed?', issues: ['GEO-9006'], forSession: 'teapot-bot', actor: 'kettle-bot' });
  db.run("UPDATE events SET data = json_remove(data, '$.title', '$.issues', '$.forSession') WHERE subject = 'ask'");

  expect(loadAnswers(db, { from: NOON_SYDNEY, to: '2026-10-14T04:00:00Z' }).map((answer) => [answer.title, answer.issues, answer.session, answer.words])).toStrictEqual([[null, [], null, 'Long']]);
});

test('it lists a review answer from before its facts were kept with no title or PR once its id comes back for another PR', () => {
  const db = setupTest();
  createUnblockItems(db, { 'review-7': { task: 'Review kettle#8 and say lgtm', links: [{ label: 'kettle#8', url: 'https://github.com/kettle-co/kettle/pull/8', subject: true }] } });
  recordConsoleReview(db, { id: 'review-7', review: 'lgtm', note: '', actor: 'console' });
  db.run("UPDATE events SET data = json_remove(data, '$.facts') WHERE action = 'console-review'");
  at('2026-10-14T03:00:00Z');
  createUnblockItems(db, { 'review-7': { task: 'Review kettle#9 and say lgtm', links: [{ label: 'kettle#9', url: 'https://github.com/kettle-co/kettle/pull/9', subject: true }] } });

  expect(loadAnswers(db, { from: NOON_SYDNEY, to: '2026-10-14T04:00:00Z' }).map((answer) => [answer.title, answer.session, answer.ref])).toStrictEqual([[null, null, null]]);
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
