// oxlint-disable zgeoff/test-beside-module -- the whole-program asks suite, across src/asks and the item commands
import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { applyAskItem } from '../src/apply-ask-item.ts';
import { addAsk } from '../src/asks/add-ask.ts';
import { answerAsk } from '../src/asks/answer-ask.ts';
import { applyAsk } from '../src/asks/apply-ask.ts';
import { closeAsk } from '../src/asks/close-ask.ts';
import { getAsk } from '../src/asks/get-ask.ts';
import { lastQuietEnd } from '../src/asks/last-quiet-end.ts';
import { laterAsk } from '../src/asks/later-ask.ts';
import { nextEligible } from '../src/asks/next-eligible.ts';
import { openAsk } from '../src/asks/open-ask.ts';
import { queueReminder } from '../src/asks/queue-reminder.ts';
import { skipAsk } from '../src/asks/skip-ask.ts';
import { buildMockAddInput } from '../src/asks/test-utils/build-mock-add-input.ts';
import { waitReasons } from '../src/asks/wait-reasons.ts';
import { iso } from '../src/clock/iso.ts';
import { listEvents } from '../src/list-events.ts';
import { readOutboxRows } from '../src/outbox/read-outbox-rows.ts';
import { parseItemInput } from '../src/parse-item-input.ts';
import { readSubjectEvents } from '../src/read-subject-events.ts';
import { findPath } from '../src/test-utils/find-path.ts';
import { FOUR_AM_SYDNEY, NOON_SYDNEY, at } from './helpers.ts';
import { setMeta } from '../src/db/set-meta.ts';
import { buildSeeder } from '../src/test-utils/build-seeder.ts';
import { createTestDb } from './create-test-db.ts';

test('#addAsk files a queued call and tells the owner', () => {
  const ctx = setupTest();
  const added = addAsk(ctx.db, buildMockAddInput());
  expect(added.result).toBe('added');
  expect(added.ask.state).toBe('queued');
  expect(readOutboxRows(ctx.db).map((row) => row.target)).toStrictEqual(['stu']);
  expect(readOutboxRows(ctx.db)[0]?.text).toContain('call ready: geo-1-paint');
});

test('#addAsk sends nothing when the owner files its own item', () => {
  const ctx = setupTest();
  addAsk(ctx.db, buildMockAddInput({ actor: 'stu' }));
  expect(readOutboxRows(ctx.db)).toStrictEqual([]);
});

test('#addAsk does nothing for the same id and question again, even once answered', () => {
  const ctx = setupTest();
  addAsk(ctx.db, buildMockAddInput());
  expect(addAsk(ctx.db, buildMockAddInput()).result).toBe('noop');
  openAsk(ctx.db, { force: false, actor: 'stu' });
  answerAsk(ctx.db, { id: 'geo-1-paint', kind: 'call', answer: 'green, obviously', actor: 'stu' });
  const again = addAsk(ctx.db, buildMockAddInput({ body: 'reworded body, same question' }));
  expect(again.result).toBe('noop');
  expect(again.ask.state).toBe('answered');
  expect(readOutboxRows(ctx.db).filter((row) => row.target === 'stu')).toHaveLength(1);
});

test('#addAsk keeps the id and sends nothing when an issue joins a shared call', () => {
  const ctx = setupTest();
  addAsk(ctx.db, buildMockAddInput());
  const added = addAsk(ctx.db, buildMockAddInput({ issues: ['GEO-1', 'GEO-2'] }));
  expect(added.result).toBe('updated');
  expect(added.ask.issues).toStrictEqual(['GEO-1', 'GEO-2']);
  expect(readOutboxRows(ctx.db)).toHaveLength(1);
});

