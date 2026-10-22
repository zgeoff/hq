// The old wake-sessions.txt format: "<session id> <name>" per line, # comments.
export function parseWakeFile(text: string): { id: string; name: string }[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const [id, ...rest] = l.split(/\s+/);
      return { id: id!, name: rest.join(' ') || id! };
    });
}
