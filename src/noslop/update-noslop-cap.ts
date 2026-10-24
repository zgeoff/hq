import type { Database } from 'bun:sqlite';
import { loadNoslopSettings } from './load-noslop-settings.ts';
import type { NoslopSettings } from './load-noslop-settings.ts';
import { writeNoslopSettings } from './write-noslop-settings.ts';

// Sets a repo's emergency review cap, or clears it with `off`. The read and the write share one
// immediate transaction, so a list change or pin by another hq process in between is never lost.
export function updateNoslopCap(db: Database, name: string, cap: number | null): NoslopSettings {
  return db
    .transaction(() => {
      const current = loadNoslopSettings(db);
      const { [name]: _dropped, ...others } = current.caps;
      const next: NoslopSettings = { ...current, caps: cap === null ? others : { ...others, [name]: cap } };
      writeNoslopSettings(db, next);
      return next;
    })
    .immediate();
}
