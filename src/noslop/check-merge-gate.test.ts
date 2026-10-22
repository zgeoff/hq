import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStubFindings } from '../../test/build-stub-findings.ts';
import { buildStubGateFacts } from '../../test/build-stub-gate-facts.ts';
import { createListedReview } from '../../test/create-listed-review.ts';
import { FAKE_FULL_SHA, FAKE_TOKEN, buildFakeRunner } from '../../test/noslop-fake.ts';
import { overrideEnv } from '../config/override-env.ts';
import { openDb } from '../db/open-db.ts';
import { setMeta } from '../db/set-meta.ts';
import { logEvent } from '../log-event.ts';
import { recordPRAcceptedRisk } from '../pr-status/record-pr-accepted-risk.ts';
import { recordPRAnswer } from '../pr-status/record-pr-answer.ts';
import { recordPROverride } from '../pr-status/record-pr-override.ts';
import { checkMergeGate } from './check-merge-gate.ts';

function setupTest() {
  const base = mkdtempSync(join(tmpdir(), 'hq-review-noslop-')),
    db = openDb(join(base, 'hq.db'));

  onTestFinished(() => {
    db.close();
    rmSync(base, { recursive: true, force: true });
  });
  writeFileSync(join(base, 'settings.json'), JSON.stringify({ env: { OP_SERVICE_ACCOUNT_TOKEN: FAKE_TOKEN } }));
  onTestFinished(overrideEnv('HQ_NOSLOP_OP_SETTINGS', join(base, 'settings.json')));
  onTestFinished(overrideEnv('REVIEW_DIR', base));
  onTestFinished(overrideEnv('HQ_PROJECTS', join(base, 'projects')));
  onTestFinished(overrideEnv('HQ_REPOS', join(base, 'repos')));

  return { base, db };
}

test('it lets a PR whose last review read an earlier head merge when no finding is open, and runs no noslop check', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  createListedReview(ctx.db, { repo: 'widgets', pr: 7, head: 'f00dfeedf00dfeedf00dfeedf00dfeedf00dfeed' });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).resolves.toMatchObject({ mayMerge: true, reviewed: true });

  expect(fake.of('bun').map((call) => call.cmd[3])).toStrictEqual(['findings']);
});

test('it tells the head it read to the caller', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner(),
    heads: string[] = [];
  createListedReview(ctx.db, { repo: 'widgets', pr: 7, head: 'f00dfeedf00dfeedf00dfeedf00dfeedf00dfeed' });

  await checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 }, (head) => heads.push(head));

  expect(heads).toStrictEqual([FAKE_FULL_SHA]);
});

test('it blocks a PR with an open finding, naming it', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopFindings: buildStubFindings('open') });
  createListedReview(ctx.db, { repo: 'widgets', pr: 7, head: FAKE_FULL_SHA });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).rejects.toMatchObject({ code: 'merge_blocked', message: '1 noslop finding is open: aaaa' });
});

test('it blocks a finding noslop lists as deferred', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopFindings: buildStubFindings('deferred') });
  createListedReview(ctx.db, { repo: 'widgets', pr: 7, head: FAKE_FULL_SHA });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).rejects.toMatchObject({ code: 'merge_blocked', message: '1 noslop finding is open: aaaa' });
});

test.each(['fixed', 'not-a-defect'])('it passes a finding in state %s', async (state) => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopFindings: buildStubFindings(state) });
  createListedReview(ctx.db, { repo: 'widgets', pr: 7, head: FAKE_FULL_SHA });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).resolves.toMatchObject({ mayMerge: true });
});

test('it keeps an accepted-risk finding open when the reply is by zgeoff but hq holds no owner record', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopFindings: buildStubFindings('accepted-risk') });
  createListedReview(ctx.db, { repo: 'widgets', pr: 7, head: FAKE_FULL_SHA });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).rejects.toMatchObject({ code: 'merge_blocked', message: '1 noslop finding is open: aaaa' });
});

test('it passes an accepted-risk finding the owner accepted in hq', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopFindings: buildStubFindings('accepted-risk') });
  createListedReview(ctx.db, { repo: 'widgets', pr: 7, head: FAKE_FULL_SHA });
  recordPRAcceptedRisk(ctx.db, { repo: 'widgets', pr: 7, finding: 'aaaa', source: 'call:KET-1', note: 'The lid is cosmetic.', actor: 'z-kettle' });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).resolves.toMatchObject({ mayMerge: true });
});

