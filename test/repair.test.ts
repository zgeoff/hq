import { afterEach, beforeEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkRepaired } from '../src/repair/check-repaired.ts';
import { planRepair } from '../src/repair/plan-repair.ts';
import { repairAdvisor400 } from '../src/repair/repair-advisor400.ts';
import { repairedText } from '../src/repair/repaired-text.ts';
import { transcriptPath } from '../src/repair/transcript-path.ts';
import { fakeAtc, type FakeAtc } from './helpers.ts';

// Invented records in the shape Claude writes: an advisor call split by a message that arrived mid-turn.
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SID = '11111111-2222-4333-8444-555555555555';
const base = { isSidechain: false, sessionId: SID, cwd: '/work/widgets', timestamp: '2026-10-17T00:00:00.000Z' };
const user = (uuid: string, parent: string | null, content: unknown, extra: object = {}) => ({ parentUuid: parent, ...base, type: 'user', message: { role: 'user', content }, uuid, ...extra });
const asst = (uuid: string, parent: string, msg: string, content: unknown[]) => ({ parentUuid: parent, ...base, type: 'assistant', message: { id: msg, role: 'assistant', content }, uuid });
const att = (uuid: string, parent: string) => ({ parentUuid: parent, ...base, type: 'attachment', attachment: { type: 'note', text: 'a reminder' }, uuid });
const lines = (recs: object[]) => recs.map((r) => JSON.stringify(r)).join('\n') + '\n';

const [R, A1, A2, I1, A3, A4, A5, T1, AT1, A6, I2] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(U) as [string, string, string, string, string, string, string, string, string, string, string];

function broken(opts: { two?: boolean; noTool?: boolean } = {}): object[] {
  const out: object[] = [
    user(R, null, 'Please check the widget count.'),
    asst(A1, R, 'msg_1', [{ type: 'thinking', thinking: 'Count them.' }]),
    asst(A2, A1, 'msg_1', [{ type: 'server_tool_use', id: 'srvtoolu_1', name: 'advisor', input: {} }]),
    user(I1, A2, [{ type: 'text', text: 'A note from a teammate: the count changed.' }], { isMeta: true, origin: 'plugin' }),
  ];
  if (opts.two) out.push(user(I2, I1, [{ type: 'text', text: 'A second note.' }], { isMeta: true }));
  out.push(asst(A3, opts.two ? I2 : I1, 'msg_1', [{ type: 'advisor_tool_result', tool_use_id: 'srvtoolu_1', content: { type: 'advisor_result', text: 'Looks fine.' } }]));
  out.push(asst(A4, A3, 'msg_1', [{ type: 'thinking', thinking: 'Now count.' }]));
  if (opts.noTool) {
    out.push(att(AT1, A4), asst(A6, AT1, 'msg_2', [{ type: 'text', text: 'Done.' }]));
  } else {
    out.push(
      asst(A5, A4, 'msg_1', [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'wc -l widgets.txt' } }]),
      user(T1, A5, [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '7 widgets.txt' }]),
      { type: 'queue-operation', operation: 'enqueue', sessionId: SID, timestamp: base.timestamp, content: 'later' },
      att(AT1, T1),
      asst(A6, AT1, 'msg_2', [{ type: 'text', text: 'There are 7 widgets.' }]),
    );
  }
  out.push({ type: 'last-prompt', lastPrompt: 'Please check the widget count.', leafUuid: A6, sessionId: SID });
  return out;
}

const parentOf = (text: string, uuid: string) => text.split('\n').filter(Boolean).map((l) => JSON.parse(l) as { uuid?: string; parentUuid?: string }).find((o) => o.uuid === uuid)!.parentUuid;

test('re-links the advisor result to its use and moves the interloper after the turn', () => {
  const text = lines(broken());
  const plan = planRepair(text);
  expect(plan.splits).toEqual([{ use: A2, result: A3, interlopers: [I1], anchor: T1 }]);
  expect(plan.changes.map((c) => [c.uuid, c.from, c.to])).toEqual([[A3, I1, A2], [I1, A2, T1], [AT1, T1, I1]]);
  const fixed = repairedText(plan);
  expect(parentOf(fixed, A3)).toBe(A2);
  expect(parentOf(fixed, I1)).toBe(T1);
  expect(parentOf(fixed, AT1)).toBe(I1);
  // Only the three changed lines differ; the rest stay byte for byte.
  const a = text.split('\n');
  const b = fixed.split('\n');
  expect(b.length).toBe(a.length);
  expect(a.filter((l, i) => l !== b[i]).length).toBe(3);
  expect(checkRepaired(fixed)).toMatchObject({ ok: true, leaf: A6, promptLeaf: A6 });
  expect(planRepair(fixed).changes).toEqual([]); // a second run finds nothing
});

test('two interlopers move together, in their order', () => {
  const plan = planRepair(lines(broken({ two: true })));
  expect(plan.splits[0]!.interlopers).toEqual([I1, I2]);
  const fixed = repairedText(plan);
  expect([parentOf(fixed, A3), parentOf(fixed, I1), parentOf(fixed, I2), parentOf(fixed, AT1)]).toEqual([A2, T1, I1, I2]);
  checkRepaired(fixed);
});

