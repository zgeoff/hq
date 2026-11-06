import { expect, test } from 'bun:test';
import { decideHandedInHold } from './decide-handed-in-hold.ts';
import type { HandedInHold, IssueRead } from './decide-handed-in-hold.ts';

test.each<[string, string | null, IssueRead | null, HandedInHold]>([
  ['hands in a run that waits on nothing', null, null, { hold: false }],
  ['hands in a run whose waits_on is blank', '  ', null, { hold: false }],
  ['holds a run that waits on parts while a Scope box is open', 'free slots for the widgets#12 part', { ok: true, description: '## Scope\n\n- [x] kettle: done\n- [ ] widgets: next part\n' }, { hold: true, why: 'open-boxes', openBoxes: 1 }],
  ['hands in a run that waits on parts once every Scope box is ticked', 'free slots for the widgets#12 part', { ok: true, description: '## Scope\n\n- [x] kettle: done\n- [X] widgets: done\n' }, { hold: false }],
  ['hands in a run that waits on parts when the issue has no Scope section', 'free slots for the widgets#12 part', { ok: true, description: '## Goal\n\n- [ ] not a scope box\n' }, { hold: false }],
  ['holds a run that waits on parts when the Linear read failed', 'free slots for the widgets#12 part', { ok: false, reason: 'Linear answered 500' }, { hold: true, why: 'read-failed', reason: 'Linear answered 500' }],
])('it %s', (_name, waitsOn, read, expected) => {
  expect(decideHandedInHold(waitsOn, read)).toStrictEqual(expected);
});
