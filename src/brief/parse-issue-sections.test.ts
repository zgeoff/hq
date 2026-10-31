import { expect, test } from 'bun:test';
import { parseIssueSections } from './parse-issue-sections.ts';

test('it splits a description at its headings, each section holding its heading line', () => {
  const sections = parseIssueSections('## Outcome\n\nBoil the water.\n\n## Scope\n\nIn: the lid.\nOut: none stated.\n');

  expect(sections).toStrictEqual([
    { name: 'Outcome', text: '## Outcome\n\nBoil the water.' },
    { name: 'Scope', text: '## Scope\n\nIn: the lid.\nOut: none stated.' },
  ]);
});

test('it keeps a lower heading inside the section above it and lists it as a section too', () => {
  const sections = parseIssueSections('## Scope\n\nIn: the lid.\n\n### Lid\n\nRound.\n\n## Acceptance\n\n- [ ] boils\n');

  expect(sections).toStrictEqual([
    { name: 'Scope', text: '## Scope\n\nIn: the lid.\n\n### Lid\n\nRound.' },
    { name: 'Lid', text: '### Lid\n\nRound.' },
    { name: 'Acceptance', text: '## Acceptance\n\n- [ ] boils' },
  ]);
});

test('it reads a heading line inside a code fence as text', () => {
  const sections = parseIssueSections('## Context\n\n```md\n## Not a heading\n```\n\n## Scope\n\nIn: x.\n');

  expect(sections.map((section) => section.name)).toStrictEqual(['Context', 'Scope']);
});

test('it gives no section for text with no heading', () => {
  expect(parseIssueSections('Just a kettle.')).toStrictEqual([]);
});

test('it keeps a heading of a three-backtick example inside a four-backtick fence as text', () => {
  const sections = parseIssueSections('## Scope\n\n````md\n```md\n## Example heading\n```\n````\n\nIn: the lid.\n\n## Acceptance\n\n- [ ] boils\n');

  expect(sections).toStrictEqual([
    { name: 'Scope', text: '## Scope\n\n````md\n```md\n## Example heading\n```\n````\n\nIn: the lid.' },
    { name: 'Acceptance', text: '## Acceptance\n\n- [ ] boils' },
  ]);
});

test.each([
  ['a tilde fence closed by backticks', '~~~\n## Lid\n```\n## Spout\n~~~'],
  ['a backtick fence closed by a shorter run', '````\n## Lid\n```\n## Spout\n````'],
  ['a closing line with an info string', '```\n## Lid\n```md\n## Spout\n```'],
  ['a fence indented by up to three spaces', '   ```\n## Lid\n  ```'],
])('it reads no heading inside %s', (_, fenced) => {
  expect(parseIssueSections(`## Scope\n\n${fenced}\n\n## Acceptance\n\nBoils.`).map((section) => section.name)).toStrictEqual(['Scope', 'Acceptance']);
});