test('#addAsk starts a new round for a new question on a settled id', () => {
  const ctx = setupTest();
  addAsk(ctx.db, buildMockAddInput());
  openAsk(ctx.db, { force: false, actor: 'stu' });
  answerAsk(ctx.db, { id: 'geo-1-paint', kind: 'call', answer: 'green', actor: 'stu' });
  applyAsk(ctx.db, 'geo-1-paint', 'call', 'typed:z-delivery', null, 'stu');
  const added = addAsk(ctx.db, buildMockAddInput({ question: 'Gloss or matte?' }));
  expect(added.result).toBe('reasked');
  expect(added.ask).toMatchObject({ state: 'queued', round: 2, answer: null });
});

test('#addAsk never sends the same question back once it was answered and closed', () => {
  const ctx = setupTest();
  addAsk(ctx.db, buildMockAddInput());
  openAsk(ctx.db, { force: false, actor: 'stu' });
  answerAsk(ctx.db, { id: 'geo-1-paint', kind: 'call', answer: 'green', actor: 'stu' });
  closeAsk(ctx.db, 'geo-1-paint', 'call', 'settled elsewhere', 'z-refine');
  const added = addAsk(ctx.db, buildMockAddInput());
  expect(added.result).toBe('noop');
  expect(added.ask).toMatchObject({ state: 'closed', answer: 'green' });
  expect(nextEligible(ctx.db)).toBeNull();
});

test('#addAsk starts a new round for an answered then skipped call, and keeps the old answer in the log', () => {
  const ctx = setupTest();
  addAsk(ctx.db, buildMockAddInput());
  openAsk(ctx.db, { force: false, actor: 'stu' });
  answerAsk(ctx.db, { id: 'geo-1-paint', kind: 'call', answer: 'green', actor: 'stu' });
  skipAsk(ctx.db, 'geo-1-paint', 'call', 'issue changed', 'stu');
  const added = addAsk(ctx.db, buildMockAddInput());
  expect(added.result).toBe('requeued');
  expect(added.ask).toMatchObject({ state: 'queued', round: 2, answer: null });
  const [ev] = listEvents(ctx.db, 'requeued');
  invariant(ev, 'the re-add logged a requeued event');
  expect(findPath(JSON.parse(ev.data), 'previous_answer')).toBe('green');
});

test('#addAsk returns a skipped call to the queue when it is re-added', () => {
  const ctx = setupTest();
  addAsk(ctx.db, buildMockAddInput());
  skipAsk(ctx.db, 'geo-1-paint', 'call', 'issue changed', 'stu');
  expect(nextEligible(ctx.db)).toBeNull();
  expect(addAsk(ctx.db, buildMockAddInput()).result).toBe('requeued');
  expect(nextEligible(ctx.db)?.id).toBe('geo-1-paint');
});

test('#addAsk moves a queued call to the session a re-add names with --for, and the text is the same', () => {
  const ctx = setupTest();
  addAsk(ctx.db, buildMockAddInput());
  const readded = addAsk(ctx.db, buildMockAddInput({ forSession: 'z-kettle' }));
  expect(readded.result).toBe('updated');
  expect(getAsk(ctx.db, 'geo-1-paint')?.for_session).toBe('z-kettle');
});

test('#addAsk drops the recommendation when a changed question starts a new round', () => {
  const ctx = setupTest();
  applyAskItem(ctx.db, { kind: 'call', id: 'geo-1-paint', issues: ['GEO-1'], forSession: null, actor: 'z-refine' }, parseItemInput('call', JSON.stringify({ title: 'Paint the shed', question: 'Green or grey?', stuView: 'Grey hides the dirt.', options: [{ label: 'Green', effect: 'Green.' }, { label: 'Grey', effect: 'Grey.', recommended: true }] })), 'Green or grey?');
  openAsk(ctx.db, { id: 'geo-1-paint', force: true, actor: 'z-refine' });
  answerAsk(ctx.db, { id: 'geo-1-paint', kind: 'call', answer: 'Grey', actor: 'stu' });
  addAsk(ctx.db, buildMockAddInput({ title: 'Paint the fence', question: 'One coat or two?', body: 'One coat or two?' }));
  expect(getAsk(ctx.db, 'geo-1-paint')).toMatchObject({ question: 'One coat or two?', stu_view: null, item: null });
});

