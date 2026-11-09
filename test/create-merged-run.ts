import type { Database } from 'bun:sqlite';
import { addPR } from '../src/runs/add-pr.ts';
import { addRun } from '../src/runs/add-run.ts';
import { closePR } from '../src/runs/close-pr.ts';
import { setState } from '../src/runs/set-state.ts';

export function createMergedRun(db: Database, issue: string, refs: string[]): void {
  addRun(db, { issue, title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, actor: 'z-delivery' });
  for (const ref of refs) {
    addPR(db, issue, ref, 'z-delivery');
    closePR(db, ref, { to: 'merged', actor: 'z-delivery' });
  }
  setState(db, issue, 'merged', {}, 'z-delivery');
}
