import { afterEach } from 'bun:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// No test reads the real local settings file: this path never exists. A test that needs a file
// writes one in a temp dir and points HQ_LOCAL_CONFIG at it.
process.env['HQ_LOCAL_CONFIG'] = join(tmpdir(), 'hq-tests-no-local-config', 'local.json');

// A run from an agent's shell inherits its atc session id, and `hq call answer` then asks the real
// atc whether that session is the owner's. A test that needs a session id sets its own.
delete process.env['ATC_SESSION_ID'];

// The machine-specific settings hold invented values, so a test that never looks at them still runs;
// a test of one sets its own through overrideEnv.
const INVENTED_LOCAL_SETTINGS = {
  HQ_NOSLOP_OP_VAULT: 'invented-vault-id',
  HQ_NOSLOP_OP_ITEM: 'invented-item-id',
  HQ_LINEAR_OP_REF: 'op://kettle/teapot-key/credential',
  HQ_PROBE_TARGET: 'https://nix.invalid/health/live',
  HQ_PROBE_READY: 'https://nix.invalid/health/ready',
  HQ_CLOUD_METRICS_URL: 'http://teapot-host:9100/metrics',
  HQ_CLOUD_HOST: 'teapot-host',

  // No test reads the real hq-private checkout: this directory never exists. A test of the start
  // prompts makes one in a temp dir and points HQ_PRIVATE_DIR at it.
  HQ_PRIVATE_DIR: join(tmpdir(), 'hq-tests-no-hq-private'),
},

  // Settings that test files set in beforeEach and did not put back: HQ_NOTIFY=off made every later
  // file's flush hold its messages (GEO-1576). Each test ends with them as they were before any test.
  LEAKED = ['HQ_NOTIFY', 'HQ_AS', ...Object.keys(INVENTED_LOCAL_SETTINGS)] as const,
  SAVED = Object.fromEntries(LEAKED.map((name) => [name, { ...process.env, ...INVENTED_LOCAL_SETTINGS }[name]]));

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
