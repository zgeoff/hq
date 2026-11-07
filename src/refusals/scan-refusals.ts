// The projects dir is ~8 GB, so a scan is bounded.
import type { Database } from 'bun:sqlite';
import { closeSync, openSync, readSync } from 'node:fs';
import { sep } from 'node:path';
import { z } from 'zod';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { parseJSON } from '../noslop/parse-json.ts';
import { getProjectsDir } from '../repair/get-projects-dir.ts';
import { BACKFILL_DAYS } from './backfill-days.ts';
import { BUDGET_BYTES } from './budget-bytes.ts';
import { collectToolUses as toolUses } from './collect-tool-uses.ts';
import { DEADLINE_MS } from './deadline-ms.ts';
import { MARK } from './mark.ts';
import { MAX_LINE } from './max-line.ts';
import { parseRefusal as refusalOf } from './parse-refusal.ts';
import { readSessionNames as whoBySession } from './read-session-names.ts';
import { readTranscriptList as listTranscripts } from './read-transcript-list.ts';
import type { Found, ScanOptions, ScanResult, Tool } from './types.ts';

const KnownFileRows = z.array(z.object({ path: z.string(), offset: z.number(), size: z.number(), mtime: z.string(), tools: z.string() }));

interface LineStream {
  readonly maxLine: number;
  offset: number;
  carry: Buffer[];
  carryLength: number;
  skipping: boolean;
}

export async function scanRefusals(db: Database, options: ScanOptions = {}): Promise<ScanResult> {
  const SLICE = 8 * 1024 * 1024;
  const who = await whoBySession(options.sessions);
  const directory = options.dir ?? getProjectsDir();
  const windowMs = (options.windowDays ?? BACKFILL_DAYS) * 86_400_000;
  const scannedAt = iso(now());
  const maxLine = options.maxLineBytes ?? MAX_LINE;
  let budget = options.budgetBytes ?? BUDGET_BYTES;
  const startedMs = performance.now();
  const late = () => performance.now() - startedMs >= (options.deadlineMs ?? DEADLINE_MS);
  const result: ScanResult = { files_read: 0, bytes_read: 0, refusals_added: 0, files_left: 0 };
  const known = new Map(KnownFileRows.parse(db.query('SELECT path, offset, size, mtime, tools FROM refusal_files').all()).map((file) => [file.path, file]));
  const save = db.query(
    'INSERT INTO refusal_files (path, offset, size, mtime, tools) VALUES (?, ?, ?, ?, ?) ON CONFLICT (path) DO UPDATE SET offset = excluded.offset, size = excluded.size, mtime = excluded.mtime, tools = excluded.tools',
  );
  const add = db.query(`INSERT OR IGNORE INTO refusals (uuid, at, claude_session, transcript, subagent, cwd, atc_session, atc_name, issue, tool, input, reason, scanned_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, (SELECT issue FROM run_sessions WHERE session_id = ?), ?, ?, ?, ?)`);
  const subagent = `${sep}subagents${sep}`;
  const markBytes = Buffer.from(MARK);
  const useBytes = Buffer.from('"tool_use"');

  for (const transcript of listTranscripts(directory)) {
    await Bun.sleep(0);
    const mtime = iso(new Date(transcript.mtimeMs));
    const previous = known.get(transcript.path);
    if (!previous && now().getTime() - transcript.mtimeMs > windowMs) {
      save.run(transcript.path, transcript.size, transcript.size, mtime, '[]');
      continue;
    }
    const shrank = previous !== undefined && transcript.size < previous.offset;
    const from = previous && !shrank ? previous.offset : 0;
    const tools = shrank ? new Map<string, Tool>() : storedTools(previous?.tools ?? null);
    if (from >= transcript.size) {
      if (previous && (previous.offset !== from || previous.size !== transcript.size)) {
        save.run(transcript.path, from, transcript.size, mtime, JSON.stringify([...tools]));
      }
      continue;
    }
    if (budget <= 0 || late()) {
      result.files_left++;
      continue;
    }
    let descriptor: number;
    try {
      descriptor = openSync(transcript.path, 'r');
    } catch {
      continue;
    }
    const found: Found[] = [];
    // The two checks are independent: a tool_use whose input quotes the refusal mark is still a
    // tool_use that a later refusal names.
    const line = (record: Buffer) => {
      if (record.includes(useBytes)) {
        for (const use of toolUses(record.toString('utf8'))) {
          remember(tools, use);
        }
      }
      if (record.includes(markBytes)) {
        const refusal = refusalOf(record.toString('utf8'), tools);
        if (refusal) {
          found.push(refusal);
        }
      }
    };
    const stream: LineStream = { maxLine, offset: from, carry: [], carryLength: 0, skipping: false };
    let position = from;
    let left = false;
    try {
      while (position < transcript.size) {
        if ((budget <= 0 || late()) && (stream.offset > from || stream.carryLength === 0)) {
          left = true;
          break;
        }
        await Bun.sleep(0);
        const buffer = readAt(descriptor, position, Math.min(options.sliceBytes ?? SLICE, transcript.size - position));
        budget -= buffer.length;
        result.bytes_read += buffer.length;

        // The file shrank under us.
        if (buffer.length === 0) {
          break;
        }
        splitLines(stream, buffer, position, line);
        position += buffer.length;
      }
    } finally {
      closeSync(descriptor);
    }
    if (left) {
      result.files_left++;
    }
    result.files_read++;
    const subagentFlag = transcript.path.includes(subagent) ? 1 : 0;
    db.transaction(() => {
      for (const refusal of found) {
        const session = refusal.claude_session ? who.get(refusal.claude_session) : undefined;
        result.refusals_added += add.run(refusal.uuid, refusal.at, refusal.claude_session, transcript.path, subagentFlag, refusal.cwd, session?.id ?? null, session?.name ?? null, session?.id ?? null, refusal.tool, refusal.input, refusal.reason, scannedAt).changes;
      }
      save.run(transcript.path, stream.offset, transcript.size, mtime, JSON.stringify([...tools]));
    }).immediate();
  }
  return result;
}

