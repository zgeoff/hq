import { Database } from 'bun:sqlite';
import { expect, onTestFinished, spyOn, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NOON_SYDNEY, at, freshDb } from '../test/helpers.ts';
import { getAsk } from './asks/get-ask.ts';
import { main } from './cli.ts';
import { overrideEnv } from './config/override-env.ts';
import { migrate } from './db/migrate.ts';
import { MIGRATIONS } from './db/migrations.ts';
import { loadConsoleItems } from './load-console-items.ts';
import { roleName } from './roles/role-name.ts';
import { getUnblock } from './unblock/get-unblock.ts';

const KETTLE_CALL = {
    title: 'Mint the kettle tokens',
    question: 'Mint the `kettle` tokens tonight?',
    options: [
      { label: 'Yes, mint them', effect: 'The kettle starts at 07:00.', recommended: true },
      { label: 'Not yet', effect: 'The kettle waits a day.' },
    ],
    stuView: 'Minting now keeps the morning boil on time.',
    details: [{ heading: 'Evidence', text: 'The last boil took 9 min.', code: 'kettle boil --dry-run' }],
  },
  KETTLE_PROPOSAL = { ...KETTLE_CALL, title: 'Boil earlier', question: 'Boil at 06:00 from now on?', diff: { now: 'The kettle boils at `07:00`.', would: 'The kettle boils at `06:00`.' } },
  LID_TODO = { title: 'Fit the lid', question: 'Fit the new lid on the kettle', time: 'about 2 min', unblocks: [{ id: 'GEO-7', title: 'Steam test' }] };

function setupTest() {
  const fresh = freshDb(),
    lines: string[] = [],
    spy = spyOn(console, 'log').mockImplementation((line: string) => {
      lines.push(line);
    });
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  onTestFinished(() => spy.mockRestore());
  onTestFinished(overrideEnv('HQ_NOTIFY', 'off'));
  onTestFinished(overrideEnv('HQ_AS', roleName('owner')));
  return {
    db: fresh.db,
    path: fresh.path,
    lines,
    writeItem: (name: string, item: unknown): string => {
      const file = join(fresh.dir, name);
      writeFileSync(file, JSON.stringify(item));
      return file;
    },
  };
}

test('hq call add --item stores every field and shows them in the console, verbatim', async () => {
  const app = setupTest(),
    code = await main(['call', 'add', 'kettle-mint', '--item', app.writeItem('call.json', KETTLE_CALL), '--issues', 'GEO-12', '--json']);

  expect(code).toBe(0);
  expect(getAsk(app.db, 'kettle-mint')).toMatchObject({ title: KETTLE_CALL.title, question: KETTLE_CALL.question, stu_view: KETTLE_CALL.stuView, issues: ['GEO-12'], state: 'queued' });
  expect(getAsk(app.db, 'kettle-mint')?.body).toContain('kettle boil --dry-run');
  expect(loadConsoleItems(app.db)).toStrictEqual([
    {
      id: 'kettle-mint',
      kind: 'call',
      title: KETTLE_CALL.title,
      question: KETTLE_CALL.question,
      deadline: null,
      time: null,
      options: KETTLE_CALL.options,
      stuView: KETTLE_CALL.stuView,
      details: KETTLE_CALL.details,
      diff: null,
      unblocks: [],
      links: [],
    },
  ]);
});

test('hq proposal add --item stores the diff and shows it in the console, verbatim', async () => {
  const app = setupTest(),
    code = await main(['proposal', 'add', 'boil-early', '--item', app.writeItem('proposal.json', KETTLE_PROPOSAL), '--json']);

  expect(code).toBe(0);
  expect(loadConsoleItems(app.db)).toMatchObject([{ id: 'boil-early', kind: 'proposal', diff: KETTLE_PROPOSAL.diff, options: KETTLE_PROPOSAL.options }]);
});

test('hq call add --item - reads the item from stdin', async () => {
  const app = setupTest(),
    child = Bun.spawn(['bun', join(import.meta.dir, 'cli.ts'), 'call', 'add', 'kettle-pipe', '--item', '-', '--json'], {
      stdin: new Blob([JSON.stringify(KETTLE_CALL)]),
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, HQ_DB: app.path, HQ_NOTIFY: 'off', HQ_AS: roleName('owner'), HQ_NOW: NOON_SYDNEY },
    }),
    code = await child.exited;

  expect(code).toBe(0);
  expect(getAsk(app.db, 'kettle-pipe')).toMatchObject({ title: KETTLE_CALL.title, stu_view: KETTLE_CALL.stuView });
});

test('a call filed as free text shows its body as one details section and no options', async () => {
  const app = setupTest(),
    code = await main(['call', 'add', 'kettle-old', '--title', 'Old kettle', '--question', 'Keep the old kettle?', '--body', 'It leaks a little.\nIt still boils.', '--json']);

  expect(code).toBe(0);
  expect(loadConsoleItems(app.db)).toMatchObject([{ id: 'kettle-old', options: [], stuView: null, details: [{ heading: 'Details', text: 'It leaks a little.\nIt still boils.' }] }]);
});