test('#addAsk drops the structured fields when a free-text re-add changes the text', () => {
  const ctx = setupTest();
  applyAskItem(ctx.db, { kind: 'call', id: 'geo-1-paint', issues: ['GEO-1'], forSession: null, actor: 'z-refine' }, parseItemInput('call', JSON.stringify({ title: 'Paint the shed', question: 'Green or grey?', options: [{ label: 'Green', effect: 'Green.' }, { label: 'Grey', effect: 'Grey.' }] })), 'Green or grey?');
  addAsk(ctx.db, buildMockAddInput({ title: 'Paint the shed', question: 'Green or grey?', body: 'The shed needs paint before the frost.' }));
  expect(getAsk(ctx.db, 'geo-1-paint')).toMatchObject({ body: 'The shed needs paint before the frost.', item: null });
});

test('#addAsk drops the structured fields when a free-text re-add asks a new question', () => {
  const ctx = setupTest();
  applyAskItem(ctx.db, { kind: 'call', id: 'geo-1-paint', issues: ['GEO-1'], forSession: null, actor: 'z-refine' }, parseItemInput('call', JSON.stringify({ title: 'Paint the shed', question: 'Green or grey?', options: [{ label: 'Green', effect: 'Green.' }, { label: 'Grey', effect: 'Grey.' }] })), 'Green or grey?');
  openAsk(ctx.db, { force: false, actor: 'stu' });
  answerAsk(ctx.db, { id: 'geo-1-paint', kind: 'call', answer: 'Green', actor: 'stu' });
  addAsk(ctx.db, buildMockAddInput({ question: 'Which green?' }));
  expect(getAsk(ctx.db, 'geo-1-paint')).toMatchObject({ state: 'queued', question: 'Which green?', item: null });
});

test('#addAsk keeps the structured fields when a re-add changes only the order', () => {
  const ctx = setupTest();
  applyAskItem(ctx.db, { kind: 'call', id: 'geo-1-paint', issues: ['GEO-1'], forSession: null, actor: 'z-refine' }, parseItemInput('call', JSON.stringify({ title: 'Paint the shed', question: 'Green or grey?', options: [{ label: 'Green', effect: 'Green.' }, { label: 'Grey', effect: 'Grey.' }] })), 'Green or grey?');
  addAsk(ctx.db, buildMockAddInput({ title: 'Paint the shed', question: 'Green or grey?', body: 'Green or grey?', forSession: null, order: 3 }));
  expect(getAsk(ctx.db, 'geo-1-paint')?.item?.options).toStrictEqual([{ label: 'Green', effect: 'Green.' }, { label: 'Grey', effect: 'Grey.' }]);
});

test('#addAsk keeps the question the owner saw on an open item', () => {
  const ctx = setupTest();
  addAsk(ctx.db, buildMockAddInput());
  openAsk(ctx.db, { force: false, actor: 'stu' });
  const added = addAsk(ctx.db, buildMockAddInput({ question: 'Something else?' }));
  expect(added.result).toBe('noop');
  expect(getAsk(ctx.db, 'geo-1-paint')?.question).toBe('Green or grey?');
});

test('#addAsk refuses an id that is not a slug, and a kind clash', () => {
  const ctx = setupTest();
  expect(() => addAsk(ctx.db, buildMockAddInput({ id: 'has space' }))).toThrow('slug');
  addAsk(ctx.db, buildMockAddInput());
  expect(() => addAsk(ctx.db, buildMockAddInput({ kind: 'proposal' }))).toThrow('is a call');
});

test('#openAsk keeps one item open at a time across calls and proposals', () => {
  const ctx = setupTest();
  addAsk(ctx.db, buildMockAddInput());
  addAsk(ctx.db, buildMockAddInput({ kind: 'proposal', id: 'tidy-docs', actor: 'z-steward' }));
  openAsk(ctx.db, { force: false, actor: 'stu' });
  expect(() => openAsk(ctx.db, { force: true, actor: 'stu' })).toThrow('is open with the owner');
  expect(waitReasons(ctx.db)).toContain('open: geo-1-paint');
});

