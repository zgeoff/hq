import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { capacitySettings } from '../capacity/capacity-settings.ts';
import type { CapacitySettings } from '../capacity/types.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { loadConsoleItems } from '../load-console-items.ts';
import { buildLanePlan } from '../lanes/build-lane-plan.ts';
import { formatPlanOverage } from '../lanes/format-plan-overage.ts';
import { countWorking } from '../lanes/cap/count-working.ts';
import { formatCapUntil } from '../lanes/cap/format-cap-until.ts';
import { readActiveCap } from '../lanes/cap/read-active-cap.ts';
import { loadPacing } from '../lanes/load-pacing.ts';
import { readRunningByPlace } from '../lanes/read-running-by-place.ts';
import type { PacingSlots } from '../lanes/types.ts';
import { match } from 'ts-pattern';
import { loadNixState } from './load-nix-state.ts';
import type { Band, BandSegment } from './types.ts';

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

async function loadLanesSegment(db: Database, pacingFile: string, at: Date): Promise<BandSegment> {
  const pacing = await loadPacing(pacingFile);
  return pacing.slots === null ? { key: 'lanes', text: 'lanes ?', tone: 'warn' } : loadLanesFromConfig(db, at, pacing.slots, pacing.impMib);
}

function loadLanesFromConfig(db: Database, at: Date, slots: PacingSlots, impMib: number): BandSegment {
  const impd = loadImpdLine(db, at, impMib);
  const plan = formatPlanOverage(buildLanePlan(slots.imp, impMib, capacitySettings(db)));
  const running = readRunningByPlace(db, at);
  const over = running.imp > slots.imp || running.local > slots.local;
  const size = slots.imp + slots.local;
  const used = running.imp + running.local;
  const detail = `${impd.text}${plan === null ? '' : `; ${plan}`}`;
  const cap = readActiveCap(db, at);
  const tone = impd.near || over || plan !== null ? 'warn' : 'ok';
  if (cap === null) {
    return { key: 'lanes', text: `lanes ${used}/${size} (${detail})`, tone };
  }
  const until = cap.until === null ? '' : ` until ${formatCapUntil(cap.until)}`;
  return { key: 'lanes', text: `lanes ${countWorking(db, at).count}/${cap.cap} (cap of ${size}${until}; ${detail})`, tone };
}

interface ImpdLine {
  text: string;
  near: boolean;
}

const ImpdReadingRow = z.object({ at: z.string(), nonnix_awake_mib: z.number().nullable(), nonnix_awake_vcpus: z.number().nullable() }).nullable();

function loadImpdLine(db: Database, at: Date, impMib: number): ImpdLine {
  const FRESH_MS = 15 * 60_000;
  const reading = ImpdReadingRow.parse(db.query('SELECT at, nonnix_awake_mib, nonnix_awake_vcpus FROM capacity_samples WHERE at <= ? ORDER BY at DESC LIMIT 1').get(iso(at)));
  if (reading === null || reading.nonnix_awake_mib === null || reading.nonnix_awake_vcpus === null || at.getTime() - Date.parse(reading.at) > FRESH_MS) {
    return { text: 'impd ?', near: true };
  }
  return buildImpdLine(reading.nonnix_awake_mib, reading.nonnix_awake_vcpus, capacitySettings(db), impMib);
}

function buildImpdLine(awakeMib: number, awakeVcpus: number, settings: CapacitySettings, impMib: number): ImpdLine {
  const MIB_PER_GIB = 1024;
  const gib = `${Math.round(awakeMib / MIB_PER_GIB)}/${Math.round(settings.nonnixMaxMib / MIB_PER_GIB)} GiB`;
  const near = settings.nonnixMaxMib - awakeMib < impMib || settings.nonnixMaxVcpus - awakeVcpus < settings.impVcpus;
  const vcpus = `${awakeVcpus}/${settings.nonnixMaxVcpus} vCPU`;
  return { text: `impd ${gib}, ${vcpus}`, near };
}

const CountRow = z.object({ count: z.number() });

const NewestUpdateRow = z.object({ at: z.string().nullable() });

function buildCISegment(db: Database, at: Date): BandSegment {
  const DAY_MS = 86_400_000;
  const STALE_MS = 2 * 3_600_000;
  const cutoff = iso(new Date(at.getTime() - DAY_MS));
  const failed = CountRow.parse(
    db
      .query(
        `SELECT COUNT(*) AS count FROM ci_runs r WHERE r.event = 'push' AND r.status = 'completed' AND r.created_at >= ?
         AND r.created_at = (SELECT MAX(o.created_at) FROM ci_runs o WHERE o.repo = r.repo AND o.path = r.path AND o.event = 'push' AND o.status = 'completed')
         AND r.conclusion IN ('failure', 'timed_out', 'startup_failure')`,
      )
      .get(cutoff),
  );
  const newest = NewestUpdateRow.parse(db.query('SELECT MAX(updated_at) AS at FROM ci_runs').get());
  if (newest.at === null || at.getTime() - Date.parse(newest.at) > STALE_MS) {
    return { key: 'ci', text: 'CI ?', tone: 'warn' };
  }
  return failed.count === 0 ? { key: 'ci', text: 'CI green', tone: 'ok' } : { key: 'ci', text: `CI ${failed.count} red`, tone: 'alert' };
}

function buildReviewsSegment(db: Database, at: Date): BandSegment {
  const DAY_MS = 86_400_000;
  const cutoff = iso(new Date(at.getTime() - DAY_MS));
  const row = CountRow.parse(db.query("SELECT COUNT(*) AS count FROM run_prs WHERE state = 'open' AND review_started_at >= ? AND (reviewed_at IS NULL OR reviewed_at < review_started_at)").get(cutoff));
  return { key: 'reviews', text: `reviews ${row.count}`, tone: 'ok' };
}
