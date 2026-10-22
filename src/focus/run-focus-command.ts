import type { Database } from 'bun:sqlite';
import { match } from 'ts-pattern';
import rulesTable from '../../lanes.json';
import { HqError } from '../errors.ts';
import { buildReadySnapshot } from '../lanes/build-ready-snapshot.ts';
import { readTeamIssues } from '../lanes/read-team-issues.ts';
import { validateLaneRules } from '../lanes/validate-lane-rules.ts';
import type { LinearCall } from '../linear/types.ts';
import { buildFocusCounts } from './build-focus-counts.ts';
import type { FocusCount } from './build-focus-counts.ts';
import { formatFocusLine } from './format-focus-line.ts';
import { parseFocusReserves } from './parse-focus-reserves.ts';
import { parseFocusTerms } from './parse-focus-terms.ts';
import { readFocus } from './read-focus.ts';
import { removeFocus } from './remove-focus.ts';
import { writeFocus } from './write-focus.ts';
import type { Focus, FocusTerm } from './types.ts';

export interface FocusCommandDeps {
  db: Database;
  call: LinearCall;
  actor: string;
  verb: string | undefined;
  rest: readonly string[];
  reserves: readonly string[];
}

interface FocusOut {
  data: Record<string, unknown>;
  text: string;
}

// hq focus show|set|clear. set checks every term and reserve before it writes, and refuses the whole
// command on any it does not know. set and show count each term's Ready and Backlog matches in Linear;
// a failed read leaves the counts out and says why, and never undoes a set.
export function runFocusCommand(deps: FocusCommandDeps): Promise<FocusOut> {
  return match(deps.verb ?? 'show')
    .with('show', async () => {
      const focus = readFocus(deps.db);
      const counts = await readCounts(deps.call, focus?.terms ?? []);
      return formatShown(focus, counts);
    })
    .with('set', async () => {
      const [raw, ...extra] = deps.rest;
      if (raw === undefined || extra.length > 0) {
        throw new HqError('bad_args', 'usage: hq focus set <term>[,<term>...] [--reserve <area>=<n>]...');
      }
      const terms = parseFocusTerms(raw);
      const reserves = parseFocusReserves(deps.reserves);
      const focus = writeFocus(deps.db, terms, reserves, deps.actor);
      const counts = await readCounts(deps.call, focus.terms);
      const shown = formatShown(focus, counts);
      return { data: shown.data, text: `Focus set; the lanes use it from their next tick, and running work keeps its slots.\n${shown.text}` };
    })
    .with('clear', () => {
      const cleared = removeFocus(deps.db, deps.actor);
      return Promise.resolve({ data: { cleared }, text: cleared ? 'Focus cleared: the lanes take all eligible work by priority from their next tick.' : 'No focus was set.' });
    })
    .otherwise((verb) => Promise.reject(new HqError('bad_args', `unknown command: hq focus ${verb}`)));
}

const BACKLOG_STATE = 'Backlog';

type Counts = { counts: FocusCount[]; error: null } | { counts: null; error: string };

async function readCounts(call: LinearCall, terms: readonly FocusTerm[]): Promise<Counts> {
  if (terms.length === 0) {
    return { counts: [], error: null };
  }
  const rules = validateLaneRules(rulesTable, Object.keys(rulesTable.lanes));
  try {
    const [ready, backlog] = await Promise.all([readTeamIssues(call, rules.team, rules.readyState), readTeamIssues(call, rules.team, BACKLOG_STATE)]);
    const at = new Date(0).toISOString();
    return { counts: buildFocusCounts(terms, buildReadySnapshot(ready, rules, at).eligible, buildReadySnapshot(backlog, rules, at).eligible), error: null };
  } catch (error) {
    return { counts: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function formatShown(focus: Focus | null, counts: Counts): FocusOut {
  if (focus === null) {
    return { data: { focus: null }, text: 'No focus set: the lanes take all eligible work by priority, then the enabler and quality labels, then the oldest.' };
  }
  const lines = focus.terms.map((term, index) => {
    const count = counts.counts?.[index];
    return `  ${index + 1}. ${term.text}${count === undefined ? '' : `: ${count.ready} Ready, ${count.backlog} Backlog`}`;
  });
  return {
    data: { focus, counts: counts.counts, countsError: counts.error },
    text: [
      `Focus (set ${focus.setAt} by ${focus.setBy}): ${formatFocusLine(focus)}`,
      ...lines,
      ...focus.reserves.map((reserve) => `  reserve: ${reserve.area} keeps ${reserve.slots} slot(s), lent while it has nothing eligible`),
      ...(counts.error === null ? [] : [`  counts unavailable: ${counts.error}`]),
      '  then any other eligible work',
    ].join('\n'),
  };
}
