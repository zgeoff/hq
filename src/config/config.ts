import { z } from 'zod';
import { CLOCK_OVERRIDES } from '../clock/clock-overrides.ts';
import { isSourceRun } from '../clock/is-source-run.ts';
import { HqError } from '../errors.ts';
import { CONFIG_SHAPE } from './config-shape.ts';

const schema = z.object(CONFIG_SHAPE);
export type HqConfig = z.infer<typeof schema>;

export type ConfigName = keyof typeof CONFIG_SHAPE | 'HOME' | 'NODE_ENV' | 'ATC_SESSION_ID' | 'OP_SERVICE_ACCOUNT_TOKEN' | 'PATH';

const RULES: Partial<Record<ConfigName, string>> = {
  HQ_QUIET: 'two hours like 03-07',
};

const NUMBER_RULE = 'a whole number, 0 or more';

export function config(env: Record<string, string | undefined> = process.env): HqConfig {
  const input: Record<string, string | undefined> = {};
  for (const key of Object.keys(CONFIG_SHAPE)) {
    input[key] = env[key];
  }

  if (!isSourceRun()) {
    for (const name of CLOCK_OVERRIDES) {
      input[name] = undefined;
    }
  }
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  const name = String(r.error.issues[0]!.path[0]) as ConfigName;
  const rule = RULES[name] ?? (/_(MIN|MS)$/.test(name) ? NUMBER_RULE : 'valid');
  throw new HqError('bad_config', `${name} must be ${rule}, got '${input[name] ?? ''}'`, { setting: name });
}
