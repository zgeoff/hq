import { HqError } from '../errors.ts';
import { INSTALL_TOGETHER } from './install-together.ts';
import { PROTOCOL_V } from './protocol-v.ts';

// A daemon that closes the hello with no answer, or answers in the old line protocol, is older.
export function buildOlderProtocolError(): HqError {
  return new HqError('atc_protocol_mismatch', `the atc daemon speaks an older protocol than hq's v${PROTOCOL_V} and closed the connection with no answer. ${INSTALL_TOGETHER}`);
}
