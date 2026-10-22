import { expect, test } from 'bun:test';
import { parseRenderedReport } from '../src/shipped/parse-rendered-report.ts';
import { buildRenderedReport } from './build-rendered-report.ts';

test('the built report is one render-report.sh --json could print, and a field given replaces its default', () => {
  const built = buildRenderedReport({ dateLabel: 'Friday 16 October' });
  expect([parseRenderedReport(JSON.stringify(built)), built.dateLabel]).toStrictEqual([built, 'Friday 16 October']);
});
