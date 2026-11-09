// oxlint-disable zgeoff/test-beside-module -- the whole-program asks suite, across src/asks and the item commands
import { describe, expect, test } from 'bun:test';
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
import type { AddInput } from '../src/asks/types.ts';
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

const call = (over: Partial<AddInput> = {}): AddInput => ({
  kind: 'call',
  id: 'geo-1-paint',
  title: 'Paint the shed',
  question: 'Green or grey?',
  body: 'The shed needs paint. Green or grey? Recommendation: green.',
  issues: ['GEO-1'],
  forSession: 'z-delivery',
  actor: 'z-refine',
  ...over,
});

describe('add', () => {
  test('files a queued call and tells the owner', () => {
    const ctx = setupTest();
    const added =addAsk(ctx.db, call());
    expect(added.result).toBe('added');
    expect(added.ask.state).toBe('queued');
    expect(readOutboxRows(ctx.db).map((row) => row.target)).toStrictEqual(['z-stu']);
    expect(readOutboxRows(ctx.db)[0]?.text).toContain('call ready: geo-1-paint');
  });

  test('the owner filing its own item sends nothing', () => {
    const ctx = setupTest();
    addAsk(ctx.db, call({ actor: 'z-stu' }));
    expect(readOutboxRows(ctx.db)).toStrictEqual([]);
  });

  test('same id and question again is a no-op, even once answered', () => {
    const ctx = setupTest();
    addAsk(ctx.db, call());
    expect(addAsk(ctx.db, call()).result).toBe('noop');
    openAsk(ctx.db, { force: false, actor: 'z-stu' });
    answerAsk(ctx.db, { id: 'geo-1-paint', kind: 'call', answer: 'green, obviously', actor: 'z-stu' });
    const again = addAsk(ctx.db, call({ body: 'reworded body, same question' }));
    expect(again.result).toBe('noop');
    expect(again.ask.state).toBe('answered');
    expect(readOutboxRows(ctx.db).filter((row) => row.target === 'z-stu')).toHaveLength(1);
  });

  test('an issue joining a shared call keeps the id and sends nothing', () => {
    const ctx = setupTest();
    addAsk(ctx.db, call());
    const added =addAsk(ctx.db, call({ issues: ['GEO-1', 'GEO-2'] }));
    expect(added.result).toBe('updated');
    expect(added.ask.issues).toStrictEqual(['GEO-1', 'GEO-2']);
    expect(readOutboxRows(ctx.db)).toHaveLength(1);
  });

  test('a new question on a settled id starts a new round', () => {
    const ctx = setupTest();
    addAsk(ctx.db, call());
    openAsk(ctx.db, { force: false, actor: 'z-stu' });
    answerAsk(ctx.db, { id: 'geo-1-paint', kind: 'call', answer: 'green', actor: 'z-stu' });
    applyAsk(ctx.db, 'geo-1-paint', 'call', 'typed:z-delivery', null, 'z-stu');
    const added =addAsk(ctx.db, call({ question: 'Gloss or matte?' }));
    expect(added.result).toBe('reasked');
    expect(added.ask).toMatchObject({ state: 'queued', round: 2, answer: null });
  });

  test('answered then closed: the same question never goes back', () => {
    const ctx = setupTest();
    addAsk(ctx.db, call());
    openAsk(ctx.db, { force: false, actor: 'z-stu' });
    answerAsk(ctx.db, { id: 'geo-1-paint', kind: 'call', answer: 'green', actor: 'z-stu' });
    closeAsk(ctx.db, 'geo-1-paint', 'call', 'settled elsewhere', 'z-refine');
    const added =addAsk(ctx.db, call());
    expect(added.result).toBe('noop');
    expect(added.ask).toMatchObject({ state: 'closed', answer: 'green' });
    expect(nextEligible(ctx.db)).toBeNull();
  });

  test('answered then skipped: a re-add is a new round, the old answer kept in the log', () => {
    const ctx = setupTest();
    addAsk(ctx.db, call());
    openAsk(ctx.db, { force: false, actor: 'z-stu' });
    answerAsk(ctx.db, { id: 'geo-1-paint', kind: 'call', answer: 'green', actor: 'z-stu' });
    skipAsk(ctx.db, 'geo-1-paint', 'call', 'issue changed', 'z-stu');
    const added =addAsk(ctx.db, call());
    expect(added.result).toBe('requeued');
    expect(added.ask).toMatchObject({ state: 'queued', round: 2, answer: null });
    const [ev] = listEvents(ctx.db, 'requeued');
    invariant(ev, 'the re-add logged a requeued event');
    expect(findPath(JSON.parse(ev.data), 'previous_answer')).toBe('green');
  });

  test('a skipped call returns to the queue when re-added', () => {
    const ctx = setupTest();
    addAsk(ctx.db, call());
    skipAsk(ctx.db, 'geo-1-paint', 'call', 'issue changed', 'z-stu');
    expect(nextEligible(ctx.db)).toBeNull();
    expect(addAsk(ctx.db, call()).result).toBe('requeued');
    expect(nextEligible(ctx.db)?.id).toBe('geo-1-paint');
  });

  test('it moves a queued call to the session a re-add names with --for, and the text is the same', () => {
    const ctx = setupTest();
    addAsk(ctx.db, call());
    const readded = addAsk(ctx.db, call({ forSession: 'z-kettle' }));
    expect(readded.result).toBe('updated');
    expect(getAsk(ctx.db, 'geo-1-paint')?.for_session).toBe('z-kettle');
  });

  test('it drops the recommendation when a changed question starts a new round', () => {
    const ctx = setupTest();
    applyAskItem(ctx.db, { kind: 'call', id: 'geo-1-paint', issues: ['GEO-1'], forSession: null, actor: 'z-refine' }, parseItemInput('call', JSON.stringify({ title: 'Paint the shed', question: 'Green or grey?', stuView: 'Grey hides the dirt.', options: [{ label: 'Green', effect: 'Green.' }, { label: 'Grey', effect: 'Grey.', recommended: true }] })), 'Green or grey?');
    openAsk(ctx.db, { id: 'geo-1-paint', force: true, actor: 'z-refine' });
    answerAsk(ctx.db, { id: 'geo-1-paint', kind: 'call', answer: 'Grey', actor: 'z-stu' });
    addAsk(ctx.db, call({ title: 'Paint the fence', question: 'One coat or two?', body: 'One coat or two?' }));
    expect(getAsk(ctx.db, 'geo-1-paint')).toMatchObject({ question: 'One coat or two?', stu_view: null, item: null });
  });

  test('it drops the structured fields when a free-text re-add changes the text', () => {
    const ctx = setupTest();
    applyAskItem(ctx.db, { kind: 'call', id: 'geo-1-paint', issues: ['GEO-1'], forSession: null, actor: 'z-refine' }, parseItemInput('call', JSON.stringify({ title: 'Paint the shed', question: 'Green or grey?', options: [{ label: 'Green', effect: 'Green.' }, { label: 'Grey', effect: 'Grey.' }] })), 'Green or grey?');
    addAsk(ctx.db, call({ title: 'Paint the shed', question: 'Green or grey?', body: 'The shed needs paint before the frost.' }));
    expect(getAsk(ctx.db, 'geo-1-paint')).toMatchObject({ body: 'The shed needs paint before the frost.', item: null });
  });

  test('it drops the structured fields when a free-text re-add asks a new question', () => {
    const ctx = setupTest();
    applyAskItem(ctx.db, { kind: 'call', id: 'geo-1-paint', issues: ['GEO-1'], forSession: null, actor: 'z-refine' }, parseItemInput('call', JSON.stringify({ title: 'Paint the shed', question: 'Green or grey?', options: [{ label: 'Green', effect: 'Green.' }, { label: 'Grey', effect: 'Grey.' }] })), 'Green or grey?');
    openAsk(ctx.db, { force: false, actor: 'z-stu' });
    answerAsk(ctx.db, { id: 'geo-1-paint', kind: 'call', answer: 'Green', actor: 'z-stu' });
    addAsk(ctx.db, call({ question: 'Which green?' }));
    expect(getAsk(ctx.db, 'geo-1-paint')).toMatchObject({ state: 'queued', question: 'Which green?', item: null });
  });

  test('it keeps the structured fields when a re-add changes only the order', () => {
    const ctx = setupTest();
    applyAskItem(ctx.db, { kind: 'call', id: 'geo-1-paint', issues: ['GEO-1'], forSession: null, actor: 'z-refine' }, parseItemInput('call', JSON.stringify({ title: 'Paint the shed', question: 'Green or grey?', options: [{ label: 'Green', effect: 'Green.' }, { label: 'Grey', effect: 'Grey.' }] })), 'Green or grey?');
    addAsk(ctx.db, call({ title: 'Paint the shed', question: 'Green or grey?', body: 'Green or grey?', forSession: null, order: 3 }));
    expect(getAsk(ctx.db, 'geo-1-paint')?.item?.options).toStrictEqual([{ label: 'Green', effect: 'Green.' }, { label: 'Grey', effect: 'Grey.' }]);
  });

  test('an open item keeps the question the owner saw', () => {
    const ctx = setupTest();
    addAsk(ctx.db, call());
    openAsk(ctx.db, { force: false, actor: 'z-stu' });
    const added =addAsk(ctx.db, call({ question: 'Something else?' }));
    expect(added.result).toBe('noop');
    expect(getAsk(ctx.db, 'geo-1-paint')?.question).toBe('Green or grey?');
  });

  test('refuses an id that is not a slug, and a kind clash', () => {
    const ctx = setupTest();
    expect(() => addAsk(ctx.db, call({ id: 'has space' }))).toThrow('slug');
    addAsk(ctx.db, call());
    expect(() => addAsk(ctx.db, call({ kind: 'proposal' }))).toThrow('is a call');
  });
});

