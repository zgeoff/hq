export function formatGiB(bytes: number, d = 1): string {
  return (bytes / 2 ** 30).toFixed(d);
}
