import invariant from 'tiny-invariant';
import { buildOrphanKeptEvent } from './build-orphan-kept-event.ts';
import type { OrphanTree } from './pick-orphan-trees.ts';
import type { OrphanEvent, WrapUp } from './types.ts';

// A session whose forget failed logs a kept event, so the sweep tries it again only after a day.
export function collectOrphanEvents(tree: OrphanTree, wrapUp: WrapUp): OrphanEvent[] {
  const byID = new Map([tree.root, ...tree.children].map((orphan) => [orphan.session.id, orphan]));
  const getOrphan = (id: string) => {
    const orphan = byID.get(id);
    invariant(orphan, 'a forget pass reports only sessions of its tree');
    return orphan;
  };
  const forgotten = wrapUp.forgotten.map((id): OrphanEvent => {
    const orphan = getOrphan(id);
    return {
      sessionID: id,
      action: 'session-forgotten',
      data: { name: orphan.session.name, issue: orphan.issue, reason: 'exited, with its work pushed and no open run needing it', destroyed: wrapUp.destroyed.includes(id) },
      line: `orphan session ${id} (${orphan.session.name}) forgotten`,
    };
  });
  const failed = wrapUp.failed.map((failure) => buildOrphanKeptEvent(getOrphan(failure.id), `forget failed: ${failure.reason}`));
  return [...forgotten, ...failed];
}