test('it ignores a record of accepted risk whose source is not an owner source', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopFindings: buildStubFindings('accepted-risk') });
  createListedReview(ctx.db, { repo: 'widgets', pr: 7, head: FAKE_FULL_SHA });
  logEvent(ctx.db, 'hq', 'pr:widgets#7', 'pr-accepted-risk', 'z-kettle', null, null, { finding: 'aaaa', source: 'session:z-teapot', note: 'Fine.' });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).rejects.toMatchObject({ code: 'merge_blocked' });
});

test('it passes open findings under an override at the head it read', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopFindings: buildStubFindings('open') });
  createListedReview(ctx.db, { repo: 'widgets', pr: 7, head: FAKE_FULL_SHA });
  recordPROverride(ctx.db, { repo: 'widgets', pr: 7, head: FAKE_FULL_SHA, source: 'call:KET-2', note: 'Ship the kettle.', actor: 'z-kettle' });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).resolves.toMatchObject({ mayMerge: true, reason: expect.stringContaining("The owner's override at 0123456 (call:KET-2) stands for 1 open finding: aaaa") });
});

test('it blocks open findings under an override logged before 0.80.0 at the head it read', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopFindings: buildStubFindings('open') });
  createListedReview(ctx.db, { repo: 'widgets', pr: 7, head: FAKE_FULL_SHA });
  logEvent(ctx.db, 'hq', 'pr:widgets#7', 'pr-override', 'z-kettle', null, null, { head: FAKE_FULL_SHA, source: 'call:KET-2', note: 'Ship the kettle.' });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).rejects.toMatchObject({ code: 'merge_blocked', message: '1 noslop finding is open: aaaa' });
});

test('it blocks open findings once the PR has a new head after the override', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopFindings: buildStubFindings('open'), prFacts: buildStubGateFacts({ head: 'f00dfeedf00dfeedf00dfeedf00dfeedf00dfeed', checks: [{ __typename: 'CheckRun', name: 'test', status: 'COMPLETED', conclusion: 'SUCCESS' }] }) });
  createListedReview(ctx.db, { repo: 'widgets', pr: 7, head: FAKE_FULL_SHA });
  recordPROverride(ctx.db, { repo: 'widgets', pr: 7, head: FAKE_FULL_SHA, source: 'call:KET-2', note: 'Ship the kettle.', actor: 'z-kettle' });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).rejects.toMatchObject({ code: 'merge_blocked', message: '1 noslop finding is open: aaaa' });
});

test('it refuses an override whose source is a session', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopFindings: buildStubFindings('open') });
  createListedReview(ctx.db, { repo: 'widgets', pr: 7, head: FAKE_FULL_SHA });
  recordPROverride(ctx.db, { repo: 'widgets', pr: 7, head: FAKE_FULL_SHA, source: 'session:z-teapot', note: 'Trust me.', actor: 'z-teapot' });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).rejects.toMatchObject({ code: 'merge_blocked', message: '1 noslop finding is open: aaaa' });
});

test('it ignores a failing noslop check run', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ prFacts: buildStubGateFacts({ head: FAKE_FULL_SHA, checks: [{ __typename: 'CheckRun', name: 'test', status: 'COMPLETED', conclusion: 'SUCCESS' }, { __typename: 'CheckRun', name: 'noslop', status: 'COMPLETED', conclusion: 'FAILURE' }] }) });
  createListedReview(ctx.db, { repo: 'widgets', pr: 7, head: FAKE_FULL_SHA });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).resolves.toMatchObject({ mayMerge: true });
});

test.each([
  ['failing', { __typename: 'CheckRun', name: 'test', status: 'COMPLETED', conclusion: 'FAILURE' }, 'CI is not green: test (FAILURE)'],
  ['pending', { __typename: 'CheckRun', name: 'test', status: 'IN_PROGRESS', conclusion: null }, 'CI is not green: test (IN_PROGRESS)'],
  ['cancelled', { __typename: 'CheckRun', name: 'test', status: 'COMPLETED', conclusion: 'CANCELLED' }, 'CI is not green: test (CANCELLED)'],
  ['status context failing', { __typename: 'StatusContext', context: 'socket', state: 'FAILURE' }, 'CI is not green: socket (FAILURE)'],
])('it blocks a PR with %s CI', async (_label, check, message) => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ prFacts: buildStubGateFacts({ head: FAKE_FULL_SHA, checks: [{ __typename: 'CheckRun', name: 'test', status: 'COMPLETED', conclusion: 'SUCCESS' }, check] }) });
  createListedReview(ctx.db, { repo: 'widgets', pr: 7, head: FAKE_FULL_SHA });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).rejects.toMatchObject({ code: 'merge_blocked', message });
});