test('#nextEligible picks by send order, and a re-add moves an item', () => {
  const ctx = setupTest();
  addAsk(ctx.db, buildMockAddInput({ id: 'old-low', order: 2 }));
  at('2026-10-14T01:05:00Z');
  addAsk(ctx.db, buildMockAddInput({ id: 'new-urgent', order: 1 }));
  addAsk(ctx.db, buildMockAddInput({ id: 'no-order' }));
  expect(nextEligible(ctx.db)?.id).toBe('new-urgent');
  expect(addAsk(ctx.db, buildMockAddInput({ id: 'old-low', order: 0 })).result).toBe('updated');
  expect(nextEligible(ctx.db)?.id).toBe('old-low');
  expect(addAsk(ctx.db, buildMockAddInput({ id: 'old-low' })).ask.send_order).toBe(0);
});

test('#openAsk opens the oldest item first', () => {
  const ctx = setupTest();
  addAsk(ctx.db, buildMockAddInput());
  at('2026-10-14T01:05:00Z');
  addAsk(ctx.db, buildMockAddInput({ id: 'geo-2-fence' }));
  expect(openAsk(ctx.db, { force: false, actor: 'stu' }).id).toBe('geo-1-paint');
});

test('#openAsk refuses from 03:00 to 07:00 Sydney unless forced', () => {
  const ctx = setupTest();
  addAsk(ctx.db, buildMockAddInput());
  at(FOUR_AM_SYDNEY);
  expect(() => openAsk(ctx.db, { force: false, actor: 'stu' })).toThrow('quiet hours');
  expect(openAsk(ctx.db, { force: true, actor: 'stu' }).state).toBe('open');
});

test('#openAsk refuses while a hold is set', () => {
  const ctx = setupTest();
  addAsk(ctx.db, buildMockAddInput());
  ctx.seed.meta({ key: 'hold', value: JSON.stringify({ reason: 'mid-intake', since: NOON_SYDNEY, by: 'stu' }) });
  expect(() => openAsk(ctx.db, { force: false, actor: 'stu' })).toThrow('held: mid-intake');
  expect(waitReasons(ctx.db)).toStrictEqual(['held: mid-intake']);
});

test('#answerAsk keeps the exact words and tells the filer, with no grant', () => {
  const ctx = setupTest();
  addAsk(ctx.db, buildMockAddInput());
  openAsk(ctx.db, { force: false, actor: 'stu' });
  const answered = answerAsk(ctx.db, { id: 'geo-1-paint', kind: 'call', answer: '  green — the  dark one ', actor: 'stu' });
  expect(answered.answer).toBe('  green — the  dark one ');
  const note = readOutboxRows(ctx.db).at(-1);
  expect(note?.target).toBe('z-triage');
  expect(note?.text).toContain('carries no grant');
  expect(readOutboxRows(ctx.db).some((row) => row.target === 'z-delivery')).toBe(false);
});

test('#answerAsk tells the filer that the owner answered, with the exact notice text', () => {
  const ctx = setupTest();
  addAsk(ctx.db, buildMockAddInput());
  openAsk(ctx.db, { force: false, actor: 'stu' });
  answerAsk(ctx.db, { id: 'geo-1-paint', kind: 'call', answer: 'green', actor: 'stu' });

  expect(readOutboxRows(ctx.db).at(-1)?.text).toBe('FYI call geo-1-paint answered by the owner: "green". This note carries no grant: stu applies the answer.');
});

test('#applyAsk needs an answer first and a known target', () => {
  const ctx = setupTest();
  addAsk(ctx.db, buildMockAddInput());
  openAsk(ctx.db, { force: false, actor: 'stu' });
  expect(() => applyAsk(ctx.db, 'geo-1-paint', 'call', 'none', null, 'stu')).toThrow('needs answered');
  answerAsk(ctx.db, { id: 'geo-1-paint', kind: 'call', answer: 'green', actor: 'stu' });
  expect(() => applyAsk(ctx.db, 'geo-1-paint', 'call', 'slack', null, 'stu')).toThrow('--to must be');
  expect(applyAsk(ctx.db, 'geo-1-paint', 'call', 'linear:GEO-1', 'commented', 'stu').applied_to).toBe('linear:GEO-1');
});

