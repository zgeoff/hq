import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { appendFileSync, mkdirSync, readFileSync, rmSync, truncateSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { main } from '../src/cli.ts';
import { clean } from '../src/redact/clean.ts';
import { redact } from '../src/redact/redact.ts';
import { loadRefusalsSummary as refusalsSummary } from '../src/refusals/load-refusals-summary.ts';
import { scanRefusals } from '../src/refusals/scan-refusals.ts';
import { type FakeAtc, at, fakeAtc, freshDb } from './helpers.ts';

// Invented records in the shape Claude writes; no real transcript content.
let db: Database;
let dir: string;
let cleanup: () => void;
let atc: FakeAtc | null = null;
const NOW = '2026-10-17T00:00:00Z';
const SID = '11111111-2222-4333-8444-555555555555';
let n = 0;
const U = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

const tu = (id: string, name: string, input: object, uuid = U()) => ({ type: 'assistant', uuid, sessionId: SID, timestamp: '2026-10-16T01:00:00.000Z', message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } });
const refused = (id: string, reason: string | null, over: object = {}) => {
  const uuid = U();
  return { type: 'user', uuid, sessionId: SID, cwd: '/work/widgets', timestamp: '2026-10-16T01:00:05.250Z', toolDenialKind: 'automode-blocked', permissionDecision: { decision: 'reject', reasonType: 'classifier' }, serverClassifierContext: 'INVENTED-CLASSIFIER-CONTEXT', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: true, content: `Permission denied.${reason ? ` Reason: ${reason}\nTo allow it, ask.` : ''}` }] }, ...over };
};
const jl = (...recs: object[]) => recs.map((r) => JSON.stringify(r)).join('\n') + '\n';
const proj = () => join(dir, 'projects');
const file = (rel: string, text: string, ageDays = 0) => {
  const p = join(proj(), rel);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, text);
  setAge(p, ageDays);
  return p;
};
const setAge = (p: string, days: number) => {
  const t = new Date(Date.parse(NOW) - days * 86_400_000);
  utimesSync(p, t, t);
};
const scan = (o: Parameters<typeof scanRefusals>[1] = {}) => scanRefusals(db, { dir: proj(), sessions: async () => [], ...o });
const rows = () => db.query('SELECT * FROM refusals ORDER BY rowid').all() as Record<string, unknown>[];

beforeEach(() => {
  ({ db, dir, cleanup } = freshDb());
  at(NOW);
  mkdirSync(proj(), { recursive: true });
});
afterEach(() => {
  atc?.stop();
  atc = null;
  delete process.env['HQ_ATC_SOCKET'];
  delete process.env['HQ_CLAUDE_PROJECTS'];
  cleanup();
});

test('a refusal is found by its structured field, with the tool, input and reason', async () => {
  file('-work-widgets/s.jsonl', jl(tu('toolu_1', 'Bash', { command: 'git push   origin main', description: 'drop me' }), refused('toolu_1', 'pushing to main'), { type: 'user', uuid: U(), message: { content: 'the text automode-blocked in a plain prompt' } }));
  const r = await scan();
  expect(r).toMatchObject({ files_read: 1, refusals_added: 1, files_left: 0 });
  expect(rows()).toEqual([expect.objectContaining({ at: '2026-10-16T01:00:05Z', claude_session: SID, subagent: 0, cwd: '/work/widgets', atc_session: null, atc_name: null, issue: null, tool: 'Bash', input: 'git push origin main', reason: 'pushing to main', scanned_at: NOW })]);
  expect(JSON.stringify(rows())).not.toContain('INVENTED-CLASSIFIER-CONTEXT');
  expect(JSON.stringify(rows())).not.toContain('drop me');
});

test('it names the tool of a refused call whose input quotes the refusal mark', async () => {
  file('p/s.jsonl', jl(tu('toolu_5', 'Bash', { command: 'rg automode-blocked trace.jsonl' }), refused('toolu_5', 'reading transcripts')));
  await scan();
  expect(rows().map((x) => [x['tool'], x['input'], x['reason']])).toStrictEqual([['Bash', 'rg automode-blocked trace.jsonl', 'reading transcripts']]);
});

