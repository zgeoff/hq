import { expect, test } from 'bun:test';
import { pickStaleKind } from './pick-stale-kind.ts';

test.each([
  {
    name: 'dates a done-but-open issue by its last merge',
    prs: [
      { ref: 'kettle#1', status: 'merged', mergedAt: '2026-10-12T01:00:00Z' },
      { ref: 'kettle#2', status: 'merged', mergedAt: '2026-10-14T01:00:00Z' },
    ],
    expected: { kind: 'done-open', since: '2026-10-14T01:00:00Z', ref: 'kettle#2', mergedAt: '2026-10-14T01:00:00Z' },
  },
  { name: 'dates a done-but-open issue by its start when the merge time is unknown', prs: [{ ref: 'kettle#1', status: 'merged', mergedAt: null }], expected: { kind: 'done-open', since: '2026-10-10T01:00:00Z', ref: 'kettle#1', mergedAt: null } },
  { name: 'calls an issue with no PRs stalled since its start', prs: [], expected: { kind: 'stalled', since: '2026-10-10T01:00:00Z' } },
  { name: 'calls an issue with only a closed PR stalled since its start', prs: [{ ref: 'kettle#1', status: 'closed', mergedAt: null }], expected: { kind: 'stalled', since: '2026-10-10T01:00:00Z' } },
  {
    name: 'calls an issue with a merged PR and a closed one stalled, since not every PR merged',
    prs: [
      { ref: 'kettle#1', status: 'merged', mergedAt: '2026-10-12T01:00:00Z' },
      { ref: 'kettle#2', status: 'closed', mergedAt: null },
    ],
    expected: { kind: 'stalled', since: '2026-10-10T01:00:00Z' },
  },
  {
    name: 'calls an issue with an open PR live, merged PRs or not',
    prs: [
      { ref: 'kettle#1', status: 'merged', mergedAt: '2026-10-12T01:00:00Z' },
      { ref: 'kettle#2', status: 'open', mergedAt: null },
    ],
    expected: { kind: 'live' },
  },
  { name: 'calls an issue with a draft PR live', prs: [{ ref: 'kettle#3', status: 'draft', mergedAt: null }], expected: { kind: 'live' } },
  {
    name: 'ignores a PR of unknown status beside a merged one',
    prs: [
      { ref: 'kettle#1', status: 'merged', mergedAt: '2026-10-12T01:00:00Z' },
      { ref: 'kettle#2', status: 'mystery', mergedAt: null },
    ],
    expected: { kind: 'done-open', since: '2026-10-12T01:00:00Z', ref: 'kettle#1', mergedAt: '2026-10-12T01:00:00Z' },
  },
  { name: 'calls an issue with only a PR of unknown status stalled', prs: [{ ref: 'kettle#3', status: 'mystery', mergedAt: null }], expected: { kind: 'stalled', since: '2026-10-10T01:00:00Z' } },
])('#pickStaleKind $name', (row) => {
  expect(pickStaleKind('2026-10-10T01:00:00Z', row.prs)).toStrictEqual(row.expected);
});
