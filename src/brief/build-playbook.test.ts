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

test('it gives an Improvement the feature playbook', () => {
  const sha = 'a'.repeat(40);

  expect(buildPlaybook('Improvement', sha)).toStrictEqual({
    type: 'feature',
    path: 'agent-kit/playbooks/feature.md',
    command: `gh api 'repos/zgeoff/hq/contents/agent-kit/playbooks/feature.md?ref=${sha}' -H 'Accept: application/vnd.github.raw'`,
  });
});