test('a turn with no tool use: the interloper goes after the turn\'s last record', () => {
  const plan = planRepair(lines(broken({ noTool: true })));
  expect(plan.splits[0]!.anchor).toBe(A4);
  const fixed = repairedText(plan);
  expect([parentOf(fixed, A3), parentOf(fixed, I1), parentOf(fixed, AT1)]).toEqual([A2, A4, I1]);
  checkRepaired(fixed);
});

test('a healthy transcript, and a split off the live branch, are left alone', () => {
  const healthy = broken();
  (healthy[4] as { parentUuid: string }).parentUuid = A2; // result on its use
  (healthy[3] as { parentUuid: string }).parentUuid = T1; // note after the turn
  (healthy[8] as { parentUuid: string }).parentUuid = I1;
  expect(planRepair(lines(healthy)).changes).toEqual([]);
  // A later branch from R leaves the split behind.
  const forked = [...broken().slice(0, -1), user(U(20), R, 'Start again.'), asst(U(21), U(20), 'msg_9', [{ type: 'text', text: 'Fresh start.' }])];
  const plan = planRepair(lines(forked));
  expect(plan.changes).toEqual([]);
  expect(plan.offBranch).toEqual([A3]);
});

test('refuses a shape it does not know, and a line that is not JSON', () => {
  const recs = broken();
  // The record between use and result is the turn's own tool_result: not an interloper.
  recs[3] = user(I1, A2, [{ type: 'tool_result', tool_use_id: 'toolu_0', content: 'x' }]);
  expect(() => planRepair(lines(recs))).toThrow('belongs to the turn');
  expect(() => planRepair(`${lines(broken())}{not json\n`)).toThrow('is not JSON');
});

test('the check fails when the last-prompt leaf is off the live branch', () => {
  const recs = broken();
  recs.push({ type: 'last-prompt', lastPrompt: 'x', leafUuid: U(99), sessionId: SID });
  expect(() => checkRepaired(repairedText(planRepair(lines(recs))))).toThrow('not on the live branch');
});

let dir: string;
let atc: FakeAtc | null = null;
beforeEach(() => {
  dir = mkdtempSync(join(process.env['TMPDIR'] ?? '/tmp', 'hq-repair-'));
  process.env['HQ_REPAIR_BACKUPS'] = `${dir}/backups`;
  process.env['HQ_CLAUDE_PROJECTS'] = `${dir}/projects`;
});
afterEach(() => {
  atc?.stop();
  atc = null;
  delete process.env['HQ_ATC_SOCKET'];
  delete process.env['HQ_REPAIR_BACKUPS'];
  delete process.env['HQ_CLAUDE_PROJECTS'];
  rmSync(dir, { recursive: true, force: true });
});

function withAtc(sessions: object[]): void {
  const list: never[] = sessions as never[];
  atc = fakeAtc(dir, list);
}

test('--file: a dry run writes nothing; --apply backs up, writes, and passes its check', async () => {
  withAtc([{ id: 'id-other', name: 'z-other', alive: true, state: 'done', agentSessionID: 'aaaa' }]);
  const file = join(dir, `${SID}.jsonl`);
  const text = lines(broken());
  writeFileSync(file, text);
  const dry = await repairAdvisor400(undefined, { file, apply: false });
  expect(dry.text).toContain('Dry run: nothing written');
  expect(dry.text).toContain(`line 4 00000000: 00000000 → 00000000`);
  expect(readFileSync(file, 'utf8')).toBe(text);
  expect(existsSync(`${dir}/backups`)).toBe(false);

  const r = await repairAdvisor400(undefined, { file, apply: true });
  expect(r.data['applied']).toBe(true);
  const backups = readdirSync(`${dir}/backups`);
  expect(backups).toHaveLength(1);
  expect(backups[0]).toStartWith(`${SID}-advisor-400-`);
  expect(readFileSync(join(`${dir}/backups`, backups[0]!), 'utf8')).toBe(text);
  const fixed = readFileSync(file, 'utf8');
  expect(parentOf(fixed, A3)).toBe(A2);
  expect(readdirSync(dir).filter((f) => f.includes('repair-tmp'))).toEqual([]);
  const again = await repairAdvisor400(undefined, { file, apply: true });
  expect(again.text).toContain('nothing to repair');
});

