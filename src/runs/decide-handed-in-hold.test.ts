import { expect, test } from 'bun:test';
import { decideHandedInHold } from './decide-handed-in-hold.ts';
import type { HandedInHold, IssueRead } from './decide-handed-in-hold.ts';

test.each<{ $title: string; waitsOn: string | null; read: IssueRead | null; expected: HandedInHold }>([
  { $title: 'hands in a run that waits on nothing', waitsOn: null, read: null, expected: { hold: false } },
  { $title: 'hands in a run whose waits_on is blank', waitsOn: '  ', read: null, expected: { hold: false } },
  {
    $title: 'holds a run that waits on parts while a Scope box is open',
    waitsOn: 'free slots for the widgets#12 part',
    read: { ok: true, description: '## Scope\n\n- [x] kettle: done\n- [ ] widgets: next part\n' },
    expected: { hold: true, why: 'open-boxes', openBoxes: 'widgets: next part' },
  },
  {
    $title: 'hands in a run that waits on parts once every Scope box is ticked',
    waitsOn: 'free slots for the widgets#12 part',
    read: { ok: true, description: '## Scope\n\n- [x] kettle: done\n- [X] widgets: done\n' },
    expected: { hold: false },
  },
  {
    $title: 'hands in a run that waits on parts when the issue has no Scope section',
    waitsOn: 'free slots for the widgets#12 part',
    read: { ok: true, description: '## Goal\n\n- [ ] not a scope box\n' },
    expected: { hold: false },
  },
  {
    $title: 'holds a run that waits on parts when the Linear read failed',
    waitsOn: 'free slots for the widgets#12 part',
    read: { ok: false, reason: 'Linear answered 500' },
    expected: { hold: true, why: 'read-failed', reason: 'Linear answered 500' },
  },
  {
    $title: 'names every open Scope box, joined and capped at 300 characters',
    waitsOn: 'free slots for the widgets#12 part',
    read: { ok: true, description: `## Scope\n\n- [ ] a: ${'x'.repeat(200)}\n- [ ] b: ${'y'.repeat(200)}\n` },
    expected: { hold: true, why: 'open-boxes', openBoxes: `a: ${'x'.repeat(200)}; b: ${'y'.repeat(97)}`.slice(0, 300) },
  },
])('it $title', ({ waitsOn, read, expected }) => {
  expect(decideHandedInHold(waitsOn, read)).toStrictEqual(expected);
});
