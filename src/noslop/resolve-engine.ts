import type { Database } from 'bun:sqlite';
import { isNoslopListed } from './is-noslop-listed.ts';
import { loadNoslopSettings } from './load-noslop-settings.ts';
import type { Engine } from './pick-engine.ts';
import { pickEngine } from './pick-engine.ts';

export interface ResolvedEngine {
  engine: Engine;
  sha: string | null;
}

export function resolveEngine(db: Database, owner: string, repo: string): ResolvedEngine {
  const settings = loadNoslopSettings(db);
  return {
    engine: pickEngine({ repo, listed: isNoslopListed(settings, owner, repo), pinned: settings.sha }),
    sha: settings.sha,
  };
}
