import { expect, test } from 'bun:test';
import { buildBotComment, buildCommentLines, buildOwnerComment } from './build-stub-pr-comments.ts';

test('it prints each comment as one JSON line', () => {
  const lines = buildCommentLines(buildBotComment(5, 'Kettle never boils (aaaa)'), buildOwnerComment(6, 5, 'accepted-risk Fine.'));

  expect(lines.stdout.split('\n').map((line) => (line === '' ? null : JSON.parse(line)))).toStrictEqual([
    { id: 5, replyTo: null, login: 'noslop-review[bot]', type: 'Bot', body: 'Kettle never boils (aaaa)', url: 'https://github.com/zgeoff/widgets/pull/7#discussion_r5' },
    { id: 6, replyTo: 5, login: 'zgeoff', type: 'User', body: 'accepted-risk Fine.', url: 'https://github.com/zgeoff/widgets/pull/7#discussion_r6' },
    null,
  ]);
});
