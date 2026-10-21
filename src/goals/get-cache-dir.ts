export function getCacheDir(): string {
  return `${process.env['XDG_CACHE_HOME'] || `${process.env['HOME']}/.cache`}/z-capacity`;
}
