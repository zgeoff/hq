// An open is a Read whose file_path ends in skills/<skill>/references/<file>, or a Bash command
// that names such a path (cat, sed, head). Files modified before the window are skipped unread;
// only a line holding a tool_use and a references path is parsed.
import { match } from 'ts-pattern';
import { z } from 'zod';
import { MAX_LINE } from '../refusals/max-line.ts';
import { parseJSONLine } from '../refusals/parse-json-line.ts';
import { readTranscriptList } from '../refusals/read-transcript-list.ts';

// Claude session id -> the references it opened, as `<skill>/references/<file>`.
export async function readReferenceOpens(directory: string, since: Date, until: Date): Promise<Map<string, Set<string>>> {
  const opens = new Map<string, Set<string>>();
  for (const file of readTranscriptList(directory)) {
    // The list is newest first: every file after this one is older too.
    if (file.mtimeMs < since.getTime()) {
      break;
    }
    await readFileOpens(file.path, (line) => {
      addLineOpens(opens, line, since, until);
    });
  }
  return opens;
}

const REFERENCE_MARK = Buffer.from('/references/');

// Only the whole lines of a chunk that holds a references path are split and passed on; a line
// that spans chunks is carried, and one longer than MAX_LINE is passed over.
async function readFileOpens(path: string, onLine: (line: Buffer) => void): Promise<void> {
  let carry: Buffer[] = [];
  let carryLength = 0;
  let skipping = false;
  try {
    for await (const chunk of Bun.file(path).stream()) {
      const buffer = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      const first = buffer.indexOf(0x0a);
      if (first === -1) {
        [carry, carryLength, skipping] = buildCarry(carry, carryLength, skipping, buffer);
        continue;
      }
      if (!skipping && carryLength + first <= MAX_LINE) {
        onLine(Buffer.concat([...carry, buffer.subarray(0, first)]));
      }
      const last = buffer.lastIndexOf(0x0a);
      const middle = buffer.subarray(first + 1, last);
      if (middle.includes(REFERENCE_MARK)) {
        for (const line of splitLines(middle)) {
          onLine(line);
        }
      }
      [carry, carryLength, skipping] = buildCarry([], 0, false, buffer.subarray(last + 1));
    }
  } catch {
    // gone or unreadable since the listing
    return;
  }
  if (!skipping && carryLength) {
    onLine(Buffer.concat(carry));
  }
}

function buildCarry(carry: Buffer[], carryLength: number, skipping: boolean, rest: Buffer): [Buffer[], number, boolean] {
  if (skipping || carryLength + rest.length > MAX_LINE) {
    return [[], 0, true];
  }
  return [[...carry, Buffer.from(rest)], carryLength + rest.length, false];
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

const USE_MARK = Buffer.from('"tool_use"');

// What an open needs of a record; any other shape is not an open.
const contentSchema = z.array(z.unknown());
const messageSchema = z.looseObject({ content: contentSchema });
const recordSchema = z.looseObject({ sessionId: z.string(), timestamp: z.string(), message: messageSchema });

function addLineOpens(opens: Map<string, Set<string>>, line: Buffer, since: Date, until: Date): void {
  if (!line.includes(USE_MARK) || !line.includes(REFERENCE_MARK)) {
    return;
  }
  const record = recordSchema.safeParse(parseJSONLine(line.toString('utf8')));
  if (!record.success) {
    return;
  }
  const at = Date.parse(record.data.timestamp);
  if (Number.isNaN(at) || at < since.getTime() || at > until.getTime()) {
    return;
  }
  const session = record.data.sessionId;
  for (const reference of record.data.message.content.flatMap((block) => pickUseReferences(block))) {
    const set = opens.get(session) ?? new Set<string>();
    set.add(reference);
    opens.set(session, set);
  }
}

const READ_PATH = /skills\/(?<skill>[\w.-]+)\/references\/(?<file>[\w./-]+)$/u;
const COMMAND_PATH = /skills\/(?<skill>[\w.-]+)\/references\/(?<file>[\w./-]*[\w-])/gu;

const readInputSchema = z.looseObject({ file_path: z.string() });
const bashInputSchema = z.looseObject({ command: z.string() });
const readUseSchema = z.looseObject({ type: z.literal('tool_use'), name: z.literal('Read'), input: readInputSchema });
const bashUseSchema = z.looseObject({ type: z.literal('tool_use'), name: z.literal('Bash'), input: bashInputSchema });
const useSchema = z.discriminatedUnion('name', [readUseSchema, bashUseSchema]);

function pickUseReferences(block: unknown): string[] {
  const use = useSchema.safeParse(block);
  if (!use.success) {
    return [];
  }
  return match(use.data)
    .with({ name: 'Read' }, (read) => {
      const groups = READ_PATH.exec(read.input.file_path)?.groups;
      return groups ? [`${groups['skill']}/references/${groups['file']}`] : [];
    })
    .with({ name: 'Bash' }, (bash) => [...bash.input.command.matchAll(COMMAND_PATH)].map((found) => `${found.groups?.['skill']}/references/${found.groups?.['file']}`))
    .exhaustive();
}
