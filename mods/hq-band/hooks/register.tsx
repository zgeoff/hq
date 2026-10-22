import { atom, read, update } from 'claude-code';
import type { EngineInterface, On, ResolveInput } from 'claude-code';
import type { BandReading, PaneDetail, PaneHeatRow, PaneReading } from '../types';
import { isHeatList } from './is-heat-list';
import { isSegmentList } from './is-segment-list';

// The band is z-stu's alone. In any other session, or when hq can't say whose session this is,
// both hooks pass straight through: no timer, no process after the first, nothing drawn.
const LIVE = atom({ plugin: 'hq-band', key: 'live' } as const, false),
  OWNER = 'z-stu',
  PANE = atom({ plugin: 'hq-band', key: 'pane' } as const, null),
  PANE_ID = 'hq',
  READING = atom({ plugin: 'hq-band', key: 'reading' } as const, null),
  REFRESH_MS = 60_000,
  TIMEOUT_MS = 10_000,
  TONE_COLORS = { ok: undefined, warn: 'warning', alert: 'error' } as const;

export function register(on: On): void {
  on('session.start', async ($, e, next) => {
    const result = await next(e);
    try {
      const name = await loadSessionName($);
      if (name === OWNER) {
        await update($, LIVE, () => true);
        await refreshAll($);
        $.clock.every(REFRESH_MS, () => refreshAll($));
        await $.command.register({ name: 'hq', description: "The fleet in detail: what needs you, Nix, lanes, reviews, today's merges, news", argumentHint: '[close]' });
      }
    } catch {
      // A whois that fails or times out leaves the band inert for the session.
    }
    return result;
  });

  on('command.run', { command: 'hq' }, async ($, e, next) => {
    const isLive = await read($, LIVE);
    if (!isLive) {
      return next(e);
    }
    if (e.args.trim() === 'close') {
      await $.ui.close({ id: PANE_ID });
      return { text: 'Closed the hq pane.' };
    }
    await refreshPane($);
    await $.ui.open({ id: PANE_ID, title: 'hq' });
    return { text: 'Opened the hq pane.' };
  });

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e, next) => {
    const elements = $.ui.resolve(e),
      isLive = await read($, LIVE),
      shown = isLive ? await read($, PANE) : null;
    if (shown === null) {
      return next(e);
    }
    return 'unreachable' in shown ? <elements.Text color="warning">hq unreachable: {shown.unreachable}</elements.Text> : renderPaneDetail($, e, shown);
  });

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const elements = $.ui.resolve(e),
      isLive = await read($, LIVE),
      shown = isLive && !e.props.hasSurvey ? await read($, READING) : null;
    if (shown === null) {
      return next(e);
    }
    if ('unreachable' in shown) {
      return (
        <elements.Box key="band">
          <elements.Text color="warning" wrap="truncate-end">
            hq unreachable
          </elements.Text>
        </elements.Box>
      );
    }
    return (
      <elements.Box key="band">
        <elements.Text wrap="truncate-end">
          {shown.segments.map((segment, index) => (
            <elements.Text key={segment.key}>
              {index > 0 ? <elements.Text dimColor>{' · '}</elements.Text> : null}
              <elements.Text color={TONE_COLORS[segment.tone]}>{segment.text}</elements.Text>
            </elements.Text>
          ))}
        </elements.Text>
      </elements.Box>
    );
  });
}

async function refreshAll($: EngineInterface): Promise<void> {
  await refreshBand($);
  await refreshPane($);
}

// One read of hq pane --json into the pane's state; any failure shows "hq unreachable".
async function refreshPane($: EngineInterface): Promise<void> {
  try {
    const answer = await runHq($, ['pane', '--json']),
      pane = answer?.['pane'] as { markdown?: unknown; heat?: unknown } | undefined,
      shown: PaneReading = typeof pane?.markdown === 'string' && isHeatList(pane.heat) ? { markdown: pane.markdown, heat: pane.heat } : { unreachable: 'hq pane printed no pane' };
    await update($, PANE, () => shown);
  } catch (error) {
    await update($, PANE, () => ({ unreachable: String(error) }));
  }
}