function splitLines(stream: LineStream, buffer: Buffer, base: number, onLine: (record: Buffer) => void): void {
  for (let cursor = 0; ; ) {
    const newline = buffer.indexOf(0x0a, cursor);
    if (newline === -1) {
      keepTail(stream, buffer.subarray(cursor), base + buffer.length);
      return;
    }
    if (stream.skipping) {
      stream.skipping = false;
    } else if (stream.carryLength + newline - cursor <= stream.maxLine) {
      const whole = stream.carryLength > 0 ? Buffer.concat([...stream.carry, buffer.subarray(cursor, newline)]) : buffer.subarray(cursor, newline);
      onLine(whole);
    }
    stream.carry = [];
    stream.carryLength = 0;
    cursor = newline + 1;
    stream.offset = base + cursor;
  }
}

function keepTail(stream: LineStream, rest: Buffer, end: number): void {
  if (stream.skipping) {
    stream.offset = end;
    return;
  }

  // Longer than any record hq needs (a refusal is a few KB): passed over as it streams.
  if (stream.carryLength + rest.length > stream.maxLine) {
    stream.carry = [];
    stream.carryLength = 0;
    stream.skipping = true;
    stream.offset = end;
    return;
  }
  if (rest.length > 0) {
    stream.carry = [...stream.carry, Buffer.from(rest)];
    stream.carryLength += rest.length;
  }
}

function readAt(fd: number, start: number, len: number): Buffer {
  const buf = Buffer.allocUnsafe(len);
  let got = 0;
  while (got < len) {
    const n = readSync(fd, buf, got, len - got, start + got);
    if (n <= 0) break;
    got += n;
  }
  return buf.subarray(0, got);
}

// A tool_result follows its tool_use within a few records, parallel calls included.
const TOOLS_KEPT = 128;

const remember = (tools: Map<string, Tool>, [k, v]: [string, Tool]) => {
  tools.delete(k);
  tools.set(k, v);
  if (tools.size > TOOLS_KEPT) tools.delete(tools.keys().next().value!);
};

const StoredToolSchema = z.object({ name: z.string(), input: z.string().nullable() });
const StoredToolsSchema = z.array(z.tuple([z.string(), StoredToolSchema]));

function storedTools(raw: string | null): Map<string, Tool> {
  const parsed = StoredToolsSchema.safeParse(parseJSON(raw ?? '[]'));
  const entries = parsed.success ? parsed.data : [];
  return new Map(entries);
}
