import { expect, mock, onTestFinished, spyOn, test } from 'bun:test';
import { linearIssues } from '../../mocks/linear-handlers.ts';
import type { ReadyNodeSeed } from '../../test/build-ready-page.ts';
import { at, freshDb } from '../../test/helpers.ts';
import { makeStateCall } from '../../test/make-state-call.ts';
import { main } from '../cli.ts';
import { overrideEnv } from '../config/override-env.ts';
import { resetKey } from '../linear/reset-key.ts';
import type { RunResult, Runner } from '../runner/types.ts';
import { readFocus } from './read-focus.ts';
import { runFocusCommand } from './run-focus-command.ts';

// A database, and for the hq CLI: an invented Linear key from op, the actor, and console.log captured.
function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  const run = mock<Runner>(() => Promise.resolve<RunResult>({ code: 0, stdout: 'lin_api_INVENTEDkettleKEY0042\n', stderr: '' }));
  resetKey();
  onTestFinished(resetKey);
  onTestFinished(overrideEnv('OP_SERVICE_ACCOUNT_TOKEN', 'invented-token'));
  onTestFinished(overrideEnv('HQ_AS', 'kettle-owner'));
  const printed: string[] = [];
  const spy = spyOn(console, 'log').mockImplementation((line: string) => void printed.push(line));
  onTestFinished(() => spy.mockRestore());
  return { db: fresh.db, run, printed };
}

test('set stores the terms and reserves, and prints each term with its Ready and Backlog matches', async () => {
  const ctx = setupTest();

  // GEO-9804 sits in an hq project, which the lanes never take.
  const readySeeds: ReadyNodeSeed[] = [
    { identifier: 'GEO-9801', project: 'kettle roadmap', type: 'Bug', labels: ['nixie'] },
    { identifier: 'GEO-9802', project: 'kettle maintenance', projectLabels: ['maintenance'], type: 'Chore', labels: ['vers'] },
    { identifier: 'GEO-9803', project: 'kettle roadmap', projectLabels: ['roadmap'], type: 'Feature', labels: ['nixie'] },
    { identifier: 'GEO-9804', project: 'hq roadmap', type: 'Bug', labels: ['hq'] },
  ];
  const backlogSeeds: ReadyNodeSeed[] = [{ identifier: 'GEO-9805', project: 'kettle roadmap', type: 'Bug', labels: ['atc'] }];

  const out = await runFocusCommand({ db: ctx.db, call: makeStateCall(readySeeds, backlogSeeds), actor: 'kettle-owner', at: new Date('2026-10-15T20:00:00Z'), verb: 'set', rest: ['bug,maintenance'], reserves: ['nixie=1'] });

  expect(readFocus(ctx.db)).toStrictEqual({
    terms: [
      { text: 'bug', filters: [{ kind: 'type', value: 'bug' }] },
      { text: 'maintenance', filters: [{ kind: 'class', value: 'maintenance' }] },
    ],
    reserves: [{ area: 'nixie', slots: 1 }],
    setAt: '2026-10-15T20:00:00Z',
    setBy: 'kettle-owner',
  });
  expect(out.text).toBe(
    [
      'Focus set; the lanes use it from their next tick, and running work keeps its slots.',
      'Focus (set 2026-10-15T20:00:00Z by kettle-owner): bug, maintenance; reserve nixie=1',
      '  1. bug: 1 Ready, 1 Backlog',
      '  2. maintenance: 2 Ready, 1 Backlog',
      '  reserve: nixie keeps 1 slot(s), lent while it has nothing eligible',
      '  then any other eligible work',
    ].join('\n'),
  );
});

