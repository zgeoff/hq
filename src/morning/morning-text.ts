import { iso } from '../clock/iso.ts';
import type { Windows } from './types.ts';

const z = (x: Date) => iso(x).slice(0, 16) + 'Z';

export function morningText(w: Windows, late: boolean): string {
  return [
    `Morning reports due${late ? ' (late: hq did not run at 08:15)' : ''}. Both windows are in Sydney time:`,
    `1. Yesterday, ${w.yesterday.label} (${z(w.yesterday.from)} to ${z(w.yesterday.to)}).`,
    `2. Today so far, ${w.today.label} (${z(w.today.from)} to ${z(w.today.to)}).`,
  ].join('\n');
}
