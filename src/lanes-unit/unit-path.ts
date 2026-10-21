import { LANES_UNIT } from './lanes-unit.ts';
import { unitDir } from './unit-dir.ts';

export function unitPath(home: string): string {
  return `${unitDir(home)}/${LANES_UNIT}.service`;
}
