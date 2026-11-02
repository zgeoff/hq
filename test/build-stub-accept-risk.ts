import type { Flags } from '../src/cli.ts';
import type { Runner } from '../src/runner/types.ts';
import { buildStubFindings } from './build-stub-findings.ts';
import { buildBotComment, buildCommentLines } from './build-stub-pr-comments.ts';
import { buildFakeRunner } from './noslop-fake.ts';
import type { FakeScript } from './noslop-fake.ts';

export interface AcceptRiskScenario {
  note: string;
  trailer: string;
  flags: Flags;
  issueBody: string;
  threadURL: string;
  replyURL: string;

  thread: FakeScript;
}

export function buildAcceptRiskScenario(): AcceptRiskScenario {
  const note = 'The lid is cosmetic.';
  const trailer = 'Recorded in hq as event 1 (source chat:kettle-12) by hq pr accept-risk.';
  return {
    note,
    trailer,
    flags: { source: 'chat:kettle-12', note },
    issueBody: `aaaaaaaaaaaaaaaa accepted-risk ${note}\naaaaaaaaaaaaaaaa accepted-risk ${note}\n\n${trailer}`,
    threadURL: 'https://github.com/zgeoff/widgets/pull/7#discussion_r501',
    replyURL: 'https://github.com/zgeoff/widgets/pull/7#discussion_r9000',
    thread: { reviewComments: buildCommentLines(buildBotComment(501, 'Kettle never boils (aaaaaaaaaaaaaaaa)', ['aaaaaaaaaaaaaaaa'])) },
  };
}

export function buildReplyDrivenNoslop(thread: FakeScript): { run: Runner } {
  const failing = { code: 0, stdout: `${JSON.stringify({ id: 9001, name: 'noslop', app: 'noslop-review', status: 'completed', conclusion: 'failure', title: '1 finding holds no valid disposition', completedAt: '2026-10-14T01:00:05Z' })}\n`, stderr: '' };
  const before = buildFakeRunner({ ...thread, noslopFindings: buildStubFindings('open'), noslopChecks: failing });
  const after = buildFakeRunner({ ...thread, noslopFindings: buildStubFindings('accepted-risk') });
  const seen = { replied: false, checked: false };
  const run: Runner = (cmd, opts) => {
    const line = cmd.join(' ');
    seen.replied ||= line.startsWith('gh api -X POST') && line.includes('accepted-risk');
    seen.checked ||= seen.replied && line.includes(' check --pr ');
    const answered = line.includes('check-runs?check_name=noslop') ? seen.checked : seen.replied;
    return (answered ? after : before).run(cmd, opts);
  };
  return { run };
}
