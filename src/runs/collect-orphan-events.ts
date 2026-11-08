import invariant from 'tiny-invariant';
import { buildOrphanKeptEvent } from './build-orphan-kept-event.ts';
import type { OrphanTree } from './pick-orphan-trees.ts';
import type { OrphanEvent, WrapUp } from './types.ts';

// A session whose forget failed logs a kept event, so the sweep tries it again only after a day.
export function collectOrphanEvents(tree: OrphanTree, wrapUp: WrapUp): OrphanEvent[] {
  const orphan = tree.root;
  const id = orphan.session.id;
  invariant([...wrapUp.forgotten, ...wrapUp.failed.map((failure) => failure.id)].every((reported) => reported === id), 'a forget pass reports only its own session');
  const forgotten = wrapUp.forgotten.map(
    (): OrphanEvent => ({
      sessionID: id,
      action: 'session-forgotten',
      data: { name: orphan.session.name, issue: orphan.issue, reason: 'exited, with its work pushed and no open run needing it', destroyed: wrapUp.destroyed.includes(id) },
      line: `orphan session ${id} (${orphan.session.name}) forgotten`,
    }),
  );
  const failed = wrapUp.failed.map((failure) => buildOrphanKeptEvent(orphan, `forget failed: ${failure.reason}`));
  return [...forgotten, ...failed];
}
