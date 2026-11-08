import type { OrphanSession } from './pick-orphan-sessions.ts';

export function isOverFailedChild(root: OrphanSession, orphans: readonly OrphanSession[], failedIDs: ReadonlySet<string>): boolean {
  return orphans.some((orphan) => orphan.session.parent === root.session.id && failedIDs.has(orphan.session.id));
}
