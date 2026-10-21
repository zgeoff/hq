import { cleanEnv } from '../runner/clean-env.ts';
import type { NoslopSecrets } from './load-noslop-secrets.ts';

// The environment of the noslop child: the credentials, and not the 1Password token.
export function buildNoslopEnv(secrets: NoslopSecrets): Record<string, string | undefined> {
  const env = cleanEnv({
    NOSLOP_GITHUB_APP_ID: secrets.appID,
    NOSLOP_GITHUB_APP_INSTALLATION_ID: secrets.installationID,
    NOSLOP_GITHUB_APP_PRIVATE_KEY: secrets.privateKey,
  });
  delete env['OP_SERVICE_ACCOUNT_TOKEN'];
  return env;
}
