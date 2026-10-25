const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "28 Oct 08:00Z": the day, month and UTC time of an ISO time, to the nearest minute, since the usage
// endpoint gives a reset a moment before the hour as often as after it.
export function formatResetTime(time: string): string {
  const MINUTE_MS = 60_000;
  const date = new Date(Math.round(Date.parse(time) / MINUTE_MS) * MINUTE_MS);
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()] ?? ''} ${hours}:${minutes}Z`;
}
