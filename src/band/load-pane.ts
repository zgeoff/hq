import type { Database } from 'bun:sqlite';
import { parkedRuns } from '../areas/parked-runs.ts';
import { RUNNING } from '../areas/running.ts';
import type { LaneConfig } from '../areas/types.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { capacitySettings } from '../capacity/capacity-settings.ts';
import { buildLanePlan } from '../lanes/build-lane-plan.ts';
import { formatPlanOverage } from '../lanes/format-plan-overage.ts';
import { loadPacing } from '../lanes/load-pacing.ts';
import { loadConsoleItems } from '../load-console-items.ts';
import { sydneyUtc } from '../morning/sydney-utc.ts';
import { sydney } from '../morning/sydney.ts';
import { line } from '../news/line.ts';
import type { NewsItem } from '../news/types.ts';
import { formatCount } from '../console/format-count.ts';
import { downtime } from '../probe/downtime.ts';
import { formatClock } from '../probe/format-clock.ts';
import { match } from 'ts-pattern';
import { loadNixState } from './load-nix-state.ts';
import type { Pane, PaneHeatRow } from './types.ts';

// The /hq pane's detail behind the band, from what hq already stores: what needs the owner with its
// links, Nix today, what holds each lane, reviews in flight, what merged today, and the newest
// news. Links are Markdown, so the terminal makes them clickable.
export async function loadPane(db: Database, pacingFile: string, consoleURL: string, at: Date = now()): Promise<Pane> {
  const config = await loadPacing(pacingFile),
    held = collectHeldIssues(db, at),
    lanes = config.lanes ?? [],
    overage = formatPlanOverage(buildLanePlan(lanes, config.impMib, capacitySettings(db))),
    sections = [loadNeedsYouSection(db, consoleURL), loadNixSection(db, at), renderLanesSection(lanes, held, config.error, overage), loadReviewsSection(db, at), loadShippedSection(db, consoleURL, at), loadNewsSection(db)];
  return { at: iso(at), markdown: sections.join('\n\n'), heat: lanes.map((lane) => buildHeatRow(lane, held)) };
}

function loadNeedsYouSection(db: Database, consoleURL: string): string {
  const items = loadConsoleItems(db),
    rows = items.map((item) => `- ${item.kind}: ${sanitizeCutURL(item.title)}${item.links.map((link) => ` · [${link.label}](${link.url})`).join('')}`);
  return [`## Needs you (${items.length})`, ...(items.length === 0 ? ['Nothing waits on you.'] : rows), `[Open the console](${consoleURL})`].join('\n');
}

