import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { now } from '../clock/now.ts';
import { logEvent } from '../log-event.ts';
import { addNews } from '../news/add-news.ts';
import { listUmbrellaBoxes } from './list-umbrella-boxes.ts';
import type { LinearCall, UmbrellaBox, UmbrellaOutcome } from './types.ts';
import { writeUmbrellaOutcome } from './write-umbrella-outcome.ts';

// An older merge is not posted: the first run after install must not flood news with old merges.
const FRESH_MS = 48 * 3_600_000;

// hq only reads Linear: z-review ticks the box. Returns the news lines posted.
export async function decideUmbrellaBoxes(db: Database, call: LinearCall, at: Date = now()): Promise<number> {
  const cutoff = at.getTime() - FRESH_MS;
  const undecided = listUmbrellaBoxes(db, 'undecided');
  const fresh = undecided.filter((box) => Date.parse(box.merged_at) >= cutoff);
  for (const box of undecided.filter((candidate) => !fresh.includes(candidate))) {
    settleBox(db, box, { outcome: 'gone', reason: 'merged more than 48 hours before hq looked' });
  }
  const descriptions = await readDescriptions(call, [...new Set(fresh.map((box) => box.issue))]);
  let posted = 0;
  for (const box of fresh) {
    const description = descriptions.get(box.issue);
    const decision = description === undefined ? { outcome: 'gone' as const, reason: 'Linear did not return the issue' } : pickDecision(box, description);
    if (settleBox(db, box, decision) && decision.outcome === 'news') {
      posted += 1;
    }
  }
  return posted;
}

interface Decision {
  outcome: UmbrellaOutcome;
  reason: string;
}

// The outcome, its event and any news line go in one transaction, and only the run whose update
// changed the row writes the event and the news line, so an overlapping sync never repeats them.
function settleBox(db: Database, box: UmbrellaBox, decision: Decision): boolean {
  return db
    .transaction(() => {
      if (!writeUmbrellaOutcome(db, box, decision.outcome)) {
        return false;
      }
      if (decision.outcome === 'news') {
        addNews(db, {
          from: 'hq',
          topic: 'merge',
          text: `${box.repo}#${box.number} merged: tick the ${box.repo} box on ${box.issue}`,
          issue: box.issue,
          link: `https://github.com/zgeoff/${box.repo}/pull/${box.number}`,
          needsGeoff: false,
        });
      }
      logEvent(db, 'hq', `umbrella-box:${box.repo}#${box.number}:${box.issue}`, 'umbrella-box', 'hq', null, decision.outcome, { reason: decision.reason });
      return true;
    })
    .immediate();
}

const BATCH = 50;

const Node = z.object({ identifier: z.string(), description: z.string().nullish() });

const Nodes = z.array(Node);

const DescriptionsResponse = z.object({ issues: z.object({ nodes: Nodes }) });

async function readDescriptions(call: LinearCall, issues: string[]): Promise<Map<string, string>> {
  const descriptions = new Map<string, string>();
  for (let start = 0; start < issues.length; start += BATCH) {
    const batch = issues.slice(start, start + BATCH);
    const query = `query($ids: [ID!]) { issues(first: ${BATCH}, includeArchived: true, filter: { id: { in: $ids } }) { nodes { identifier description } } }`;
    const response = await call(query, { ids: batch });
    const result = DescriptionsResponse.parse(response);
    for (const node of result.issues.nodes) {
      if (batch.includes(node.identifier)) {
        descriptions.set(node.identifier, node.description ?? '');
      }
    }
  }
  return descriptions;
}

function pickDecision(box: UmbrellaBox, description: string): Decision {
  const marks = collectMarks(description, box.repo);
  const [mark] = marks;
  if (marks.length === 0) {
    return { outcome: 'no_box', reason: `no checklist line for ${box.repo} in ${box.issue}` };
  }
  if (marks.length > 1) {
    return { outcome: 'ambiguous', reason: `${marks.length} checklist lines for ${box.repo} in ${box.issue}` };
  }
  if (mark !== ' ') {
    return { outcome: 'ticked', reason: `the ${box.repo} box in ${box.issue} is already ticked` };
  }
  return { outcome: 'news', reason: `the ${box.repo} box in ${box.issue} is unticked` };
}

// The tick mark of each checklist line that starts with the repo's name, not a longer name.
function collectMarks(description: string, repo: string): string[] {
  const escaped = repo.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
  const pattern = new RegExp(String.raw`^\s*[-*]\s+\[(?<mark> |x|X)\]\s+${escaped}\b(?![-\w])`, 'u');
  return description.split(/\r?\n/u).flatMap((line) => {
    const mark = pattern.exec(line)?.groups?.['mark'];
    return mark === undefined ? [] : [mark];
  });
}
