export function getHome(): string {
  return process.env['HOME'] ?? '/';
}
