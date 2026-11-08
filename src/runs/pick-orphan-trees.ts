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
  const going = checked.filter((orphan) => !staying.has(orphan.session.id));
  const byID = new Map(going.map((orphan) => [orphan.session.id, orphan]));
  const roots = going.filter((orphan) => !byID.has(orphan.session.parent ?? ''));
  const trees = roots.map((root) => {
    const rootDestroysImp = destroyImp.get(root.session.id);
    invariant(rootDestroysImp !== undefined, 'every going orphan has a forget outcome');
    const children = going.filter((orphan) => orphan !== root && getRootID(byID, orphan) === root.session.id);
    return { root, children, destroyImp: rootDestroysImp };
  });
  return { kept, trees };
}

function getRootID(byID: ReadonlyMap<string, CheckedOrphan>, orphan: CheckedOrphan): string {
  let current = orphan;
  for (let step = 0; step < byID.size; step += 1) {
    const parent = byID.get(current.session.parent ?? '');
    if (parent === undefined) {
      break;
    }
    current = parent;
  }
  return current.session.id;
}
