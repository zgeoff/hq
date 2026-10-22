// Which credential sources this process could hand git: names only, never a value.
export function credentialNames(): string {
  const set = (k: string) => `${k} ${process.env[k] ? 'set' : 'unset'}`;
  return ['GH_TOKEN', 'GITHUB_TOKEN', 'GIT_ASKPASS', 'SSH_AUTH_SOCK', 'HOME'].map(set).join(', ');
}
