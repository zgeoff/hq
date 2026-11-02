import { expect, test } from 'bun:test';
import { pickStaleKind } from './pick-stale-kind.ts';

function setupTest() {
  const started = '2026-10-10T01:00:00Z';
  return {
    started,
    pr: (ref: string, status: string, mergedAt: string | null = null) => ({ ref, status, mergedAt }),
    classify: (prs: { ref: string; status: string; mergedAt: string | null }[]) => pickStaleKind(started, prs),
  };
}

test('it dates a done-but-open issue by its last merge', () => {
  const app = setupTest();

  expect(app.classify([app.pr('kettle#1', 'merged', '2026-10-12T01:00:00Z'), app.pr('kettle#2', 'merged', '2026-10-14T01:00:00Z')])).toStrictEqual({ kind: 'done-open', since: '2026-10-14T01:00:00Z', ref: 'kettle#2' });
});

test('it dates a done-but-open issue by its start when the merge time is unknown', () => {
  const app = setupTest();

  expect(app.classify([app.pr('kettle#1', 'merged')])).toStrictEqual({ kind: 'done-open', since: app.started, ref: 'kettle#1' });
});

test('it calls an issue with no PRs, or only closed ones, stalled since its start', () => {
  const app = setupTest();

  expect([app.classify([]), app.classify([app.pr('kettle#1', 'closed')])]).toStrictEqual([
    { kind: 'stalled', since: app.started },
    { kind: 'stalled', since: app.started },
  ]);
});

test('it calls an issue with a merged PR and a closed one stalled, since not every PR merged', () => {
  const app = setupTest();

  expect(app.classify([app.pr('kettle#1', 'merged', '2026-10-12T01:00:00Z'), app.pr('kettle#2', 'closed')])).toStrictEqual({ kind: 'stalled', since: app.started });
});

test('it calls an issue with an open or draft PR live, merged PRs or not', () => {
  const app = setupTest();

  expect([app.classify([app.pr('kettle#1', 'merged', '2026-10-12T01:00:00Z'), app.pr('kettle#2', 'open')]), app.classify([app.pr('kettle#3', 'draft')])]).toStrictEqual([{ kind: 'live' }, { kind: 'live' }]);
});

test('it ignores a PR of unknown status', () => {
  const app = setupTest();

  expect([app.classify([app.pr('kettle#1', 'merged', '2026-10-12T01:00:00Z'), app.pr('kettle#2', 'mystery')]), app.classify([app.pr('kettle#3', 'mystery')])]).toStrictEqual([
    { kind: 'done-open', since: '2026-10-12T01:00:00Z', ref: 'kettle#1' },
    { kind: 'stalled', since: app.started },
  ]);
});
