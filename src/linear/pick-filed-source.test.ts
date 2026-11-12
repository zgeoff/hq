import { expect, test } from 'bun:test';
import { pickFiledSource } from './pick-filed-source.ts';

test.each([
  ['stu mark', 'Filed by stu.\n\n## Outcome\n\nDescale.', false, 'stu'],
  ['retired z-stu mark, forwarded to stu', 'Filed by z-stu.\n\n## Outcome\n\nDescale.', false, 'stu'],
  ['z-triage mark', 'Filed by z-triage.\n\n## Outcome\n\nDescale.', false, 'z-triage'],
  ['z-review mark', 'Filed by z-review.\n\n## Outcome\n\nDescale.', false, 'z-review'],
  ['z-delivery mark', 'Filed by z-delivery.\n\n## Outcome\n\nDescale.', false, 'z-delivery'],
  ['z-release mark', 'Filed by z-release.\n\n## Outcome\n\nDescale.', false, 'z-release'],
  ['z-qa mark', 'Filed by z-qa.\n\n## Outcome\n\nDescale.', false, 'z-qa'],
  ['mark after a blank first line', '\nFiled by z-qa.\n\n## Outcome\n\nDescale.', false, 'z-qa'],
  ['mark after the first heading, not read', '## Outcome\n\nFiled by z-qa.', false, 'owner'],
  ['non-z name', 'Filed by builder-7.\n\n## Outcome\n\nDescale.', false, 'agent'],
  ['mark without the period, not read', 'Filed by stu\n\n## Outcome\n\nDescale.', false, 'owner'],
  ['lower-case mark, not read', 'filed by stu.\n\n## Outcome\n\nDescale.', false, 'owner'],
  ['first mark only', 'Filed by z-qa.\nFiled by stu.\n\n## Outcome', false, 'z-qa'],
  ['design link over a mark', 'From design https://linear.app/kettle/document/plan-1a2b, decisions 2\nFiled by z-triage.\n\n## Outcome', false, 'design'],
  ['mark over a found-by-agent line', 'Filed by stu.\nFound by the GEO-1 agent.\n\n## Outcome', false, 'stu'],
  ['indented mark, not read', '  Filed by stu.\n\n## Outcome\n\nDescale.', false, 'owner'],
  ['mark with a CRLF line end', 'Filed by stu.\r\n\r\n## Outcome', false, 'stu'],
  ['bot creator with a mark', 'Filed by stu.\n\n## Outcome\n\nDescale.', true, 'bot'],
  ['no mark', 'Descale the kettle.', false, 'owner'],
] as const)('it picks the source for a %s', (_name, description, isBotCreator, expected) => {
  expect<string>(pickFiledSource({ title: 'Invented kettle work', description, labels: [], isBotCreator })).toBe(expected);
});

test('it picks the marked session over a live check label', () => {
  expect<string>(pickFiledSource({ title: 'Invented kettle work', description: 'Filed by z-qa.\n\n## Outcome\n\nDescale.', labels: ['live check'], isBotCreator: false })).toBe('z-qa');
});
