export function getLogFiles(): string[] {
  return [`${process.env['HOME']}/.local/share/z-sessions/delivery-archive.md`, `${process.env['HOME']}/.local/share/z-sessions/delivery.md`];
}
