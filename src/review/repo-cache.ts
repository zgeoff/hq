import { config } from '../config/config.ts';

export function repoCache(): string {
  return config().HQ_REPOS ?? `${process.env['HOME']}/.local/share/z-sessions/repos`;
}