test('#laterAsk defaults to the next 07:00 Sydney, and the item reopens when due', () => {
  const ctx = setupTest();
  addAsk(ctx.db, buildMockAddInput());
  openAsk(ctx.db, { force: false, actor: 'stu' });
  const later = laterAsk(ctx.db, 'geo-1-paint', 'call', null, 'stu');
  expect(later.due_at).toBe('2026-10-14T20:00:00Z');
  expect(nextEligible(ctx.db)).toBeNull();
  at('2026-10-14T20:00:00Z');
  expect(nextEligible(ctx.db)?.id).toBe('geo-1-paint');
});

test('#laterAsk accepts +4h', () => {
  const ctx = setupTest();
  addAsk(ctx.db, buildMockAddInput());
  expect(laterAsk(ctx.db, 'geo-1-paint', 'call', '+4h', 'stu').due_at).toBe('2026-10-14T05:00:00Z');
});

test('#laterAsk puts off again a call whose later hold has ended', () => {
  const ctx = setupTest();
  addAsk(ctx.db, buildMockAddInput());
  laterAsk(ctx.db, 'geo-1-paint', 'call', '+4h', 'stu');
  at('2026-10-14T05:00:00Z');
  const due = getAsk(ctx.db, 'geo-1-paint');
  invariant(due);

  expect(laterAsk(ctx.db, 'geo-1-paint', 'call', '2026-10-14T22:00:00Z', 'stu')).toStrictEqual({ ...due, state: 'later', due_at: '2026-10-14T22:00:00Z', updated_at: '2026-10-14T05:00:00Z' });
});

test('#laterAsk leaves a call it put off again out of the next call until the new time', () => {
  const ctx = setupTest();
  addAsk(ctx.db, buildMockAddInput());
  laterAsk(ctx.db, 'geo-1-paint', 'call', '+4h', 'stu');
  at('2026-10-14T05:00:00Z');
  laterAsk(ctx.db, 'geo-1-paint', 'call', '2026-10-14T22:00:00Z', 'stu');

  expect(nextEligible(ctx.db)).toBeNull();
});

test('#closeAsk tells the filer and the owner, but not the closer', () => {
  const ctx = setupTest();
  addAsk(ctx.db, buildMockAddInput());
  openAsk(ctx.db, { force: false, actor: 'stu' });
  closeAsk(ctx.db, 'geo-1-paint', 'call', 'issue lost Needs Geoff', 'z-refine');
  const last = readOutboxRows(ctx.db).at(-1);
  expect(last?.target).toBe('stu');
  expect(last?.text).toContain('it was open with the owner, so tell them it is settled');
  expect(() => closeAsk(ctx.db, 'geo-1-paint', 'call', 'again', 'z-refine')).toThrow('is closed');
});

test('it logs every transition in the event log', () => {
  const ctx = setupTest();
  addAsk(ctx.db, buildMockAddInput());
  openAsk(ctx.db, { force: false, actor: 'stu' });
  answerAsk(ctx.db, { id: 'geo-1-paint', kind: 'call', answer: 'green', actor: 'stu' });
  applyAsk(ctx.db, 'geo-1-paint', 'call', 'none', null, 'stu');
  const actions = readSubjectEvents(ctx.db, 'ask', 'geo-1-paint').map((event) => event.action);
  expect(actions).toStrictEqual(['added', 'opened', 'answered', 'applied']);
});

