import { mondayOf } from '../../kinds/monday-of.ts';
import { sydney } from '../../morning/sydney.ts';

export function getMondayKey(at: Date): string {
  return sydney(mondayOf(at)).date;
}
