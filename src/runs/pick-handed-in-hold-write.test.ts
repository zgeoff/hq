import { expect, test } from 'bun:test';
import type { StoredEvent } from '../read-events.ts';
import type { HandedInHold } from './decide-handed-in-hold.ts';
import { pickHandedInHoldWrite } from './pick-handed-in-hold-write.ts';
import type { HandedInHoldWrite } from './pick-handed-in-hold-write.ts';

test.each<{ $title: string; hold: HandedInHold; newest: StoredEvent | undefined; expected: HandedInHoldWrite }>([
  { $title: 'writes nothing for a run that is not held and never was', hold: { hold: false }, newest: undefined, expected: { write: 'none', line: null } },
  {
    $title: 'writes a release for a run no longer held whose newest event is a hold',
    hold: { hold: false },
    newest: { seq: 4, action: 'handed-in-held', actor: 'teapot-bot', at: '2026-09-02T10:00:00Z', data: '{"openBoxes":"gizmo: next","boxesHash":"b2"}' },
    expected: { write: 'released' },
  },
  {
    $title: 'writes nothing for a run no longer held that was already released',
    hold: { hold: false },
    newest: { seq: 5, action: 'handed-in-released', actor: 'teapot-bot', at: '2026-09-02T11:00:00Z', data: '{}' },
    expected: { write: 'none', line: null },
  },
  {
    $title: 'logs a failed read and writes no event',
    hold: { hold: true, why: 'read-failed', reason: 'Linear answered 502' },
    newest: { seq: 4, action: 'handed-in-held', actor: 'teapot-bot', at: '2026-09-02T10:00:00Z', data: '{"openBoxes":"gizmo: next","boxesHash":"b2"}' },
    expected: { write: 'none', line: 'handed-in held for GEO-8101: could not read its Linear Scope (Linear answered 502)' },
  },
  {
    $title: 'writes a hold and its line for a first hold',
    hold: { hold: true, why: 'open-boxes', boxes: ['gizmo: next'] },
    newest: undefined,
    expected: { write: 'held', data: { openBoxes: 'gizmo: next', boxesHash: expect.any(String) }, line: 'handed-in held for GEO-8101: it waits on more parts and its Linear Scope has open boxes: gizmo: next' },
  },
  {
    $title: 'writes a hold again after a release, even for the same boxes',
    hold: { hold: true, why: 'open-boxes', boxes: ['gizmo: next'] },
    newest: { seq: 5, action: 'handed-in-released', actor: 'teapot-bot', at: '2026-09-02T11:00:00Z', data: '{}' },
    expected: { write: 'held', data: { openBoxes: 'gizmo: next', boxesHash: expect.any(String) }, line: 'handed-in held for GEO-8101: it waits on more parts and its Linear Scope has open boxes: gizmo: next' },
  },
  {
    $title: 'writes a hold when the open boxes differ from the newest hold',
    hold: { hold: true, why: 'open-boxes', boxes: ['gizmo: next'] },
    newest: { seq: 4, action: 'handed-in-held', actor: 'teapot-bot', at: '2026-09-02T10:00:00Z', data: '{"openBoxes":"sprocket: later","boxesHash":"b2"}' },
    expected: { write: 'held', data: { openBoxes: 'gizmo: next', boxesHash: expect.any(String) }, line: 'handed-in held for GEO-8101: it waits on more parts and its Linear Scope has open boxes: gizmo: next' },
  },
  {
    $title: 'writes nothing when the newest hold has the hash of the same open boxes',
    hold: { hold: true, why: 'open-boxes', boxes: ['gizmo: next'] },
    newest: { seq: 4, action: 'handed-in-held', actor: 'teapot-bot', at: '2026-09-02T10:00:00Z', data: '{"openBoxes":"gizmo: next","boxesHash":"f60eb1b0e8315d0d6886cd45e2879dec4adce8f21f17c707a141380269673f27"}' },
    expected: { write: 'none', line: null },
  },
])('it $title', (row) => {
  expect(pickHandedInHoldWrite('GEO-8101', row.hold, row.newest)).toStrictEqual(row.expected);
});
