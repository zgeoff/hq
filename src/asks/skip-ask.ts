import type { Database } from 'bun:sqlite';
import type { Ask, Kind } from './types.ts';
import { updateAskState as transition } from './update-ask-state.ts';

// oxlint-disable-next-line max-params, zgeoff/function-verb -- positional like answerAsk and laterAsk; GEO-1318 holds this lint debt
export function skipAsk(db: Database, id: string, kind: Kind | undefined, reason: string | null, actor: string): Ask {
  return transition(db, {
    id,
    kind,
    action: 'skipped',
    actor,
    set: { opened_at: null, close_reason: reason },
    data: { reason },
    notice: (a) => `${a.kind} ${a.id} skipped${reason ? ` (${reason})` : ''}. It stays out of the queue until you add it again: prepare it from the issue as it stands, then hq ${a.kind} add.`,
  });
}
