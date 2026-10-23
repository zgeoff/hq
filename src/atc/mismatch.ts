import { HqError } from '../errors.ts';
import { INSTALL_TOGETHER } from './install-together.ts';
import { PROTOCOL_V } from './protocol-v.ts';

// atc refuses a hello in another version with "… daemon <build> speaks v<N>; …".
export function mismatch(text: string): HqError {
  const found = /\bdaemon (?<build>\S+) speaks v(?<protocol>\d+)/u.exec(text),
    theirs = found?.groups ? `atc ${found.groups['build']} speaks protocol v${found.groups['protocol']}` : `atc refused hq's protocol (${text.slice(0, 200)})`;
  return new HqError('atc_protocol_mismatch', `${theirs}; hq speaks protocol v${PROTOCOL_V}. ${INSTALL_TOGETHER}`);
}
