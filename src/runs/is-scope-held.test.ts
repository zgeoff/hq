import { expect, test } from 'bun:test';
import type { StoredEvent } from '../read-events.ts';
import { isScopeHeld } from './is-scope-held.ts';

test.each<{ $title: string; waitsOn: string | null; newest: StoredEvent | undefined; expected: boolean }>([
  {
    $title: 'holds a run that waits on parts when its newest Scope event is a hold',
    waitsOn: 'free slots for the gizmo#4 part',
    newest: { seq: 7, action: 'handed-in-held', actor: 'teapot-bot', at: '2026-09-02T10:00:00Z', data: '{"openBoxes":"gizmo: next","boxesHash":"a1"}' },
    expected: true,
  },
  {
    $title: 'releases a run whose newest Scope event is a release',
    waitsOn: 'free slots for the gizmo#4 part',
    newest: { seq: 9, action: 'handed-in-released', actor: 'teapot-bot', at: '2026-09-02T11:00:00Z', data: '{}' },
    expected: false,
  },
  { $title: 'releases a run that waits on parts with no Scope event', waitsOn: 'free slots for the gizmo#4 part', newest: undefined, expected: false },
  {
    $title: 'releases a run with no waits_on despite a hold event',
    waitsOn: null,
    newest: { seq: 7, action: 'handed-in-held', actor: 'teapot-bot', at: '2026-09-02T10:00:00Z', data: '{"openBoxes":"gizmo: next","boxesHash":"a1"}' },
    expected: false,
  },
  {
    $title: 'releases a run with a blank waits_on despite a hold event',
    waitsOn: '   ',
    newest: { seq: 7, action: 'handed-in-held', actor: 'teapot-bot', at: '2026-09-02T10:00:00Z', data: '{"openBoxes":"gizmo: next","boxesHash":"a1"}' },
    expected: false,
  },
])('it $title', (row) => {
  expect(isScopeHeld(row.waitsOn, row.newest)).toBe(row.expected);
});
