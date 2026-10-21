import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
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
import { FOUR_AM_SYDNEY, NOON_SYDNEY, at, freshDb } from './helpers.ts';

let db: Database;
let cleanup: () => void;

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

const outbox = () => db.query('SELECT target, text FROM outbox ORDER BY id').all() as { target: string; text: string }[];

beforeEach(() => {
  ({ db, cleanup } = freshDb());
  at(NOON_SYDNEY);
});
afterEach(() => cleanup());

describe('add', () => {
  test('files a queued call and tells the owner', () => {
    const r = addAsk(db, call());
    expect(r.result).toBe('added');
    expect(r.ask.state).toBe('queued');
    expect(outbox()).toEqual([{ target: 'z-stu', text: expect.stringContaining('call ready: geo-1-paint') }]);
  });

  test('the owner filing its own item sends nothing', () => {
    addAsk(db, call({ actor: 'z-stu' }));
    expect(outbox()).toEqual([]);
  });

  test('same id and question again is a no-op, even once answered', () => {
    addAsk(db, call());
    expect(addAsk(db, call()).result).toBe('noop');
    openAsk(db, { force: false, actor: 'z-stu' });
    answerAsk(db, { id: 'geo-1-paint', kind: 'call', answer: 'green, obviously', actor: 'z-stu' });
    const again = addAsk(db, call({ body: 'reworded body, same question' }));
    expect(again.result).toBe('noop');
    expect(again.ask.state).toBe('answered');
    expect(outbox().filter((m) => m.target === 'z-stu')).toHaveLength(1);
  });

  test('an issue joining a shared call keeps the id and sends nothing', () => {
    addAsk(db, call());
    const r = addAsk(db, call({ issues: ['GEO-1', 'GEO-2'] }));
    expect(r.result).toBe('updated');
    expect(r.ask.issues).toEqual(['GEO-1', 'GEO-2']);
    expect(outbox()).toHaveLength(1);
  });

  test('a new question on a settled id starts a new round', () => {
    addAsk(db, call());
    openAsk(db, { force: false, actor: 'z-stu' });
    answerAsk(db, { id: 'geo-1-paint', kind: 'call', answer: 'green', actor: 'z-stu' });
    applyAsk(db, 'geo-1-paint', 'call', 'typed:z-delivery', null, 'z-stu');
    const r = addAsk(db, call({ question: 'Gloss or matte?' }));
    expect(r.result).toBe('reasked');
    expect(r.ask).toMatchObject({ state: 'queued', round: 2, answer: null });
  });

  test('answered then closed: the same question never goes back', () => {
    addAsk(db, call());
    openAsk(db, { force: false, actor: 'z-stu' });
    answerAsk(db, { id: 'geo-1-paint', kind: 'call', answer: 'green', actor: 'z-stu' });
    closeAsk(db, 'geo-1-paint', 'call', 'settled elsewhere', 'z-refine');
    const r = addAsk(db, call());
    expect(r.result).toBe('noop');
    expect(r.ask).toMatchObject({ state: 'closed', answer: 'green' });
    expect(nextEligible(db)).toBeNull();
  });

  test('answered then skipped: a re-add is a new round, the old answer kept in the log', () => {
    addAsk(db, call());
    openAsk(db, { force: false, actor: 'z-stu' });
    answerAsk(db, { id: 'geo-1-paint', kind: 'call', answer: 'green', actor: 'z-stu' });
    skipAsk(db, 'geo-1-paint', 'call', 'issue changed', 'z-stu');
    const r = addAsk(db, call());
    expect(r.result).toBe('requeued');
    expect(r.ask).toMatchObject({ state: 'queued', round: 2, answer: null });
    const ev = db.query(`SELECT data FROM events WHERE action='requeued'`).get() as { data: string };
    expect(JSON.parse(ev.data).previous_answer).toBe('green');
  });

  test('a skipped call returns to the queue when re-added', () => {
    addAsk(db, call());
    skipAsk(db, 'geo-1-paint', 'call', 'issue changed', 'z-stu');
    expect(nextEligible(db)).toBeNull();
    expect(addAsk(db, call()).result).toBe('requeued');
    expect(nextEligible(db)?.id).toBe('geo-1-paint');
  });

  test('an open item keeps the question the owner saw', () => {
    addAsk(db, call());
    openAsk(db, { force: false, actor: 'z-stu' });
    const r = addAsk(db, call({ question: 'Something else?' }));
    expect(r.result).toBe('noop');
    expect(getAsk(db, 'geo-1-paint')?.question).toBe('Green or grey?');
  });

  test('refuses an id that is not a slug, and a kind clash', () => {
    expect(() => addAsk(db, call({ id: 'has space' }))).toThrow('slug');
    addAsk(db, call());
    expect(() => addAsk(db, call({ kind: 'proposal' }))).toThrow('is a call');
  });
});

