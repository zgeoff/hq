import type { RunResult } from '../src/runner/types.ts';

// A PR comment as hq reads it with gh api: invented, on zgeoff/widgets#7.
interface StubComment {
  id: number;
  replyTo: number | null;
  login: string;
  type: string;
  body: string;
  url: string;
}

// The noslop App's top-level comment, such as a finding's thread opener: its text, then one noslop
// finding marker for each finding it holds, as noslop writes them.
export function buildBotComment(id: number, text: string, findings: readonly string[]): StubComment {
  const markers = findings.map((finding) => `<!-- noslop:finding {"id":"${finding}","severity":"P2"} -->`);
  return { id, replyTo: null, login: 'noslop-review[bot]', type: 'Bot', body: [text, ...markers].join('\n\n'), url: `https://github.com/zgeoff/widgets/pull/7#discussion_r${id}` };
}

// A comment by the owner's login, a reply in a thread when replyTo names its opener.
export function buildOwnerComment(id: number, replyTo: number | null, body: string): StubComment {
  return { id, replyTo, login: 'zgeoff', type: 'User', body, url: `https://github.com/zgeoff/widgets/pull/7#discussion_r${id}` };
}

// What gh prints for the comments: one compact JSON object a line.
export function buildCommentLines(...comments: StubComment[]): RunResult {
  return { code: 0, stdout: comments.map((comment) => `${JSON.stringify(comment)}\n`).join(''), stderr: '' };
}