test('hq call add --item refuses the free-text flags beside it, and a bad item', async () => {
  const app = setupTest(),
    bad = app.writeItem('bad.json', { ...KETTLE_CALL, options: [] }),
    good = app.writeItem('call.json', KETTLE_CALL),
    refusedFlags = await main(['call', 'add', 'k1', '--item', good, '--title', 'Twice', '--json']),
    refusedItem = await main(['call', 'add', 'k2', '--item', bad, '--json']);

  expect([refusedFlags, refusedItem]).not.toContain(0);
  expect(app.lines.map((l) => JSON.parse(l).error.code)).toStrictEqual(['bad_args', 'bad_args']);
  expect(getAsk(app.db, 'k1')).toBeNull();
  expect(getAsk(app.db, 'k2')).toBeNull();
});

test('a re-add of a queued call with the same question updates its fields in place', async () => {
  const app = setupTest(),
    changed = app.writeItem('changed.json', { ...KETTLE_CALL, stuView: 'Boil it later instead.' }),
    first = app.writeItem('call.json', KETTLE_CALL);
  await main(['call', 'add', 'kettle-mint', '--item', first, '--json']);
  await main(['call', 'add', 'kettle-mint', '--item', changed, '--json']);

  expect(JSON.parse(app.lines[1] ?? '').result).toBe('updated');
  expect(getAsk(app.db, 'kettle-mint')?.stu_view).toBe('Boil it later instead.');
});

test('a re-add leaves the fields of a call that is open with the owner, or already answered, as they were', async () => {
  const app = setupTest(),
    first = app.writeItem('call.json', KETTLE_CALL),
    newQuestion = app.writeItem('new.json', { ...KETTLE_CALL, question: 'Mint half the tokens?', stuView: 'Half is enough.' }),
    sameQuestion = app.writeItem('same.json', { ...KETTLE_CALL, stuView: 'Changed my mind.', details: [] });
  await main(['call', 'add', 'kettle-mint', '--item', first, '--json']);
  await main(['call', 'open', 'kettle-mint', '--json']);
  await main(['call', 'add', 'kettle-mint', '--item', newQuestion, '--json']);

  expect(getAsk(app.db, 'kettle-mint')).toMatchObject({ question: KETTLE_CALL.question, stu_view: KETTLE_CALL.stuView, item: { details: KETTLE_CALL.details } });

  await main(['call', 'answer', 'kettle-mint', '--answer', 'Yes, mint them', '--json']);
  await main(['call', 'add', 'kettle-mint', '--item', sameQuestion, '--json']);

  expect(getAsk(app.db, 'kettle-mint')).toMatchObject({ state: 'answered', stu_view: KETTLE_CALL.stuView, item: { details: KETTLE_CALL.details } });
});

test('hq call stu sets Stu view on an item filed as free text', async () => {
  const app = setupTest();
  await main(['call', 'add', 'kettle-old', '--title', 'Old kettle', '--question', 'Keep it?', '--body', 'It leaks.', '--json']);

  await expect(main(['call', 'stu', 'kettle-old', '--view', 'Keep it a week; the new one is late.', '--json'])).resolves.toBe(0);
  expect(loadConsoleItems(app.db)[0]?.stuView).toBe('Keep it a week; the new one is late.');
});

test('hq unblock add --item makes a to-do with Done, Later and Skip', async () => {
  const app = setupTest(),
    code = await main(['unblock', 'add', '--id', 'lid', '--item', app.writeItem('todo.json', LID_TODO), '--unblocks', 'GEO-7:high', '--json']);

  expect(code).toBe(0);
  expect(getUnblock(app.db, 'lid')).toMatchObject({ title: 'Fit the lid', task: 'Fit the new lid on the kettle', state: 'open' });
  expect(loadConsoleItems(app.db)).toMatchObject([
    { id: 'lid', kind: 'todo', title: 'Fit the lid', question: 'Fit the new lid on the kettle', time: 'about 2 min', options: [{ label: 'Done' }, { label: 'Later' }, { label: 'Skip' }], unblocks: [{ id: 'GEO-7', title: 'Steam test' }] },
  ]);
});

test('hq unblock add --item keeps --kind watch and --deadline, so the watch stays off the console', async () => {
  const app = setupTest();

  const code = await main(['unblock', 'add', '--id', 'lid-watch', '--item', app.writeItem('watch.json', LID_TODO), '--kind', 'watch', '--deadline', '2026-10-20T00:00:00Z', '--json']);

  expect(code).toBe(0);
  expect(getUnblock(app.db, 'lid-watch')).toMatchObject({ kind: 'watch', deadline: '2026-10-20T00:00:00Z' });
  expect(loadConsoleItems(app.db)).toStrictEqual([]);
});

test('an unchanged hq unblock add --item is a no-op that keeps its subject link', async () => {
  const app = setupTest(),
    body = { title: 'Review kettle#4', question: 'Review kettle#4 and say lgtm', links: [{ label: 'kettle#4', url: 'https://github.com/kettle-co/kettle/pull/4', subject: true }] },
    doc = app.writeItem('review.json', body),
    first = await main(['unblock', 'add', '--id', 'review-4', '--item', doc, '--json']),
    second = await main(['unblock', 'add', '--id', 'review-4', '--item', doc, '--json']);

  expect([first, second]).toStrictEqual([0, 0]);
  expect(app.lines.map((l) => JSON.parse(l).result)).toStrictEqual(['added', 'noop']);
  expect(JSON.parse(getUnblock(app.db, 'review-4')?.item ?? '{}').links).toStrictEqual(body.links);
});