test('input is the command or the path; any other tool shows nothing; the reason may be absent or in text parts', async () => {
  const parts = refused('toolu_4', null);
  (parts.message.content[0] as { content: unknown }).content = [{ type: 'text', text: 'Blocked.\nReason: the part reason\n' }];
  file('p/s.jsonl', jl(tu('toolu_2', 'Edit', { file_path: '/work/a.ts', old_string: 'secret' }), refused('toolu_2', null), tu('toolu_3', 'WebFetch', { url: 'https://example.test/x' }), refused('toolu_3', 'r'), tu('toolu_4', 'Read', { file_path: '/work/b.ts' }), parts));
  await scan();
  expect(rows().map((x) => [x['tool'], x['input'], x['reason']])).toEqual([['Edit', '/work/a.ts', null], ['WebFetch', null, 'r'], ['Read', '/work/b.ts', 'the part reason']]);
});

test('a file first seen older than the window skips its history; a newer one is read from the start', async () => {
  const old = file('p/old.jsonl', jl(tu('t1', 'Bash', { command: 'a' }), refused('t1', 'old')), 20);
  file('p/new.jsonl', jl(tu('t2', 'Bash', { command: 'b' }), refused('t2', 'new')), 3);
  expect((await scan()).refusals_added).toBe(1);
  expect(rows().map((x) => x['reason'])).toEqual(['new']);
  expect(db.query('SELECT offset, size FROM refusal_files WHERE path = ?').get(old)).toEqual({ offset: expect.any(Number), size: expect.any(Number) });
  appendFileSync(old, jl(tu('t3', 'Bash', { command: 'c' }), refused('t3', 'old file, new line')));
  await scan();

  // an appended refusal in a skipped file still counts
  expect(rows().map((x) => x['reason'])).toEqual(['new', 'old file, new line']);
});

test('a wider window backfills files not yet seen', async () => {
  file('p/old.jsonl', jl(tu('t1', 'Bash', { command: 'a' }), refused('t1', 'old')), 20);
  expect((await scan({ windowDays: 30 })).refusals_added).toBe(1);
});

test('the next scan reads only new bytes, and a partial trailing line waits for its newline', async () => {
  const p = file('p/s.jsonl', jl(tu('t1', 'Bash', { command: 'a' }), refused('t1', 'first')));
  const first = await scan();
  const whole = JSON.stringify(refused('t2', 'second'));
  appendFileSync(p, JSON.stringify(tu('t2', 'Bash', { command: 'b' })) + '\n' + whole.slice(0, 40));
  const second = await scan();
  expect(second.refusals_added).toBe(0);
  expect(second.bytes_read).toBeLessThan(first.bytes_read + JSON.stringify(tu('t2', 'Bash', {})).length + 2);
  appendFileSync(p, whole.slice(40) + '\n');
  expect((await scan()).refusals_added).toBe(1);
  expect(rows().map((x) => [x['reason'], x['tool'], x['input']])).toEqual([['first', 'Bash', 'a'], ['second', 'Bash', 'b']]);
  expect((await scan()).files_read).toBe(0); // nothing new: the file is not opened
});

test('a file that shrank is read again from the start; the uuid keeps it from doubling', async () => {
  const p = file('p/s.jsonl', jl(tu('t1', 'Bash', { command: 'a' }), refused('t1', 'first')));
  await scan();
  expect((await scan()).refusals_added).toBe(0); // dedupe on a re-scan
  const keep = jl(refused('t9', 'after truncation', { uuid: '00000000-0000-4000-8000-0000000000aa' }));
  truncateSync(p, 0);
  writeFileSync(p, keep);
  expect((await scan()).refusals_added).toBe(1);
  truncateSync(p, 0);
  writeFileSync(p, keep + keep);
  expect((await scan()).refusals_added).toBe(0);
  expect(rows()).toHaveLength(2);
});

