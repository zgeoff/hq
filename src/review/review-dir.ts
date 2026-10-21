import { config } from '../config/config.ts';

// On disk, not in /tmp: the PC's /tmp is a tmpfs, so whatever lands there uses RAM.
export function reviewDir(): string {
  return config().REVIEW_DIR ?? `${process.env['HOME']}/.local/share/z-sessions/reviews`;
}