describe('one open at a time', () => {
  test('across calls and proposals', () => {
    addAsk(db, call());
    addAsk(db, call({ kind: 'proposal', id: 'tidy-docs', actor: 'z-steward' }));
    openAsk(db, { force: false, actor: 'z-stu' });
    expect(() => openAsk(db, { force: true, actor: 'z-stu' })).toThrow('is open with the owner');
    expect(waitReasons(db)).toContain('open: geo-1-paint');
  });

  test('the schema itself refuses a second open row', () => {
    addAsk(db, call());
    addAsk(db, call({ id: 'geo-2-fence' }));
    db.query(`UPDATE asks SET state='open' WHERE id='geo-1-paint'`).run();
    expect(() => db.query(`UPDATE asks SET state='open' WHERE id='geo-2-fence'`).run()).toThrow('UNIQUE');
  });

  test('opens by send order, and a re-add moves an item', () => {
    addAsk(db, call({ id: 'old-low', order: 2 }));
    at('2026-10-14T01:05:00Z');
    addAsk(db, call({ id: 'new-urgent', order: 1 }));
    addAsk(db, call({ id: 'no-order' }));
    expect(nextEligible(db)?.id).toBe('new-urgent');
    expect(addAsk(db, call({ id: 'old-low', order: 0 })).result).toBe('updated');
    expect(nextEligible(db)?.id).toBe('old-low');
    expect(addAsk(db, call({ id: 'old-low' })).ask.send_order).toBe(0); // no --order keeps it
  });

  test('opens the oldest first', () => {
    addAsk(db, call());
    at('2026-10-14T01:05:00Z');
    addAsk(db, call({ id: 'geo-2-fence' }));
    expect(openAsk(db, { force: false, actor: 'z-stu' }).id).toBe('geo-1-paint');
  });
});

describe('quiet hours and hold', () => {
  test('refuses from 03:00 to 07:00 Sydney unless forced', () => {
    addAsk(db, call());
    at(FOUR_AM_SYDNEY);
    expect(() => openAsk(db, { force: false, actor: 'z-stu' })).toThrow('quiet hours');
    expect(openAsk(db, { force: true, actor: 'z-stu' }).state).toBe('open');
  });

  test('a hold blocks opening until released', () => {
    addAsk(db, call());
    db.query(`INSERT INTO meta (key, value) VALUES ('hold', ?)`).run(JSON.stringify({ reason: 'mid-intake', since: NOON_SYDNEY, by: 'z-stu' }));
    expect(() => openAsk(db, { force: false, actor: 'z-stu' })).toThrow('held: mid-intake');
    expect(waitReasons(db)).toEqual(['held: mid-intake']);
  });
});

describe('answer, apply, later, skip, close', () => {
  test('answer keeps the exact words and tells the filer, with no grant', () => {
    addAsk(db, call());
    openAsk(db, { force: false, actor: 'z-stu' });
    const answered = answerAsk(db, { id: 'geo-1-paint', kind: 'call', answer: '  green — the  dark one ', actor: 'z-stu' });
    expect(answered.answer).toBe('  green — the  dark one ');
    const note = outbox().at(-1)!;
    expect(note.target).toBe('z-triage'); // z-refine is retired: the table forwards it
    expect(note.text).toContain('carries no grant');
    expect(outbox().some((m) => m.target === 'z-delivery')).toBe(false);
  });

  test('the filer hears that the owner answered, with the exact notice text', () => {
    addAsk(db, call());
    openAsk(db, { force: false, actor: 'z-stu' });
    answerAsk(db, { id: 'geo-1-paint', kind: 'call', answer: 'green', actor: 'z-stu' });

    expect(outbox().at(-1)?.text).toBe('FYI call geo-1-paint answered by the owner: "green". This note carries no grant: z-stu applies the answer.');
  });

  test('apply needs an answer first and a known target', () => {
    addAsk(db, call());
    openAsk(db, { force: false, actor: 'z-stu' });
    expect(() => applyAsk(db, 'geo-1-paint', 'call', 'none', null, 'z-stu')).toThrow('needs answered');
    answerAsk(db, { id: 'geo-1-paint', kind: 'call', answer: 'green', actor: 'z-stu' });
    expect(() => applyAsk(db, 'geo-1-paint', 'call', 'slack', null, 'z-stu')).toThrow('--to must be');
    expect(applyAsk(db, 'geo-1-paint', 'call', 'linear:GEO-1', 'commented', 'z-stu').applied_to).toBe('linear:GEO-1');
  });

  test('later defaults to the next 07:00 Sydney and reopens when due', () => {
    addAsk(db, call());
    openAsk(db, { force: false, actor: 'z-stu' });
    const a = laterAsk(db, 'geo-1-paint', 'call', null, 'z-stu');
    expect(a.due_at).toBe('2026-10-14T20:00:00Z'); // 07:00 on 15 Oct, AEDT
    expect(nextEligible(db)).toBeNull();
    at('2026-10-14T20:00:00Z');
    expect(nextEligible(db)?.id).toBe('geo-1-paint');
  });

  test('later accepts +4h', () => {
    addAsk(db, call());
    expect(laterAsk(db, 'geo-1-paint', 'call', '+4h', 'z-stu').due_at).toBe('2026-10-14T05:00:00Z');
  });

  test('close tells the filer and the owner, but not the closer', () => {
    addAsk(db, call());
    openAsk(db, { force: false, actor: 'z-stu' });
    closeAsk(db, 'geo-1-paint', 'call', 'issue lost Needs Geoff', 'z-refine');
    const last = outbox().at(-1)!;
    expect(last.target).toBe('z-stu');
    expect(last.text).toContain('it was open with the owner, so tell them it is settled');
    expect(() => closeAsk(db, 'geo-1-paint', 'call', 'again', 'z-refine')).toThrow('is closed');
  });

  test('every transition is in the event log', () => {
    addAsk(db, call());
    openAsk(db, { force: false, actor: 'z-stu' });
    answerAsk(db, { id: 'geo-1-paint', kind: 'call', answer: 'green', actor: 'z-stu' });
    applyAsk(db, 'geo-1-paint', 'call', 'none', null, 'z-stu');
    const actions = (db.query(`SELECT action FROM events WHERE subject_id='geo-1-paint' ORDER BY seq`).all() as { action: string }[]).map((e) => e.action);
    expect(actions).toEqual(['added', 'opened', 'answered', 'applied']);
  });
});

