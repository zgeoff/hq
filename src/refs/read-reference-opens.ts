// An open is a Read whose file_path ends in skills/<skill>/references/<file>, or a Bash command
// that names such a path (cat, sed, head). Files modified before the window are skipped unread;
// only a line holding a tool_use and a references path is parsed.
import { match } from 'ts-pattern';
import { z } from 'zod';
import { MAX_LINE } from '../refusals/max-line.ts';
import { parseJSONLine } from '../refusals/parse-json-line.ts';
import { readTranscriptList } from '../refusals/read-transcript-list.ts';
import { buildChunkLines } from './build-chunk-lines.ts';
import { REFERENCE_MARK } from './reference-mark.ts';
import type { ChunkCarry } from './types.ts';

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

// A line that spans chunks is carried; the reader passes on what each chunk completes.
async function readFileOpens(path: string, onLine: (line: Buffer) => void): Promise<void> {
  let carry: ChunkCarry = { parts: [], length: 0, skipping: false };
  try {
    for await (const chunk of Bun.file(path).stream()) {
      const decoded = buildChunkLines(carry, Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength), MAX_LINE);
      for (const line of decoded.lines) {
        onLine(line);
      }
      carry = decoded.carry;
    }
  } catch (error) {
    // Gone since the listing: nothing to count. Any other failure would leave its opens uncounted.
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return;
    }
    throw error;
  }
  if (!carry.skipping && carry.length > 0) {
    onLine(Buffer.concat(carry.parts));
  }
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
