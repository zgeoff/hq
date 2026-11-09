import type { Database } from 'bun:sqlite';
import type { addTyped } from '../add-typed.ts';

export interface TypedDeps {
  db: Database;
}

export type NewTyped = Parameters<typeof addTyped>[1];
