import { expect, test } from 'bun:test';
import { buildMockRunPrRow } from './build-mock-run-pr-row.ts';

test('it builds a default run PR row', () => {
  expect(buildMockRunPrRow()).toStrictEqual({
    ref: 'kettle#1',
    issue: 'GEO-9001',
    url: null,
    state: 'open',
    final_sha: null,
    final_at: null,
    final_source: null,
    review_started_at: null,
    reviewed_sha: null,
    review_round: 0,
    reviewed_at: null,
    merged_at: null,
    added_at: '2026-10-14T01:00:00Z',
    updated_at: '2026-10-14T01:00:00Z',
    fixed_in_pr: null,
    tally_at: null,
    merge_sha: null,
    shipped_tag: null,
    shipped_at: null,
    design_pass: 0,
    session_id: null,
    session_by_hand: 0,
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockRunPrRow({ ref: 'widgets#7', review_round: 1 })).toStrictEqual({
    ref: 'widgets#7',
    issue: 'GEO-9001',
    url: null,
    state: 'open',
    final_sha: null,
    final_at: null,
    final_source: null,
    review_started_at: null,
    reviewed_sha: null,
    review_round: 1,
    reviewed_at: null,
    merged_at: null,
    added_at: '2026-10-14T01:00:00Z',
    updated_at: '2026-10-14T01:00:00Z',
    fixed_in_pr: null,
    tally_at: null,
    merge_sha: null,
    shipped_tag: null,
    shipped_at: null,
    design_pass: 0,
    session_id: null,
    session_by_hand: 0,
  });
});