test('the byte budget stops a scan; files not reached resume next scan, newest first', async () => {
  const a = jl(tu('ta', 'Bash', { command: 'a' }), refused('ta', 'in a'));
  const b = jl(tu('tb', 'Bash', { command: 'b' }), refused('tb', 'in b'));
  const c = jl(tu('tc', 'Bash', { command: 'c' }), refused('tc', 'in c'));
  file('p/a.jsonl', a, 3);
  file('p/b.jsonl', b, 2);
  file('p/c.jsonl', c, 1);
  const used = Buffer.byteLength(c) + Buffer.byteLength(b);
  const budgetBytes = used;
  const r1 = await scan({ budgetBytes });
  expect(r1).toMatchObject({ files_read: 2, bytes_read: used, files_left: 1, refusals_added: 2 });
  expect(rows().map((x) => x['reason'])).toEqual(['in c', 'in b']);
  const r2 = await scan({ budgetBytes });
  expect(r2).toMatchObject({ files_read: 1, files_left: 0, refusals_added: 1 });
  expect(rows()).toHaveLength(3);
});

test('a file once begun is read to a line end, so a tiny budget still moves forward', async () => {
  const a = jl(tu('ta', 'Bash', { command: 'a' }), refused('ta', 'x'));
  file('p/a.jsonl', a, 1);
  file('p/b.jsonl', jl(tu('tb', 'Bash', { command: 'b' }), refused('tb', 'y')), 2);
  expect(await scan({ budgetBytes: 20 })).toMatchObject({ files_read: 1, bytes_read: Buffer.byteLength(a), files_left: 1, refusals_added: 1 });
});

test('a subagent transcript is flagged by its path', async () => {
  file(`-work/${SID}/subagents/agent-ab12.jsonl`, jl(tu('t1', 'Bash', { command: 'a' }), refused('t1', 'sub')));
  file('-work/main.jsonl', jl(tu('t2', 'Bash', { command: 'b' }), refused('t2', 'main')));
  await scan();
  expect(rows().map((x) => [x['reason'], x['subagent']])).toEqual(expect.arrayContaining([['sub', 1], ['main', 0]]));
});

test('the tool is found earlier in the scan, else from the last scan of the file, else null', async () => {
  const p = file('p/s.jsonl', jl(tu('t_early', 'Bash', { command: 'read back' })));
  await scan(); // the chunk holds no refusal; the offset moves past the tool_use
  const assistant = tu('t_bytes', 'Bash', { command: 'by assistant uuid' }, '00000000-0000-4000-8000-0000000000bb');
  const noId = refused('', 'by uuid', { sourceToolAssistantUUID: assistant.uuid });
  delete (noId.message.content[0] as { tool_use_id?: string }).tool_use_id;
  appendFileSync(p, jl(refused('t_early', 'read back'), assistant, noId, refused('t_missing', 'nowhere'), tu('t_in', 'Write', { file_path: '/w/x' }), refused('t_in', 'in chunk')));
  await scan();
  expect(rows().map((x) => [x['reason'], x['tool'], x['input']])).toEqual(expect.arrayContaining([
    ['read back', 'Bash', 'read back'],
    ['by uuid', 'Bash', 'by assistant uuid'],
    ['nowhere', null, null],
    ['in chunk', 'Write', '/w/x'],
  ]));
});

test('parallel calls with a 10 MiB result between: the third call refusal still finds its tool (a 4 MiB read-back missed it)', async () => {
  const calls = { type: 'assistant', uuid: U(), sessionId: SID, message: { content: [1, 2, 3, 4, 5].map((i) => ({ type: 'tool_use', id: `tp${i}`, name: 'Bash', input: { command: `step ${i}` } })) } };
  const p = file('p/s.jsonl', jl(calls, { type: 'user', uuid: U(), message: { content: [{ type: 'tool_result', tool_use_id: 'tp1', content: 'x'.repeat(10 * 1024 * 1024) }] } }));
  await scan();
  appendFileSync(p, jl(refused('tp3', 'third')));
  await scan();
  expect(rows().map((x) => [x['reason'], x['tool'], x['input']])).toEqual([['third', 'Bash', 'step 3']]);
});

