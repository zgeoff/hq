import { z } from 'zod';
import { config } from '../config/config.ts';
import { readLocalSetting } from '../config/read-local-setting.ts';
import { HqError } from '../errors.ts';
import { cleanEnv } from '../runner/clean-env.ts';
import type { Runner } from '../runner/types.ts';
import { parseJSON } from './parse-json.ts';

export interface NoslopSecrets {
  appID: string;
  installationID: string;
  privateKey: string;
}

// One `op item get` per round for all three fields, by item and vault ID: 1Password counts a lookup
// by name as 3 requests and one by ID as 1, and every hq call is a new process. `recordRead` runs
// once op answers, before its answer is checked, so a read that fails validation still counts.
export async function loadNoslopSecrets(run: Runner, recordRead: () => void = () => {}): Promise<NoslopSecrets> {
  const token = await readOpToken(),
    values = await readSecretFields(run, token, recordRead);
  return {
    appID: pickSecret(values, 'app-id'),
    installationID: pickSecret(values, 'installation-id'),
    privateKey: pickSecret(values, 'private-key'),
  };
}

const AUTH_FAILURE = /auth|sign.?in|token|unauthori[sz]ed|forbidden|401|403/iu,

  OpFields = z.array(z.object({ label: z.string(), value: z.string().optional() })),
  OpSettings = z.object({ env: z.object({ OP_SERVICE_ACCOUNT_TOKEN: z.string().min(1) }) }),
  RATE_LIMITED = /too many requests|rate.?limit/iu;

async function readOpToken(): Promise<string> {
  const path = resolveSettingsPath(),
    raw = await readJSONFile(path),
    remint = `re-mint with op-mint noslop (token read from ${path})`,
    settings = OpSettings.safeParse(raw);
  if (raw === undefined) {
    throw new HqError('bad_config', `noslop's 1Password token is unreadable: ${remint}`);
  }
  if (!settings.success) {
    throw new HqError('bad_config', `noslop's 1Password token (env.OP_SERVICE_ACCOUNT_TOKEN) is missing: ${remint}`);
  }
  return settings.data.env.OP_SERVICE_ACCOUNT_TOKEN;
}

function resolveSettingsPath(): string {
  return config().HQ_NOSLOP_OP_SETTINGS ?? `${process.env['HOME']}/projects/noslop/.claude/settings.local.json`;
}

async function readJSONFile(path: string): Promise<unknown> {
  try {
    const text = await Bun.file(path).text();
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function readSecretFields(run: Runner, token: string, recordRead: () => void): Promise<z.infer<typeof OpFields>> {
  // The item and vault IDs come from the local settings file; a moved item fails the read loudly.
  const settings = { item: readLocalSetting('HQ_NOSLOP_OP_ITEM'), vault: readLocalSetting('HQ_NOSLOP_OP_VAULT') },
    toolResult = await run(['op', 'item', 'get', settings.item, '--vault', settings.vault, '--fields', 'label=app-id,label=installation-id,label=private-key', '--reveal', '--format', 'json'], { env: cleanEnv({ OP_SERVICE_ACCOUNT_TOKEN: token }) });
  recordRead();
  if (toolResult.code !== 0) {
    throw new HqError('bad_config', `1Password gave no app secrets for noslop (exit ${toolResult.code})${pickFailureReason(toolResult.stderr)}`);
  }
  return parseSecretFields(toolResult.stdout);
}

function parseSecretFields(stdout: string): z.infer<typeof OpFields> {
  const parsed = OpFields.safeParse(parseJSON(stdout));
  if (!parsed.success) {
    throw new HqError('bad_config', "1Password's answer for noslop's app secrets is not a list of fields");
  }
  return parsed.data;
}

function pickFailureReason(stderr: string): string {
  if (RATE_LIMITED.test(stderr)) {
    return ": 1Password rate-limited the request; op service-account ratelimit shows which limit and when it resets";
  }
  return AUTH_FAILURE.test(stderr) ? ': re-mint with op-mint noslop' : '';
}

function pickSecret(fields: z.infer<typeof OpFields>, label: string): string {
  const value = fields.find((field) => field.label === label)?.value?.trim() ?? '';
  if (value === '') {
    throw new HqError('bad_config', `noslop's ${label} in 1Password is empty`);
  }
  return value;
}
