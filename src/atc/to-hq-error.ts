import { ORPCError } from '@orpc/client';
import { HqError } from '../errors.ts';
import { ATC_ERROR_CODES } from './error-codes.ts';
import { mismatch } from './mismatch.ts';

export function toHqError(error: unknown): HqError {
  if (error instanceof HqError) {
    return error;
  }
  if (error instanceof ORPCError) {
    const code: unknown = error.code;
    const daemonCode = typeof code === 'string' ? code : 'internal';
    return buildDaemonError(daemonCode, error.message);
  }
  const message = error instanceof Error ? error.message : String(error);
  return new HqError('atc_internal', message);
}

function buildDaemonError(daemonCode: string, message: string): HqError {
  if (daemonCode === 'protocol_mismatch') {
    return mismatch(message);
  }
  const code = ATC_ERROR_CODES.has(daemonCode) ? daemonCode : 'internal';
  return new HqError(`atc_${code}`, message);
}