test('the tools kept between scans hold the masked input only', async () => {
  const p = file('p/s.jsonl', jl(tu('tk', 'Bash', { command: 'curl -H "Authorization: Bearer abcdef0123456789xyz" https://example.test', description: 'RAW-INPUT-FIELD' })));
  await scan();
  const kept = (db.query('SELECT tools FROM refusal_files WHERE path = ?').get(p) as { tools: string }).tools;
  expect(kept).not.toContain('abcdef0123456789xyz');
  expect(kept).not.toContain('RAW-INPUT-FIELD');
  appendFileSync(p, jl(refused('tk', 'auth header')));
  await scan();
  expect(rows()[0]).toMatchObject({ tool: 'Bash', input: expect.stringContaining('Bearer [redacted]') });
});

test('a scan that stops inside an oversized line resumes on a fragment, which is skipped', async () => {
  const MiB = 1024 * 1024;
  const fake = `"toolDenialKind":"automode-blocked","type":"tool_use"`;
  const p = file('p/s.jsonl', jl({ type: 'user', uuid: U(), pad: 'z'.repeat(3 * MiB), tail: fake }));
  const o = { sliceBytes: MiB, maxLineBytes: 1.5 * MiB, budgetBytes: 2 * MiB };
  expect(await scan(o)).toMatchObject({ files_left: 1, refusals_added: 0 });
  appendFileSync(p, jl(tu('t1', 'Bash', { command: 'ls' }), refused('t1', 'after the fragment')));
  await scan(o);
  await scan(o);
  expect(rows().map((x) => [x['reason'], x['tool']])).toEqual([['after the fragment', 'Bash']]);
  expect((db.query('SELECT tools FROM refusal_files WHERE path = ?').get(p) as { tools: string }).tools).not.toContain('automode');
});

test('a malformed line is skipped, and the scan goes on', async () => {
  file('p/s.jsonl', `{"toolDenialKind":"automode-blocked", broken\n${jl(tu('t1', 'Bash', { command: 'a' }), refused('t1', 'ok'))}`);
  expect((await scan()).refusals_added).toBe(1);
});

test('redaction masks token shapes in a command and a reason before anything is stored', async () => {
  const gh = 'ghp_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8';
  const ant = 'sk-ant-api03-' + 'Zy9x8w7v6u5t4s3r2q1p';
  file('p/s.jsonl', jl(tu('t1', 'Bash', { command: `curl -H "Authorization: Bearer ${ant}" https://example.test && GITHUB_TOKEN=${gh} run ${'ab12'.repeat(10)}` }), refused('t1', `used ${gh} and DB_PASSWORD=hunter2hunter2 against it`)));
  await scan();
  const dump = JSON.stringify(db.query('SELECT * FROM refusals').all());
  for (const secret of [gh, ant, 'hunter2', 'ab12'.repeat(10)]) expect(dump).not.toContain(secret);
  expect(dump).toContain('[redacted]');
  expect(dump).toContain('GITHUB_TOKEN=[redacted]');
});

test('redact covers each token family and leaves ordinary text and paths alone', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln';
  const cases = ['ghs_' + 'a'.repeat(30), 'github_pat_' + 'B'.repeat(30), 'sk-' + 'q'.repeat(30), 'ops_' + 'eyJ'.padEnd(30, 'x'), 'AKIA' + 'ABCDEFGHIJKLMNOP', jwt, 'a1'.repeat(20), 'Qm9' + 'x'.repeat(20) + 'AbC1' + 'y'.repeat(10)];
  for (const c of cases) expect(redact(`before ${c} after`)).toBe('before [redacted] after');
  expect(redact('Authorization: Bearer abc123xyz789')).toBe('Authorization: Bearer [redacted]');
  expect(redact('API_KEY="a b" run')).toBe('API_KEY=[redacted] run');
  expect(redact('bun test /home/kettle/projects/hq/src/refusals-and-more.ts')).toBe('bun test /home/kettle/projects/hq/src/refusals-and-more.ts');
  expect(clean(`x ${'ghp_' + 'z'.repeat(40)}`, 5)).toBe('x [re'); // mask first, then cap
  expect(clean('  a \n\t b  ', 120)).toBe('a b');
});

