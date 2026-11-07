import { toErrorMessage } from '../to-error-message.ts';

export function formatError(e: unknown): string {
  return toErrorMessage(e).slice(0, 200);
}
