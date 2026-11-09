import type { FeedEvent } from './types.ts';

// Milliseconds are kept: two notes in one second stay two.
export function toNoteTime(event: FeedEvent): string {
  return new Date(event.at).toISOString();
}