test('the caps: input 120, reason 300', async () => {
  file('p/s.jsonl', jl(tu('t1', 'Bash', { command: 'echo ' + 'word '.repeat(60) }), refused('t1', 'why '.repeat(120))));
  await scan();
  expect(rows()[0]?.['input']).toHaveLength(120);
  expect(rows()[0]?.['reason']).toHaveLength(300);
});

test('atc names the session and hq run_sessions gives the issue; atc down scans with nulls', async () => {
  db.query(`INSERT INTO runs (issue, title, place, state, created_at, updated_at) VALUES ('GEO-9', 't', 'local', 'working', '2026-10-16T00:00:00Z', '2026-10-16T00:00:00Z')`).run();
  db.query(`INSERT INTO run_sessions (session_id, issue, added_at) VALUES ('id-w', 'GEO-9', '2026-10-16T00:00:00Z')`).run();
  file('p/s.jsonl', jl(tu('t1', 'Bash', { command: 'a' }), refused('t1', 'with atc')));
  atc = fakeAtc(dir, [{ id: 'id-w', name: 'z-worker', alive: true, state: 'done', agentSessionID: SID }] as never[]);
  process.env['HQ_ATC_SOCKET'] = join(dir, 'atc.sock');
  await scanRefusals(db, { dir: proj() });
  expect(rows()[0]).toMatchObject({ atc_session: 'id-w', atc_name: 'z-worker', issue: 'GEO-9' });

  appendFileSync(join(proj(), 'p/s.jsonl'), jl(tu('t2', 'Bash', { command: 'b' }), refused('t2', 'atc down')));
  atc.stop();
  atc = null;

  // tests never reach a live atc
  delete process.env['HQ_ATC_SOCKET'];
  expect((await scanRefusals(db, { dir: proj() })).refusals_added).toBe(1);
  expect(rows()[1]).toMatchObject({ reason: 'atc down', atc_session: null, atc_name: null, issue: null });
});

test('a missing projects dir scans nothing', async () => {
  rmSync(proj(), { recursive: true });
  expect(await scan()).toEqual({ files_read: 0, bytes_read: 0, refusals_added: 0, files_left: 0 });
});

test('the weekly summary counts a window and ranks reasons', async () => {
  file('p/s.jsonl', jl(tu('t1', 'Bash', { command: 'a' }), refused('t1', 'same'), tu('t2', 'Bash', { command: 'a' }), refused('t2', 'same'), tu('t3', 'Bash', { command: 'a' }), refused('t3', 'other')));
  await scan();
  expect(refusalsSummary(db, new Date('2026-10-12T00:00:00Z'), new Date('2026-10-19T00:00:00Z'))).toBe('Refusals: 3 (top reasons: same x2; other x1)');
  expect(refusalsSummary(db, new Date('2026-10-01T00:00:00Z'), new Date('2026-10-02T00:00:00Z'))).toBe('Refusals: none');
});

