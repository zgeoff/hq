import { basename } from 'node:path';

export function isAtcMcpCommand(cmdline: string): boolean {
  const argv = cmdline.split('\0');
  return basename(argv[0] ?? '') === 'atc' && argv[1] === 'mcp';
}
