import { afterEach } from 'bun:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env['HQ_LOCAL_CONFIG'] = join(tmpdir(), 'hq-tests-no-local-config', 'local.json');

process.env['XDG_DATA_HOME'] = join(tmpdir(), 'hq-tests-no-data-home');

process.env['REVIEW_DIR'] = join(tmpdir(), 'hq-tests-no-review-dir');

process.env['HQ_SLOTS_OP_SETTINGS'] = join(tmpdir(), 'hq-tests-no-slots-settings', 'settings.local.json');

process.env['HQ_STATE_DIR'] = join(tmpdir(), 'hq-tests-no-state-dir');

// A run from an agent's shell inherits its atc session id, and `hq call answer` then asks the real
// atc whether that session is the owner's.
delete process.env['ATC_SESSION_ID'];

const INVENTED_LOCAL_SETTINGS = {
  HQ_NOSLOP_OP_VAULT: 'invented-vault-id',
  HQ_NOSLOP_OP_ITEM: 'invented-item-id',
  HQ_LINEAR_OP_REF: 'op://kettle/teapot-key/credential',
  HQ_PROBE_TARGET: 'https://nix.invalid/health/live',
  HQ_PROBE_READY: 'https://nix.invalid/health/ready',
  HQ_CLOUD_METRICS_URL: 'http://teapot-host:9100/metrics',
  HQ_CLOUD_HOST: 'teapot-host',

  HQ_PRIVATE_DIR: join(tmpdir(), 'hq-tests-no-hq-private'),
};

// Settings that test files set in beforeEach and did not put back: HQ_NOTIFY=off made every later
// file's flush hold its messages.
const LEAKED = ['HQ_NOTIFY', 'HQ_AS', ...Object.keys(INVENTED_LOCAL_SETTINGS)] as const;
const SAVED = Object.fromEntries(LEAKED.map((name) => [name, { ...process.env, ...INVENTED_LOCAL_SETTINGS }[name]]));

Object.assign(process.env, INVENTED_LOCAL_SETTINGS);

afterEach(() => {
  for (const name of LEAKED) {
    const value = SAVED[name];
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
});