test.each([
  ['a skipped check run', { __typename: 'CheckRun', name: 'kettle', status: 'COMPLETED', conclusion: 'SKIPPED' }],
  ['a neutral check run', { __typename: 'CheckRun', name: 'kettle', status: 'COMPLETED', conclusion: 'NEUTRAL' }],
  ['a passing status context', { __typename: 'StatusContext', context: 'teapot', state: 'SUCCESS' }],
])('it lets a PR merge beside %s', async (_label, check) => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ prFacts: buildStubGateFacts({ head: FAKE_FULL_SHA, checks: [{ __typename: 'CheckRun', name: 'test', status: 'COMPLETED', conclusion: 'SUCCESS' }, check] }) });
  createListedReview(ctx.db, { repo: 'widgets', pr: 7, head: FAKE_FULL_SHA });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).resolves.toStrictEqual({ mayMerge: true, reason: `noslop findings: none open; CI green at ${FAKE_FULL_SHA.slice(0, 7)}`, reviewed: true });
});

test('it blocks a PR whose rollup is empty', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ prFacts: buildStubGateFacts({ head: FAKE_FULL_SHA, checks: [] }) });
  createListedReview(ctx.db, { repo: 'widgets', pr: 7, head: FAKE_FULL_SHA });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).rejects.toMatchObject({ code: 'merge_blocked', message: 'the head has no CI checks, so CI has not passed' });
});

test('it never lets an override pass red CI', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopFindings: buildStubFindings('open'), prFacts: buildStubGateFacts({ head: FAKE_FULL_SHA, checks: [{ __typename: 'CheckRun', name: 'test', status: 'COMPLETED', conclusion: 'FAILURE' }] }) });
  createListedReview(ctx.db, { repo: 'widgets', pr: 7, head: FAKE_FULL_SHA });
  recordPROverride(ctx.db, { repo: 'widgets', pr: 7, head: FAKE_FULL_SHA, source: 'call:KET-2', note: 'Ship the kettle.', actor: 'z-kettle' });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).rejects.toMatchObject({ code: 'merge_blocked', message: 'CI is not green: test (FAILURE)' });
});

test('it blocks a PR when GitHub gives no facts', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ prFacts: { code: 1, stdout: '', stderr: 'gh: could not resolve to a PullRequest' } });
  createListedReview(ctx.db, { repo: 'widgets', pr: 7, head: FAKE_FULL_SHA });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).rejects.toMatchObject({ code: 'merge_blocked', message: expect.stringContaining('could not resolve to a PullRequest') });
});

test('it blocks a PR when the findings read fails', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopFindings: { code: 1, stdout: '', stderr: 'noslop: boom' } });
  createListedReview(ctx.db, { repo: 'widgets', pr: 7, head: FAKE_FULL_SHA });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).rejects.toMatchObject({ code: 'merge_blocked', message: expect.stringContaining("could not read noslop's findings, so no pass") });
});

test('it tells a noslop with no findings command to pin a newer one', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopFindings: { code: 1, stdout: '', stderr: 'error: unknown command findings' } });
  createListedReview(ctx.db, { repo: 'widgets', pr: 7, head: FAKE_FULL_SHA });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).rejects.toMatchObject({ message: expect.stringContaining('pin noslop 0.4.15 or later') });
});

test('it reads the findings of a noslop that exits 0 with a warning that holds the word unrecognized', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ noslopFindings: { code: 0, stdout: JSON.stringify({ findings: [] }), stderr: 'warning: unrecognized kettle setting ignored' } });
  createListedReview(ctx.db, { repo: 'widgets', pr: 7, head: FAKE_FULL_SHA });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).resolves.toMatchObject({ mayMerge: true, reviewed: true });
});