describe('one open at a time', () => {
  test('across calls and proposals', () => {
    const ctx = setupTest();
    addAsk(ctx.db, call());
    addAsk(ctx.db, call({ kind: 'proposal', id: 'tidy-docs', actor: 'z-steward' }));
    openAsk(ctx.db, { force: false, actor: 'z-stu' });
    expect(() => openAsk(ctx.db, { force: true, actor: 'z-stu' })).toThrow('is open with the owner');
    expect(waitReasons(ctx.db)).toContain('open: geo-1-paint');
  });

  test('opens by send order, and a re-add moves an item', () => {
    const ctx = setupTest();
    addAsk(ctx.db, call({ id: 'old-low', order: 2 }));
    at('2026-10-14T01:05:00Z');
    addAsk(ctx.db, call({ id: 'new-urgent', order: 1 }));
    addAsk(ctx.db, call({ id: 'no-order' }));
    expect(nextEligible(ctx.db)?.id).toBe('new-urgent');
    expect(addAsk(ctx.db, call({ id: 'old-low', order: 0 })).result).toBe('updated');
    expect(nextEligible(ctx.db)?.id).toBe('old-low');
    expect(addAsk(ctx.db, call({ id: 'old-low' })).ask.send_order).toBe(0);
  });

  test('opens the oldest first', () => {
    const ctx = setupTest();
    addAsk(ctx.db, call());
    at('2026-10-14T01:05:00Z');
    addAsk(ctx.db, call({ id: 'geo-2-fence' }));
    expect(openAsk(ctx.db, { force: false, actor: 'z-stu' }).id).toBe('geo-1-paint');
  });
});