test('hq refusals lists newest first, tallies with --by, and hq refusals scan reports its numbers', async () => {
  process.env['HQ_CLAUDE_PROJECTS'] = proj();
  file('p/s.jsonl', jl(tu('t1', 'Bash', { command: 'git push' }), refused('t1', 'same'), tu('t2', 'Edit', { file_path: '/w/a' }), refused('t2', 'same', { timestamp: '2026-10-16T02:00:00.000Z' })));
  const origLog = console.log;
  const origErr = console.error;
  let out: string[] = [];
  console.log = (l: string) => out.push(l);
  console.error = (l: string) => out.push(l);
  const hq = async (...argv: string[]) => {
    out = [];
    const code = await main(argv);
    return { code, text: out.join('\n') };
  };
  try {
    expect(JSON.parse((await hq('refusals', 'scan', '--json')).text)).toMatchObject({ files_read: 1, bytes_read: expect.any(Number), refusals_added: 2, files_left: 0 });
    const list = JSON.parse((await hq('refusals', '--json')).text) as { items: { tool: string }[] };
    expect(list.items.map((i) => i.tool)).toEqual(['Edit', 'Bash']);
    expect(JSON.parse((await hq('refusals', '--by', 'reason', '--json')).text)).toMatchObject({ tally: [{ key: 'same', count: 2 }] });
    expect((await hq('refusals', '--by', 'tool', '--days', '30')).text).toMatch(/1  Bash\n.*1  Edit|1  Edit\n.*1  Bash/s);
    expect((await hq('refusals')).text).toContain('git push');
    expect((await hq('refusals', '--by', 'colour')).code).not.toBe(0);
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
});

test('every physical read is charged: big records past the budget do not make later files get read', async () => {
  const big = 'x '.repeat(1024 * 1024); // a 2 MiB record
  const sizes = Array.from({ length: 10 }, (_, i) => Buffer.byteLength(readFileSync(file(`p/f${i}.jsonl`, jl({ type: 'user', uuid: U(), pad: big }), i))));
  const r = await scan({ budgetBytes: 1024 * 1024 });
  expect(r).toMatchObject({ files_read: 1, files_left: 9, bytes_read: sizes[0] }); // the newest, read to its line end
});

test('an 18 MiB record with a 32 MiB budget is passed over, and the refusal after it is found', async () => {
  const p = file('p/a.jsonl', jl({ type: 'user', uuid: U(), pad: 'x'.repeat(18 * 1024 * 1024) }) + jl(tu('t1', 'Bash', { command: 'ls' }), refused('t1', 'after')));
  const budgetBytes = 32 * 1024 * 1024;
  await scan({ budgetBytes });
  const offset = () => (db.query('SELECT offset FROM refusal_files WHERE path = ?').get(p) as { offset: number }).offset;
  expect(offset()).toBeGreaterThan(18 * 1024 * 1024);
  for (let i = 0; i < 3 && rows().length < 1; i++) await scan({ budgetBytes });
  expect(rows().map((x) => x['reason'])).toEqual(['after']);
});

test('two refusals whose tool_use came before the saved offset both get their tool, on a tiny budget', async () => {
  const fill = (k: number) => ({ type: 'user', uuid: U(), pad: 'y'.repeat(k) });
  // chunk 1 ends the scan's slice reads; tool_use sits before the saved offset
  const p = file('p/a.jsonl', jl(tu('tb', 'Bash', { command: 'ls' }), fill(1000)));
  await scan();
  appendFileSync(p, jl(fill(700_000), refused('tb', 'late'), fill(700_000), refused('tb', 'later')));
  const budgetBytes = 1;
  for (let i = 0; i < 4; i++) await scan({ budgetBytes, sliceBytes: 256 * 1024 });
  expect(rows().map((x) => [x['reason'], x['tool'], x['input']])).toEqual([['late', 'Bash', 'ls'], ['later', 'Bash', 'ls']]);
});

test('a deadline stops the scan between lines; the rest resumes next scan', async () => {
  file('p/a.jsonl', jl(tu('t1', 'Bash', { command: 'a' }), refused('t1', 'x')));
  expect(await scan({ deadlineMs: 0 })).toMatchObject({ files_read: 0, files_left: 1, refusals_added: 0 });
  expect(await scan()).toMatchObject({ refusals_added: 1 });
});

test('redact masks a whole shell-escaped or quoted secret value', () => {
  expect(redact('DB_PASSWORD=correct\\ horse run')).toBe('DB_PASSWORD=[redacted] run');
  expect(redact('API_TOKEN="ab\\"cd ef" go')).toBe('API_TOKEN=[redacted] go');
  expect(redact("SECRET='one two' go")).toBe('SECRET=[redacted] go');
  expect(redact('export "DB_PASSWORD=correct horse" go')).toBe('export "DB_PASSWORD=[redacted]" go');
  expect(redact("export 'DB_PASSWORD=correct horse' go")).toBe("export 'DB_PASSWORD=[redacted]' go");
  expect(redact('export DB_PASSWORD="correct horse" go')).toBe('export DB_PASSWORD=[redacted] go');
});