test('#queueReminder tells stu once after 07:00 about a proposal filed in quiet hours', () => {
  const ctx = setupTest();
  at('2026-10-14T18:00:00Z');
  addAsk(ctx.db, buildMockAddInput({ kind: 'proposal', id: 'tidy-docs', actor: 'z-steward' }));
  expect(queueReminder(ctx.db, 'hq-lanes').reminded).toBeNull();
  at('2026-10-14T20:05:00Z');
  expect(queueReminder(ctx.db, 'hq-lanes').reminded).toBe('tidy-docs');
  expect(readOutboxRows(ctx.db).at(-1)?.target).toBe('stu');
  expect(readOutboxRows(ctx.db).at(-1)?.text).toContain('Open it with: hq open');
  at('2026-10-14T20:10:00Z');
  expect(queueReminder(ctx.db, 'hq-lanes').reminded).toBeNull();
});

test('#queueReminder sends no reminder for an item stu heard about while it could open', () => {
  const ctx = setupTest();
  addAsk(ctx.db, buildMockAddInput());
  expect(queueReminder(ctx.db, 'hq-lanes').why).toContain('already told');
});

test('#queueReminder announces a later item that falls due at 07:00', () => {
  const ctx = setupTest();
  addAsk(ctx.db, buildMockAddInput({ actor: 'stu' }));
  laterAsk(ctx.db, 'geo-1-paint', 'call', null, 'stu');
  at('2026-10-14T20:05:00Z');
  expect(queueReminder(ctx.db, 'hq-lanes').reminded).toBe('geo-1-paint');
});

test('#queueReminder sends nothing while an item is open', () => {
  const ctx = setupTest();
  at('2026-10-14T18:00:00Z');
  addAsk(ctx.db, buildMockAddInput({ id: 'a', actor: 'z-refine' }));
  addAsk(ctx.db, buildMockAddInput({ id: 'b', actor: 'z-refine' }));
  at('2026-10-14T20:05:00Z');
  openAsk(ctx.db, { id: 'a', force: false, actor: 'stu' });
  expect(queueReminder(ctx.db, 'hq-lanes').why).toContain('open: a');
});

test.each([
  ['2026-10-05T13:05:00Z', '2026-10-04T20:00:00Z'],

  // 4 Oct 07:00 is already AEDT, because DST began at 02:00.
  ['2026-10-04T12:00:00Z', '2026-10-03T20:00:00Z'],
  ['2026-10-14T20:05:00Z', '2026-10-14T20:00:00Z'],
  ['2026-10-14T18:00:00Z', '2026-10-13T20:00:00Z'],
])('#lastQuietEnd gives the latest 07:00 Sydney before %s as %s, across the October DST change', (now, expected) => {
  const quietEnd = lastQuietEnd(new Date(now));

  expect(iso(quietEnd)).toBe(expected);
});

test('#queueReminder still announces when a hold is released within the same second as the add', () => {
  const ctx = setupTest();
  ctx.seed.meta({ key: 'hold', value: '{"reason":"x","since":"","by":"stu"}' });
  at('2026-10-14T01:00:00.100Z');
  addAsk(ctx.db, buildMockAddInput({ actor: 'z-refine' }));
  setMeta(ctx.db, 'hold', null);
  ctx.seed.meta({ key: 'hold_released_at', value: '2026-10-14T01:00:00.900Z' });
  at('2026-10-14T01:05:00Z');
  expect(queueReminder(ctx.db, 'hq-lanes').reminded).toBe('geo-1-paint');
});

test('#addAsk adds a new issue to an open shared call even when the question text changed', () => {
  const ctx = setupTest();
  addAsk(ctx.db, buildMockAddInput());
  openAsk(ctx.db, { force: false, actor: 'stu' });
  const added = addAsk(ctx.db, buildMockAddInput({ question: 'Green or grey, for both sheds?', issues: ['GEO-1', 'GEO-2'] }));
  expect(added.result).toBe('noop');
  expect(added.ask).toMatchObject({ state: 'open', question: 'Green or grey?', issues: ['GEO-1', 'GEO-2'] });
});

function setupTest() {
  const fresh = createTestDb();
  at(NOON_SYDNEY);
  return { db: fresh.db, seed: buildSeeder(fresh) };
}
