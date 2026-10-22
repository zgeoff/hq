import { REFERENCE_MARK } from './reference-mark.ts';
import type { ChunkCarry } from './types.ts';

// The whole lines one chunk completes, and the carry for the next chunk. The line the carry
// completes always comes out; the chunk's own whole lines come out only when one holds a
// references path. A line longer than `maxLine` is passed over.
export function buildChunkLines(carry: ChunkCarry, chunk: Buffer, maxLine: number): { lines: Buffer[]; carry: ChunkCarry } {
  const first = chunk.indexOf(0x0a);
  if (first === -1) {
    return { lines: [], carry: buildCarry(carry, chunk, maxLine) };
  }
  const lines: Buffer[] = [];
  if (!carry.skipping && carry.length + first <= maxLine) {
    lines.push(Buffer.concat([...carry.parts, chunk.subarray(0, first)]));
  }
  const last = chunk.lastIndexOf(0x0a);
  const middle = chunk.subarray(first + 1, last);
  if (middle.includes(REFERENCE_MARK)) {
    lines.push(...splitLines(middle));
  }
  return { lines, carry: buildCarry({ parts: [], length: 0, skipping: false }, chunk.subarray(last + 1), maxLine) };
}

function buildCarry(carry: ChunkCarry, rest: Buffer, maxLine: number): ChunkCarry {
  if (carry.skipping || carry.length + rest.length > maxLine) {
    return { parts: [], length: 0, skipping: true };
  }
  return { parts: [...carry.parts, Buffer.from(rest)], length: carry.length + rest.length, skipping: false };
}

function splitLines(block: Buffer): Buffer[] {
  const lines: Buffer[] = [];
  let start = 0;
  for (let newline = block.indexOf(0x0a); newline !== -1; newline = block.indexOf(0x0a, start)) {
    lines.push(block.subarray(start, newline));
    start = newline + 1;
  }
  lines.push(block.subarray(start));
  return lines;
}
