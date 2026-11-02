import { expect, test } from 'bun:test';
import { pickStaleKind } from './pick-stale-kind.ts';

const STARTED = '2026-10-10T01:00:00Z';
const pr = (ref: string, status: string, mergedAt: string | null = null) => ({ ref, status: status, mergedAt });

test.each([
  ['every PR merged, dated by the last merge', [pr('kettle#1', 'merged', '2026-10-12T01:00:00Z'), pr('kettle#2', 'merged', '2026-10-14T01:00:00Z')], { kind: 'done-open', since: '2026-10-14T01:00:00Z', ref: 'kettle#2' }],
  ['one merged PR with no merge time, dated by the start', [pr('kettle#1', 'merged')], { kind: 'done-open', since: STARTED, ref: 'kettle#1' }],
  ['no PRs', [], { kind: 'stalled', since: STARTED }],
  ['only closed PRs', [pr('kettle#1', 'closed')], { kind: 'stalled', since: STARTED }],
  ['a merged and a closed PR', [pr('kettle#1', 'merged', '2026-10-12T01:00:00Z'), pr('kettle#2', 'closed')], { kind: 'stalled', since: STARTED }],
  ['an open PR beside a merged one', [pr('kettle#1', 'merged', '2026-10-12T01:00:00Z'), pr('kettle#2', 'open')], { kind: 'live' }],
  ['a draft PR', [pr('kettle#1', 'draft')], { kind: 'live' }],
  ['a merged PR and one of unknown status', [pr('kettle#1', 'merged', '2026-10-12T01:00:00Z'), pr('kettle#2', 'mystery')], { kind: 'done-open', since: '2026-10-12T01:00:00Z', ref: 'kettle#1' }],
  ['only a PR of unknown status', [pr('kettle#1', 'mystery')], { kind: 'stalled', since: STARTED }],
])('it classifies %s', (_case, prs, expected) => {
  expect(pickStaleKind(STARTED, prs)).toStrictEqual(expected);
});
