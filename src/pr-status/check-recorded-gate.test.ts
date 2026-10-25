import { expect, onTestFinished, spyOn, test } from 'bun:test';
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
import { checkRecordedGate } from './check-recorded-gate.ts';
import { recordPRAnswer } from './record-pr-answer.ts';

function setupTest() {
  const base = mkdtempSync(join(tmpdir(), 'hq-pr-gate-')),
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

test('it records a passing gate with the head it read, and returns the gate outcome unchanged', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  createListedReview(ctx.db, { repo: 'widgets', pr: 7, head: FAKE_FULL_SHA });

  await expect(checkRecordedGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).resolves.toStrictEqual({ mayMerge: true, reason: `noslop findings: none open; CI green at ${FAKE_FULL_SHA.slice(0, 7)}`, reviewed: true });

  expect(ctx.db.query('SELECT repo, pr, head, gate, gate_head FROM pr_status').all()).toStrictEqual([{ repo: 'widgets', pr: 7, head: FAKE_FULL_SHA, gate: 'pass', gate_head: FAKE_FULL_SHA }]);
});

test('it records a blocked gate as a fail and still throws the same merge_blocked error', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopFindings: buildStubFindings('open') });
  createListedReview(ctx.db, { repo: 'widgets', pr: 7, head: FAKE_FULL_SHA });

  await expect(checkRecordedGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).rejects.toMatchObject({ code: 'merge_blocked', message: '1 noslop finding is open: aaaa' });

  expect(ctx.db.query('SELECT gate, gate_head FROM pr_status').all()).toStrictEqual([{ gate: 'fail', gate_head: FAKE_FULL_SHA }]);
});

test('it records a gate that red CI blocks as a fail at the head it read', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ prFacts: buildStubGateFacts({ head: FAKE_FULL_SHA, checks: [{ __typename: 'CheckRun', name: 'test', status: 'COMPLETED', conclusion: 'FAILURE' }] }) });
  createListedReview(ctx.db, { repo: 'widgets', pr: 7, head: FAKE_FULL_SHA });

  await expect(checkRecordedGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).rejects.toMatchObject({ code: 'merge_blocked' });

  expect(ctx.db.query('SELECT gate, gate_head FROM pr_status').all()).toStrictEqual([{ gate: 'fail', gate_head: FAKE_FULL_SHA }]);
});

test('it records gate none with no head for a PR whose repo is not on the noslop list', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();

  await expect(checkRecordedGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).resolves.toStrictEqual({ mayMerge: true, reason: 'not a noslop repo: CI green at 0123456', reviewed: false });

  expect(ctx.db.query('SELECT repo, pr, head, gate, gate_head FROM pr_status').all()).toStrictEqual([{ repo: 'widgets', pr: 7, head: null, gate: 'none', gate_head: null }]);
});

test("it records gate none with no head for a bot's PR, which noslop never reviews", async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ author: '{"author":{"login":"renovate","is_bot":true}}' });
  setMeta(ctx.db, 'noslop', JSON.stringify({ repos: ['widgets'], sha: '0123456789abcdef0123456789abcdef01234567' }));

  await expect(checkRecordedGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).resolves.toStrictEqual({ mayMerge: true, reason: 'bot PR: CI green at 0123456', reviewed: false });

  expect(ctx.db.query('SELECT repo, pr, head, gate, gate_head FROM pr_status').all()).toStrictEqual([{ repo: 'widgets', pr: 7, head: null, gate: 'none', gate_head: null }]);
});

test('it records a noslop gate, not gate none, for a listed repo\'s PR that has a Codex review file', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  setMeta(ctx.db, 'noslop', JSON.stringify({ repos: ['widgets'], sha: '0123456789abcdef0123456789abcdef01234567' }));
  writeFileSync(join(ctx.base, 'widgets7-review.md'), 'No findings.\n');

  await expect(checkRecordedGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).resolves.toStrictEqual({ mayMerge: true, reason: `noslop findings: none open; CI green at ${FAKE_FULL_SHA.slice(0, 7)}`, reviewed: true });

  expect(ctx.db.query('SELECT repo, pr, head, gate, gate_head FROM pr_status').all()).toStrictEqual([{ repo: 'widgets', pr: 7, head: FAKE_FULL_SHA, gate: 'pass', gate_head: FAKE_FULL_SHA }]);
});

