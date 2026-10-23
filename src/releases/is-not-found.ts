import { HqError } from '../errors.ts';

// gh reports a missing commit or ref only in its stderr text.
export function isNotFound(error: unknown): boolean {
  return error instanceof HqError && error.code === 'command_failed' && error.message.includes('(HTTP 404)');
}
