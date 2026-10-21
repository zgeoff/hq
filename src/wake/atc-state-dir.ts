import { config } from '../config/config.ts';

export function atcStateDir(): string {
  return config().HQ_ATC_STATE ?? `${process.env['HOME']}/.local/state/atc`;
}
