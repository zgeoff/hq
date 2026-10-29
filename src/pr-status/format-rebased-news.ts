export interface RebasedNews {
  repo: string;
  pr: number;
  oldHead: string;
  newHead: string;
}

// One news line for a carried lgtm, under the 400 characters a news line may hold.
export function formatRebasedNews(actor: string, carry: RebasedNews): string {
  return `${actor} carried the owner's lgtm on ${carry.repo}#${carry.pr} from ${carry.oldHead.slice(0, 7)} to ${carry.newHead.slice(0, 7)}: git's patch-id of the diff matched`;
}
