import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseRenderedReport } from './parse-rendered-report.ts';

const FIXTURES = join(import.meta.dir, '../../skills/delivery-report/scripts/testdata/render-report');

test.each(['daily.json.expected', 'weekly.json.expected'])('the skill\'s own %s reads whole', (file) => {
  const body = readFileSync(join(FIXTURES, file), 'utf8'),
    raw = JSON.parse(body) as { groups: { rows: { prs: unknown[] }[] }[] },
    read = parseRenderedReport(body);
  expect(collectPRs(read.groups)).toStrictEqual(collectPRs(raw.groups));
});

function collectPRs(groups: readonly { rows: readonly { prs: readonly unknown[] }[] }[]): unknown[][] {
  return groups.map((group) => group.rows.map((row) => row.prs));
}

test('a report in another shape is refused, naming the fields', () => {
  const daily = JSON.parse(readFileSync(join(FIXTURES, 'daily.json.expected'), 'utf8')) as Record<string, unknown>;
  expect(() => parseRenderedReport(JSON.stringify({ ...daily, kind: 'monthly', groups: [{ project: 'Lantern Garden' }] }))).toThrow('render-report.sh printed an unexpected shape: kind, groups.0.issues, groups.0.prs, groups.0.burndown, groups.0.rows');
});
