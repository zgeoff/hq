export function parseBtime(stat: string): number | null {
  const seconds = /^btime (?<seconds>\d+)$/mu.exec(stat)?.groups?.['seconds'];
  return seconds === undefined ? null : Number(seconds);
}
