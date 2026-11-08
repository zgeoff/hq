import type { FleetSession } from '../fleet/types.ts';
import { toErrorMessage } from '../to-error-message.ts';
import type { ImpWork } from './types.ts';

// A failed check reads as unknown work, so the session stays rather than the sweep failing.
export async function readWorkSafely(read: (session: FleetSession) => Promise<ImpWork>, session: FleetSession): Promise<ImpWork> {
  try {
    return await read(session);
  } catch (error) {
    return { state: 'unknown', detail: toErrorMessage(error) };
  }
}
