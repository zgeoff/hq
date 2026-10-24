import { z } from 'zod';

// The last count of Backlog issues triage may promote that the focus asks for; count is null when
// that read failed, so a failed read never shows as none waiting. focus is the buildFocusKey of the
// focus the count used, so a count from an earlier focus is never read as the current one.
export const PROMOTABLE_FOCUS = z.object({ at: z.string(), count: z.number().nullable(), focus: z.string(), error: z.string().nullable().default(null) }).nullable();
