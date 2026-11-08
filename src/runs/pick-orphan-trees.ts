import invariant from 'tiny-invariant';
import { buildOrphanKeptEvent } from './build-orphan-kept-event.ts';
import { pickOrphanOutcome } from './pick-orphan-outcome.ts';
import type { OrphanSession } from './pick-orphan-sessions.ts';
import type { ImpWork, OrphanEvent } from './types.ts';

export interface CheckedOrphan extends OrphanSession {
  work: ImpWork;
}

export interface OrphanTree {
  root: OrphanSession;
  children: readonly OrphanSession[];
  destroyImp: boolean;
}

export interface OrphanPlan {
  kept: OrphanEvent[];
  trees: OrphanTree[];
}

export function pickOrphanTrees(checked: readonly CheckedOrphan[]): OrphanPlan {
  const kept: OrphanEvent[] = [];
  const staying = new Set<string>();
  const destroyImp = new Map<string, boolean>();
  for (const orphan of checked) {
    const id = orphan.session.id;
    if (checked.some((child) => child.session.parent === id && staying.has(child.session.id))) {
      staying.add(id);
      continue;
    }
    const outcome = pickOrphanOutcome(id, orphan.work, orphan.place);
    if (outcome.kind === 'keep') {
      kept.push(buildOrphanKeptEvent(orphan, outcome.reason));
      staying.add(id);
      continue;
    }
    destroyImp.set(id, outcome.destroyImp);
  }

  // Each orphan goes as its own tree, in the deepest-first order it came in: a child on another host
  // than its parent needs its own imp destroy, and the sweep must see a child's forget fail before
  // it forgets the parent.
  const trees = checked
    .filter((orphan) => !staying.has(orphan.session.id))
    .map((root) => {
      const rootDestroysImp = destroyImp.get(root.session.id);
      invariant(rootDestroysImp !== undefined, 'every going orphan has a forget outcome');
      return { root, children: [], destroyImp: rootDestroysImp };
    });
  return { kept, trees };
}
