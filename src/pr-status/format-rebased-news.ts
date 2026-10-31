export interface RebasedNews {
  repo: string;
  pr: number;
  oldHead: string;
  newHead: string;

  // How many files the base now holds as the old head had them, left out of the compared diffs.
  landed: number;
}

// One news line for a carried lgtm, under the 400 characters a news line may hold.
export function formatRebasedNews(actor: string, carry: RebasedNews): string {
  return `${actor} carried the owner's lgtm on ${carry.repo}#${carry.pr} from ${carry.oldHead.slice(0, 7)} to ${carry.newHead.slice(0, 7)}: ${carry.landed === 0 ? "git's patch-id of the diff matched" : `the diff matched once ${carry.landed} ${carry.landed === 1 ? 'file' : 'files'} the base now holds as approved ${carry.landed === 1 ? 'was' : 'were'} left out`}`;
}
