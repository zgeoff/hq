export function formatProbeStart(at: string): string {
  const day = new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(at));

  return `${day} ${at.slice(11, 16)}Z`;
}
