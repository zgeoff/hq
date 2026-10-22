// The refusal log (z-stu, 2026-10-16): every auto-mode refusal in the fleet's Claude Code
// transcripts, kept without anyone remembering to. A refusal is a record whose structured field
// toolDenialKind is "automode-blocked"; hq never matches text to find one. Read-only on the
// transcripts, and nothing secret is stored: the tool input is cut to the command or path, and
// input and reason are masked (redact.ts) before they are capped.
//
// The projects dir is ~8 GB, so a scan is bounded: a byte offset per file, only new bytes read, a
// byte budget per scan (most recently modified first), and files older than the backfill window
// skipped on first sight. Each file streams line by line; a refusal's tool comes from the
// tool_use ids seen before it, kept per file across scans. Local transcripts only.
import type { Database } from 'bun:sqlite';
import { closeSync, openSync, readSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { AtcClient } from '../atc/atc-client.ts';
import type { SessionInfo } from '../atc/session-schema.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { getProjectsDir } from '../repair/get-projects-dir.ts';
import { BACKFILL_DAYS } from './backfill-days.ts';
import { BUDGET_BYTES } from './budget-bytes.ts';
import { collectToolUses as toolUses } from './collect-tool-uses.ts';
import { DEADLINE_MS } from './deadline-ms.ts';
import { MARK } from './mark.ts';
import { MAX_LINE } from './max-line.ts';
import { parseRefusal as refusalOf } from './parse-refusal.ts';
import type { Found, ScanOptions, ScanResult, Tool, Who } from './types.ts';

export async function scanRefusals(db: Database, o: ScanOptions = {}): Promise<ScanResult> {
  const SLICE = 8 * 1024 * 1024,
    who = await whoBySession(o.sessions),
    [dir, window, scannedAt] = [o.dir ?? getProjectsDir(), (o.windowDays ?? BACKFILL_DAYS) * 86_400_000, iso(now())];
  const maxLine = o.maxLineBytes ?? MAX_LINE;
  // Checked between reads. A file's first line is read to its end (at most maxLine), so a scan
  // overspends by a read plus one line at most, and every file it starts moves forward.
  let budget = o.budgetBytes ?? BUDGET_BYTES;
  const t0 = performance.now();
  const late = () => performance.now() - t0 >= (o.deadlineMs ?? DEADLINE_MS);
  const r: ScanResult = { files_read: 0, bytes_read: 0, refusals_added: 0, files_left: 0 };
  type Known = { path: string; offset: number; size: number; mtime: string; tools: string };
  const known = new Map((db.query('SELECT path, offset, size, mtime, tools FROM refusal_files').all() as Known[]).map((f) => [f.path, f]));
  const save = db.query(
    'INSERT INTO refusal_files (path, offset, size, mtime, tools) VALUES (?, ?, ?, ?, ?) ON CONFLICT (path) DO UPDATE SET offset = excluded.offset, size = excluded.size, mtime = excluded.mtime, tools = excluded.tools',
  );
  const add = db.query(`INSERT OR IGNORE INTO refusals (uuid, at, claude_session, transcript, subagent, cwd, atc_session, atc_name, issue, tool, input, reason, scanned_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, (SELECT issue FROM run_sessions WHERE session_id = ?), ?, ?, ?, ?)`);
  const subagent = `${sep}subagents${sep}`;
  const [markB, useB] = [Buffer.from(MARK), Buffer.from('"tool_use"')];

  for (const f of listTranscripts(dir)) {
    await Bun.sleep(0);
    const mtime = iso(new Date(f.mtimeMs));
    const prev = known.get(f.path);
    if (!prev && now().getTime() - f.mtimeMs > window) {
      save.run(f.path, f.size, f.size, mtime, '[]'); // first sight of an old file: its history is skipped
      continue;
    }
    const shrank = !!prev && f.size < prev.offset;
    let offset = prev && !shrank ? prev.offset : 0;
    const tools = shrank ? new Map<string, Tool>() : storedTools(prev?.tools ?? null);
    if (offset >= f.size) {
      if (prev && (prev.offset !== offset || prev.size !== f.size)) save.run(f.path, offset, f.size, mtime, JSON.stringify([...tools]));
      continue;
    }
    if (budget <= 0 || late()) {
      r.files_left++;
      continue;
    }
    let fd: number;
    try {
      fd = openSync(f.path, 'r');
    } catch {
      continue;
    }
    const found: Found[] = [];
    // A whole line. A scan that resumed mid-line (after an oversized one) gets a fragment here,
    // which fails to parse and is skipped.
    // The two checks are independent: a tool_use whose input quotes the refusal mark is still a
    // tool_use that a later refusal names.
    const line = (b: Buffer) => {
      if (b.includes(useB)) {
        for (const use of toolUses(b.toString('utf8'))) {
          remember(tools, use);
        }
      }
      if (b.includes(markB)) {
        const x = refusalOf(b.toString('utf8'), tools);
        if (x) found.push(x);
      }
    };
    let [pos, carry, carryLen, skipping, left] = [offset, [] as Buffer[], 0, false, false];
    const from = offset;
    try {
      while (pos < f.size) {
        // Out of budget: stop once this file has moved on (the carried part line is read again
        // next scan). Until then the line begun is read on, so every file started moves forward.
        if ((budget <= 0 || late()) && (offset > from || carryLen === 0)) {
          left = true;
          break;
        }
        await Bun.sleep(0);
        const buf = readAt(fd, pos, Math.min(o.sliceBytes ?? SLICE, f.size - pos));
        budget -= buf.length;
        r.bytes_read += buf.length;
        if (!buf.length) break; // the file shrank under us
        const base = pos;
        pos += buf.length;
        for (let i = 0; ; ) {
          const nl = buf.indexOf(0x0a, i);
          if (nl < 0) {
            const rest = buf.subarray(i);
            if (skipping) offset = pos;
            else if (carryLen + rest.length > maxLine) {
              // Longer than any record hq needs (a refusal is a few KB): passed over as it streams.
              [carry, carryLen, skipping, offset] = [[], 0, true, pos];
            } else if (rest.length) [carry, carryLen] = [[...carry, Buffer.from(rest)], carryLen + rest.length];
            break;
          }
          if (skipping) skipping = false;
          else line(carryLen ? Buffer.concat([...carry, buf.subarray(i, nl)]) : buf.subarray(i, nl));
          [carry, carryLen, i] = [[], 0, nl + 1];
          offset = base + i;
        }
      }
    } finally {
      closeSync(fd);
    }
    // A partial last line (carry) waits for its newline: offset stays at its start.
    if (left) r.files_left++;
    r.files_read++;
    db.transaction(() => {
      for (const x of found) {
        const w = x.claude_session ? who.get(x.claude_session) : undefined;
        r.refusals_added += add.run(x.uuid, x.at, x.claude_session, f.path, f.path.includes(subagent) ? 1 : 0, x.cwd, w?.id ?? null, w?.name ?? null, w?.id ?? null, x.tool, x.input, x.reason, scannedAt).changes;
      }
      save.run(f.path, offset, f.size, mtime, JSON.stringify([...tools]));
    }).immediate();
  }
  return r;
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

function listTranscripts(dir: string): { path: string; size: number; mtimeMs: number }[] {
  let names: string[];
  try {
    names = readdirSync(dir, { recursive: true }) as string[];
  } catch {
    return []; // no projects dir: nothing to scan
  }
  const out: { path: string; size: number; mtimeMs: number }[] = [];
  for (const n of names) {
    if (!n.endsWith('.jsonl')) continue;
    const path = join(dir, n);
    try {
      const s = statSync(path);
      if (s.isFile()) out.push({ path, size: s.size, mtimeMs: s.mtimeMs });
    } catch {
      // gone since the listing
    }
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

async function whoBySession(get: ScanOptions['sessions']): Promise<Map<string, Who>> {
  const map = new Map<string, Who>();
  try {
    const list = get ? await get() : await atcSessions();
    for (const s of list) if (s.agentSessionID) map.set(s.agentSessionID, { id: s.id, name: s.name });
  } catch {
    // atc down: the rows keep no session name
  }
  return map;
}

async function atcSessions(): Promise<SessionInfo[]> {
  const c = await AtcClient.open(undefined, 1500);
  try {
    return await c.sessions();
  } finally {
    c.close();
  }
}

// A tool_use map entry ages out after this many newer ones: a tool_result follows its tool_use
// within a few records, parallel calls included.
const TOOLS_KEPT = 128;

const remember = (tools: Map<string, Tool>, [k, v]: [string, Tool]) => {
  tools.delete(k);
  tools.set(k, v);
  if (tools.size > TOOLS_KEPT) tools.delete(tools.keys().next().value!);
};

function storedTools(raw: string | null): Map<string, Tool> {
  try {
    const v: unknown = JSON.parse(raw ?? '[]');
    return new Map(Array.isArray(v) ? (v as [string, Tool][]) : []);
  } catch {
    return new Map();
  }
}
