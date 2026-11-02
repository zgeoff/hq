import { expect, test } from 'bun:test';
import { formatSweepText } from './format-sweep-text.ts';

test('it ends with the review hint when a PR alert is due', () => {
  expect(
    formatSweepText([
      { key: 'pr:kettle#56', fingerprint: 'final:abc1234', issue: 'GEO-9856', line: 'kettle#56 (GEO-9856) final at abc1234 for 120 min, no review' },
      { key: 'session:98560000', fingerprint: 'quiet:idle', issue: 'GEO-9856', line: 'GEO-9856: session 98560000 quiet for 90 min' },
    ]),
  ).toBe('hq run sweep: 2 to look at.\n- kettle#56 (GEO-9856) final at abc1234 for 120 min, no review\n- GEO-9856: session 98560000 quiet for 90 min\nRecord a review with hq run reviewed <pr> --sha <head>.');
});

test('it leaves out the review hint when only a quiet session is due', () => {
  expect(
    formatSweepText([
      { key: 'session:98560000', fingerprint: 'quiet:idle', issue: 'GEO-9856', line: 'GEO-9856: session 98560000 quiet for 90 min; if it waits only on the owner, hq run state GEO-9856 working --waits-on-geoff' },
    ]),
  ).toBe('hq run sweep: 1 to look at.\n- GEO-9856: session 98560000 quiet for 90 min; if it waits only on the owner, hq run state GEO-9856 working --waits-on-geoff');
});
