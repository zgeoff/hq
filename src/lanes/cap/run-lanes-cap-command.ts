import type { Database } from 'bun:sqlite';
import { match } from 'ts-pattern';
import { iso } from '../../clock/iso.ts';
import { HqError } from '../../errors.ts';
import type { OwnerProbeDeps } from '../../pr-status/read-owner-session.ts';
import { buildCapView } from './build-cap-view.ts';
import { countWorking } from './count-working.ts';
import { decideCapChange } from './decide-cap-change.ts';
import type { CapRequest } from './decide-cap-change.ts';
import { formatCapLine } from './format-cap-line.ts';
import { formatWorking } from './format-working.ts';
import { isCapEnded } from './is-cap-ended.ts';
import type { LanesCap } from './lanes-cap.ts';
import { parseCapUntil } from './parse-cap-until.ts';
import type { LanesCapArgs } from './parse-lanes-cap-args.ts';
import { readCapCaller } from './read-cap-caller.ts';
import { readLanesCap } from './read-lanes-cap.ts';
import { writeLanesCap } from './write-lanes-cap.ts';

export interface LanesCapCommandDeps {
  db: Database;
  at: Date;
  args: LanesCapArgs;

  probe: OwnerProbeDeps;
}

interface CapOut {
  data: Record<string, unknown>;
  text: string;
}

export function runLanesCapCommand(deps: LanesCapCommandDeps): Promise<CapOut> {
  return match(deps.args)
    .with({ kind: 'show' }, () => Promise.resolve(showCap(deps)))
    .with({ kind: 'off' }, (args) => changeCap(deps, args))
    .with({ kind: 'set' }, (args) => changeCap(deps, args))
    .exhaustive();
}

function showCap(deps: LanesCapCommandDeps): CapOut {
  const stored = readLanesCap(deps.db);
  const working = countWorking(deps.db, deps.at);
  const ended = stored.kind === 'set' && isCapEnded(stored.cap, deps.at);
  const active = stored.kind === 'set' && !ended ? stored.cap : null;
  const view = buildCapView(active, working, { capHeld: false });
  const line = formatCapLine(view) ?? `no cap, ${formatWorking(view)}`;
  const notes = match(stored)
    .with({ kind: 'bad' }, (bad) => [`the stored cap is unusable, so no cap applies: ${bad.error}`])
    .with({ kind: 'set' }, () => (ended ? ['the cap has ended; the next lanes tick clears it'] : []))
    .with({ kind: 'none' }, () => [])
    .exhaustive();
  return { data: { cap: active, working: working.count, workingFrom: working.from, error: stored.kind === 'bad' ? stored.error : null }, text: [line, ...notes].join('\n') };
}

async function changeCap(deps: LanesCapCommandDeps, args: Exclude<LanesCapArgs, { kind: 'show' }>): Promise<CapOut> {
  const request = toCapRequest(args, deps.at);
  const stored = readLanesCap(deps.db);
  const current = stored.kind === 'set' && !isCapEnded(stored.cap, deps.at) ? stored.cap : null;
  const caller = await readCapCaller(deps.db, deps.probe);
  const decision = decideCapChange({ caller, current, request, at: iso(deps.at) });
  if (!decision.ok) {
    throw new HqError('not_allowed', decision.message);
  }
  if (decision.action === null) {
    return { data: { cap: null }, text: 'There is no cap to lift.' };
  }
  const by = decision.by;
  deps.db.transaction(() => writeLanesCap(deps.db, { action: decision.action, cap: decision.cap, actor: by, reason: decision.reason })).immediate();
  return { data: { cap: decision.action === 'cap-set' ? decision.cap : null, by }, text: formatChange(decision.action, decision.cap) };
}

function toCapRequest(args: Exclude<LanesCapArgs, { kind: 'show' }>, at: Date): CapRequest {
  if (args.kind === 'off') {
    return args;
  }
  return { kind: 'set', cap: args.cap, until: args.until === null ? null : parseCapUntil(args.until, at), reason: args.reason };
}

function formatChange(action: 'cap-set' | 'cap-off' | 'cap-ended', cap: LanesCap): string {
  return action === 'cap-set' ? `Lanes cap set to ${cap.cap} by ${cap.by}; the slots obey it from the next look.` : `Lanes cap of ${cap.cap} lifted; the slots obey the pool alone from the next look.`;
}