describe('queue reminder after quiet hours', () => {
  const FIVE_AM = '2026-10-14T18:00:00Z'; // 05:00 on 15 Oct, Sydney
  const SEVEN_OH_FIVE = '2026-10-14T20:05:00Z'; // 07:05

  test('a proposal filed in quiet hours reaches z-stu once after 07:00', () => {
    at(FIVE_AM);
    addAsk(db, call({ kind: 'proposal', id: 'tidy-docs', actor: 'z-steward' }));
    expect(queueReminder(db, 'hq-lanes').reminded).toBeNull(); // still quiet
    at(SEVEN_OH_FIVE);
    expect(queueReminder(db, 'hq-lanes').reminded).toBe('tidy-docs');
    expect(outbox().at(-1)).toEqual({ target: 'z-stu', text: expect.stringContaining('Open it with: hq open') });
    at('2026-10-14T20:10:00Z');
    expect(queueReminder(db, 'hq-lanes').reminded).toBeNull();
  });

  test('no reminder for an item z-stu heard about while it could open', () => {
    addAsk(db, call());
    expect(queueReminder(db, 'hq-lanes').why).toContain('already told');
  });

  test('a later item that falls due at 07:00 is announced', () => {
    addAsk(db, call({ actor: 'z-stu' }));
    laterAsk(db, 'geo-1-paint', 'call', null, 'z-stu');
    at(SEVEN_OH_FIVE);
    expect(queueReminder(db, 'hq-lanes').reminded).toBe('geo-1-paint');
  });

  test('nothing while an item is open or the queue is held', () => {
    at(FIVE_AM);
    addAsk(db, call({ id: 'a', actor: 'z-refine' }));
    addAsk(db, call({ id: 'b', actor: 'z-refine' }));
    at(SEVEN_OH_FIVE);
    openAsk(db, { id: 'a', force: false, actor: 'z-stu' });
    expect(queueReminder(db, 'hq-lanes').why).toContain('open: a');
  });

  test('lastQuietEnd across the October DST change', () => {
    // 6 Oct 2026 00:05 AEDT = 5 Oct 13:05Z; the latest 07:00 is 5 Oct 07:00 AEDT = 4 Oct 20:00Z.
    expect(iso(lastQuietEnd(new Date('2026-10-05T13:05:00Z')))).toBe('2026-10-04T20:00:00Z');
    // 4 Oct 07:00 is already AEDT (DST began at 02:00): 3 Oct 20:00Z.
    expect(iso(lastQuietEnd(new Date('2026-10-04T12:00:00Z')))).toBe('2026-10-03T20:00:00Z');
  });

  test('a hold released within the same second as the add still announces', () => {
    db.query(`INSERT INTO meta (key, value) VALUES ('hold', '{"reason":"x","since":"","by":"z-stu"}')`).run();
    at('2026-10-14T01:00:00.100Z');
    addAsk(db, call({ actor: 'z-refine' }));
    db.query(`DELETE FROM meta WHERE key = 'hold'`).run();
    db.query(`INSERT INTO meta (key, value) VALUES ('hold_released_at', '2026-10-14T01:00:00.900Z')`).run();
    at('2026-10-14T01:05:00Z');
    expect(queueReminder(db, 'hq-lanes').reminded).toBe('geo-1-paint');
  });

  test('lastQuietEnd is the latest 07:00 Sydney', () => {
    expect(iso(lastQuietEnd(new Date(SEVEN_OH_FIVE)))).toBe('2026-10-14T20:00:00Z');
    expect(iso(lastQuietEnd(new Date(FIVE_AM)))).toBe('2026-10-13T20:00:00Z');
  });
});

test('an open shared call takes a new issue even when the question text changed', () => {
  addAsk(db, call());
  openAsk(db, { force: false, actor: 'z-stu' });
  const r = addAsk(db, call({ question: 'Green or grey, for both sheds?', issues: ['GEO-1', 'GEO-2'] }));
  expect(r.result).toBe('noop');
  expect(r.ask).toMatchObject({ state: 'open', question: 'Green or grey?', issues: ['GEO-1', 'GEO-2'] });
});