test('set logs an event and posts the change to hq news', async () => {
  const ctx = setupTest();

  await runFocusCommand({ db: ctx.db, call: makeStateCall([], []), actor: 'kettle-owner', at: new Date('2026-10-15T20:00:00Z'), verb: 'set', rest: ['roadmap:nixie:high+'], reserves: [] });

  expect(ctx.db.query("SELECT action, actor, data FROM events WHERE subject_id = 'focus'").all()).toStrictEqual([{ action: 'focus-set', actor: 'kettle-owner', data: JSON.stringify({ terms: ['roadmap:nixie:high+'], reserves: [] }) }]);
  expect(ctx.db.query('SELECT from_name, topic, text, tag FROM news').all()).toStrictEqual([{ from_name: 'kettle-owner', topic: 'other', text: 'Lanes focus set: roadmap:nixie:high+. It applies from the next lanes tick.', tag: 'focus' }]);
});

test('set refuses an unknown term and stores nothing', async () => {
  const ctx = setupTest();

  const refused = runFocusCommand({ db: ctx.db, call: makeStateCall([], []), actor: 'kettle-owner', at: new Date('2026-10-15T20:00:00Z'), verb: 'set', rest: ['bug,teapots'], reserves: [] });

  await expect(refused).rejects.toThrow('focus: unknown filter "teapots" in term "teapots"');
  expect(readFocus(ctx.db)).toBeNull();
  expect(ctx.db.query('SELECT count(*) AS total FROM news').get()).toStrictEqual({ total: 0 });
});

test('set refuses an unknown filter key and a bad reserve, and stores nothing', async () => {
  const ctx = setupTest();
  const call = makeStateCall([], []);

  await expect(runFocusCommand({ db: ctx.db, call, actor: 'kettle-owner', at: new Date('2026-10-15T20:00:00Z'), verb: 'set', rest: ['bug:owner=kettle'], reserves: [] })).rejects.toThrow('focus: unknown filter "owner=kettle" in term "bug:owner=kettle"');
  await expect(runFocusCommand({ db: ctx.db, call, actor: 'kettle-owner', at: new Date('2026-10-15T20:00:00Z'), verb: 'set', rest: ['bug'], reserves: ['teapots=1'] })).rejects.toThrow('focus: bad --reserve "teapots=1"');
  expect(readFocus(ctx.db)).toBeNull();
});

test('show prints the match counts of the focus set now', async () => {
  const ctx = setupTest();
  const readySeeds: ReadyNodeSeed[] = [
    { identifier: 'GEO-9801', project: 'kettle roadmap', type: 'Bug', labels: ['nixie'] },
    { identifier: 'GEO-9802', project: 'kettle maintenance', projectLabels: ['maintenance'], type: 'Chore', labels: ['vers'] },
    { identifier: 'GEO-9803', project: 'kettle roadmap', projectLabels: ['roadmap'], type: 'Feature', labels: ['nixie'] },
    { identifier: 'GEO-9804', project: 'hq roadmap', type: 'Bug', labels: ['hq'] },
  ];
  const backlogSeeds: ReadyNodeSeed[] = [{ identifier: 'GEO-9805', project: 'kettle roadmap', type: 'Bug', labels: ['atc'] }];
  await runFocusCommand({ db: ctx.db, call: makeStateCall([], []), actor: 'kettle-owner', at: new Date('2026-10-15T20:00:00Z'), verb: 'set', rest: ['project=kettle roadmap:bug'], reserves: [] });

  const out = await runFocusCommand({ db: ctx.db, call: makeStateCall(readySeeds, backlogSeeds), actor: 'kettle-owner', at: new Date('2026-10-15T20:00:00Z'), verb: undefined, rest: [], reserves: [] });

  expect(out.text).toBe(['Focus (set 2026-10-15T20:00:00Z by kettle-owner): project=kettle roadmap:bug', '  1. project=kettle roadmap:bug: 1 Ready, 1 Backlog', '  then any other eligible work'].join('\n'));
});

