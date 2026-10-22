import type { Database } from 'bun:sqlite';
import { capacitySettings } from '../capacity/capacity-settings.ts';
import type { CapacitySettings } from '../capacity/types.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { loadConsoleItems } from '../load-console-items.ts';
import { buildLanePlan } from '../lanes/build-lane-plan.ts';
import { formatPlanOverage } from '../lanes/format-plan-overage.ts';
import { loadPacing } from '../lanes/load-pacing.ts';
import { readRunningByPlace } from '../lanes/read-running-by-place.ts';
import type { PacingSlots } from '../lanes/types.ts';
import { match } from 'ts-pattern';
import { loadNixState } from './load-nix-state.ts';
import type { Band, BandSegment } from './types.ts';

// The band's line from what hq already stores; it runs no probe, script or network call, so a
// read every minute costs a few queries. Each segment says how it is drawn.
export async function loadBand(db: Database, pacingFile: string, at: Date = now()): Promise<Band> {
  const segments = [buildNeedsSegment(db), buildNixSegment(db, at), await loadLanesSegment(db, pacingFile, at), buildCISegment(db, at), buildReviewsSegment(db, at)];
  return { at: iso(at), segments, line: segments.map((segment) => segment.text).join(' · ') };
}

function buildNeedsSegment(db: Database): BandSegment {
  const count = loadConsoleItems(db).length;
  return { key: 'needs', text: `Needs you ${count}`, tone: count > 0 ? 'alert' : 'ok' };
}

function buildNixSegment(db: Database, at: Date): BandSegment {
  return match(loadNixState(db, at))
    .with({ kind: 'down' }, (): BandSegment => ({ key: 'nix', text: 'Nix down', tone: 'alert' }))
    .with({ kind: 'unknown' }, (): BandSegment => ({ key: 'nix', text: 'Nix ?', tone: 'warn' }))
    .with({ kind: 'up' }, (): BandSegment => ({ key: 'nix', text: 'Nix up', tone: 'ok' }))
    .exhaustive();
}

// The runs that hold a slot against the slot caps, then impd's non-Nix use against its lines. Amber
// when the runs exceed the caps, when one more imp would cross either impd line, when no impd reading
// is 15 minutes fresh, or when the imp cap, all full, would cross one ("plan 18/16 GiB").
async function loadLanesSegment(db: Database, pacingFile: string, at: Date): Promise<BandSegment> {
  const pacing = await loadPacing(pacingFile);
  return pacing.slots === null ? { key: 'lanes', text: 'lanes ?', tone: 'warn' } : buildLanesFromConfig(db, at, pacing.slots, pacing.impMib);
}

function buildLanesFromConfig(db: Database, at: Date, slots: PacingSlots, impMib: number): BandSegment {
  const impd = loadImpdLine(db, at, impMib),
    plan = formatPlanOverage(buildLanePlan(slots.imp, impMib, capacitySettings(db))),
    running = readRunningByPlace(db, at),
    size = slots.imp + slots.local,
    used = running.imp + running.local;
  return { key: 'lanes', text: `lanes ${used}/${size} (${impd.text}${plan === null ? '' : `; ${plan}`})`, tone: impd.near || used > size || plan !== null ? 'warn' : 'ok' };
}

interface ImpdLine {
  text: string;
  near: boolean;
}

interface ImpdReading {
  at: string;
  nonnix_awake_mib: number | null;
  nonnix_awake_vcpus: number | null;
}

function loadImpdLine(db: Database, at: Date, impMib: number): ImpdLine {
  const FRESH_MS = 15 * 60_000,
    reading = db.query('SELECT at, nonnix_awake_mib, nonnix_awake_vcpus FROM capacity_samples WHERE at <= ? ORDER BY at DESC LIMIT 1').get(iso(at)) as ImpdReading | null;
  if (reading === null || reading.nonnix_awake_mib === null || reading.nonnix_awake_vcpus === null || at.getTime() - Date.parse(reading.at) > FRESH_MS) {
    return { text: 'impd ?', near: true };
  }
  return buildImpdLine(reading.nonnix_awake_mib, reading.nonnix_awake_vcpus, capacitySettings(db), impMib);
}

function buildImpdLine(awakeMib: number, awakeVcpus: number, settings: CapacitySettings, impMib: number): ImpdLine {
  const MIB_PER_GIB = 1024,
    gib = `${Math.round(awakeMib / MIB_PER_GIB)}/${Math.round(settings.nonnixMaxMib / MIB_PER_GIB)} GiB`,
    near = settings.nonnixMaxMib - awakeMib < impMib || settings.nonnixMaxVcpus - awakeVcpus < settings.impVcpus,
    vcpus = `${awakeVcpus}/${settings.nonnixMaxVcpus} vCPU`;
  return { text: `impd ${gib}, ${vcpus}`, near };
}

// Each workflow's newest finished push run of the last 24 hours; red when any of those failed.
// Unknown when the goals sync has stored no run in 2 hours.
function buildCISegment(db: Database, at: Date): BandSegment {
  const DAY_MS = 86_400_000,
    STALE_MS = 2 * 3_600_000,
    cutoff = iso(new Date(at.getTime() - DAY_MS)),
    failed = db
      .query(
        `SELECT COUNT(*) AS n FROM ci_runs r WHERE r.event = 'push' AND r.status = 'completed' AND r.created_at >= ?
           AND r.created_at = (SELECT MAX(o.created_at) FROM ci_runs o WHERE o.repo = r.repo AND o.path = r.path AND o.event = 'push' AND o.status = 'completed')
           AND r.conclusion IN ('failure', 'timed_out', 'startup_failure')`,
      )
      .get(cutoff) as { n: number },
    newest = db.query('SELECT MAX(updated_at) AS at FROM ci_runs').get() as { at: string | null };
  if (newest.at === null || at.getTime() - Date.parse(newest.at) > STALE_MS) {
    return { key: 'ci', text: 'CI ?', tone: 'warn' };
  }
  return failed.n === 0 ? { key: 'ci', text: 'CI green', tone: 'ok' } : { key: 'ci', text: `CI ${failed.n} red`, tone: 'alert' };
}

// Open PRs whose review started in the last 24 hours and has not finished.
function buildReviewsSegment(db: Database, at: Date): BandSegment {
  const DAY_MS = 86_400_000,
    cutoff = iso(new Date(at.getTime() - DAY_MS)),
    row = db.query("SELECT COUNT(*) AS n FROM run_prs WHERE state = 'open' AND review_started_at >= ? AND (reviewed_at IS NULL OR reviewed_at < review_started_at)").get(cutoff) as { n: number };
  return { key: 'reviews', text: `reviews ${row.n}`, tone: 'ok' };
}
