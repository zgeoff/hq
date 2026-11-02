import { expect, test } from 'bun:test';
import { classifyTestScope } from './classify-test-scope.ts';

test.each([
  ['a doc', ['docs/kettle.md']],
  ['an agent-kit brief', ['agent-kit/kettle-brief.md']],
  ['a skill, whose lint steps run whatever the scope', ['skills/kettle/SKILL.md']],
  ['a synced skill reference', ['.claude/skills/kettle/references/boil.md']],
  ['the still-ask data', ['grants/still-ask.yaml']],
  ['docs and data together', ['README.md', 'grants/still-ask.yaml']],
])('it skips the tests on %s', (_name, paths) => {
  expect(classifyTestScope(paths)).toBe('skip');
});

test.each([
  ['no change', []],
  ['the doc a test reads', ['docs/skill-development/repo-facts.md']],
  ['fleet.json, which src imports', ['fleet.json']],
  ['lanes.json, which src imports', ['lanes.json']],
  ['package.json', ['package.json']],
  ['a workflow doc', ['.github/pull_request_template.md']],
  ['markdown a script test reads', ['skills/kettle/scripts/testdata/boil.md']],
  ['a fixture', ['scripts/fixtures/grants/docs/kettle.md']],
  ['a mock', ['mocks/kettle.md']],
  ['a skill script', ['skills/kettle/scripts/boil.sh']],
  ['a doc beside code', ['docs/kettle.md', 'src/kettle.ts']],
])('it runs the tests on %s', (_name, paths) => {
  expect(classifyTestScope(paths)).toBe('run');
});
