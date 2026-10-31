import { expect, test } from 'bun:test';
import { buildPlaybook } from './build-playbook.ts';

test('it names the lower-case playbook file of a type and a gh command pinned to the sha', () => {
  const sha = 'a'.repeat(40);

  expect(buildPlaybook('Bug', sha)).toStrictEqual({
    type: 'bug',
    path: 'agent-kit/playbooks/bug.md',
    command: `gh api 'repos/zgeoff/hq/contents/agent-kit/playbooks/bug.md?ref=${sha}' -H 'Accept: application/vnd.github.raw'`,
  });
});
