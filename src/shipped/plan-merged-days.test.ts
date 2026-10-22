import { expect, test } from 'bun:test';
import { planMergedDays } from './plan-merged-days.ts';

test('today and yesterday are Sydney calendar dates, across midnight UTC and a daylight saving change', () => {
  const morning = new Date('2026-10-14T21:30:00Z'),
    shifted = new Date('2026-10-04T13:30:00Z');
  expect([planMergedDays('today', morning), planMergedDays('yesterday', morning)]).toStrictEqual([
    { today: '2026-10-15', days: ['2026-10-15'] },
    { today: '2026-10-15', days: ['2026-10-14'] },
  ]);
  expect([planMergedDays('today', shifted).days, planMergedDays('yesterday', shifted).days]).toStrictEqual([['2026-10-05'], ['2026-10-04']]);
  expect(planMergedDays('yesterday', new Date('2026-03-01T03:00:00Z')).days).toStrictEqual(['2026-02-28']);
});

test('the week runs Monday to the day that holds the time, never past today', () => {
  expect(planMergedDays('week', new Date('2026-10-14T21:30:00Z')).days).toStrictEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15']);
});

test('a Monday morning is a week of one day', () => {
  expect(planMergedDays('week', new Date('2026-10-11T14:30:00Z')).days).toStrictEqual(['2026-10-12']);
});

test('a Sunday is the seventh day of its week', () => {
  expect(planMergedDays('week', new Date('2026-10-18T02:00:00Z')).days).toStrictEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']);
});

test('a week that holds the October daylight saving change keeps all 7 calendar days', () => {
  expect(planMergedDays('week', new Date('2026-10-04T10:00:00Z')).days).toStrictEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
});