test('show says why the counts are missing when Linear fails', async () => {
  const ctx = setupTest();
  await runFocusCommand({ db: ctx.db, call: makeStateCall([], []), actor: 'kettle-owner', at: new Date('2026-10-15T20:00:00Z'), verb: 'set', rest: ['bug'], reserves: [] });

  const out = await runFocusCommand({ db: ctx.db, call: () => Promise.reject(new Error('Linear answered 502: invented outage')), actor: 'kettle-owner', at: new Date('2026-10-15T20:00:00Z'), verb: 'show', rest: [], reserves: [] });

  expect(out.text).toBe(['Focus (set 2026-10-15T20:00:00Z by kettle-owner): bug', '  1. bug', '  counts unavailable: Linear answered 502: invented outage', '  then any other eligible work'].join('\n'));
});

test('clear removes the focus, logs it and posts it to hq news', async () => {
  const ctx = setupTest();
  await runFocusCommand({ db: ctx.db, call: makeStateCall([], []), actor: 'kettle-owner', at: new Date('2026-10-15T20:00:00Z'), verb: 'set', rest: ['bug'], reserves: [] });

  const out = await runFocusCommand({ db: ctx.db, call: makeStateCall([], []), actor: 'kettle-owner', at: new Date('2026-10-15T20:00:00Z'), verb: 'clear', rest: [], reserves: [] });

  expect(out.text).toBe('Focus cleared: the lanes take all eligible work by priority from their next tick.');
  expect(readFocus(ctx.db)).toBeNull();
  expect(ctx.db.query("SELECT action FROM events WHERE subject_id = 'focus' ORDER BY seq").all()).toStrictEqual([{ action: 'focus-set' }, { action: 'focus-cleared' }]);
  expect(ctx.db.query('SELECT text FROM news ORDER BY id DESC LIMIT 1').get()).toStrictEqual({ text: 'Lanes focus cleared: the lanes take all eligible work by priority from the next lanes tick.' });
});

test('hq focus set, show and clear parse the terms and each --reserve, store the focus and print it', async () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');
  linearIssues.push(
    { identifier: 'GEO-9801', team: 'GEO', state: 'Ready', stateType: 'unstarted', previousIdentifiers: [], project: 'kettle roadmap', labels: ['nixie'], parent: null, type: 'Bug' },
    { identifier: 'GEO-9802', team: 'GEO', state: 'Backlog', stateType: 'backlog', previousIdentifiers: [], project: 'kettle roadmap', labels: ['vers'], parent: null, type: 'Bug' },
  );

  const setCode = await main(['focus', 'set', 'bug', '--reserve', 'nixie=1', '--reserve', 'vers=2'], ctx.run);
  const stored = readFocus(ctx.db);
  const setText = ctx.printed.splice(0).join('\n');
  const showCode = await main(['focus', 'show'], ctx.run);
  const showText = ctx.printed.splice(0).join('\n');
  const clearCode = await main(['focus', 'clear'], ctx.run);

  expect([setCode, showCode, clearCode]).toStrictEqual([0, 0, 0]);
  expect(stored).toStrictEqual({
    terms: [{ text: 'bug', filters: [{ kind: 'type', value: 'bug' }] }],
    reserves: [
      { area: 'nixie', slots: 1 },
      { area: 'vers', slots: 2 },
    ],
    setAt: '2026-10-15T20:00:00Z',
    setBy: 'kettle-owner',
  });
  const shown = [
    'Focus (set 2026-10-15T20:00:00Z by kettle-owner): bug; reserve nixie=1, vers=2',
    '  1. bug: 1 Ready, 1 Backlog',
    '  reserve: nixie keeps 1 slot(s), lent while it has nothing eligible',
    '  reserve: vers keeps 2 slot(s), lent while it has nothing eligible',
    '  then any other eligible work',
  ];
  expect(setText).toBe(['Focus set; the lanes use it from their next tick, and running work keeps its slots.', ...shown].join('\n'));
  expect(showText).toBe(shown.join('\n'));
  expect(ctx.printed.join('\n')).toBe('Focus cleared: the lanes take all eligible work by priority from their next tick.');
  expect(readFocus(ctx.db)).toBeNull();
});
