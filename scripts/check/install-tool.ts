import { spawnSync } from 'node:child_process';
import { appendFileSync, chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface Tool {
  readonly url: string;
  readonly sha256: string;
  readonly unpack: 'tar.xz' | 'tar.gz' | 'bz2';

  // The folder inside the archive that holds the binary, or '' for the archive root
  readonly folder: string;
  readonly version: readonly string[];
}

// Each tool is pinned to the version used locally: the runner's own shellcheck reports findings 0.11.0 does not,
// and restic matches the version hq backs up with.
export const TOOLS: Readonly<Record<string, Tool>> = {
  shellcheck: {
    url: 'https://github.com/koalaman/shellcheck/releases/download/v0.11.0/shellcheck-v0.11.0.linux.x86_64.tar.xz',
    sha256: '8c3be12b05d5c177a04c29e3c78ce89ac86f1595681cab149b65b97c4e227198',
    unpack: 'tar.xz',
    folder: 'shellcheck-v0.11.0',
    version: ['shellcheck', '--version'],
  },
  gitleaks: {
    url: 'https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz',
    sha256: '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb',
    unpack: 'tar.gz',
    folder: '',
    version: ['gitleaks', 'version'],
  },
  restic: {
    url: 'https://github.com/restic/restic/releases/download/v0.17.3/restic_0.17.3_linux_amd64.bz2',
    sha256: '5097faeda6aa13167aae6e36efdba636637f8741fed89bbf015678334632d4d3',
    unpack: 'bz2',
    folder: '',
    version: ['restic', 'version'],
  },
};

export function checkDigest(bytes: Uint8Array, sha256: string, url: string): void {
  const digest = new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
  if (digest !== sha256) {
    throw new Error(`${url}: sha256 is ${digest}, expected ${sha256}`);
  }
}

function runChecked(command: string[], input?: Uint8Array): Buffer {
  const result = spawnSync(command[0] ?? '', command.slice(1), { input, maxBuffer: 256 * 1024 * 1024 });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command.join(' ')} exited ${result.status ?? result.signal}: ${result.stderr.toString().trim()}`);
  }
  return result.stdout;
}

export function unpackTool(name: string, tool: Tool, bytes: Uint8Array, into: string): string {
  mkdirSync(into, { recursive: true });
  if (tool.unpack === 'bz2') {
    const binary = join(into, name);
    writeFileSync(binary, runChecked(['bunzip2', '-c'], bytes));
    chmodSync(binary, 0o755);
    return into;
  }
  runChecked(['tar', tool.unpack === 'tar.xz' ? '-xJf' : '-xzf', '-', '-C', into], bytes);
  return join(into, tool.folder);
}

if (import.meta.main) {
  const name = process.argv[2] ?? '';
  const tool = TOOLS[name];
  if (tool === undefined) {
    throw new Error(`install-tool: name one of ${Object.keys(TOOLS).join(', ')}, not "${name}"`);
  }
  const response = await fetch(tool.url);
  if (!response.ok) {
    throw new Error(`${tool.url}: HTTP ${response.status}`);
  }
  const body = await response.arrayBuffer();
  const bytes = new Uint8Array(body);
  checkDigest(bytes, tool.sha256, tool.url);
  const folder = unpackTool(name, tool, bytes, join(process.env['RUNNER_TEMP'] ?? process.cwd(), name));
  console.log(runChecked([join(folder, tool.version[0] ?? name), ...tool.version.slice(1)]).toString().trim());
  const path = process.env['GITHUB_PATH'];
  if (path !== undefined && path !== '') {
    appendFileSync(path, `${folder}\n`);
  }
}
