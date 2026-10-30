import type { Database } from 'bun:sqlite';
import { now } from '../clock/now.ts';
import { logEvent } from '../log-event.ts';
import { addNews } from '../news/add-news.ts';
import type { LinearCall } from './types.ts';
import { decideUmbrellaBox, listUmbrellaBoxes } from './umbrella-boxes.ts';
import type { UmbrellaBox, UmbrellaOutcome } from './umbrella-boxes.ts';

const FRESH_MS = 48 * 3_600_000; // an older merge is not posted: the first run after install must not flood news

// For each merged PR that contributes to an umbrella issue, looks for the repo's rollout box in the
// issue's description and posts one news line when it is unticked. hq only reads Linear: z-review
// ticks the box. Returns the news lines posted.
export async function decideUmbrellaBoxes(db: Database, call: LinearCall, at: Date = now()): Promise<number> {
  const cutoff = at.getTime() - FRESH_MS;
  const undecided = listUmbrellaBoxes(db, 'undecided');
  const fresh = undecided.filter((box) => Date.parse(box.merged_at) >= cutoff);
  for (const box of undecided) {
    if (!fresh.includes(box)) settle(db, box, 'gone', 'merged more than 48 hours before hq looked');
  }
  const descriptions = new Map<string, string | null>();
  const issues = [...new Set(fresh.map((box) => box.issue))];
  for (let i = 0; i < issues.length; i += 50) {
    const batch = issues.slice(i, i + 50);
    const q = `query($ids: [ID!]) { issues(first: 50, includeArchived: true, filter: { id: { in: $ids } }) { nodes { identifier description } } }`;
    const d = (await call(q, { ids: batch })) as { issues: { nodes: { identifier: string; description?: string | null }[] } };
    for (const node of d.issues.nodes) if (batch.includes(node.identifier)) descriptions.set(node.identifier, node.description ?? '');
  }
  let posted = 0;
  for (const box of fresh) {
    const description = descriptions.get(box.issue);
    if (description === undefined) {
      settle(db, box, 'gone', 'Linear did not return the issue');
      continue;
    }
    const boxes = checklistLines(description ?? '', box.repo);
    if (boxes.length === 0) settle(db, box, 'no_box', `no checklist line for ${box.repo} in ${box.issue}`);
    else if (boxes.length > 1) settle(db, box, 'ambiguous', `${boxes.length} checklist lines for ${box.repo} in ${box.issue}`);
    else if (boxes[0] !== ' ') settle(db, box, 'ticked', `the ${box.repo} box in ${box.issue} is already ticked`);
    else {
      settle(db, box, 'news', `the ${box.repo} box in ${box.issue} is unticked`);
      posted++;
    }
  }
  return posted;
}

// The tick mark of each checklist line that starts with the repo's name (not a longer name).
function checklistLines(description: string, repo: string): string[] {
  const re = new RegExp(`^\\s*[-*]\\s+\\[( |x|X)\\]\\s+${repo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b(?![-\\w])`);
  return description.split(/\r?\n/).flatMap((line) => {
    const m = re.exec(line);
    return m ? [m[1]!] : [];
  });
}

// The outcome, its event and any news line go in one transaction, so a news line is never repeated.
function settle(db: Database, box: UmbrellaBox, outcome: UmbrellaOutcome, reason: string): void {
  db.transaction(() => {
    decideUmbrellaBox(db, box, outcome);
    if (outcome === 'news') {
      addNews(db, {
        from: 'hq',
        topic: 'merge',
        text: `${box.repo}#${box.number} merged: tick the ${box.repo} box on ${box.issue}`,
        issue: box.issue,
        link: `https://github.com/zgeoff/${box.repo}/pull/${box.number}`,
        needsGeoff: false,
      });
    }
    logEvent(db, 'hq', `umbrella-box:${box.repo}#${box.number}:${box.issue}`, 'umbrella-box', 'hq', null, outcome, { reason });
  }).immediate();
}