describe('quiet hours and hold', () => {
  test('refuses from 03:00 to 07:00 Sydney unless forced', () => {
    const ctx = setupTest();
    addAsk(ctx.db, call());
    at(FOUR_AM_SYDNEY);
    expect(() => openAsk(ctx.db, { force: false, actor: 'z-stu' })).toThrow('quiet hours');
    expect(openAsk(ctx.db, { force: true, actor: 'z-stu' }).state).toBe('open');
  });

  test('a hold blocks opening until released', () => {
    const ctx = setupTest();
    addAsk(ctx.db, call());
    ctx.seed.meta({ key: 'hold', value: JSON.stringify({ reason: 'mid-intake', since: NOON_SYDNEY, by: 'z-stu' }) });
    expect(() => openAsk(ctx.db, { force: false, actor: 'z-stu' })).toThrow('held: mid-intake');
    expect(waitReasons(ctx.db)).toStrictEqual(['held: mid-intake']);
  });
});

describe('answer, apply, later, skip, close', () => {
  test('answer keeps the exact words and tells the filer, with no grant', () => {
    const ctx = setupTest();
    addAsk(ctx.db, call());
    openAsk(ctx.db, { force: false, actor: 'z-stu' });
    const answered = answerAsk(ctx.db, { id: 'geo-1-paint', kind: 'call', answer: '  green — the  dark one ', actor: 'z-stu' });
    expect(answered.answer).toBe('  green — the  dark one ');
    const note = readOutboxRows(ctx.db).at(-1);
    expect(note?.target).toBe('z-triage');
    expect(note?.text).toContain('carries no grant');
    expect(readOutboxRows(ctx.db).some((row) => row.target === 'z-delivery')).toBe(false);
  });

  test('the filer hears that the owner answered, with the exact notice text', () => {
    const ctx = setupTest();
    addAsk(ctx.db, call());
    openAsk(ctx.db, { force: false, actor: 'z-stu' });
    answerAsk(ctx.db, { id: 'geo-1-paint', kind: 'call', answer: 'green', actor: 'z-stu' });

    expect(readOutboxRows(ctx.db).at(-1)?.text).toBe('FYI call geo-1-paint answered by the owner: "green". This note carries no grant: z-stu applies the answer.');
  });

  test('apply needs an answer first and a known target', () => {
    const ctx = setupTest();
    addAsk(ctx.db, call());
    openAsk(ctx.db, { force: false, actor: 'z-stu' });
    expect(() => applyAsk(ctx.db, 'geo-1-paint', 'call', 'none', null, 'z-stu')).toThrow('needs answered');
    answerAsk(ctx.db, { id: 'geo-1-paint', kind: 'call', answer: 'green', actor: 'z-stu' });
    expect(() => applyAsk(ctx.db, 'geo-1-paint', 'call', 'slack', null, 'z-stu')).toThrow('--to must be');
    expect(applyAsk(ctx.db, 'geo-1-paint', 'call', 'linear:GEO-1', 'commented', 'z-stu').applied_to).toBe('linear:GEO-1');
  });

  test('later defaults to the next 07:00 Sydney and reopens when due', () => {
    const ctx = setupTest();
    addAsk(ctx.db, call());
    openAsk(ctx.db, { force: false, actor: 'z-stu' });
    const later = laterAsk(ctx.db, 'geo-1-paint', 'call', null, 'z-stu');
    expect(later.due_at).toBe('2026-10-14T20:00:00Z');
    expect(nextEligible(ctx.db)).toBeNull();
    at('2026-10-14T20:00:00Z');
    expect(nextEligible(ctx.db)?.id).toBe('geo-1-paint');
  });

  test('later accepts +4h', () => {
    const ctx = setupTest();
    addAsk(ctx.db, call());
    expect(laterAsk(ctx.db, 'geo-1-paint', 'call', '+4h', 'z-stu').due_at).toBe('2026-10-14T05:00:00Z');
  });

  test('close tells the filer and the owner, but not the closer', () => {
    const ctx = setupTest();
    addAsk(ctx.db, call());
    openAsk(ctx.db, { force: false, actor: 'z-stu' });
    closeAsk(ctx.db, 'geo-1-paint', 'call', 'issue lost Needs Geoff', 'z-refine');
    const last = readOutboxRows(ctx.db).at(-1);
    expect(last?.target).toBe('z-stu');
    expect(last?.text).toContain('it was open with the owner, so tell them it is settled');
    expect(() => closeAsk(ctx.db, 'geo-1-paint', 'call', 'again', 'z-refine')).toThrow('is closed');
  });

  test('every transition is in the event log', () => {
    const ctx = setupTest();
    addAsk(ctx.db, call());
    openAsk(ctx.db, { force: false, actor: 'z-stu' });
    answerAsk(ctx.db, { id: 'geo-1-paint', kind: 'call', answer: 'green', actor: 'z-stu' });
    applyAsk(ctx.db, 'geo-1-paint', 'call', 'none', null, 'z-stu');
    const actions = readSubjectEvents(ctx.db, 'ask', 'geo-1-paint').map((event) => event.action);
    expect(actions).toEqual(['added', 'opened', 'answered', 'applied']);
  });
});

