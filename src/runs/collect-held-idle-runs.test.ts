import { expect, test } from 'bun:test';
import { collectHeldIdleRuns } from './collect-held-idle-runs.ts';
import type { WorkingRunRead } from './collect-held-idle-runs.ts';

test.each<{ $title: string; runs: WorkingRunRead[]; active: string[]; expected: string[] }>([
  {
    $title: 'collects a held run with no active session',
    runs: [{ issue: 'GEO-8201', waitsOn: 'free slots for the hinge#2 part', newestScopeEvent: { seq: 3, action: 'handed-in-held', actor: 'lid-bot', at: '2026-09-04T08:00:00Z', data: '{}' } }],
    active: [],
    expected: ['GEO-8201'],
  },
  {
    $title: 'skips a held run that still has an active session',
    runs: [{ issue: 'GEO-8201', waitsOn: 'free slots for the hinge#2 part', newestScopeEvent: { seq: 3, action: 'handed-in-held', actor: 'lid-bot', at: '2026-09-04T08:00:00Z', data: '{}' } }],
    active: ['GEO-8201'],
    expected: [],
  },
  {
    $title: 'skips a released run with no active session',
    runs: [{ issue: 'GEO-8201', waitsOn: 'free slots for the hinge#2 part', newestScopeEvent: { seq: 4, action: 'handed-in-released', actor: 'lid-bot', at: '2026-09-04T09:00:00Z', data: '{}' } }],
    active: [],
    expected: [],
  },
  {
    $title: 'skips a run that waits on parts but was never held',
    runs: [{ issue: 'GEO-8201', waitsOn: 'free slots for the hinge#2 part', newestScopeEvent: undefined }],
    active: [],
    expected: [],
  },
  {
    $title: 'skips a run whose waits_on was cleared after a hold',
    runs: [{ issue: 'GEO-8201', waitsOn: null, newestScopeEvent: { seq: 3, action: 'handed-in-held', actor: 'lid-bot', at: '2026-09-04T08:00:00Z', data: '{}' } }],
    active: [],
    expected: [],
  },
])('it $title', (row) => {
  expect(collectHeldIdleRuns(row.runs, new Set(row.active))).toStrictEqual(row.expected);
});
