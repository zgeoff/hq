import type { RunResult } from '../src/runner/types.ts';

interface StubComment {
  id: number;
  replyTo: number | null;
  login: string;
  type: string;
  body: string;
  url: string;
}

export function buildBotComment(id: number, text: string, findings: readonly string[]): StubComment {
  const markers = findings.map((finding) => `<!-- noslop:finding {"id":"${finding}","severity":"P2"} -->`);
  return { id, replyTo: null, login: 'noslop-review[bot]', type: 'Bot', body: [text, ...markers].join('\n\n'), url: `https://github.com/zgeoff/widgets/pull/7#discussion_r${id}` };
}

export function buildOwnerComment(id: number, replyTo: number | null, body: string): StubComment {
  return { id, replyTo, login: 'zgeoff', type: 'User', body, url: `https://github.com/zgeoff/widgets/pull/7#discussion_r${id}` };
}

export function buildCommentLines(...comments: StubComment[]): RunResult {
  return { code: 0, stdout: comments.map((comment) => `${JSON.stringify(comment)}\n`).join(''), stderr: '' };
}
