import { expect, test } from 'bun:test';
import type { InstructionHoldFacts, InstructionHoldVerdict } from './pick-instruction-hold.ts';
import { pickInstructionHold } from './pick-instruction-hold.ts';


test.each<{ name: string; facts: InstructionHoldFacts; verdict: InstructionHoldVerdict }>([
  { name: "the owner's lgtm clears it before any diff", facts: { lgtm: true, bot: false, exempted: false, mechanicalRecorded: false, diff: { kind: 'unread' } }, verdict: { kind: 'clear' } },
  { name: 'a bot author clears it before any diff', facts: { lgtm: false, bot: true, exempted: false, mechanicalRecorded: false, diff: { kind: 'unread' } }, verdict: { kind: 'clear' } },
  { name: 'an exemption record clears it before any diff', facts: { lgtm: false, bot: false, exempted: true, mechanicalRecorded: false, diff: { kind: 'unread' } }, verdict: { kind: 'clear' } },
  { name: 'nothing cheap clears it, so the diff is needed', facts: { lgtm: false, bot: false, exempted: false, mechanicalRecorded: false, diff: { kind: 'unread' } }, verdict: { kind: 'needs-diff' } },
  { name: 'a mechanical record alone still needs the diff', facts: { lgtm: false, bot: false, exempted: false, mechanicalRecorded: true, diff: { kind: 'unread' } }, verdict: { kind: 'needs-diff' } },
  { name: 'an unreadable diff holds it', facts: { lgtm: false, bot: false, exempted: false, mechanicalRecorded: true, diff: { kind: 'failed', error: 'the head moved' } }, verdict: { kind: 'held', hint: 'hq could not read the diff to prove it: the head moved' } },
  { name: 'a formatting-only diff clears it with no record', facts: { lgtm: false, bot: false, exempted: false, mechanicalRecorded: false, diff: { kind: 'read', formattingOnly: true, proof: { pass: false, reason: 'AGENTS.md line 3: the words of the line changed' } } }, verdict: { kind: 'clear' } },
  { name: 'a proved diff with a record clears it', facts: { lgtm: false, bot: false, exempted: false, mechanicalRecorded: true, diff: { kind: 'read', formattingOnly: false, proof: { pass: true, files: ['AGENTS.md'], lines: 1 } } }, verdict: { kind: 'clear' } },
  { name: 'a proved diff with no record holds it for the record', facts: { lgtm: false, bot: false, exempted: false, mechanicalRecorded: false, diff: { kind: 'read', formattingOnly: false, proof: { pass: true, files: ['AGENTS.md'], lines: 1 } } }, verdict: { kind: 'held', hint: 'hq proves every held edit mechanical; z-review records that with hq pr mechanical' } },
  { name: 'a refused diff holds it, record or not', facts: { lgtm: false, bot: false, exempted: false, mechanicalRecorded: true, diff: { kind: 'read', formattingOnly: false, proof: { pass: false, reason: 'AGENTS.md line 3: the words of the line changed' } } }, verdict: { kind: 'held', hint: "hq does not prove the edits mechanical: AGENTS.md line 3: the words of the line changed (z-review's record at this head does not hold)" } },
  { name: 'a refused diff with no record holds it', facts: { lgtm: false, bot: false, exempted: false, mechanicalRecorded: false, diff: { kind: 'read', formattingOnly: false, proof: { pass: false, reason: 'AGENTS.md line 3: the words of the line changed' } } }, verdict: { kind: 'held', hint: 'hq does not prove the edits mechanical: AGENTS.md line 3: the words of the line changed' } },
])('$name', (row) => {
  expect(pickInstructionHold(row.facts)).toStrictEqual(row.verdict);
});