test('it blocks a PR whose findings output does not fit', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopFindings: { code: 0, stdout: '{"findings":[{"id":"aaaa","state":"mystery"}]}', stderr: '' } });
  createListedReview(ctx.db, { repo: 'widgets', pr: 7, head: FAKE_FULL_SHA });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).rejects.toMatchObject({ code: 'merge_blocked', message: expect.stringContaining('no pass') });
});

test('it blocks a noslop PR that no noslop review has covered, even with no findings', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  setMeta(ctx.db, 'noslop', JSON.stringify({ repos: ['widgets'], sha: '0123456789abcdef0123456789abcdef01234567' }));

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).rejects.toMatchObject({ code: 'merge_blocked', message: expect.stringContaining('no completed review') });
});

test('it blocks a PR whose head moved while the gate ran', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ prHead: { code: 0, stdout: JSON.stringify({ headRefOid: 'f00dfeedf00dfeedf00dfeedf00dfeedf00dfeed' }), stderr: '' } });
  createListedReview(ctx.db, { repo: 'widgets', pr: 7, head: FAKE_FULL_SHA });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).rejects.toMatchObject({ code: 'merge_blocked', message: expect.stringContaining('head moved') });
});

test('it lets a PR of a repo off the noslop list merge on green CI alone', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).resolves.toStrictEqual({ mayMerge: true, reason: 'not a noslop repo: green CI is enough', reviewed: false });

  expect(fake.of('bun')).toStrictEqual([]);
});

test('it blocks a PR of a repo off the noslop list when CI is red', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ prFacts: buildStubGateFacts({ head: FAKE_FULL_SHA, checks: [{ __typename: 'CheckRun', name: 'test', status: 'COMPLETED', conclusion: 'FAILURE' }] }) });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).rejects.toMatchObject({ code: 'merge_blocked', message: 'CI is not green: test (FAILURE)' });
});

test.each([
  ['an is_bot author', '{"author":{"login":"renovate","is_bot":true}}'],
  ['a [bot] login', '{"author":{"login":"dependabot[bot]","is_bot":false}}'],
  ['an app/ login', '{"author":{"login":"app/renovate"}}'],
])('it lets a bot PR merge on %s without reading findings', async (_label, author) => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ author });
  setMeta(ctx.db, 'noslop', JSON.stringify({ repos: ['widgets'], sha: '0123456789abcdef0123456789abcdef01234567' }));

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).resolves.toStrictEqual({ mayMerge: true, reason: 'bot PR: green CI is enough', reviewed: false });

  expect(fake.of('bun')).toStrictEqual([]);
});

test('it lets a PR that started on Codex merge on green CI without reading findings', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  setMeta(ctx.db, 'noslop', JSON.stringify({ repos: ['widgets'], sha: '0123456789abcdef0123456789abcdef01234567' }));
  writeFileSync(join(ctx.base, 'widgets7-review.md'), 'No findings.\n');

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).resolves.toStrictEqual({ mayMerge: true, reason: 'on Codex: green CI is enough', reviewed: false });

  expect(fake.of('bun')).toStrictEqual([]);
});

test('it refuses a PR in hq that changes a skill with no lgtm at its head, naming the file', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ prFiles: { code: 0, stdout: 'src/kettle.ts\nskills/kettle/SKILL.md\n', stderr: '' } });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'hq', pr: 7 })).rejects.toMatchObject({ code: 'merge_blocked', message: "the PR changes owner-held files (skills/kettle/SKILL.md) and needs the owner's lgtm at 0123456: hq pr answer hq 7 lgtm, from the console" });
});

test('it refuses an lgtm a session relayed from chat', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ prFiles: { code: 0, stdout: 'skills/kettle/SKILL.md\n', stderr: '' } });
  recordPRAnswer(ctx.db, { repo: 'hq', pr: 7, answer: 'lgtm', head: FAKE_FULL_SHA, source: 'chat:kettle-1', note: null, actor: 'z-kettle' });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'hq', pr: 7 })).rejects.toMatchObject({ code: 'merge_blocked', message: expect.stringContaining("needs the owner's lgtm at 0123456") });
});

