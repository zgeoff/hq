import type { RefreshPhase } from './refresh-schema.ts';

export const REFRESH_TRANSITIONS: Readonly<Record<RefreshPhase | 'none', readonly (RefreshPhase | 'none')[]>> = {
  none: ['asked'],
  idle: ['asked', 'none'],
  asked: ['restarting', 'idle', 'none'],
  restarting: ['idle', 'none'],
};
