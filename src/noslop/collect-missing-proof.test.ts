import { expect, test } from 'bun:test';
import { collectMissingProof } from './collect-missing-proof.ts';

test('it finds nothing missing when all three lines are ticked and both declined findings are listed', () => {
  const body = ['## Checks', '', '- [x] Second opinion (Codex, high): 2 fixed, 1 declined', '- [x] chex prose, links and skill: cleared', '- [x] Cold read: 6 fixed, 1 declined', '- [x] Deslop: 3 edits', '', 'Declined:', '', '- Second opinion: the timer should use a monotonic clock. Filed GEO-9997.', '- Cold read: the opening never says what the agent hands back. Filed GEO-9996.'].join('\n');

  expect(collectMissingProof(body)).toStrictEqual([]);
});

test('it names a Deslop line that is unticked', () => {
  const body = ['## Checks', '', '- [x] chex prose, links and skill: cleared', '- [x] Cold read: 0 fixed, 0 declined', '- [ ] Deslop: 3 edits', '', 'Declined: none.'].join('\n');

  expect(collectMissingProof(body)).toStrictEqual([{ kind: 'line', line: 'Deslop' }]);
});

test('it reports a Declined list shorter than the ticked declined counts', () => {
  const body = ['## Checks', '', '- [x] chex prose, links and skill: cleared', '- [x] Cold read: 6 fixed, 2 declined', '- [x] Deslop: 3 edits', '', 'Declined:', '', '- Cold read: the opening is vague. Filed GEO-9996.'].join('\n');

  expect(collectMissingProof(body)).toStrictEqual([{ kind: 'declined', counted: 2, listed: 1 }]);
});

test('it ignores proof lines that sit only inside a code fence', () => {
  const body = ['## Checks', '', '```md', '- [x] chex prose, links and skill: cleared', '- [x] Cold read: 6 fixed, 1 declined', '- [x] Deslop: 3 edits', '```'].join('\n');

  expect(collectMissingProof(body)).toStrictEqual([
    { kind: 'line', line: 'chex prose, links and skill' },
    { kind: 'line', line: 'Cold read' },
    { kind: 'line', line: 'Deslop' },
  ]);
});

test('it accepts "Declined: none." with 0 declined', () => {
  const body = ['## Checks', '', '- [x] chex prose, links and skill: cleared', '- [x] Cold read: 4 fixed, 0 declined', '- [x] Deslop: 3 edits', '', 'Declined: none.'].join('\n');

  expect(collectMissingProof(body)).toStrictEqual([]);
});

test('it counts a nested bullet as a reason, not a finding', () => {
  const body = ['## Checks', '', '- [x] chex prose, links and skill: cleared', '- [x] Cold read: 3 fixed, 2 declined', '- [x] Deslop: 3 edits', '', 'Declined:', '', '- Cold read: the opening is vague.', '  - It is outside this PR; filed GEO-9996.'].join('\n');

  expect(collectMissingProof(body)).toStrictEqual([{ kind: 'declined', counted: 2, listed: 1 }]);
});

test('it rejects a FAILED chex line and malformed Cold read and Deslop lines', () => {
  const body = ['## Checks', '', '- [x] chex prose, links and skill: FAILED', '- [x] Cold read: some', '- [x] Deslop: lots', '', 'Declined: none.'].join('\n');

  expect(collectMissingProof(body)).toStrictEqual([
    { kind: 'line', line: 'chex prose, links and skill' },
    { kind: 'line', line: 'Cold read' },
    { kind: 'line', line: 'Deslop' },
  ]);
});

test('it counts the old placeholder line under Declined as no finding', () => {
  const body = ['## Checks', '', '- [x] chex prose, links and skill: cleared', '- [x] Cold read: 1 fixed, 1 declined', '- [x] Deslop: 3 edits', '', 'Declined:', '', '- [ ] <review>: <the finding>. <why not, or the issue it went to>'].join('\n');

  expect(collectMissingProof(body)).toStrictEqual([{ kind: 'declined', counted: 1, listed: 0 }]);
});

test("it counts the template's <review> placeholder under Declined as no finding", () => {
  const body = ['## Checks', '', '- [x] chex prose, links and skill: cleared', '- [x] Cold read: 1 fixed, 1 declined', '- [x] Deslop: 3 edits', '', 'Declined:', '', '- <review>: <the finding>. <why not, or the issue it went to>'].join('\n');

  expect(collectMissingProof(body)).toStrictEqual([{ kind: 'declined', counted: 1, listed: 0 }]);
});

test('it passes the filled Checks section from the decision record', () => {
  const body = [
    '## Checks',
    '',
    '- [x] Second opinion (Codex, high): 2 fixed, 1 declined',
    '- [x] chex prose, links and skill: cleared',
    '- [x] Cold read: 6 fixed, 1 declined',
    '- [x] Deslop: 3 edits',
    '',
    'Declined:',
    '',
    '- Second opinion: the timer should use a monotonic clock. The kettle firmware has none; filed GEO-9997.',
    '- Cold read: the opening never says what the agent hands back. That text is outside this PR; filed GEO-9996.',
  ].join('\n');

  expect(collectMissingProof(body)).toStrictEqual([]);
});

test('it reads a declined count followed by trailing spaces as listed in the line', () => {
  const body = ['## Checks', '', '- [x] chex prose, links and skill: cleared', '- [x] Cold read: 2 fixed, 1 declined   ', '- [x] Deslop: 3 edits', '', 'Declined:', '', '- Cold read: the opening is vague. Filed GEO-9996.'].join('\n');

  expect(collectMissingProof(body)).toStrictEqual([]);
});

test('it accepts a Cold read line that names its model', () => {
  const body = ['## Checks', '', '- [x] chex prose, links and skill: cleared', '- [x] Cold read (Codex): 2 fixed, 0 declined', '- [x] Deslop: 3 edits', '', 'Declined: none.'].join('\n');

  expect(collectMissingProof(body)).toStrictEqual([]);
});
