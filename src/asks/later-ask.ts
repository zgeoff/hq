import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { nextMorning } from '../clock/next-morning.ts';
import { now } from '../clock/now.ts';
import { parseWhen } from '../clock/parse-when.ts';
import type { Ask, Kind } from './types.ts';
import { updateAskState as transition } from './update-ask-state.ts';

export function laterAsk(db: Database, id: string, kind: Kind | undefined, until: string | null, actor: string): Ask {
  const due = until ? parseWhen(until, now()) : nextMorning(now());
  return transition(db, {
    id,
    kind,
    action: 'later',
    actor,
    set: { due_at: iso(due), opened_at: null },
    data: { due_at: iso(due) },
    notice: (a) => `FYI ${a.kind} ${a.id} put off until ${a.due_at}. hq reopens it then; no need to send it again.`,
  });
}
