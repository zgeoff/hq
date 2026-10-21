// hq repair advisor-400 <session>: mend a Claude transcript that fails every turn with
// "unexpected tool_use_id found in advisor_tool_result blocks" (z-stu, 2026-10-17; root cause GEO-1169).
// A record written mid-turn (such as an atc-bridge message) can land between an advisor
// server_tool_use and its advisor_tool_result in the parentUuid chain. Claude then sends the
// result in a later message than its use, and the API refuses every turn. The repair re-links the
// result to its use and moves the interloper after the turn's last record, so it stays in context.
// Only parentUuid fields change; every other line stays byte for byte. Dry run unless --apply.
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { AtcClient } from '../atc/atc-client.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import { backupDir } from './backup-dir.ts';
import { checkRepaired } from './check-repaired.ts';
import { planRepair } from './plan-repair.ts';
import { planText } from './plan-text.ts';
import { repairedText } from './repaired-text.ts';
import { transcriptPath } from './transcript-path.ts';

export async function repairAdvisor400(target: string | undefined, opts: { file?: string; apply: boolean }): Promise<{ data: Record<string, unknown>; text: string }> {
  if (!target && !opts.file) throw new HqError('bad_args', 'give the session: hq repair advisor-400 <session>, or --file <transcript.jsonl>');
  if (target && opts.file) throw new HqError('bad_args', 'give a session or --file, not both');
  const { file, session } = await locate(target, opts.file);
  if (!existsSync(file)) throw new HqError('no_transcript', `no transcript at ${file}`);
  const before = statSync(file);
  const text = readFileSync(file, 'utf8');
  const plan = planRepair(text);
  checkRoundTrip(plan);
  const fixed = repairedText(plan);
  const check = checkRepaired(fixed);
  const { recs: _r, lineText: _l, ...summary } = plan;
  let backup: string | null = null;
  if (opts.apply && plan.changes.length) {
    mkdirSync(backupDir(), { recursive: true });
    backup = join(backupDir(), `${basename(file, '.jsonl')}-advisor-400-${iso(now()).replace(/[-:]/g, '')}.jsonl`);
    copyFileSync(file, backup);
    const tmp = join(dirname(file), `.${basename(file)}.repair-tmp`);
    writeFileSync(tmp, fixed, { mode: before.mode & 0o777 });
    const still = statSync(file);
    if (still.size !== before.size || still.mtimeMs !== before.mtimeMs) {
      rmSync(tmp, { force: true });
      throw new HqError('transcript_changed', `${file} changed while hq read it; nothing written. Is the session really stopped?`);
    }
    renameSync(tmp, file);
    checkRepaired(readFileSync(file, 'utf8'));
  }
  const applied = backup ? `Written. Backup: ${backup}` : opts.apply ? 'Nothing to write.' : null;
  return { data: { file, session, ...summary, applied: !!backup, backup, check }, text: planText(plan, file, applied) };
}

interface WireSession {
  id: string;
  name: string;
  alive: boolean;
  state: string;
  cwd?: string;
  agent?: string;
  agentSessionID?: string;
  locator?: { targetID?: string };
}

// The session's transcript, after checking that it is stopped and on this machine. With --file,
// no live atc session may hold that transcript.
async function locate(target: string | undefined, file: string | undefined): Promise<{ file: string; session: string | null }> {
  let atc: AtcClient;
  try {
    atc = await AtcClient.open();
  } catch (e) {
    throw new HqError('atc_unreachable', `hq checks with atc that the session is stopped before it repairs; ${(e as Error).message}`);
  }
  try {
    const all = (await atc.sessions()) as WireSession[];
    if (file) {
      const id = basename(file).replace(/\.jsonl$/, '');
      const live = all.find((s) => s.alive && s.agentSessionID === id);
      if (live) throw new HqError('session_running', `${live.name} (${live.id}) is running on this transcript; stop it first`);
      return { file, session: null };
    }
    const hits = all.filter((s) => s.id === target || s.name === target);
    if (!hits.length) throw new HqError('no_such_session', `no atc session ${target}`);
    if (hits.length > 1) throw new HqError('ambiguous_session', `${hits.length} sessions are named ${target}; give its id`);
    const s = hits[0]!;
    if (s.alive || s.state !== 'exited') throw new HqError('session_running', `${s.name} is ${s.alive ? 'alive' : s.state}; stop it before the repair`);
    if (s.agent && s.agent !== 'claude') throw new HqError('bad_args', `${s.name} runs ${s.agent}, not claude`);
    if ((s.locator?.targetID ?? 'local') !== 'local') throw new HqError('not_local', `${s.name} runs on the ${s.locator!.targetID} target; its transcript is not on this machine`);
    if (!s.cwd || !s.agentSessionID) throw new HqError('no_transcript', `atc gives no cwd or Claude session id for ${s.name}`);
    const holder = all.find((x) => x.alive && x.agentSessionID === s.agentSessionID);
    if (holder) throw new HqError('session_running', `${holder.name} (${holder.id}) is running on this transcript; stop it first`);
    return { file: transcriptPath(s.cwd, s.agentSessionID), session: s.id };
  } finally {
    atc.close();
  }
}

// Every changed line must round-trip: a line Claude wrote another way would change more than parentUuid.
function checkRoundTrip(plan: ReturnType<typeof planRepair>): void {
  for (const c of plan.changes) {
    const raw = plan.lineText[c.line - 1]!;
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (JSON.stringify(o) !== raw) throw new HqError('unknown_shape', `line ${c.line} does not round-trip through JSON; hq would change more than its parentUuid`);
  }
}
