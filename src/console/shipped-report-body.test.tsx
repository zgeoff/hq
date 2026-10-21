import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRenderedReport } from '../../test/build-rendered-report.ts';
import { setupPageDOM } from '../../test/setup-page-dom.ts';
import { parseRenderedReport } from '../shipped/parse-rendered-report.ts';
import type { RenderedReport, ReportGroup, ReportRow } from '../shipped/types.ts';

const FIXTURES = join(import.meta.dir, '../../skills/delivery-report/scripts/testdata/render-report');

// A page and the report body's component, before anything is drawn.
async function setupTest() {
  const lib = await setupPageDOM('http://127.0.0.1:4317/shipped'),
    module = await import('./shipped-report-body.tsx');
  return { lib, ShippedReportBody: module.ShippedReportBody };
}

// Draws `report` on the test's page and returns the page's body.
function renderReport(app: Awaited<ReturnType<typeof setupTest>>, report: RenderedReport): HTMLElement {
  app.lib.render(<app.ShippedReportBody report={report} />);
  return document.body;
}

function loadFixture(name: string): RenderedReport {
  return parseRenderedReport(readFileSync(join(FIXTURES, `${name}.json.expected`), 'utf8'));
}

// Each row's parts in order, as text: markers, title link, pill, then its chips.
function collectRowParts(page: HTMLElement): string[][] {
  return Array.from(page.querySelectorAll('li.hq-shipped-row'), (row) => Array.from(row.children, (part) => (part.tagName === 'UL' ? Array.from(part.querySelectorAll('a'), (chip) => chip.textContent).join(' ') : (part.textContent ?? ''))));
}

test('a day draws its title, each project as a group of two-line rows, No issue, and the notes', async () => {
  const app = await setupTest(),
    page = renderReport(app, loadFixture('daily'));
  expect(page.querySelector('h1')?.textContent).toBe('Thursday 15 October: 7 PRs across 2 repos, covering 5 issues, 2 closed.');
  expect(Array.from(page.querySelectorAll('h2'), (heading) => heading.textContent)).toStrictEqual(['Lantern Garden (2 issues, 3 PRs)', 'Paper Orchard (1 issue, 1 PR)', 'No project (1 issue, 1 PR)', 'No issue (1 PR)']);
  expect(collectRowParts(page)).toStrictEqual([
    ['🐛 🚨', 'GEO-9401 Repair the lantern latch', '', 'lantern-demo#9401'],
    ['✨ ❗', 'GEO-9402 Add the dusk path', 'In Review', 'lantern-demo#9402 lantern-demo#9403'],
    ['🧹', 'GEO-9403 Sweep the paper leaves', '', 'paper-orchard#9404'],
    ['▫️', 'GEO-9404 Draw the spare planter', 'Canceled', 'paper-orchard#9405'],
    ['', 'paper-orchard add a paper kite', '', 'paper-orchard#9407'],
  ]);
  expect(Array.from(page.querySelectorAll('.hq-shipped-line'), (line) => line.textContent)).toStrictEqual(['Closed: 1 bug, 1 chore.', 'Not found in Linear: GEO-9499.']);
});

test('a week draws its days, its burndowns, Still open and the fetch gap', async () => {
  const app = await setupTest(),
    page = renderReport(app, loadFixture('weekly'));
  expect([page.querySelector('h1')?.textContent, page.querySelector('.hq-shipped-days li')?.textContent]).toStrictEqual(['Week of Monday 12 October: 6 PRs across 2 repos, covering 4 issues, 2 closed. +2,345 −1,234.', 'Thursday 15 October: 2 PRs, 2 issues']);
  expect(Array.from(page.querySelectorAll('h2'), (heading) => heading.textContent)).toStrictEqual(['Lantern Garden (2 issues, 3 PRs) · 1 of 3 done, 1 in Triage', 'Paper Orchard (1 issue, 1 PR) · 1 of 2 done', 'Still open', 'No issue (1 PR)']);
  expect(page.textContent).toContain('Lantern Garden: 1 issue, most PRs on GEO-9402 Add the dusk path');
  expect(page.textContent).toContain('GitHub found 7 PRs, but only 6 arrived.');
});