// The heat map, a row per lane with its name, then hq's Markdown.
function renderPaneDetail($: EngineInterface, e: ResolveInput, shown: PaneDetail) {
  const elements = $.ui.resolve(e),
    width = Math.max(...shown.heat.map((row) => row.lane.length), 4);
  return (
    <elements.Box flexDirection="column" key="pane">
      {shown.heat.map((row) => (
        <elements.Box key={`lane-${row.lane}`} flexDirection="row">
          <elements.Text dimColor>{row.lane.padEnd(width + 1)}</elements.Text>
          {e.surface === 'terminal' ? renderRasterHeat($, { ...e, surface: 'terminal' }, row) : renderTextHeat($, e, row)}
          {row.used > row.size ? (
            <elements.Box key={`over-${row.lane}`}>
              <elements.Text color="warning">{` +${row.used - row.size}`}</elements.Text>
            </elements.Box>
          ) : null}
        </elements.Box>
      ))}
      <elements.Markdown key="detail" text={shown.markdown} />
    </elements.Box>
  );
}

// The terminal draws a lane's slots as one Raster, two columns to a slot.
function renderRasterHeat($: EngineInterface, e: ResolveInput & { surface: 'terminal' }, row: PaneHeatRow) {
  const terminal = $.ui.resolve(e);
  if (row.size === 0) {
    return null;
  }
  return <terminal.Raster key={`heat-${row.lane}`} columns={row.size * 2} rows={1} cells={buildHeatCells(row)} />;
}

// A surface with no Raster draws the slots as block characters.
function renderTextHeat($: EngineInterface, e: ResolveInput, row: PaneHeatRow) {
  const elements = $.ui.resolve(e);
  return (
    <elements.Box key={`heat-${row.lane}`}>
      <elements.Text>{'██'.repeat(Math.min(row.used, row.size)) + '░░'.repeat(Math.max(row.size - row.used, 0))}</elements.Text>
    </elements.Box>
  );
}

// Two cells per slot: a held slot is full blocks, amber when the lane is full and green otherwise;
// a free slot is a light shade in the terminal's own colour.
function buildHeatCells(row: PaneHeatRow): string {
  const DEFAULT = 0x01_00_00_00,
    FREE = 0x25_91,
    FULL_COLOR = 0xd2_99_22,
    HELD = 0x25_88,
    OPEN_COLOR = 0x3f_b9_50,
    held = row.used >= row.size ? FULL_COLOR : OPEN_COLOR,
    words = Uint32Array.from({ length: row.size * 6 }, (_unused, index) => {
      const cell = Math.floor(index / 6),
        isHeld = cell < row.used,
        part = index % 3;
      return [isHeld ? HELD : FREE, isHeld ? held : DEFAULT, DEFAULT][part] ?? DEFAULT;
    });
  return btoa(String.fromCodePoint(...new Uint8Array(words.buffer)));
}

// The fleet name hq fleet last saw under this atc session's id; none outside atc.
async function loadSessionName($: EngineInterface): Promise<string | null> {
  const id = await $.env.get('ATC_SESSION_ID'),
    whoisAnswer = id === undefined || id === '' ? null : await runHq($, ['whois', id, '--json']);
  return typeof whoisAnswer?.['name'] === 'string' ? whoisAnswer['name'] : null;
}

// One read of hq band --json into the band's state; any failure shows "hq unreachable".
async function refreshBand($: EngineInterface): Promise<void> {
  try {
    const answer = await runHq($, ['band', '--json']),
      segments = (answer?.['band'] as { segments?: unknown } | undefined)?.segments,
      shown: BandReading = isSegmentList(segments) ? { segments } : { unreachable: 'hq band printed no segments' };
    await update($, READING, () => shown);
  } catch (error) {
    await update($, READING, () => ({ unreachable: String(error) }));
  }
}

// hq's JSON answer, run from HQ_BAND_BIN or ~/.local/bin/hq with a 10 s limit; none on a failed exit.
async function runHq($: EngineInterface, args: string[]): Promise<Record<string, unknown> | null> {
  const home = await $.env.get('HOME'),
    override = await $.env.get('HQ_BAND_BIN'),
    ran = await $.process.run([override ?? `${home ?? ''}/.local/bin/hq`, ...args], { timeoutMs: TIMEOUT_MS });
  return ran.exitCode === 0 ? parseHqAnswer(ran.stdout) : null;
}

function parseHqAnswer(stdout: string): Record<string, unknown> | null {
  const parsed: unknown = JSON.parse(stdout);
  return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
}