test('refuses a transcript a live session holds, and a session that is running or not on this machine', async () => {
  const file = join(dir, `${SID}.jsonl`);
  writeFileSync(file, lines(broken()));
  withAtc([
    { id: 'id-live', name: 'z-live', alive: true, state: 'running', agent: 'claude', agentSessionID: SID, cwd: '/work/widgets', locator: { targetID: 'local' } },
    { id: 'id-cloud', name: 'z-cloud', alive: false, state: 'exited', agent: 'claude', agentSessionID: 'c1', cwd: '/root/w', locator: { targetID: 'cloud' } },
    { id: 'id-dup', name: 'twin', alive: false, state: 'exited' },
    { id: 'id-dup2', name: 'twin', alive: false, state: 'exited' },
  ]);
  await expect(repairAdvisor400(undefined, { file, apply: true })).rejects.toThrow('z-live (id-live) is running on this transcript');
  await expect(repairAdvisor400('z-live', { apply: true })).rejects.toThrow('z-live is alive; stop it before the repair');
  await expect(repairAdvisor400('z-cloud', { apply: false })).rejects.toThrow('runs on the cloud target');
  await expect(repairAdvisor400('twin', { apply: false })).rejects.toThrow('2 sessions are named twin');
  await expect(repairAdvisor400('nobody', { apply: false })).rejects.toThrow('no atc session nobody');
  await expect(repairAdvisor400(undefined, { apply: false })).rejects.toThrow('give the session');
  expect(readFileSync(file, 'utf8')).toBe(lines(broken()));
});

test('a stopped local session: hq finds its transcript from atc\'s cwd and Claude session id', async () => {
  withAtc([{ id: 'id-stopped', name: 'z-stopped', alive: false, state: 'exited', agent: 'claude', agentSessionID: SID, cwd: '/work/my.widgets', locator: { targetID: 'local' } }]);
  const file = transcriptPath('/work/my.widgets', SID);
  expect(file).toBe(`${dir}/projects/-work-my-widgets/${SID}.jsonl`);
  mkdirSync(`${dir}/projects/-work-my-widgets`, { recursive: true });
  writeFileSync(file, lines(broken()));
  const r = await repairAdvisor400('z-stopped', { apply: true });
  expect(r.data).toMatchObject({ file, session: 'id-stopped', applied: true });
  expect(parentOf(readFileSync(file, 'utf8'), I1)).toBe(T1);
});

test('the folder name gives one dash per UTF-16 code unit, so an emoji takes two', () => {
  expect(transcriptPath('/work/\u{1F375}', SID)).toBe(`${dir}/projects/-work---/${SID}.jsonl`);
});

test('without atc, hq refuses: it cannot tell the session is stopped', async () => {
  const file = join(dir, `${SID}.jsonl`);
  writeFileSync(file, lines(broken()));
  await expect(repairAdvisor400(undefined, { file, apply: true })).rejects.toThrow('checks with atc that the session is stopped');
});

test('review follow-ups: a dangling parent, a long run of interlopers, and a turn that ends the transcript', () => {
  const dangling = broken();
  (dangling[1] as { parentUuid: string }).parentUuid = U(77);
  expect(() => planRepair(lines(dangling))).toThrow(`names a parent ${U(77)} that is not in the transcript`);

  // 25 notes between the use and its result: all move, in order.
  const recs = broken();
  const notes = Array.from({ length: 25 }, (_, k) => user(U(100 + k), k ? U(99 + k) : A2, [{ type: 'text', text: `Note ${k}.` }], { isMeta: true }));
  recs.splice(3, 1, ...notes);
  (recs[3 + 25] as { parentUuid: string }).parentUuid = U(124);
  const plan = planRepair(lines(recs));
  expect(plan.splits[0]!.interlopers).toHaveLength(25);
  const fixed = repairedText(plan);
  expect([parentOf(fixed, A3), parentOf(fixed, U(100)), parentOf(fixed, AT1)]).toEqual([A2, T1, U(124)]);
  checkRepaired(fixed);

  // Nothing after the turn: the moved note would leave the live branch, so hq refuses.
  const tail = broken().slice(0, 8);
  expect(() => planRepair(lines(tail))).toThrow('ends the transcript');
});

test('review follow-ups: a stopped session whose transcript a live session holds, and a shortened project folder', async () => {
  withAtc([
    { id: 'id-old', name: 'z-old', alive: false, state: 'exited', agent: 'claude', agentSessionID: SID, cwd: '/work/widgets', locator: { targetID: 'local' } },
    { id: 'id-new', name: 'z-new', alive: true, state: 'running', agent: 'claude', agentSessionID: SID, cwd: '/work/widgets', locator: { targetID: 'local' } },
  ]);
  await expect(repairAdvisor400('z-old', { apply: true })).rejects.toThrow('z-new (id-new) is running on this transcript');

  const long = `/work/${'x'.repeat(240)}`;
  mkdirSync(`${dir}/projects/-work-xxxx-shortened-1a2b`, { recursive: true });
  writeFileSync(`${dir}/projects/-work-xxxx-shortened-1a2b/${SID}.jsonl`, 'x');
  expect(transcriptPath(long, SID)).toBe(`${dir}/projects/-work-xxxx-shortened-1a2b/${SID}.jsonl`);
  mkdirSync(`${dir}/projects/-elsewhere`, { recursive: true });
  writeFileSync(`${dir}/projects/-elsewhere/${SID}.jsonl`, 'x');
  expect(() => transcriptPath(long, SID)).toThrow('2 project folders hold');
  expect(() => transcriptPath('/work', '../../etc/passwd')).toThrow('is not a Claude session id');
});