test('Still open separates the issues it names with commas', async () => {
  const app = await setupTest(),
    listed = [
      { issue: 'GEO-9701', title: 'Fit the long spout', url: 'https://linear.example/issue/GEO-9701' },
      { issue: 'GEO-9702', title: 'Descale the boiler', url: 'https://linear.example/issue/GEO-9702' },
    ],
    page = renderReport(app, buildRenderedReport({ stillOpen: [{ project: 'Kettle Works', issues: 2, top: listed }] }));
  expect(page.querySelector('.hq-shipped-days li')?.textContent).toBe('Kettle Works: 2 issues, most PRs on GEO-9701 Fit the long spout, GEO-9702 Descale the boiler');
});

// Every row's chips sit in the grid's title column and the column after it, below the title, and
// the marker column has a fixed width, so the chips start at one x on every row. happy-dom has no
// layout, so the test checks that structure; the screenshots show it drawn.
test('each PR is a chip naming its repo and number and linking to the PR, six of them in one wrapping list under the title', async () => {
  const app = await setupTest(),
    chipPRs = Array.from({ length: 6 }, (_unused, index) => ({ repo: 'kettle', number: 50 + index, url: `https://github.com/zgeoff/kettle/pull/${50 + index}` })),
    group = buildKettleGroup([buildKettleRow({ prs: chipPRs }), buildKettleRow({ issue: 'GEO-9602' })]),
    page = renderReport(app, buildRenderedReport({ groups: [group] })),
    rowChips = [...page.querySelectorAll('ul.hq-shipped-chips')];
  expect(rowChips.map((list) => Array.from(list.querySelectorAll('a'), (chip) => [chip.textContent, chip.getAttribute('href'), chip.getAttribute('target')]))).toStrictEqual([
    chipPRs.map((pr) => [`kettle#${pr.number}`, pr.url, '_blank']),
    [['kettle#41', 'https://github.com/zgeoff/kettle/pull/41', '_blank']],
    [['kettle#43', 'https://github.com/zgeoff/kettle/pull/43', '_blank']],
  ]);
  expect(rowChips.map((list) => list.previousElementSibling?.previousElementSibling?.className)).toStrictEqual(['hq-shipped-title', 'hq-shipped-title', 'hq-shipped-title']);
});

test('a long title keeps to one line and shows whole on hover', async () => {
  const app = await setupTest(),
    fullTitle = 'Fit the long spout and the short spout and the spare spout and the lid that holds them all',
    group = buildKettleGroup([buildKettleRow({ title: fullTitle })]),
    page = renderReport(app, buildRenderedReport({ groups: [group] })),
    title = page.querySelector('a.hq-shipped-title');
  expect([title?.getAttribute('title'), title?.className]).toStrictEqual([`GEO-9601 ${fullTitle}`, 'hq-shipped-title']);
});

function buildKettleGroup(rows: ReportRow[]): ReportGroup {
  return { project: 'Kettle Works', issues: rows.length, prs: rows.flatMap((row) => row.prs).length, burndown: null, rows };
}

function buildKettleRow(over: Partial<ReportRow>): ReportRow {
  return { issue: 'GEO-9601', title: 'Fit the long spout', url: 'https://linear.example/issue/GEO-9601', state: 'closed', status: 'Done', marker: '🐛', flag: null, prs: [{ repo: 'kettle', number: 41, url: 'https://github.com/zgeoff/kettle/pull/41' }], ...over };
}

test('an empty day says nothing merged under its title', async () => {
  const app = await setupTest(),
    page = renderReport(app, buildRenderedReport({ totals: { prs: 0, repos: 0, issues: 0, added: 0, removed: 0, closed: 0 }, closed: [], groups: [], noIssue: [] }));
  expect(Array.from(page.querySelector('article')?.children ?? [], (part) => part.textContent)).toStrictEqual(['Thursday 15 October: 0 PRs across 0 repos, covering 0 issues, 0 closed.', 'Nothing merged in this period.', 'Closed: none.']);
});
