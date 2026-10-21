import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { HELP } from '../src/cli.ts';
import { checkSkills } from '../src/skillcheck/check-skills.ts';
import { check } from '../src/skillcheck/check.ts';
import { parseHelp } from '../src/skillcheck/parse-help.ts';
import { usesIn } from '../src/skillcheck/uses-in.ts';

const help = `hq 0.0.0: an invented help.

  hq kettle [--hot]                         boil
  hq kettle fill --litres N | empty         fill or empty it
  hq teapot steep <leaf> [--minutes N] | pour <cup>   tea
  hq cup|mug add --size S|M (--note TEXT | --note-file F|-)
                 [--handle LEFT]
  hq tray [list|count] [--limit N]          the tray
  hq timer <minutes>   a positional, no verbs`;

const uses = (body: string) => check(parseHelp(help), usesIn('skills/x/SKILL.md', body));
const why = (body: string) => uses(body).map((p) => `${p.use.line}: ${p.why}`);

test('the help text becomes forms: alternations, optional verbs, continuation lines', () => {
  const f = parseHelp(help).map((x) => `${x.top} ${x.verb ?? '-'} ${[...x.flags].sort().join(',')}${x.positional ? ' +pos' : ''}`);
  expect(f).toEqual([
    'kettle - --hot',
    'kettle fill --litres',
    'kettle empty ',
    'teapot steep --minutes +pos',
    'teapot pour  +pos',
    'cup add --handle,--note,--note-file,--size',
    'mug add --handle,--note,--note-file,--size',
    'tray - --limit',
    'tray list --limit',
    'tray count --limit',
    'timer -  +pos',
  ]);
});

test('lines that match the help pass', () => {
  expect(
    why(
      [
        'Run `hq kettle --hot`, then `hq kettle fill --litres 2`.',
        '`hq teapot steep <leaf name> --minutes 4` and `hq teapot pour <cup>`',
        '`hq mug add --size M --note "a --fake flag in quotes" --handle LEFT --json`',
        '`hq tray` `hq tray count --limit 3` `hq timer 5` `hq kettle --by z-invented`',
        '```sh',
        'hq kettle empty',
        '$ hq tray list',
        '```',
        'Prose that says hq kettle --cold outside code is not checked.',
      ].join('\n'),
    ),
  ).toEqual([]);
});

test('a dropped flag, a renamed verb and an unknown command fail, naming the line', () => {
  expect(why('ok\n`hq kettle fill --gallons 2`')).toEqual(['2: hq kettle fill has no --gallons in hq --help']);
  expect(why('`hq kettle refill`')).toEqual(['1: hq kettle refill: no such command in hq --help (hq kettle takes fill, empty)']);
  expect(why('`hq saucer`')).toEqual(['1: hq saucer is not a command in hq --help']);
  expect(why('`hq teapot pour <cup> --minutes 3`')).toEqual(['1: hq teapot pour has no --minutes in hq --help']); // a flag of another verb
  expect(why('```\nhq tray --hot\n```')).toEqual(['2: hq tray has no --hot in hq --help']);
});

test('the skills in this repo match the current hq --help', () => {
  const r = checkSkills(join(import.meta.dir, '..'), HELP);
  expect(r.problems.map((p) => `${p.use.file}:${p.use.line}: ${p.why}`)).toEqual([]);
  expect(r.uses).toBeGreaterThan(30);
});

test('renaming a flag a skill uses fails the real check', () => {
  const r = checkSkills(join(import.meta.dir, '..'), HELP.replace('hq news read --upto N', 'hq news read --up-to N'));
  expect(r.problems.map((p) => p.why)).toContain('hq news read has no --upto in hq --help');
});

test.each([
  ['`hq kettle --Hot`', '1: hq kettle has no --Hot in hq --help'],
  ['`hq kettle --hot_water`', '1: hq kettle has no --hot_water in hq --help'],
  ['`hq kettle fill --litres 2 --litres-max 3`', '1: hq kettle fill has no --litres-max in hq --help'],
  ['`hq kettle fill --hot`', '1: hq kettle fill has no --hot in hq --help'],
  ['`hq kettle Fill`', '1: hq kettle Fill: no such command in hq --help (hq kettle takes fill, empty)'],
  ['`hq Kettle`', '1: hq Kettle is not a command in hq --help'],
  ['`hq tray list --limit 3 --all`', '1: hq tray list has no --all in hq --help'],
  ['`hq cup remove`', '1: hq cup remove: no such command in hq --help (hq cup takes add)'],
])('the hostile line %p fails', (line, problem) => expect(why(line)).toEqual([problem]));

test.each([
  ["`hq mug add --size S --note 'say --dry-run first'`"],
  ['`hq mug add --size S --note "say --dry-run first"`'],
  ['`hq teapot steep <a --flag-looking leaf>`'],
])('a quoted or placeholder --word is a value: %p', (line) => expect(why(line)).toEqual([]));
