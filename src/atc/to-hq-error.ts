import { ORPCError } from '@orpc/client';
import { HqError } from '../errors.ts';
import { ATC_ERROR_CODES } from './error-codes.ts';
import { mismatch } from './mismatch.ts';

export function toHqError(error: unknown): HqError {
  if (error instanceof HqError) {
    return error;
  }
  if (error instanceof ORPCError) {
    return buildDaemonError(error);
  }
  const message = error instanceof Error ? error.message : String(error);
  return new HqError('atc_internal', message);
}

function buildDaemonError(error: ORPCError<string, unknown>): HqError {
  if (error.code === 'protocol_mismatch') {
    return mismatch(error.message);
  }
  const code = ATC_ERROR_CODES.has(error.code) ? error.code : 'internal';
  return new HqError(`atc_${code}`, error.message);
}
