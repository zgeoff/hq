import type { Database } from 'bun:sqlite';
import { fleetIds } from '../atc/fleet-ids.ts';
import { iso } from '../clock/iso.ts';
import { readWallClock } from '../clock/read-wall-clock.ts';
import { HqError } from '../errors.ts';
import { logEvent } from '../log-event.ts';
import { addNews } from '../news/add-news.ts';
import type { OwnerProbeDeps } from '../pr-status/read-owner-session.ts';
import { roleName } from '../roles/role-name.ts';
import { GrantActionRowSchema } from './grant-action-row-schema.ts';
import { pickGrantVoider } from './pick-grant-voider.ts';
import { readGrantVoidCaller } from './read-grant-void-caller.ts';
import type { GrantActionRow, GrantVoidArgs, GrantVoidCaller } from './types.ts';

interface GrantVoidDeps {
  db: Database;
  args: GrantVoidArgs;
  probe: OwnerProbeDeps;
}

// Takes back an action logged in error. The row stays, marked with when, by whom and why, and drops
// out of every count.
export async function voidGrantAction(deps: GrantVoidDeps): Promise<GrantActionRow> {
  const caller = await readGrantVoidCaller(deps.probe);
  return deps.db.transaction(() => writeVoid(deps, caller)).immediate();
}

function writeVoid(deps: GrantVoidDeps, caller: GrantVoidCaller): GrantActionRow {
  const db = deps.db;
  const args = deps.args;
  const found = db.query('SELECT * FROM grant_actions WHERE id = ?').get(args.id);
  if (found === null) {
    throw new HqError('not_found', `no grant action ${args.id}`);
  }
  const action = GrantActionRowSchema.parse(found);
  const voider = pickGrantVoider(caller, fleetIds(db), action.actor);
  if (voider === null) {
    throw new HqError('not_allowed', `${formatWhoMayVoid(action)}${caller.kind === 'unknown' ? `; atc cannot say who is calling (${caller.cause})` : ''}`);
  }
  if (action.voided_at !== null) {
    throw new HqError('bad_state', `grant action ${action.id} was already voided at ${action.voided_at} by ${action.voided_by}: ${action.void_reason}`);
  }
  const voidedAt = iso(readWallClock());
  db.query('UPDATE grant_actions SET voided_at = ?, voided_by = ?, void_reason = ? WHERE id = ?').run(voidedAt, voider, args.reason, action.id);
  logEvent(db, 'hq', `grant:${action.grant_name}`, 'grant-void', voider, null, null, { id: action.id, target: action.target, reason: args.reason });
  addNews(db, { from: voider, topic: 'other', text: formatNews(voider, action, args.reason), issue: null, link: null, needsGeoff: false });
  return { ...action, voided_at: voidedAt, voided_by: voider, void_reason: args.reason };
}

function formatWhoMayVoid(action: GrantActionRow): string {
  return `only ${action.actor}, who logged grant action ${action.id}, or ${roleName('owner')} may void it`;
}

function formatNews(voider: string, action: GrantActionRow, reason: string): string {
  return `${voider} voided grant action ${action.id} under ${action.grant_name} (${action.target}): ${reason}`.slice(0, 400);
}
