import { expect, onTestFinished, test } from 'bun:test';
import { buildStubGitHubFactsRunner } from '../../test/build-stub-github-facts-runner.ts';
import { freshDb } from '../../test/helpers.ts';
import { addPr } from './add-pr.ts';
import { addRun } from './add-run.ts';
import { IN_SCOPE } from '../scope/in-scope.ts';
import { attachGitHubPRs } from './attach-github-prs.ts';
import { setState } from './set-state.ts';

function setupTest() {
  const fresh = freshDb();

  onTestFinished(fresh.cleanup);

  return { db: fresh.db };
}

test('it attaches a PR to the open run its Fixes line names, with its URL and a pr event by hq-github', async () => {
  const ctx = setupTest();
  const calls: string[] = [];
  addRun(ctx.db, { issue: 'GEO-9811', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });

  const result = await attachGitHubPRs(ctx.db, buildStubGitHubFactsRunner({ search: JSON.stringify([{ number: 12, repository: { name: 'hq' }, body: 'Descale the kettle.\n\nFixes GEO-9811\n' }]), calls }), new Date('2026-10-20T00:00:00Z'));

  expect(result).toStrictEqual({ attached: ['hq#12 to GEO-9811'], errors: [], mergedSearched: true });
  expect(calls).toStrictEqual(IN_SCOPE.flatMap((repo) => [`gh search prs --repo zgeoff/${repo} --state open --json number,repository,body --limit 1000`, `gh search prs --repo zgeoff/${repo} --merged-at >=2026-10-20T00:00:00Z --json number,repository,body --limit 1000`]));
  expect(ctx.db.query('SELECT ref, issue, url FROM run_prs ORDER BY ref').all()).toStrictEqual([{ ref: 'hq#12', issue: 'GEO-9811', url: 'https://github.com/zgeoff/hq/pull/12' }]);
  expect(ctx.db.query("SELECT actor FROM events WHERE action = 'pr'").all()).toStrictEqual([{ actor: 'hq-github' }]);
});

test('it attaches a PR whose Contributes to line sits in the middle of a bullet list', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9811', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });

  const result = await attachGitHubPRs(ctx.db, buildStubGitHubFactsRunner({ search: JSON.stringify([{ number: 12, repository: { name: 'hq' }, body: '- descale the lid\n  - **Contributes to GEO-9811**: part one\n- polish the spout' }]) }), new Date('2026-10-20T00:00:00Z'));

  expect(result.attached).toStrictEqual(['hq#12 to GEO-9811']);
});

test('it attaches nothing for a Related to line', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9811', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });

  const result = await attachGitHubPRs(ctx.db, buildStubGitHubFactsRunner({ search: JSON.stringify([{ number: 12, repository: { name: 'hq' }, body: 'Related to GEO-9811' }]) }), new Date('2026-10-20T00:00:00Z'));

  expect(result).toStrictEqual({ attached: [], errors: [], mergedSearched: true });
  expect(ctx.db.query('SELECT ref, issue, url FROM run_prs ORDER BY ref').all()).toStrictEqual([]);
});

test('it leaves a PR in a repo outside the scope alone', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9811', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });

  await attachGitHubPRs(ctx.db, buildStubGitHubFactsRunner({ search: JSON.stringify([{ number: 12, repository: { name: 'toaster' }, body: 'Fixes GEO-9811' }]) }), new Date('2026-10-20T00:00:00Z'));

  expect(ctx.db.query('SELECT ref, issue, url FROM run_prs ORDER BY ref').all()).toStrictEqual([]);
});

test('it attaches no PR to a closed run', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9811', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  setState(ctx.db, 'GEO-9811', 'done', { note: 'finished' }, 'kettle-bot');

  const result = await attachGitHubPRs(ctx.db, buildStubGitHubFactsRunner({ search: JSON.stringify([{ number: 12, repository: { name: 'hq' }, body: 'Fixes GEO-9811' }]) }), new Date('2026-10-20T00:00:00Z'));

  expect(result).toStrictEqual({ attached: [], errors: [], mergedSearched: true });
  expect(ctx.db.query('SELECT ref, issue, url FROM run_prs ORDER BY ref').all()).toStrictEqual([]);
});