test('it stores nothing for a PR of an owner other than zgeoff', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  setMeta(ctx.db, 'noslop', JSON.stringify({ repos: ['kettle-co/widgets'], sha: '0123456789abcdef0123456789abcdef01234567' }));

  await expect(checkRecordedGate({ run: fake.run, db: ctx.db, rawRepo: 'kettle-co/widgets', pr: 7 })).resolves.toMatchObject({ mayMerge: true, reason: 'not a noslop repo: CI green at 0123456' });

  expect(ctx.db.query('SELECT COUNT(*) AS n FROM pr_status').get()).toStrictEqual({ n: 0 });
});

test('it leaves the gate passing when the record cannot be written', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner(),
    stderr = spyOn(console, 'error').mockImplementation(() => {});
  onTestFinished(() => stderr.mockRestore());
  createListedReview(ctx.db, { repo: 'widgets', pr: 7, head: FAKE_FULL_SHA });
  ctx.db.exec('DROP TABLE pr_status');

  await expect(checkRecordedGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).resolves.toMatchObject({ mayMerge: true, reviewed: true });
});

test('it warns on stderr when the record cannot be written', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner(),
    stderr = spyOn(console, 'error').mockImplementation(() => {});
  onTestFinished(() => stderr.mockRestore());
  createListedReview(ctx.db, { repo: 'widgets', pr: 7, head: FAKE_FULL_SHA });
  ctx.db.exec('DROP TABLE pr_status');

  await checkRecordedGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 });

  expect(stderr.mock.calls).toStrictEqual([["hq: warning: the gate's pass was not written to the PR record of widgets#7: no such table: pr_status"]]);
});

test('it throws the same merge_blocked error when a blocked gate cannot be recorded', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopFindings: buildStubFindings('open') }),
    stderr = spyOn(console, 'error').mockImplementation(() => {});
  onTestFinished(() => stderr.mockRestore());
  createListedReview(ctx.db, { repo: 'widgets', pr: 7, head: FAKE_FULL_SHA });
  ctx.db.exec('DROP TABLE pr_status');

  await expect(checkRecordedGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).rejects.toMatchObject({ code: 'merge_blocked', message: '1 noslop finding is open: aaaa' });
});

test('it keeps the last seen head when a gate none follows a recorded head', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  createListedReview(ctx.db, { repo: 'widgets', pr: 7, head: FAKE_FULL_SHA });
  await checkRecordedGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 });
  setMeta(ctx.db, 'noslop', JSON.stringify({ repos: [], sha: '0123456789abcdef0123456789abcdef01234567' }));

  await checkRecordedGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 });

  expect(ctx.db.query('SELECT head, gate, gate_head FROM pr_status').all()).toStrictEqual([{ head: FAKE_FULL_SHA, gate: 'none', gate_head: null }]);
});

test('it records a fail at the head it read when a reviewed PR changes an owner-held file without the lgtm', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ prFiles: { code: 0, stdout: 'skills/kettle/SKILL.md\n', stderr: '' } });
  createListedReview(ctx.db, { repo: 'hq', pr: 7, head: FAKE_FULL_SHA });

  await expect(checkRecordedGate({ run: fake.run, db: ctx.db, rawRepo: 'hq', pr: 7 })).rejects.toMatchObject({ code: 'merge_blocked', message: expect.stringContaining("needs the owner's lgtm at 0123456") });

  expect(ctx.db.query('SELECT gate, gate_head FROM pr_status').all()).toStrictEqual([{ gate: 'fail', gate_head: FAKE_FULL_SHA }]);
});

test('it records no gate when an unreviewed PR changes an owner-held file without the lgtm', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ prFiles: { code: 0, stdout: 'skills/kettle/SKILL.md\n', stderr: '' } });

  await expect(checkRecordedGate({ run: fake.run, db: ctx.db, rawRepo: 'hq', pr: 7 })).rejects.toMatchObject({ code: 'merge_blocked' });

  expect(ctx.db.query('SELECT COUNT(*) AS count FROM pr_status').get()).toStrictEqual({ count: 0 });
});

test("it records gate none for an unreviewed PR that changes an owner-held file under the owner's lgtm", async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ prFiles: { code: 0, stdout: 'skills/kettle/SKILL.md\n', stderr: '' } });
  recordPRAnswer(ctx.db, { repo: 'hq', pr: 7, answer: 'lgtm', head: FAKE_FULL_SHA, source: 'console:kettle-2', note: null, actor: 'z-kettle' });

  await expect(checkRecordedGate({ run: fake.run, db: ctx.db, rawRepo: 'hq', pr: 7 })).resolves.toStrictEqual({ mayMerge: true, reason: 'not a noslop repo: CI green at 0123456', reviewed: false });

  expect(ctx.db.query('SELECT gate, gate_head FROM pr_status').all()).toStrictEqual([{ gate: 'none', gate_head: null }]);
});
