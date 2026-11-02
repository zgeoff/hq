import { expect, onTestFinished, test } from 'bun:test';
import { buildStubFindings } from '../../test/build-stub-findings.ts';
import { buildBotComment, buildCommentLines, buildOwnerComment } from '../../test/build-stub-pr-comments.ts';
import { createListedReview } from '../../test/create-listed-review.ts';
import { createStubNoslopEnv } from '../../test/create-stub-noslop-env.ts';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import { FAKE_FULL_SHA, buildFakeRunner } from '../../test/noslop-fake.ts';
import type { FakeRunner, FakeScript } from '../../test/noslop-fake.ts';
import { buildAcceptRiskScenario, buildReplyDrivenNoslop } from '../../test/build-stub-accept-risk.ts';
import type { Flags } from '../cli.ts';
import { checkMergeGate } from '../noslop/check-merge-gate.ts';
import { runPRCommand } from './run-pr-command.ts';

function setupTest() {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  createStubNoslopEnv(fresh.db);
  const scenario = buildAcceptRiskScenario();
  return {
    db: fresh.db,
    scenario,
    posts: (fake: ReturnType<typeof buildFakeRunner>): string[][] => fake.calls.map((call) => call.cmd).filter((cmd) => cmd[0] === 'gh' && cmd.includes('POST')),
    fake: (script: FakeScript) => buildFakeRunner(script),
    command: async (fake: ReturnType<typeof buildFakeRunner>, verb: string, rest: string[], given: Flags) => await runPRCommand({ run: fake.run, db: fresh.db, verb, rest, flags: given, actor: () => Promise.resolve('z-kettle'), readOwnerSession: () => Promise.resolve({ verdict: 'owner' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) }),
    accept: async (fake: Pick<FakeRunner, 'run'>, flagsGiven: Flags = scenario.flags) => await runPRCommand({ run: fake.run, db: fresh.db, verb: 'accept-risk', rest: ['widgets', '7', 'aaaaaaaaaaaaaaaa'], flags: flagsGiven, actor: () => Promise.resolve('z-kettle'), readOwnerSession: () => Promise.resolve({ verdict: 'owner' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) }),
    events: () => fresh.db.query("SELECT seq FROM events WHERE action = 'pr-accepted-risk'").all(),
  };
}

test('it records the risk, replies in the finding thread and sets noslop check', async () => {
  const ctx = setupTest();
  const fake = ctx.fake(ctx.scenario.thread);

  const out = await ctx.accept(fake);

  expect(ctx.posts(fake)).toStrictEqual([
    [
      'gh',
      'api',
      '-X',
      'POST',
      'repos/zgeoff/widgets/pulls/7/comments/501/replies',
      '-f',
      `body=aaaaaaaaaaaaaaaa accepted-risk ${ctx.scenario.note}\n\n${ctx.scenario.trailer}`,
      '--jq',
      '.html_url',
    ],
  ]);
  expect(out.data).toStrictEqual({
    acceptedRisk: {
      repo: 'widgets',
      pr: 7,
      finding: 'aaaaaaaaaaaaaaaa',
      source: 'chat:kettle-12',
      note: ctx.scenario.note,
      alreadyRecorded: false,
      event: 1,
      reply: 'posted',
      replyURL: ctx.scenario.replyURL,
      check: {
        conclusion: 'success',
        title: 'No findings need attention.',
        problem: null,
        open: [],
      },
    },
  });
  expect(out.text).toStrictEqual(
    [
      `Recorded the owner's acceptance of the risk of finding aaaaaaaaaaaaaaaa for widgets#7 as hq event 1 (chat:kettle-12): ${ctx.scenario.note}`,
      `Reply: posted at ${ctx.scenario.replyURL}`,
      'noslop check: pass (No findings need attention.)',
    ].join('\n'),
  );
  expect(fake.lines().filter((line) => line.includes(' check --pr '))).toStrictEqual([
    expect.stringContaining('check --pr 7 --repo zgeoff/widgets --json'),
  ]);
});

test('it posts an issue comment that starts with the finding id when no thread on the diff holds it', async () => {
  const ctx = setupTest();
  const fake = ctx.fake({ ...ctx.scenario.thread, reviewComments: buildCommentLines(), issueComments: buildCommentLines(buildBotComment(77, 'Outside the diff: kettle has no lid (aaaaaaaaaaaaaaaa)', ['aaaaaaaaaaaaaaaa'])) });

  const out = await ctx.accept(fake);

  expect(ctx.posts(fake)).toStrictEqual([
    [
      'gh',
      'api',
      '-X',
      'POST',
      'repos/zgeoff/widgets/issues/7/comments',
      '-f',
      `body=${ctx.scenario.issueBody}`,
      '--jq',
      '.html_url',
    ],
  ]);
  expect(out.data).toMatchObject({ acceptedRisk: { reply: 'posted', replyURL: ctx.scenario.replyURL } });
});

test('it answers only its own finding, on two id-led lines, when the issue comment holds two findings', async () => {
  const ctx = setupTest();
  const fake = ctx.fake({
    reviewComments: buildCommentLines(),
    issueComments: buildCommentLines(
      buildBotComment(77, 'Outside the diff: kettle has no lid (aaaaaaaaaaaaaaaa) and no spout (bbbbbbbbbbbbbbbb)', ['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb']),
    ),
  });

  await ctx.accept(fake);

  const body = ctx.posts(fake)[0]?.find((arg) => arg.startsWith('body=')) ?? '';
  const answerLines = body.slice('body='.length).split('\n\n')[0]?.split('\n');
  expect(answerLines).toStrictEqual([`aaaaaaaaaaaaaaaa accepted-risk ${ctx.scenario.note}`, `aaaaaaaaaaaaaaaa accepted-risk ${ctx.scenario.note}`]);
  expect(body).not.toContain('bbbbbbbbbbbbbbbb');
});

test('it fails clearly, keeping the record, when no noslop comment holds the finding', async () => {
  const ctx = setupTest();
  const fake = ctx.fake({ ...ctx.scenario.thread, reviewComments: buildCommentLines(buildBotComment(501, 'Another finding (bbbbbbbbbbbbbbbb)', ['bbbbbbbbbbbbbbbb'])), issueComments: buildCommentLines() });

  await expect(ctx.accept(fake)).rejects.toMatchObject({ code: 'not_found', message: expect.stringContaining('no noslop comment holds finding aaaaaaaaaaaaaaaa on zgeoff/widgets#7') });

  expect(ctx.posts(fake)).toStrictEqual([]);
  expect(ctx.events()).toStrictEqual([{ seq: 1 }]);
});

test('it ignores a human comment that mentions the finding id', async () => {
  const ctx = setupTest();
  const fake = ctx.fake({ ...ctx.scenario.thread, reviewComments: buildCommentLines(buildOwnerComment(12, null, 'What about aaaaaaaaaaaaaaaa?')), issueComments: buildCommentLines() });

  await expect(ctx.accept(fake)).rejects.toMatchObject({ code: 'not_found' });
});

test('it adds no second record and no second reply on a rerun, and says the record already stood', async () => {
  const ctx = setupTest();
  await ctx.accept(ctx.fake(ctx.scenario.thread));
  const rerun = ctx.fake({ ...ctx.scenario.thread, reviewComments: buildCommentLines(buildBotComment(501, 'Kettle never boils (aaaaaaaaaaaaaaaa)', ['aaaaaaaaaaaaaaaa']), buildOwnerComment(502, 501, `aaaaaaaaaaaaaaaa accepted-risk ${ctx.scenario.note}\n\n${ctx.scenario.trailer}`)) });

  const out = await ctx.accept(rerun, { source: 'chat:kettle-12', note: 'Another note.' });

  expect(ctx.events()).toStrictEqual([{ seq: 1 }]);
  expect(ctx.posts(rerun)).toStrictEqual([]);
  expect(out.data).toMatchObject({ acceptedRisk: { alreadyRecorded: true, event: 1, note: ctx.scenario.note, reply: 'already-posted', replyURL: 'https://github.com/zgeoff/widgets/pull/7#discussion_r502' } });
  expect(out.text.split('\n')[0]).toStrictEqual(`The owner's acceptance of the risk of finding aaaaaaaaaaaaaaaa for widgets#7 already stood as hq event 1 (chat:kettle-12): ${ctx.scenario.note}`);
});

test('it posts the reply an earlier failed run left out, under the same record', async () => {
  const ctx = setupTest();
  await expect(ctx.accept(ctx.fake({ ...ctx.scenario.thread, ghPost: { code: 1, stdout: '', stderr: 'HTTP 502' } }))).rejects.toMatchObject({ code: 'reply_failed' });
  const rerun = ctx.fake(ctx.scenario.thread);

  const out = await ctx.accept(rerun);

  expect(ctx.events()).toStrictEqual([{ seq: 1 }]);
  expect(ctx.posts(rerun)).toHaveLength(1);
  expect(out.data).toMatchObject({ acceptedRisk: { alreadyRecorded: true, reply: 'posted' } });
});

test('it does not repeat a reply the owner posted in the issue comments', async () => {
  const ctx = setupTest();
  const fake = ctx.fake({ ...ctx.scenario.thread, reviewComments: buildCommentLines(), issueComments: buildCommentLines(buildBotComment(77, 'Outside the diff (aaaaaaaaaaaaaaaa)', ['aaaaaaaaaaaaaaaa']), buildOwnerComment(78, null, `aaaaaaaaaaaaaaaa accepted-risk ${ctx.scenario.note}`)) });

  const out = await ctx.accept(fake);

  expect(ctx.posts(fake)).toStrictEqual([]);
  expect(out.data).toMatchObject({ acceptedRisk: { reply: 'already-posted' } });
});

test('it keeps the record, exits with the reply text and where it goes, and leaves the check alone when the post fails', async () => {
  const ctx = setupTest();
  const fake = ctx.fake({ ...ctx.scenario.thread, ghPost: { code: 1, stdout: '', stderr: 'HTTP 502' } });

  const failure = await ctx.accept(fake).catch((error: unknown) => error);

  const message = failure instanceof Error ? failure.message : '';
  expect(failure).toMatchObject({
    code: 'reply_failed',
    data: {
      acceptedRisk: {
        event: 1,
        reply: 'not-posted',
        replyText: `aaaaaaaaaaaaaaaa accepted-risk ${ctx.scenario.note}\n\n${ctx.scenario.trailer}`,
      },
    },
  });
  expect(message).toContain(`the thread of the finding's comment ${ctx.scenario.threadURL}`);
  expect(message).toContain(`aaaaaaaaaaaaaaaa accepted-risk ${ctx.scenario.note}\n\n${ctx.scenario.trailer}`);
  expect(message).toContain("the merge gate stays shut until both the reply and noslop's check exist");
  expect(ctx.events()).toStrictEqual([{ seq: 1 }]);
  expect(fake.lines().filter((line) => line.includes(' check --pr '))).toStrictEqual([]);
});

test('it keeps the record and the posted reply, and exits non-zero, when noslop cannot set its check', async () => {
  const ctx = setupTest();
  const fake = ctx.fake({ ...ctx.scenario.thread, noslopCheck: { code: 1, stdout: '', stderr: 'bad credentials' } });

  await expect(ctx.accept(fake)).rejects.toMatchObject({ code: 'check_failed', message: expect.stringContaining('noslop\'s check was not set'), data: { acceptedRisk: { event: 1, reply: 'posted', replyURL: ctx.scenario.replyURL } } });

  expect(ctx.events()).toStrictEqual([{ seq: 1 }]);
});

test('it exits 0 and names the first problem when the check still fails over other findings', async () => {
  const ctx = setupTest();
  const failing = JSON.stringify({ conclusion: 'failure', title: '1 finding needs attention', summary: '', open: [{ id: 'bbbbbbbbbbbbbbbb', title: 'Lid untested', reason: 'no reply yet' }] });
  const fake = ctx.fake({ ...ctx.scenario.thread, noslopCheck: { code: 0, stdout: failing, stderr: '' } });

  const out = await ctx.accept(fake);

  expect(out.data).toMatchObject({ acceptedRisk: { check: { conclusion: 'failure', title: '1 finding needs attention', problem: 'bbbbbbbbbbbbbbbb: no reply yet', open: [{ id: 'bbbbbbbbbbbbbbbb', reason: 'no reply yet' }] } } });
  expect(out.text.split('\n')[2]).toStrictEqual('noslop check: still failing (1 finding needs attention); first problem: bbbbbbbbbbbbbbbb: no reply yet; open findings: bbbbbbbbbbbbbbbb. Other findings or checks are open, so the merge gate may stay shut until they clear; this is not an error of accept-risk.');
});

test('it fails, keeping the record, when the check still lists the accepted finding as open', async () => {
  const ctx = setupTest();
  const failing = JSON.stringify({ conclusion: 'failure', title: '1 finding needs attention', summary: '', open: [{ id: 'aaaaaaaaaaaaaaaa', title: 'Kettle never boils', reason: 'author lacks admin permission' }] });
  const fake = ctx.fake({ ...ctx.scenario.thread, noslopCheck: { code: 0, stdout: failing, stderr: '' } });

  await expect(ctx.accept(fake)).rejects.toMatchObject({ code: 'check_failed', message: expect.stringContaining('still lists finding aaaaaaaaaaaaaaaa as open: author lacks admin permission'), data: { acceptedRisk: { event: 1, reply: 'posted' } } });

  expect(ctx.events()).toStrictEqual([{ seq: 1 }]);
});

test('it answers only its own finding in a comment that folds two findings, and posts again for the second', async () => {
  const ctx = setupTest();
  const folded = buildBotComment(501, 'Two problems (aaaaaaaaaaaaaaaa) (bbbbbbbbbbbbbbbb)', ['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb']);
  const first = ctx.fake({ ...ctx.scenario.thread, reviewComments: buildCommentLines(folded) });
  await ctx.accept(first);
  const second = ctx.fake({ ...ctx.scenario.thread, reviewComments: buildCommentLines(folded, buildOwnerComment(502, 501, `aaaaaaaaaaaaaaaa accepted-risk ${ctx.scenario.note}\n\n${ctx.scenario.trailer}`)) });

  const out = await ctx.command(second, 'accept-risk', ['widgets', '7', 'bbbbbbbbbbbbbbbb'], { source: 'chat:kettle-12', note: 'The spout is cosmetic.' });

  expect(ctx.posts(first)).toStrictEqual([['gh', 'api', '-X', 'POST', 'repos/zgeoff/widgets/pulls/7/comments/501/replies', '-f', `body=aaaaaaaaaaaaaaaa accepted-risk ${ctx.scenario.note}\n\n${ctx.scenario.trailer}`, '--jq', '.html_url']]);
  expect(ctx.posts(second)).toStrictEqual([['gh', 'api', '-X', 'POST', 'repos/zgeoff/widgets/pulls/7/comments/501/replies', '-f', expect.stringContaining('bbbbbbbbbbbbbbbb accepted-risk The spout is cosmetic.\n\n'), '--jq', '.html_url']]);
  expect(out.data).toMatchObject({ acceptedRisk: { finding: 'bbbbbbbbbbbbbbbb', reply: 'posted' } });
});

test('it refuses a note with a newline and records nothing', async () => {
  const ctx = setupTest();
  const fake = ctx.fake(ctx.scenario.thread);

  await expect(ctx.accept(fake, { source: 'chat:kettle-12', note: 'First line.\nSecond line.' })).rejects.toMatchObject({ code: 'bad_args' });

  expect(ctx.events()).toStrictEqual([]);
  expect(ctx.posts(fake)).toStrictEqual([]);
});

test('it lets the merge gate pass a PR whose only open finding the owner accepted, with no reply posted by hand', async () => {
  const ctx = setupTest();
  createListedReview(ctx.db, { repo: 'widgets', pr: 7, head: FAKE_FULL_SHA });
  const noslop = buildReplyDrivenNoslop(ctx.scenario.thread);
  await expect(checkMergeGate({ run: noslop.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).rejects.toMatchObject({ code: 'merge_blocked' });

  await ctx.accept(noslop);

  await expect(checkMergeGate({ run: noslop.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).resolves.toMatchObject({ mayMerge: true });
});

test('it leaves one record when two runs accept the same finding at once', async () => {
  const ctx = setupTest();

  await Promise.all([ctx.accept(ctx.fake(ctx.scenario.thread)), ctx.accept(ctx.fake(ctx.scenario.thread))]);

  expect(ctx.events()).toStrictEqual([{ seq: 1 }]);
});

test('it shows each accepted risk with its finding, source, event and the state noslop gives it, in text and json', async () => {
  const ctx = setupTest();
  ctx.db.query("INSERT INTO pr_status (repo, pr, head, updated_at) VALUES ('widgets', 7, ?, '2026-10-14T01:00:00Z')").run(FAKE_FULL_SHA);
  await ctx.accept(ctx.fake(ctx.scenario.thread));
  const fake = ctx.fake({ ...ctx.scenario.thread, noslopFindings: buildStubFindings('accepted-risk') });

  const out = await ctx.command(fake, 'status', ['widgets', '7'], {});

  expect(out.data).toMatchObject({
    pr: {
      acceptedRisks: [
        {
          finding: 'aaaaaaaaaaaaaaaa',
          source: 'chat:kettle-12',
          note: ctx.scenario.note,
          event: 1,
          noslopState: 'accepted-risk',
        },
      ],
    },
  });
  expect(out.text).toContain('accepted risk aaaaaaaaaaaaaaaa (chat:kettle-12, event 1): noslop reads accepted-risk');
});

test('it shows an accepted risk of a PR with no record, and the state noslop gives it', async () => {
  const ctx = setupTest();
  await ctx.accept(ctx.fake(ctx.scenario.thread));
  const fake = ctx.fake({ ...ctx.scenario.thread, noslopFindings: buildStubFindings('open') });

  const out = await ctx.command(fake, 'status', ['widgets', '7'], {});

  expect(out.data).toStrictEqual({ pr: null, acceptedRisks: [{ finding: 'aaaaaaaaaaaaaaaa', source: 'chat:kettle-12', note: ctx.scenario.note, event: 1, noslopState: 'open' }] });
  expect(out.text).toStrictEqual('No record for widgets#7.\naccepted risk aaaaaaaaaaaaaaaa (chat:kettle-12, event 1): noslop reads open');
});

test('it shows no state and the error when noslop findings cannot be read, and does not fail status', async () => {
  const ctx = setupTest();
  ctx.db.query("INSERT INTO pr_status (repo, pr, head, updated_at) VALUES ('widgets', 7, ?, '2026-10-14T01:00:00Z')").run(FAKE_FULL_SHA);
  await ctx.accept(ctx.fake(ctx.scenario.thread));
  const fake = ctx.fake({ ...ctx.scenario.thread, noslopFindings: { code: 1, stdout: '', stderr: 'bad credentials' } });

  const out = await ctx.command(fake, 'status', ['widgets', '7'], {});

  expect(out.data).toMatchObject({
    pr: {
      acceptedRisks: [
        {
          finding: 'aaaaaaaaaaaaaaaa',
          event: 1,
          noslopState: null,
          noslopError: expect.stringContaining('bad credentials'),
        },
      ],
    },
  });
  expect(out.text).toContain(
    "accepted risk aaaaaaaaaaaaaaaa (chat:kettle-12, event 1): noslop's state could not be read (noslop gave no findings",
  );
});

test('it reads no findings and shows an empty list when the PR holds no accepted risk', async () => {
  const ctx = setupTest();
  ctx.db.query("INSERT INTO pr_status (repo, pr, head, updated_at) VALUES ('widgets', 7, ?, '2026-10-14T01:00:00Z')").run(FAKE_FULL_SHA);
  const fake = ctx.fake(ctx.scenario.thread);

  const out = await ctx.command(fake, 'status', ['widgets', '7'], {});

  expect(out.data).toMatchObject({ pr: { acceptedRisks: [] } });
  expect(fake.lines().filter((line) => line.includes(' findings '))).toStrictEqual([]);
  expect(out.text).not.toContain('accepted risk');
});

test('it refuses a finding id that is not 16 lowercase hex characters, and records nothing', async () => {
  const ctx = setupTest();
  const fake = ctx.fake(ctx.scenario.thread);

  await expect(ctx.command(fake, 'accept-risk', ['widgets', '7', 'aaaa'], { source: 'chat:kettle-12', note: ctx.scenario.note })).rejects.toMatchObject({ code: 'bad_args', message: 'finding id "aaaa" must be noslop\'s 16 lowercase hex characters, as its comment shows them' });

  expect(ctx.events()).toStrictEqual([]);
  expect(ctx.posts(fake)).toStrictEqual([]);
});

test('it does not reply in a thread whose text names the finding but whose marker names another', async () => {
  const ctx = setupTest();
  const fake = ctx.fake({ ...ctx.scenario.thread, reviewComments: buildCommentLines(buildBotComment(501, 'Unlike aaaaaaaaaaaaaaaa, the spout leaks', ['bbbbbbbbbbbbbbbb'])), issueComments: buildCommentLines() });

  await expect(ctx.accept(fake)).rejects.toMatchObject({ code: 'not_found' });

  expect(ctx.posts(fake)).toStrictEqual([]);
});

test('it gives both reply forms when the thread comments cannot be read, since the form is not known yet', async () => {
  const ctx = setupTest();
  const fake = ctx.fake({ ...ctx.scenario.thread, reviewComments: { code: 1, stdout: '', stderr: 'HTTP 502' } });

  const failure = await ctx.accept(fake).catch((error: unknown) => error);

  const message = failure instanceof Error ? failure.message : '';
  expect(failure).toMatchObject({ code: 'reply_failed' });
  expect(message).toContain(`On the finding's thread:\n\naaaaaaaaaaaaaaaa accepted-risk ${ctx.scenario.note}\n\n${ctx.scenario.trailer}`);
  expect(message).toContain(`Or, for a finding outside the diff, as an issue comment:\n\n${ctx.scenario.issueBody}`);
  expect(ctx.events()).toStrictEqual([{ seq: 1 }]);
});

test('it reads no noslop findings when hq pr next prints the record of a PR that holds an accepted risk', async () => {
  const ctx = setupTest();
  ctx.db.query("INSERT INTO pr_status (repo, pr, head, updated_at) VALUES ('widgets', 7, ?, '2026-10-14T01:00:00Z')").run(FAKE_FULL_SHA);
  await ctx.accept(ctx.fake(ctx.scenario.thread));
  const fake = ctx.fake({ ...ctx.scenario.thread, noslopFindings: buildStubFindings('accepted-risk') });

  const out = await ctx.command(fake, 'next', ['widgets', '7'], { clear: true });

  expect(out.data).toMatchObject({ pr: { acceptedRisks: [{ finding: 'aaaaaaaaaaaaaaaa', event: 1, noslopState: null, noslopError: 'not read by this command: hq pr status reads it' }] } });
  expect(fake.lines().filter((line) => line.includes(' findings --pr '))).toStrictEqual([]);
});