test('an unblock item filed as a task shows its minutes and the issues it unblocks', async () => {
  const app = setupTest();
  await main(['unblock', 'add', '--id', 'steam', '--task', 'Run the steam test on the new kettle base', '--minutes', '5', '--unblocks', 'GEO-9:urgent', '--json']);

  expect(loadConsoleItems(app.db)).toMatchObject([{ id: 'steam', title: 'Run the steam test on the new kettle base', time: 'about 5 min', unblocks: [{ id: 'GEO-9', title: 'urgent priority' }] }]);
});

test('it keeps each --done-when of hq unblock add --item, and the console lists them as a detail', async () => {
  const app = setupTest();
  const item = app.writeItem('todo.json', LID_TODO);
  const code = await main(['unblock', 'add', '--id', 'lid', '--item', item, '--done-when', 'issue:KET-7', '--done-when', 'pr:kettle-co/kettle#4', '--json']);

  expect(code).toBe(0);
  expect(getUnblock(app.db, 'lid')?.done_when).toStrictEqual([
    { kind: 'issue', ref: 'KET-7' },
    { kind: 'pr', ref: 'kettle-co/kettle#4' },
  ]);
  expect(loadConsoleItems(app.db)[0]?.details).toStrictEqual([{ heading: 'Done when', text: 'issue:KET-7\npr:kettle-co/kettle#4' }]);
});

test('hq unblock later hides the item from the console until it is due', async () => {
  const app = setupTest();
  await main(['unblock', 'add', '--id', 'lid', '--item', app.writeItem('todo.json', LID_TODO), '--json']);

  await expect(main(['unblock', 'later', 'lid', '--until', '+4h', '--json'])).resolves.toBe(0);
  expect(loadConsoleItems(app.db)).toStrictEqual([]);
  expect(getUnblock(app.db, 'lid')?.state).toBe('open');
  at('2026-10-14T05:01:00Z');
  expect(loadConsoleItems(app.db).map((i) => i.id)).toStrictEqual(['lid']);
});

test('an unblock item dropped while put off comes back to the console when it is added again', async () => {
  const app = setupTest(),
    todo = app.writeItem('todo.json', LID_TODO);
  await main(['unblock', 'add', '--id', 'lid', '--item', todo, '--json']);
  await main(['unblock', 'later', 'lid', '--until', '+4h', '--json']);
  await main(['unblock', 'drop', 'lid', '--json']);
  await main(['unblock', 'add', '--id', 'lid', '--item', todo, '--json']);

  expect(getUnblock(app.db, 'lid')).toMatchObject({ state: 'open', due_at: null });
  expect(loadConsoleItems(app.db).map((i) => i.id)).toStrictEqual(['lid']);
});

test('the console lists calls in send order, then to-dos, and leaves out a call put off until later', async () => {
  const app = setupTest();
  await main(['call', 'add', 'second', '--item', app.writeItem('a.json', KETTLE_CALL), '--order', '2', '--json']);
  await main(['call', 'add', 'first', '--item', app.writeItem('b.json', KETTLE_CALL), '--order', '1', '--json']);
  await main(['call', 'add', 'shelved', '--item', app.writeItem('c.json', KETTLE_CALL), '--json']);
  await main(['call', 'later', 'shelved', '--until', '+4h', '--json']);
  await main(['unblock', 'add', '--id', 'lid', '--item', app.writeItem('todo.json', LID_TODO), '--json']);

  expect(loadConsoleItems(app.db).map((i) => i.id)).toStrictEqual(['first', 'second', 'lid']);
});

test('migration v26 adds the item columns after a backup, keeping the rows it had', () => {
  const base = mkdtempSync(join(tmpdir(), 'hq-item-migration-')),
    path = join(base, 'old.db'),
    stored = new Database(path, { create: true, strict: true });
  onTestFinished(() => {
    stored.close();
    rmSync(base, { recursive: true, force: true });
  });
  migrate(stored, path, false, MIGRATIONS.slice(0, 25));
  stored.query("INSERT INTO unblocks (id, task, added_by, state, added_seq, added_at, updated_at) VALUES ('lid', 'Fit the lid', 'kettle-bot', 'open', 1, 'a', 'a')").run();

  expect(migrate(stored, path, true, MIGRATIONS.slice(0, 26))).toContain('.bak-v25-');

  expect(stored.query('SELECT task, title, item, due_at FROM unblocks').get()).toStrictEqual({ task: 'Fit the lid', title: null, item: null, due_at: null });
  expect(stored.query("SELECT name FROM pragma_table_info('asks') WHERE name IN ('item', 'stu_view') ORDER BY name").all()).toStrictEqual([{ name: 'item' }, { name: 'stu_view' }]);
});
