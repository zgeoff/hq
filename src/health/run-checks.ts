// hq health: read-only checks on this PC. The watcher runs them every tick and tells
// z-stu once per new problem, in one message per tick; a problem that clears becomes a
// news item. It never stops, starts or restarts anything.
import { iso } from '../clock/iso.ts';
import type { Runner } from '../runner/types.ts';
import { COMMAND_TIMEOUT_MS } from './command-timeout-ms.ts';
import type { HealthSettings } from './health-defaults.ts';
import { out } from './out.ts';
import type { Check, Probe, Samples } from './types.ts';

const glob = (pattern: string) => new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`);

// Every check, plus the restart samples to keep. Pure apart from the probe.
// unknown: key prefixes a failed read could not see; their open problems stay open.
export async function runChecks(p: Probe, s: HealthSettings, prev: Samples, at: Date): Promise<{ checks: Check[]; samples: Samples; unknown: string[] }> {
  const checks: Check[] = [];
  const unknown: string[] = [];
  const ignore = s.ignoreUnits.split(',').map((x) => x.trim()).filter(Boolean).map(glob);
  const ignored = (unit: string) => ignore.some((r) => r.test(unit));

  for (const scope of ['user', 'system'] as const) {
    const flag = scope === 'user' ? ['--user'] : [];
    const failed = await out(p.run, ['systemctl', ...flag, 'list-units', '--state=failed', '--no-legend', '--plain']);
    if (failed === null) {
      checks.push({ key: `systemd:${scope}`, ok: false, line: `can't read ${scope} units (systemctl failed)` });
      unknown.push(`failed:${scope}:`);
      continue;
    }
    const units = failed.split('\n').map((l) => l.trim().split(/\s+/)[0]).filter((u): u is string => !!u && !ignored(u));
    for (const u of units) checks.push({ key: `failed:${scope}:${u}`, ok: false, line: `${scope} unit ${u} has failed` });
    if (!units.length) checks.push({ key: `failed:${scope}`, ok: true, line: `no failed ${scope} units` });
  }

  const samples: Samples = {};
  const cutoff = at.getTime() - s.restartWindowMin * 60_000;
  let loops = 0;
  for (const scope of ['user', 'system'] as const) {
    const counts = await restartCounts(p.run, scope);
    if (!counts) {
      unknown.push(`restart-loop:${scope}:`);
      for (const [k, v] of Object.entries(prev)) if (k.startsWith(`${scope}:`)) samples[k] = v;
      continue;
    }
    for (const [unit, n] of counts) {
      if (ignored(unit)) continue;
      const k = `${scope}:${unit}`;
      const kept = (prev[k] ?? []).filter(([t]) => Date.parse(t) >= cutoff);
      kept.push([iso(at), n]);
      samples[k] = kept;
      const gained = n - Math.min(...kept.map(([, x]) => x));
      if (gained >= s.restarts) {
        loops++;
        checks.push({ key: `restart-loop:${k}`, ok: false, line: `${scope} unit ${unit} is restart-looping: ${gained} restarts in ${s.restartWindowMin} min (NRestarts ${n})` });
      }
    }
  }
  if (!loops) checks.push({ key: 'restart-loop', ok: true, line: 'no restart loops' });

  // /tmp too: on this PC it's a 16 GB tmpfs, and agent build caches filled it once (2026-10-16).
  const df = await out(p.run, ['df', '-P', '-B1', '/', p.home, '/tmp']);
  if (df === null) {
    checks.push({ key: 'disk', ok: false, line: "can't read disk space (df failed)" });
    unknown.push('disk:');
  }
  else {
    const seen = new Set<string>();
    for (const l of df.split('\n').slice(1)) {
      const f = l.trim().split(/\s+/);
      if (f.length < 6) continue;
      const mount = f.slice(5).join(' ');
      if (seen.has(mount)) continue;
      seen.add(mount);
      const size = Number(f[1]);
      const avail = Number(f[3]);
      const pct = size ? (avail / size) * 100 : 0;
      const gib = avail / 2 ** 30;
      const low = pct < s.diskMinPct || gib < s.diskMinGiB;
      checks.push({ key: `disk:${mount}`, ok: !low, line: `disk ${mount}: ${gib.toFixed(1)} GiB free (${pct.toFixed(0)}%)${low ? `, under ${s.diskMinPct}% or ${s.diskMinGiB} GiB` : ''}` });
    }
  }

  try {
    const psi = await p.readFile('/proc/pressure/memory');
    const avg60 = Number(/^some .*avg60=([\d.]+)/m.exec(psi)?.[1] ?? 'NaN');
    const high = avg60 >= s.memSomeAvg60;
    checks.push({ key: 'memory:pressure', ok: !high, line: `memory pressure: some avg60 ${avg60}%${high ? `, at or over ${s.memSomeAvg60}%` : ''}` });
  } catch {
    checks.push({ key: 'memory:pressure-read', ok: false, line: "can't read /proc/pressure/memory" });
    unknown.push('memory:pressure');
  }
  try {
    const mi = await p.readFile('/proc/meminfo');
    const total = Number(/^MemTotal:\s+(\d+)/m.exec(mi)?.[1]);
    const avail = Number(/^MemAvailable:\s+(\d+)/m.exec(mi)?.[1]);
    const pct = (avail / total) * 100;
    const low = pct < s.memAvailMinPct;
    checks.push({ key: 'memory:available', ok: !low, line: `memory available: ${(avail / 2 ** 20).toFixed(1)} GiB (${pct.toFixed(0)}%)${low ? `, under ${s.memAvailMinPct}%` : ''}` });
  } catch {
    checks.push({ key: 'memory', ok: false, line: "can't read /proc/meminfo" });
    unknown.push('memory:available');
  }

  const b = p.backup?.();
  if (b?.everRan) {
    const age = b.lastOk ? (at.getTime() - Date.parse(b.lastOk)) / 3_600_000 : Infinity;
    const stale = age > s.backupMaxAgeHours;
    checks.push({
      key: 'backup',
      ok: !stale,
      line: stale ? `hq backup: no good backup in ${Number.isFinite(age) ? `${age.toFixed(1)} h` : 'ever'}${b.lastError ? `; last error: ${b.lastError.slice(0, 200)}` : ''}` : `hq backup: last good ${age.toFixed(1)} h ago`,
    });
  }

  const m = p.morning?.(at);
  if (m) checks.push(m);
  const gd = p.goalsDaily?.(at);
  if (gd) checks.push(gd);
  const gw = p.goalsWeekly?.(at);
  if (gw) checks.push(gw);
  const f = p.defsFetch?.();
  if (f) checks.push(f);
  for (const tree of [p.defsTree?.(at), p.privateTree?.(at)]) {
    if (tree) {
      checks.push(tree);
    }
  }
  try {
    checks.push(...(p.fleetTrust?.() ?? []));
  } catch {}
  try {
    const pr = p.probe?.(at);
    if (pr) checks.push(pr);
  } catch {}
  try {
    const lc = p.localConfig?.();
    if (lc) {
      checks.push(lc);
    }
  } catch {}
  const w = p.watcher?.(at);
  if (w) checks.push(w);

  const atcErr = await p.atcAnswers();
  checks.push({ key: 'atc', ok: atcErr === null, line: atcErr === null ? 'atc daemon answers' : `atc daemon does not answer: ${atcErr}` });

  let lanes = 'unknown';
  try {
    const r = await Promise.race([p.run(['systemctl', '--user', 'is-active', 'hq-lanes']), Bun.sleep(COMMAND_TIMEOUT_MS).then(() => null)]);
    if (r) lanes = r.stdout.trim() || 'inactive';
  } catch {}
  checks.push({ key: 'hq-lanes', ok: lanes === 'active', line: `hq-lanes watcher: ${lanes}` });

  return { checks, samples, unknown };
}

// NRestarts per service, for one manager (user or system).
async function restartCounts(run: Runner, scope: 'user' | 'system'): Promise<Map<string, number> | null> {
  const flag = scope === 'user' ? ['--user'] : [];
  const list = await out(run, ['systemctl', ...flag, 'list-units', '--type=service', '--all', '--no-legend', '--plain']);
  if (list === null) return null;
  const names = list.split('\n').map((l) => l.trim().split(/\s+/)[0]).filter((n): n is string => !!n && n.endsWith('.service'));
  const counts = new Map<string, number>();
  if (!names.length) return counts;
  const show = await out(run, ['systemctl', ...flag, 'show', '-p', 'Id', '-p', 'NRestarts', ...names]);
  if (show === null) return null;
  for (const block of show.split(/\n\s*\n/)) {
    const id = /^Id=(.+)$/m.exec(block)?.[1];
    const n = /^NRestarts=(\d+)$/m.exec(block)?.[1];
    if (id && n !== undefined) counts.set(id, Number(n));
  }
  return counts;
}
