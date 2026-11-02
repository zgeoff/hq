export function restartQuiet(d: Date): boolean {
  const h = Number(new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', hour: '2-digit', hourCycle: 'h23' }).format(d));
  return h >= 23 || h < 8;
}