test('it refuses an lgtm at an older head', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ prFiles: { code: 0, stdout: 'skills/kettle/SKILL.md\n', stderr: '' } });
  recordPRAnswer(ctx.db, { repo: 'hq', pr: 7, answer: 'lgtm', head: 'f00dfeedf00dfeedf00dfeedf00dfeedf00dfeed', source: 'console:kettle-2', note: null, actor: 'z-kettle' });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'hq', pr: 7 })).rejects.toMatchObject({ code: 'merge_blocked', message: expect.stringContaining("needs the owner's lgtm at 0123456") });
});

test('it refuses an lgtm at the head that a later changes at the head took back', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ prFiles: { code: 0, stdout: 'fleet.json\n', stderr: '' } });
  recordPRAnswer(ctx.db, { repo: 'hq', pr: 7, answer: 'lgtm', head: FAKE_FULL_SHA, source: 'console:kettle-2', note: null, actor: 'z-kettle' });
  recordPRAnswer(ctx.db, { repo: 'hq', pr: 7, answer: 'changes', head: FAKE_FULL_SHA, source: 'call:kettle-3', note: 'Descale it first.', actor: 'z-kettle' });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'hq', pr: 7 })).rejects.toMatchObject({ code: 'merge_blocked', message: expect.stringContaining('owner-held files (fleet.json)') });
});

test("it passes a PR in hq that changes a skill once the owner's console lgtm is at its head", async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ prFiles: { code: 0, stdout: 'skills/kettle/SKILL.md\n', stderr: '' } });
  recordPRAnswer(ctx.db, { repo: 'hq', pr: 7, answer: 'lgtm', head: FAKE_FULL_SHA, source: 'console:kettle-2', note: null, actor: 'z-kettle' });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'hq', pr: 7 })).resolves.toStrictEqual({ mayMerge: true, reason: 'not a noslop repo: green CI is enough', reviewed: false });
});

test('it holds a noslop-reviewed PR in hq to the same lgtm', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ prFiles: { code: 0, stdout: 'skills/kettle/SKILL.md\n', stderr: '' } });
  createListedReview(ctx.db, { repo: 'hq', pr: 7, head: FAKE_FULL_SHA });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'hq', pr: 7 })).rejects.toMatchObject({ code: 'merge_blocked', message: expect.stringContaining("needs the owner's lgtm at 0123456") });

  expect(fake.of('bun')).toStrictEqual([]);
});

test("it holds a bot's PR in hq to the same lgtm", async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ author: '{"author":{"login":"renovate","is_bot":true}}', prFiles: { code: 0, stdout: 'skills/kettle/SKILL.md\n', stderr: '' } });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'hq', pr: 7 })).rejects.toMatchObject({ code: 'merge_blocked', message: expect.stringContaining("needs the owner's lgtm at 0123456") });
});

test('it lets a PR in hq that changes only source files merge with no lgtm', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ prFiles: { code: 0, stdout: 'src/kettle.ts\nsrc/kettle.test.ts\n', stderr: '' } });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'hq', pr: 7 })).resolves.toStrictEqual({ mayMerge: true, reason: 'not a noslop repo: green CI is enough', reviewed: false });
});

test('it refuses a PR in hq that moves a skill out of skills/', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ prFiles: { code: 0, stdout: 'attic/SKILL.md\tskills/kettle/SKILL.md\n', stderr: '' } });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'hq', pr: 7 })).rejects.toMatchObject({ code: 'merge_blocked', message: expect.stringContaining('owner-held files (skills/kettle/SKILL.md)') });
});

test('it refuses a PR in hq-private that changes a start prompt with no lgtm at its head', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ prFiles: { code: 0, stdout: 'skills/kettle/references/session-prompt.md\n', stderr: '' } });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'hq-private', pr: 7 })).rejects.toMatchObject({ code: 'merge_blocked', message: "the PR changes owner-held files (skills/kettle/references/session-prompt.md) and needs the owner's lgtm at 0123456: hq pr answer hq-private 7 lgtm, from the console" });
});

test('it refuses a chat lgtm on a PR in hq-private', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ prFiles: { code: 0, stdout: 'skills/kettle/references/session-prompt.md\n', stderr: '' } });
  recordPRAnswer(ctx.db, { repo: 'hq-private', pr: 7, answer: 'lgtm', head: FAKE_FULL_SHA, source: 'chat:kettle-1', note: null, actor: 'z-kettle' });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'hq-private', pr: 7 })).rejects.toMatchObject({ code: 'merge_blocked' });
});

