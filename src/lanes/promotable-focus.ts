import { z } from 'zod';

// The last count of Backlog issues triage may promote that the focus asks for; count is null when
// that read failed, so a failed read never shows as none waiting.
export const PROMOTABLE_FOCUS = z.object({ at: z.string(), count: z.number().nullable() }).nullable();
