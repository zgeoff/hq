import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import { APPLY_TO } from './apply-to.ts';
import type { Ask, Kind } from './types.ts';
import { updateAskState as transition } from './update-ask-state.ts';

// oxlint-disable-next-line max-params -- positional like answerAsk and laterAsk; GEO-1318 holds this lint debt
export function applyAsk(db: Database, id: string, kind: Kind | undefined, to: string, note: string | null, actor: string): Ask {
  if (!APPLY_TO.test(to)) {
    throw new HqError('bad_args', `--to must be typed:<session>, linear:<GEO-n> or none, got "${to}"`);
  }
  return transition(db, { id, kind, action: 'applied', actor, set: { applied_to: to, applied_note: note, applied_at: iso(now()) }, data: { to, note } });
}
