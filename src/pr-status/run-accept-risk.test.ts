import { expect, onTestFinished, test } from 'bun:test';
import { buildStubFindings } from '../../test/build-stub-findings.ts';
import { buildBotComment, buildCommentLines, buildOwnerComment } from '../../test/build-stub-pr-comments.ts';
import { createListedReview } from '../../test/create-listed-review.ts';
import { createStubNoslopEnv } from '../../test/create-stub-noslop-env.ts';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import { FAKE_FULL_SHA, buildFakeRunner } from '../../test/noslop-fake.ts';
import type { FakeScript } from '../../test/noslop-fake.ts';
import type { Flags } from '../cli.ts';
import { checkMergeGate } from '../noslop/check-merge-gate.ts';
import { runPRCommand } from './run-pr-command.ts';

function setupTest() {
  const note = 'The lid is cosmetic.';
  const trailer = 'Recorded in hq as event 1 (source chat:kettle-12) by hq pr accept-risk.';
  const flags: Flags = { source: 'chat:kettle-12', note };
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  createStubNoslopEnv(fresh.db);
  const base: FakeScript = { reviewComments: buildCommentLines(buildBotComment(501, 'Kettle never boils (aaaa)')) };
  return {
    db: fresh.db,
    note,
    trailer,
    threadURL: 'https://github.com/zgeoff/widgets/pull/7#discussion_r501',
    replyURL: 'https://github.com/zgeoff/widgets/pull/7#discussion_r9000',
    posts: (fake: ReturnType<typeof buildFakeRunner>): string[][] => fake.calls.map((call) => call.cmd).filter((cmd) => cmd[0] === 'gh' && cmd.includes('POST')),
    fake: (script: FakeScript = {}) => buildFakeRunner({ ...base, ...script }),
    command: async (fake: ReturnType<typeof buildFakeRunner>, verb: string, rest: string[], given: Flags) => await runPRCommand({ run: fake.run, db: fresh.db, verb, rest, flags: given, actor: () => Promise.resolve('z-kettle'), readOwnerSession: () => Promise.resolve({ verdict: 'owner' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) }),
    accept: async (fake: ReturnType<typeof buildFakeRunner>, flagsGiven: Flags = flags) => await runPRCommand({ run: fake.run, db: fresh.db, verb: 'accept-risk', rest: ['widgets', '7', 'aaaa'], flags: flagsGiven, actor: () => Promise.resolve('z-kettle'), readOwnerSession: () => Promise.resolve({ verdict: 'owner' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) }),
    events: () => fresh.db.query("SELECT seq FROM events WHERE action = 'pr-accepted-risk'").all(),
  };
}

test('it records the risk, replies in the finding thread and sets noslop check', async () => {
  const ctx = setupTest();
  const fake = ctx.fake();

  const out = await ctx.accept(fake);

  expect(ctx.posts(fake)).toStrictEqual([['gh', 'api', '-X', 'POST', 'repos/zgeoff/widgets/pulls/7/comments/501/replies', '-f', `body=accepted-risk ${ctx.note}\n\n${ctx.trailer}`, '--jq', '.html_url']]);
  expect(out.data).toStrictEqual({ acceptedRisk: { repo: 'widgets', pr: 7, finding: 'aaaa', source: 'chat:kettle-12', note: ctx.note, alreadyRecorded: false, event: 1, reply: 'posted', replyURL: ctx.replyURL, check: { conclusion: 'success', title: 'No findings need attention.', problem: null } } });
  expect(out.text).toStrictEqual([`Recorded the owner's acceptance of the risk of finding aaaa for widgets#7 as hq event 1 (chat:kettle-12): ${ctx.note}`, `Reply: posted at ${ctx.replyURL}`, 'noslop check: pass (No findings need attention.)'].join('\n'));
  expect(fake.lines().filter((line) => line.includes(' check --pr '))).toStrictEqual([expect.stringContaining('check --pr 7 --repo zgeoff/widgets --json')]);
});

test('it posts an issue comment that starts with the finding id when no thread on the diff holds it', async () => {
  const ctx = setupTest();
  const fake = ctx.fake({ reviewComments: buildCommentLines(), issueComments: buildCommentLines(buildBotComment(77, 'Outside the diff: kettle has no lid (aaaa)')) });

  const out = await ctx.accept(fake);

  expect(ctx.posts(fake)).toStrictEqual([['gh', 'api', '-X', 'POST', 'repos/zgeoff/widgets/issues/7/comments', '-f', `body=aaaa accepted-risk ${ctx.note}\n\n${ctx.trailer}`, '--jq', '.html_url']]);
  expect(out.data).toMatchObject({ acceptedRisk: { reply: 'posted', replyURL: ctx.replyURL } });
});

test('it fails clearly, keeping the record, when no noslop comment holds the finding', async () => {
  const ctx = setupTest();
  const fake = ctx.fake({ reviewComments: buildCommentLines(buildBotComment(501, 'Another finding (bbbb)')), issueComments: buildCommentLines() });

  await expect(ctx.accept(fake)).rejects.toMatchObject({ code: 'not_found', message: expect.stringContaining('no noslop comment holds finding aaaa on zgeoff/widgets#7') });

  expect(ctx.posts(fake)).toStrictEqual([]);
  expect(ctx.events()).toStrictEqual([{ seq: 1 }]);
});

test('it ignores a human comment that mentions the finding id', async () => {
  const ctx = setupTest();
  const fake = ctx.fake({ reviewComments: buildCommentLines(buildOwnerComment(12, null, 'What about aaaa?')), issueComments: buildCommentLines() });

  await expect(ctx.accept(fake)).rejects.toMatchObject({ code: 'not_found' });
});

test('it adds no second record and no second reply on a rerun, and says the record already stood', async () => {
  const ctx = setupTest();
  await ctx.accept(ctx.fake());
  const rerun = ctx.fake({ reviewComments: buildCommentLines(buildBotComment(501, 'Kettle never boils (aaaa)'), buildOwnerComment(502, 501, `accepted-risk ${ctx.note}\n\n${ctx.trailer}`)) });

  const out = await ctx.accept(rerun, { source: 'chat:kettle-12', note: 'Another note.' });

  expect(ctx.events()).toStrictEqual([{ seq: 1 }]);
  expect(ctx.posts(rerun)).toStrictEqual([]);
  expect(out.data).toMatchObject({ acceptedRisk: { alreadyRecorded: true, event: 1, note: ctx.note, reply: 'already-posted', replyURL: 'https://github.com/zgeoff/widgets/pull/7#discussion_r502' } });
  expect(out.text.split('\n')[0]).toStrictEqual(`The owner's acceptance of the risk of finding aaaa for widgets#7 already stood as hq event 1 (chat:kettle-12): ${ctx.note}`);
});

test('it posts the reply an earlier failed run left out, under the same record', async () => {
  const ctx = setupTest();
  await expect(ctx.accept(ctx.fake({ ghPost: { code: 1, stdout: '', stderr: 'HTTP 502' } }))).rejects.toMatchObject({ code: 'reply_failed' });
  const rerun = ctx.fake();

  const out = await ctx.accept(rerun);

  expect(ctx.events()).toStrictEqual([{ seq: 1 }]);
  expect(ctx.posts(rerun)).toHaveLength(1);
  expect(out.data).toMatchObject({ acceptedRisk: { alreadyRecorded: true, reply: 'posted' } });
});

test('it does not repeat a reply the owner posted in the issue comments', async () => {
  const ctx = setupTest();
  const fake = ctx.fake({ reviewComments: buildCommentLines(), issueComments: buildCommentLines(buildBotComment(77, 'Outside the diff (aaaa)'), buildOwnerComment(78, null, `aaaa accepted-risk ${ctx.note}`)) });

  const out = await ctx.accept(fake);

  expect(ctx.posts(fake)).toStrictEqual([]);
  expect(out.data).toMatchObject({ acceptedRisk: { reply: 'already-posted' } });
});

test('it keeps the record, exits with the reply text and where it goes, and leaves the check alone when the post fails', async () => {
  const ctx = setupTest();
  const fake = ctx.fake({ ghPost: { code: 1, stdout: '', stderr: 'HTTP 502' } });

  const failure = await ctx.accept(fake).catch((error: unknown) => error);

  const message = failure instanceof Error ? failure.message : '';
  expect(failure).toMatchObject({ code: 'reply_failed', data: { acceptedRisk: { event: 1, reply: 'not-posted', replyText: `accepted-risk ${ctx.note}\n\n${ctx.trailer}` } } });
  expect(message).toContain(`the thread of the finding's comment ${ctx.threadURL}`);
  expect(message).toContain(`accepted-risk ${ctx.note}\n\n${ctx.trailer}`);
  expect(message).toContain("the merge gate stays shut until both the reply and noslop's check exist");
  expect(ctx.events()).toStrictEqual([{ seq: 1 }]);
  expect(fake.lines().filter((line) => line.includes(' check --pr '))).toStrictEqual([]);
});

test('it keeps the record and the posted reply, and exits non-zero, when noslop cannot set its check', async () => {
  const ctx = setupTest();
  const fake = ctx.fake({ noslopCheck: { code: 1, stdout: '', stderr: 'bad credentials' } });

  await expect(ctx.accept(fake)).rejects.toMatchObject({ code: 'check_failed', message: expect.stringContaining('noslop\'s check was not set'), data: { acceptedRisk: { event: 1, reply: 'posted', replyURL: ctx.replyURL } } });

  expect(ctx.events()).toStrictEqual([{ seq: 1 }]);
});

test('it exits 0 and names the first problem when the check still fails over other findings', async () => {
  const ctx = setupTest();
  const failing = JSON.stringify({ conclusion: 'failure', title: '1 finding needs attention', summary: '', open: [{ id: 'bbbb', title: 'Lid untested', reason: 'no reply yet' }] });
  const fake = ctx.fake({ noslopCheck: { code: 0, stdout: failing, stderr: '' } });

  const out = await ctx.accept(fake);

  expect(out.data).toMatchObject({ acceptedRisk: { check: { conclusion: 'failure', title: '1 finding needs attention', problem: 'bbbb: no reply yet' } } });
  expect(out.text.split('\n')[2]).toStrictEqual('noslop check: still failing (1 finding needs attention); first problem: bbbb: no reply yet. Other findings or checks are open, so the merge gate may stay shut until they clear; this is not an error of accept-risk.');
});

test('it refuses a note with a newline and records nothing', async () => {
  const ctx = setupTest();
  const fake = ctx.fake();

  await expect(ctx.accept(fake, { source: 'chat:kettle-12', note: 'First line.\nSecond line.' })).rejects.toMatchObject({ code: 'bad_args' });

  expect(ctx.events()).toStrictEqual([]);
  expect(ctx.posts(fake)).toStrictEqual([]);
});

test('it lets the merge gate pass a PR whose only open finding the owner accepted, with no reply posted by hand', async () => {
  const ctx = setupTest();
  createListedReview(ctx.db, { repo: 'widgets', pr: 7, head: FAKE_FULL_SHA });
  const fake = ctx.fake({ noslopFindings: buildStubFindings('open') });
  await expect(checkMergeGate({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).rejects.toMatchObject({ code: 'merge_blocked' });
  const accepting = ctx.fake({ noslopFindings: buildStubFindings('accepted-risk') });

  await ctx.accept(accepting);

  await expect(checkMergeGate({ run: accepting.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).resolves.toMatchObject({ mayMerge: true });
});

test('it shows each accepted risk with its finding, source, event and the state noslop gives it, in text and json', async () => {
  const ctx = setupTest();
  ctx.db.query("INSERT INTO pr_status (repo, pr, head, updated_at) VALUES ('widgets', 7, ?, '2026-10-14T01:00:00Z')").run(FAKE_FULL_SHA);
  await ctx.accept(ctx.fake());
  const fake = ctx.fake({ noslopFindings: buildStubFindings('accepted-risk') });

  const out = await ctx.command(fake, 'status', ['widgets', '7'], {});

  expect(out.data).toMatchObject({ pr: { acceptedRisks: [{ finding: 'aaaa', source: 'chat:kettle-12', note: ctx.note, event: 1, noslopState: 'accepted-risk' }] } });
  expect(out.text).toContain('accepted risk aaaa (chat:kettle-12, event 1): noslop reads accepted-risk');
});

test('it shows an accepted risk of a PR with no record, and the state noslop gives it', async () => {
  const ctx = setupTest();
  await ctx.accept(ctx.fake());
  const fake = ctx.fake({ noslopFindings: buildStubFindings('open') });

  const out = await ctx.command(fake, 'status', ['widgets', '7'], {});

  expect(out.data).toStrictEqual({ pr: null, acceptedRisks: [{ finding: 'aaaa', source: 'chat:kettle-12', note: ctx.note, event: 1, noslopState: 'open' }] });
  expect(out.text).toStrictEqual('No record for widgets#7.\naccepted risk aaaa (chat:kettle-12, event 1): noslop reads open');
});

test('it shows no state and the error when noslop findings cannot be read, and does not fail status', async () => {
  const ctx = setupTest();
  ctx.db.query("INSERT INTO pr_status (repo, pr, head, updated_at) VALUES ('widgets', 7, ?, '2026-10-14T01:00:00Z')").run(FAKE_FULL_SHA);
  await ctx.accept(ctx.fake());
  const fake = ctx.fake({ noslopFindings: { code: 1, stdout: '', stderr: 'bad credentials' } });

  const out = await ctx.command(fake, 'status', ['widgets', '7'], {});

  expect(out.data).toMatchObject({ pr: { acceptedRisks: [{ finding: 'aaaa', event: 1, noslopState: null, noslopError: expect.stringContaining('bad credentials') }] } });
  expect(out.text).toContain("accepted risk aaaa (chat:kettle-12, event 1): noslop's state could not be read (noslop gave no findings");
});

test('it reads no findings and shows an empty list when the PR holds no accepted risk', async () => {
  const ctx = setupTest();
  ctx.db.query("INSERT INTO pr_status (repo, pr, head, updated_at) VALUES ('widgets', 7, ?, '2026-10-14T01:00:00Z')").run(FAKE_FULL_SHA);
  const fake = ctx.fake();

  const out = await ctx.command(fake, 'status', ['widgets', '7'], {});

  expect(out.data).toMatchObject({ pr: { acceptedRisks: [] } });
  expect(fake.lines().filter((line) => line.includes(' findings '))).toStrictEqual([]);
  expect(out.text).not.toContain('accepted risk');
});
