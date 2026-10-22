// ---- text

export function fmtMin(m: number | null): string {
  if (m === null) return '–';
  if (m < 90) return `${Math.round(m)}m`;
  if (m < 48 * 60) return `${(m / 60).toFixed(1)}h`;
  return `${(m / 1440).toFixed(1)}d`;
}