describe('queue reminder after quiet hours', () => {
  const FIVE_AM = '2026-10-14T18:00:00Z';
  const SEVEN_OH_FIVE = '2026-10-14T20:05:00Z';

  test('a proposal filed in quiet hours reaches z-stu once after 07:00', () => {
    const ctx = setupTest();
    at(FIVE_AM);
    addAsk(ctx.db, call({ kind: 'proposal', id: 'tidy-docs', actor: 'z-steward' }));
    expect(queueReminder(ctx.db, 'hq-lanes').reminded).toBeNull();
    at(SEVEN_OH_FIVE);
    expect(queueReminder(ctx.db, 'hq-lanes').reminded).toBe('tidy-docs');
    expect(readOutboxRows(ctx.db).at(-1)?.target).toBe('z-stu');
    expect(readOutboxRows(ctx.db).at(-1)?.text).toContain('Open it with: hq open');
    at('2026-10-14T20:10:00Z');
    expect(queueReminder(ctx.db, 'hq-lanes').reminded).toBeNull();
  });

  test('no reminder for an item z-stu heard about while it could open', () => {
    const ctx = setupTest();
    addAsk(ctx.db, call());
    expect(queueReminder(ctx.db, 'hq-lanes').why).toContain('already told');
  });

  test('a later item that falls due at 07:00 is announced', () => {
    const ctx = setupTest();
    addAsk(ctx.db, call({ actor: 'z-stu' }));
    laterAsk(ctx.db, 'geo-1-paint', 'call', null, 'z-stu');
    at(SEVEN_OH_FIVE);
    expect(queueReminder(ctx.db, 'hq-lanes').reminded).toBe('geo-1-paint');
  });

  test('nothing while an item is open or the queue is held', () => {
    const ctx = setupTest();
    at(FIVE_AM);
    addAsk(ctx.db, call({ id: 'a', actor: 'z-refine' }));
    addAsk(ctx.db, call({ id: 'b', actor: 'z-refine' }));
    at(SEVEN_OH_FIVE);
    openAsk(ctx.db, { id: 'a', force: false, actor: 'z-stu' });
    expect(queueReminder(ctx.db, 'hq-lanes').why).toContain('open: a');
  });

  test('lastQuietEnd across the October DST change', () => {
    expect(iso(lastQuietEnd(new Date('2026-10-05T13:05:00Z')))).toBe('2026-10-04T20:00:00Z');
    // 4 Oct 07:00 is already AEDT (DST began at 02:00): 3 Oct 20:00Z.
    expect(iso(lastQuietEnd(new Date('2026-10-04T12:00:00Z')))).toBe('2026-10-03T20:00:00Z');
  });

  test('a hold released within the same second as the add still announces', () => {
    const ctx = setupTest();
    ctx.seed.meta({ key: 'hold', value: '{"reason":"x","since":"","by":"z-stu"}' });
    at('2026-10-14T01:00:00.100Z');
    addAsk(ctx.db, call({ actor: 'z-refine' }));
    setMeta(ctx.db, 'hold', null);
    ctx.seed.meta({ key: 'hold_released_at', value: '2026-10-14T01:00:00.900Z' });
    at('2026-10-14T01:05:00Z');
    expect(queueReminder(ctx.db, 'hq-lanes').reminded).toBe('geo-1-paint');
  });

  test('lastQuietEnd is the latest 07:00 Sydney', () => {
    expect(iso(lastQuietEnd(new Date(SEVEN_OH_FIVE)))).toBe('2026-10-14T20:00:00Z');
    expect(iso(lastQuietEnd(new Date(FIVE_AM)))).toBe('2026-10-13T20:00:00Z');
  });
});

test('an open shared call takes a new issue even when the question text changed', () => {
  const ctx = setupTest();
  addAsk(ctx.db, call());
  openAsk(ctx.db, { force: false, actor: 'z-stu' });
  const added =addAsk(ctx.db, call({ question: 'Green or grey, for both sheds?', issues: ['GEO-1', 'GEO-2'] }));
  expect(added.result).toBe('noop');
  expect(added.ask).toMatchObject({ state: 'open', question: 'Green or grey?', issues: ['GEO-1', 'GEO-2'] });
});

function setupTest() {
  const fresh = createTestDb();
  at(NOON_SYDNEY);
  return { db: fresh.db, seed: buildSeeder(fresh) };
}
