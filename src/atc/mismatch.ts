import { HqError } from '../errors.ts';
import { PROTOCOL_V } from './protocol-v.ts';

const TOGETHER = 'hq and atc install together: install the hq release that matches this atc.';

// atc refuses a hello in another version with "… daemon <build> speaks v<N>; …".
export function mismatch(text: string): HqError {
  const found = /\bdaemon (?<build>\S+) speaks v(?<protocol>\d+)/u.exec(text),
    theirs = found?.groups ? `atc ${found.groups['build']} speaks protocol v${found.groups['protocol']}` : `atc refused hq's protocol (${text.slice(0, 200)})`;
  return new HqError('atc_protocol_mismatch', `${theirs}; hq speaks protocol v${PROTOCOL_V}. ${TOGETHER}`);
}

// A daemon that closes the hello with no answer, or answers in the old line protocol, is older.
export function buildOlderProtocolError(): HqError {
  return new HqError('atc_protocol_mismatch', `the atc daemon speaks an older protocol than hq's v${PROTOCOL_V} and closed the connection with no answer. ${TOGETHER}`);
}
