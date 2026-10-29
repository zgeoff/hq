import { expect, onTestFinished, test } from 'bun:test';
import { at, freshDb } from '../../test/helpers.ts';
import { writeIssues } from '../linear/write-issues.ts';
import { addRun } from '../runs/add-run.ts';
import { setState } from '../runs/set-state.ts';
import { countOpenDesignRuns } from './count-open-design-runs.ts';
import { readDesignRuns } from './read-design-runs.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  at('2026-10-15T20:00:00Z');
  writeIssues(fresh.db, [{ issue: 'GEO-9901', type: 'Design', title: 'Design: a quieter kettle whistle', state: 'open', closed_at: null }]);
  const add = (issue: string, design: 'agent' | 'with-geoff' | null) =>
    addRun(fresh.db, { issue, title: 'Descale the kettle', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design, actor: 'z-delivery' });
  return { db: fresh.db, add };
}

test('it reads a run with a design lane, and a run with none whose issue is Design type as with-geoff', () => {
  const ctx = setupTest();
  ctx.add('GEO-9901', null);
  ctx.add('GEO-9902', 'agent');
  ctx.add('GEO-9903', null);
  ctx.db.query('UPDATE runs SET design_lane = NULL WHERE issue = ?').run('GEO-9901');

  expect(readDesignRuns(ctx.db)).toStrictEqual([
    { issue: 'GEO-9901', state: 'working', lane: 'with-geoff' },
    { issue: 'GEO-9902', state: 'working', lane: 'agent' },
  ]);
});

test('it counts only the open design runs in each lane', () => {
  const ctx = setupTest();
  ctx.add('GEO-9902', 'agent');
  ctx.add('GEO-9904', 'agent');
  ctx.add('GEO-9905', 'with-geoff');
  setState(ctx.db, 'GEO-9904', 'done', { note: 'design settled' }, 'z-delivery');

  expect(countOpenDesignRuns(ctx.db)).toStrictEqual({ agent: 1, withGeoff: 1 });
});
