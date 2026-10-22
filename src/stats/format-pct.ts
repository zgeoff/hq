export function formatPct(x: number | null) {
  return (x === null ? '–' : `${Math.round(x * 100)}%`);
}
