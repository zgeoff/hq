import { expect, test } from 'bun:test';
import { compareLineChange } from './compare-line-change.ts';

test.each([
  ['a version in prose', 'Needs bun 1.3.4 or newer.', 'Needs bun 1.4.0 or newer.'],
  ['a v-prefixed pre-release version', 'Pin kettle to v1.0.0-rc.1.', 'Pin kettle to 1.0.0.'],
  ['a version in a code span', 'Install `kettle@1.2.3` first.', 'Install `kettle@1.2.4` first.'],
  ['a code span that is only a version', 'Use `1.2.3`.', 'Use `2.0.0`.'],
  ['table padding', '| Name | Boils |', '| Name   | Boils |'],
  ['table delimiter padding', '|---|:--:|', '|-----|:----:|'],
  ['a version in a table cell', '| bun | 1.3.4 |', '| bun   | 1.4.0 |'],
])('it accepts %s', (_label, oldLine, newLine) => {
  expect(compareLineChange('skills/kettle/SKILL.md', oldLine, newLine)).toStrictEqual({ ok: true, moves: [] });
});

test('it claims a moved link target, resolved from the file', () => {
  expect(compareLineChange('skills/kettle/SKILL.md', 'See [descaling](refs/descale.md#steps).', 'See [descaling](refs/care/descale.md#steps).')).toStrictEqual({ ok: true, moves: [[['skills/kettle/refs/descale.md', 'skills/kettle/refs/care/descale.md']]] });
});

test('it claims a moved reference definition', () => {
  expect(compareLineChange('skills/kettle/SKILL.md', '[care]: refs/descale.md', '[care]: refs/care.md')).toStrictEqual({ ok: true, moves: [[['skills/kettle/refs/descale.md', 'skills/kettle/refs/care.md']]] });
});

test('it claims a moved path in a code span, resolved both ways', () => {
  expect(compareLineChange('skills/kettle/SKILL.md', 'Edit `docs/old.md`.', 'Edit `docs/new.md`.')).toStrictEqual({
    ok: true,
    moves: [
      [
        ['skills/kettle/docs/old.md', 'skills/kettle/docs/new.md'],
        ['docs/old.md', 'docs/new.md'],
      ],
    ],
  });
});

test('it claims a moved target inside a table cell', () => {
  expect(compareLineChange('skills/kettle/SKILL.md', '| care | [steps](refs/a.md) |', '| care | [steps](refs/b.md) |')).toStrictEqual({ ok: true, moves: [[['skills/kettle/refs/a.md', 'skills/kettle/refs/b.md']]] });
});

test.each([
  ['a reworded sentence', 'Boil the water.', 'Heat the water.', 'the words of the line changed'],
  ['a changed word beside a moved link', 'See [care](refs/a.md).', 'Read [care](refs/b.md).', 'the words of the line changed'],
  ['a changed link label', 'See [care](refs/a.md).', 'See [upkeep](refs/a.md).', 'the words of the line changed'],
  ['a changed link anchor', 'See [care](refs/a.md#one).', 'See [care](refs/a.md#two).', 'a link anchor changed'],
  ['an external link', 'See [care](https://example.com/a).', 'See [care](https://example.com/b).', 'a link target changed that is not a path in the repo'],
  ['a spacing change outside a table', 'Boil the water.', 'Boil  the water.', 'the words of the line changed'],
  ['an indent change outside a table', '- Boil the water.', '  - Boil the water.', 'the words of the line changed'],
  ['a code span that is not a path or version', 'Run `boil`.', 'Run `steam`.', 'code in a code span changed'],
  ['a changed table cell', '| kettle | boils |', '| teapot | boils |', 'a table cell changed'],
  ['a table row with another cell count', '| kettle | boils |', '| kettle | boils | fast |', 'a table row has a different number of cells'],
  ['a table row indented differently', '| kettle | boils |', '  | kettle | boils |', 'a table row was indented differently'],
  ['a number that is not a version', 'Wait 10 minutes.', 'Wait 12 minutes.', 'the words of the line changed'],
  ['a two-part number in prose', 'Wait 1.5 seconds.', 'Wait 30.0 seconds.', 'the words of the line changed'],
  ['an IP address', 'Bind to 127.0.0.1 only.', 'Bind to 0.0.0.0 only.', 'the words of the line changed'],
  ['a two-part number in a code span', 'Run `kettle --max 1.5`.', 'Run `kettle --max 99.0`.', 'code in a code span changed'],
  ['a duration with a word suffix', 'Run a 1.2-hour soak.', 'Run a 9.9-day soak.', 'the words of the line changed'],
  ['a target that leaves the repo', '[care](../../../a.md)', '[care](../../../b.md)', 'a target points outside the repo'],
])('it refuses %s', (_label, oldLine, newLine, reason) => {
  expect(compareLineChange('skills/kettle/SKILL.md', oldLine, newLine)).toStrictEqual({ ok: false, reason });
});

test('it names a changed table cell as the reason', () => {
  expect(compareLineChange('skills/kettle/SKILL.md', '| kettle | boils |', '| teapot | boils |')).toStrictEqual({ ok: false, reason: 'a table cell changed' });
});
