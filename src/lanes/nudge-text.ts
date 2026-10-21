export function nudgeText(slots: number, minutes: number, eligible: number | null): string {
  const eligibleText = eligible === null ? 'Ready count unknown (no fresh Ready count from Linear)' : `${eligible} eligible Ready issue${eligible === 1 ? '' : 's'}`;
  return `${slots} agent slot${slots === 1 ? '' : 's'} free for ${minutes} min, ${eligibleText}: fill now. (hq lanes; you pick the issues and write the briefs.)`;
}