test('it leaves a PR already on a run, open or closed, where it is', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9811', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addRun(ctx.db, { issue: 'GEO-9812', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9812', 'hq#12', 'kettle-bot');
  setState(ctx.db, 'GEO-9812', 'dropped', { note: 'paused' }, 'kettle-bot');

  const result = await attachGitHubPRs(ctx.db, buildStubGitHubFactsRunner({ search: JSON.stringify([{ number: 12, repository: { name: 'hq' }, body: 'Fixes GEO-9811' }]) }), new Date('2026-10-20T00:00:00Z'));

  expect(result).toStrictEqual({ attached: [], errors: [], mergedSearched: true });
  expect(ctx.db.query('SELECT ref, issue, url FROM run_prs ORDER BY ref').all()).toStrictEqual([{ ref: 'hq#12', issue: 'GEO-9812', url: null }]);
});

test('it attaches a PR to neither of two open runs its lines name, and reports the PR', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9811', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addRun(ctx.db, { issue: 'GEO-9812', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });

  const result = await attachGitHubPRs(ctx.db, buildStubGitHubFactsRunner({ search: JSON.stringify([{ number: 12, repository: { name: 'hq' }, body: 'Fixes GEO-9811\nContributes to GEO-9812' }]) }), new Date('2026-10-20T00:00:00Z'));

  expect(result).toStrictEqual({ attached: [], errors: ['hq#12: its body names GEO-9811 and GEO-9812, so hq attaches it to neither'], mergedSearched: true });
  expect(ctx.db.query('SELECT ref, issue, url FROM run_prs ORDER BY ref').all()).toStrictEqual([]);
});

test('it reports a repo whose search failed, and still attaches from the others', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9811', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  const found = JSON.stringify([{ number: 12, repository: { name: 'hq' }, body: 'Fixes GEO-9811' }]);

  const result = await attachGitHubPRs(ctx.db, (cmd) => {
    const answer = cmd.includes('zgeoff/atc') ? { code: 1, stdout: '', stderr: 'invented: rate limited' } : { code: 0, stdout: found, stderr: '' };
    return Promise.resolve(answer);
  }, new Date('2026-10-20T00:00:00Z'));

  expect(result).toStrictEqual({ attached: ['hq#12 to GEO-9811'], errors: ['open PR search in atc failed (gh exit 1): invented: rate limited', 'merged PR search in atc failed (gh exit 1): invented: rate limited'], mergedSearched: false });
});

test('it attaches nothing and reports a search answer it cannot read', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9811', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });

  const result = await attachGitHubPRs(ctx.db, buildStubGitHubFactsRunner({ search: 'not json' }), new Date('2026-10-20T00:00:00Z'));

  expect(result).toStrictEqual({ attached: [], errors: IN_SCOPE.map((repo) => `open PR search in ${repo} gave an unreadable answer`), mergedSearched: true });
  expect(ctx.db.query('SELECT ref FROM run_prs').all()).toStrictEqual([]);
});

test('it says when the search answer fills its limit, as PRs past it go unattached', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9811', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  const full = JSON.stringify(Array.from({ length: 1000 }, (_, index) => ({ number: index + 1, repository: { name: 'hq' }, body: 'Fit the lid.' })));

  const result = await attachGitHubPRs(ctx.db, (cmd) => {
    const stdout = cmd.includes('zgeoff/hq') && cmd.includes('open') ? full : '[]';
    return Promise.resolve({ code: 0, stdout, stderr: '' });
  }, new Date('2026-10-20T00:00:00Z'));

  expect(result).toStrictEqual({ attached: [], errors: ['open PR search in hq gave 1000 PRs, its limit, so PRs past it are not attached'], mergedSearched: true });
});

test('it attaches a PR that merged since the last pass and no longer shows as open', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9811', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });

  const result = await attachGitHubPRs(ctx.db, buildStubGitHubFactsRunner({ search: '[]', merged: JSON.stringify([{ number: 14, repository: { name: 'hq' }, body: 'Fixes GEO-9811' }]) }), new Date('2026-10-20T00:00:00Z'));

  expect(result).toStrictEqual({ attached: ['hq#14 to GEO-9811'], errors: [], mergedSearched: true });
  expect(ctx.db.query('SELECT ref, issue FROM run_prs').all()).toStrictEqual([{ ref: 'hq#14', issue: 'GEO-9811' }]);
});

test('it attaches a PR once when both the open and the merged search find it', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9811', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  const found = JSON.stringify([{ number: 14, repository: { name: 'hq' }, body: 'Fixes GEO-9811' }]);

  const result = await attachGitHubPRs(ctx.db, buildStubGitHubFactsRunner({ search: found, merged: found }), new Date('2026-10-20T00:00:00Z'));

  expect(result).toStrictEqual({ attached: ['hq#14 to GEO-9811'], errors: [], mergedSearched: true });
});
