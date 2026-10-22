import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import { restartQuiet } from './restart-quiet.ts';

export function guardQuiet(force: boolean): void {
  if (!force && restartQuiet(now())) {
    throw new HqError('quiet_hours', 'no daemon restarts 23:00-08:00 Sydney unless the owner is in chat. Use --force if they are.');
  }
}