test('it refuses an lgtm at an older head on a PR in hq-private', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ prFiles: { code: 0, stdout: 'skills/kettle/references/session-prompt.md\n', stderr: '' } });
  recordPRAnswer(ctx.db, { repo: 'hq-private', pr: 7, answer: 'lgtm', head: 'f00dfeedf00dfeedf00dfeedf00dfeedf00dfeed', source: 'call:kettle-3', note: null, actor: 'z-kettle' });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'hq-private', pr: 7 })).rejects.toMatchObject({ code: 'merge_blocked' });
});

test("it passes a PR in hq-private that changes a start prompt once the owner's call lgtm is at its head", async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ prFiles: { code: 0, stdout: 'skills/kettle/references/session-prompt.md\n', stderr: '' } });
  recordPRAnswer(ctx.db, { repo: 'hq-private', pr: 7, answer: 'lgtm', head: FAKE_FULL_SHA, source: 'call:kettle-3', note: null, actor: 'z-kettle' });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'hq-private', pr: 7 })).resolves.toMatchObject({ mayMerge: true });
});

test('it lets a PR in hq-private that changes only source files merge with no lgtm', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ prFiles: { code: 0, stdout: 'src/kettle.ts\n', stderr: '' } });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'hq-private', pr: 7 })).resolves.toMatchObject({ mayMerge: true });
});

test.each(['grants/kettle.json', 'docs/sessions.md', 'docs/sessions/kettle.md', 'session-prompt.md'])('it holds %s in hq-private', async (path) => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ prFiles: { code: 0, stdout: `${path}\n`, stderr: '' } });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'hq-private', pr: 7 })).rejects.toMatchObject({ code: 'merge_blocked', message: expect.stringContaining(`owner-held files (${path})`) });
});

test('it names the first three owner-held files and counts the rest', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ prFiles: { code: 0, stdout: 'skills/a/SKILL.md\nskills/b/SKILL.md\nskills/c/SKILL.md\nskills/d/SKILL.md\nfleet.json\n', stderr: '' } });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'hq', pr: 7 })).rejects.toMatchObject({ message: expect.stringContaining('owner-held files (skills/a/SKILL.md, skills/b/SKILL.md, skills/c/SKILL.md and 2 more)') });
});

test('it refuses a PR in hq whose changed files cannot be read', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ prFiles: { code: 1, stdout: '', stderr: 'gh: HTTP 502' } });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'hq', pr: 7 })).rejects.toMatchObject({ code: 'merge_blocked', message: expect.stringContaining("could not read the PR's changed files from GitHub") });
});

test('it refuses a PR in hq that lists as many files as GitHub gives', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ prFiles: { code: 0, stdout: Array.from({ length: 3000 }, (_, index) => `src/kettle-${index}.ts\n`).join(''), stderr: '' } });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'hq', pr: 7 })).rejects.toMatchObject({ code: 'merge_blocked', message: expect.stringContaining("GitHub's limit") });
});

test('it refuses a PR in hq whose head moved after the lgtm check', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ prFiles: { code: 0, stdout: 'skills/kettle/SKILL.md\n', stderr: '' }, prHead: { code: 0, stdout: JSON.stringify({ headRefOid: 'f00dfeedf00dfeedf00dfeedf00dfeedf00dfeed' }), stderr: '' } });
  recordPRAnswer(ctx.db, { repo: 'hq', pr: 7, answer: 'lgtm', head: FAKE_FULL_SHA, source: 'console:kettle-2', note: null, actor: 'z-kettle' });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'hq', pr: 7 })).rejects.toMatchObject({ code: 'merge_blocked', message: expect.stringContaining('head moved') });
});

test('it reads no changed files for a repo with no owner-held paths', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner();

  await checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 });

  expect(fake.lines().filter((line) => line.includes('/files?'))).toStrictEqual([]);
});

test('it holds a PR in zgeoff/hq given with its owner, and none in another owner\'s hq', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ prFiles: { code: 0, stdout: 'skills/kettle/SKILL.md\n', stderr: '' } });

  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'zgeoff/hq', pr: 7 })).rejects.toMatchObject({ code: 'merge_blocked' });
  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'teapot/hq', pr: 7 })).resolves.toMatchObject({ mayMerge: true });
});
