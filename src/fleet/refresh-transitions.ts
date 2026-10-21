import type { RefreshPhase } from './refresh-schema.ts';

// `none` is a name with no entry in meta fleet_refresh.
export const REFRESH_TRANSITIONS: Readonly<Record<RefreshPhase | 'none', readonly (RefreshPhase | 'none')[]>> = {
  none: ['asked'],
  idle: ['asked', 'none'],
  asked: ['restarting', 'idle', 'none'],
  restarting: ['idle', 'none'],
};