// The console cuts a long title with an ellipsis, which can land inside a URL; the terminal would
// link the cut URL, so the cut moves to before it.
function sanitizeCutURL(title: string): string {
  return title.replace(/\s*\(?https?:\/\/\S*…$/u, '…');
}

function loadNixSection(db: Database, at: Date): string {
  const state = match(loadNixState(db, at))
      .with({ kind: 'down' }, (nix) => `**Down** since ${formatClock(nix.since)}`)
      .with({ kind: 'unknown' }, (nix) => `**Unknown**: ${nix.reason}`)
      .with({ kind: 'up' }, () => 'Up')
      .exhaustive(),
    today = downtime(db, getSydneyMidnight(at), at);
  return `## Nix\n${state} · ${today.downMinutes} min down today`;
}

// Each lane's slots and the runs that hold them; a parked run holds no slot and says so. A plan
// over impd's line comes first, in bold, as the band shows it in amber.
function renderLanesSection(lanes: readonly LaneConfig[], held: Map<string, HeldIssue[]>, error: string | null, overage: string | null): string {
  if (error !== null) {
    return `## Lanes\nhq can't read the lanes: ${error}`;
  }
  const rows = lanes.map((lane) => {
    const runs = held.get(lane.name) ?? [],
      used = runs.filter((run) => !run.parked).length;
    return `- ${lane.name} ${formatLaneCount(used, lane.size)}${runs.length === 0 ? '' : `: ${runs.map((run) => (run.parked ? `${run.issue} (parked)` : run.issue)).join(', ')}`}`;
  });
  return ['## Lanes', ...(overage === null ? [] : [`**The imp lanes, all full, cross impd's line: ${overage}**`]), ...(rows.length === 0 ? ['No lanes in pacing.json.'] : rows)].join('\n');
}

// The lane's true use, as the band counts it; bold when the runs exceed its size, since Markdown
// has no amber.
function formatLaneCount(used: number, size: number): string {
  return used > size ? `**${used}/${size}**` : `${used}/${size}`;
}

function loadReviewsSection(db: Database, at: Date): string {
  const DAY_MS = 86_400_000,
    cutoff = iso(new Date(at.getTime() - DAY_MS)),
    rows = db
      .query("SELECT ref, url, review_round, review_started_at FROM run_prs WHERE state = 'open' AND review_started_at >= ? AND (reviewed_at IS NULL OR reviewed_at < review_started_at) ORDER BY review_started_at")
      .all(cutoff) as { ref: string; url: string | null; review_round: number; review_started_at: string }[],
    shownRows = rows.map((row) => `- [${row.ref}](${row.url ?? buildPRURL(row.ref)}): round ${row.review_round + 1}, started ${formatClock(row.review_started_at)}`);
  return [`## Reviews in flight (${rows.length})`, ...(rows.length === 0 ? ['None.'] : shownRows)].join('\n');
}

// PRs hq saw merge since Sydney midnight.
function loadShippedSection(db: Database, consoleURL: string, at: Date): string {
  const batch = db.query('SELECT ref, issue FROM run_prs WHERE merged_at >= ?').all(iso(getSydneyMidnight(at))) as { ref: string; issue: string }[],
    issues = new Set(batch.map((pr) => pr.issue)).size,
    repos = new Set(batch.map((pr) => pr.ref.split('#')[0])).size;
  return `## Shipped today\n${formatCount(batch.length, 'PR')} in ${formatCount(repos, 'repo')}, for ${formatCount(issues, 'issue')} · [Shipped tab](${consoleURL}shipped)`;
}

// The newest news lines, read or not, newest first.
function loadNewsSection(db: Database): string {
  const LIMIT = 5,
    items = db.query('SELECT * FROM news ORDER BY id DESC LIMIT ?').all(LIMIT) as NewsItem[];
  return ['## News', ...(items.length === 0 ? ['No news yet.'] : items.map((item) => `- ${line(item)}`))].join('\n');
}

interface HeldIssue {
  issue: string;
  parked: boolean;
}

// The running runs of each lane, a parked one marked.
function collectHeldIssues(db: Database, at: Date): Map<string, HeldIssue[]> {
  const byLane = new Map<string, HeldIssue[]>(),
    parked = new Set(parkedRuns(db, at).map((run) => run.issue)),
    rows = db.query(`SELECT issue, COALESCE(lane, '') AS lane FROM runs WHERE place != 'none' AND state IN (${RUNNING.map(() => '?').join(', ')}) ORDER BY issue`).all(...RUNNING) as { issue: string; lane: string }[];
  for (const row of rows) {
    byLane.set(row.lane, [...(byLane.get(row.lane) ?? []), { issue: row.issue, parked: parked.has(row.issue) }]);
  }
  return byLane;
}

function buildHeatRow(lane: LaneConfig, held: Map<string, HeldIssue[]>): PaneHeatRow {
  const used = (held.get(lane.name) ?? []).filter((run) => !run.parked).length;
  return { lane: lane.name, size: lane.size, used };
}

// A run PR's ref is repo#n in zgeoff's account, as hq run pr records it.
function buildPRURL(ref: string): string {
  const [repo, number] = ref.split('#');
  return `https://github.com/zgeoff/${repo}/pull/${number}`;
}

function getSydneyMidnight(at: Date): Date {
  const day = sydney(at);
  return sydneyUtc(day.y, day.mo, day.d);
}
