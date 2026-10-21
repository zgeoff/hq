import type { Database } from 'bun:sqlite';
import { expect, onTestFinished, spyOn, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import { main } from '../cli.ts';
import { addMark } from '../marks/add-mark.ts';
import { createGrantMark } from './create-grant-mark.ts';
import { formatGrantLine } from './format-grant-line.ts';
import { loadGrantTallies } from './load-grant-tallies.ts';
import { recordGrantAction } from './record-grant-action.ts';

function setupTest(): Database {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return fresh.db;
}

test('each named grant lists its actions in the window, one line each, and an unused grant says none', () => {
  const db = setupTest();
  at('2026-10-05T01:00:00Z');
  createGrantMark(db, { text: 'kettle PRs merge on green CI', ref: 'kettle#3', at: null, name: 'kettle-merges', actor: 'kettle-bot' });
  createGrantMark(db, { text: 'teapot deploys outside quiet hours', ref: null, at: null, name: 'teapot-deploys', actor: 'kettle-bot' });
  addMark(db, { kind: 'grant', text: 'a one-off yes, never named', ref: null, at: null, actor: 'kettle-bot' });
  recordGrantAction(db, { grant: 'kettle-merges', target: 'kettle#8', note: null, actor: 'teapot-bot' });
  at(NOON_SYDNEY);
  recordGrantAction(db, { grant: 'kettle-merges', target: 'kettle#9', note: null, actor: 'teapot-bot' });
  recordGrantAction(db, { grant: 'kettle-merges', target: 'kettle#10', note: 'after a re-run', actor: 'kettle-bot' });

  expect(loadGrantTallies(db, { from: '2026-10-07T01:00:00Z', to: '2026-10-14T02:00:00Z' }).map((t) => [t.grant, t.mark, t.actions.map((a) => a.target)])).toStrictEqual([
    ['kettle-merges', 1, ['kettle#9', 'kettle#10']],
    ['teapot-deploys', 2, []],
  ]);
  expect(loadGrantTallies(db, { from: '2026-10-07T01:00:00Z', to: '2026-10-14T02:00:00Z' }).map((t) => formatGrantLine(t))).toStrictEqual(['kettle-merges (mark 1, kettle#3): 2: kettle#9 (teapot-bot); kettle#10 (kettle-bot)', 'teapot-deploys (mark 2): none']);
});

test('hq mark add --grant, hq mark grant, hq grant act and hq grant actions work through the CLI', async () => {
  const db = setupTest(),
    log = spyOn(console, 'log').mockImplementation((line: string) => printed.push(line)),
    printed: string[] = [],
    runs = [
      await runAt(['mark', 'add', '--kind', 'grant', '--text', 'kettle PRs merge on green CI', '--grant', 'kettle-merges', '--json']),
      await runAt(['mark', 'add', '--kind', 'grant', '--text', 'teapot deploys', '--json']),
      await runAt(['mark', 'grant', '2', 'teapot-deploys', '--json']),
      await runAt(['grant', 'act', 'teapot-deploys', '--target', 'teapot#4', '--note', 'outside quiet hours', '--by', 'teapot-bot', '--json']),
      await runAt(['grant', 'actions', '--since', '1d', '--json'], '2026-10-14T01:01:00Z'),
      await runAt(['mark', 'add', '--kind', 'skills', '--text', 'kettle skill', '--grant', 'kettle-skill', '--json']),
    ];
  onTestFinished(() => log.mockRestore());
  expect([db.query('SELECT COUNT(*) AS n FROM grant_actions').get(), runs]).toStrictEqual([{ n: 1 }, [0, 0, 0, 0, 0, 1]]);
  expect((JSON.parse(printed.at(-2) ?? '{}') as { grants: { grant: string; actions: { target: string; actor: string }[] }[] }).grants.map((g) => [g.grant, g.actions.map((a) => [a.target, a.actor])])).toStrictEqual([
    ['kettle-merges', []],
    ['teapot-deploys', [['teapot#4', 'teapot-bot']]],
  ]);
});

function runAt(argv: string[], time = NOON_SYDNEY): Promise<number> {
  at(time);
  return main(argv);
}
