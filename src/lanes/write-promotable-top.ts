import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { setMeta } from '../db/set-meta.ts';
import { PROMOTABLE_TOP_KEY, PROMOTABLE_TOP_SIZE } from './promotable-top.ts';

interface PromotableTop {
  issues: readonly { identifier: string; title: string }[] | null;
  focus: string;
  at: Date;
}

export function writePromotableTop(db: Database, top: PromotableTop): void {
  if (top.issues === null) {
    setMeta(db, PROMOTABLE_TOP_KEY, null);
    return;
  }
  const issues = top.issues.slice(0, PROMOTABLE_TOP_SIZE).map((issue) => ({ identifier: issue.identifier, title: issue.title }));
  setMeta(db, PROMOTABLE_TOP_KEY, JSON.stringify({ at: iso(top.at), focus: top.focus, issues }));
}
