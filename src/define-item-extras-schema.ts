import { defineItemInputSchema } from './define-item-input-schema.ts';

export function defineItemExtrasSchema() {
  return defineItemInputSchema().omit({ title: true, question: true, stuView: true });
}
