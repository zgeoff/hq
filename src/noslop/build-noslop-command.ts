// `--config` is mandatory: without it Bun loads the reviewed repo's bunfig.toml and its preloads,
// and runs PR code.
export function buildNoslopCommand(clone: string, args: string[]): string[] {
  return ['bun', `--config=${clone}/bunfig.toml`, `${clone}/apps/cli/src/cli.ts`, ...args];
}
