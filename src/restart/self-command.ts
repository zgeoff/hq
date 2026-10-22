// The command that runs this hq again: the compiled binary, or bun + this script.
export function selfCommand(): string[] {
  return Bun.main.startsWith('/$bunfs/') ? [process.execPath] : [process.execPath, Bun.main];
}
