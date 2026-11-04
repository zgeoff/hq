import { z } from 'zod';

export const AREA_LABELS_KEY = 'linear_area_labels';

export const areaLabelsSchema = z.object({
  at: z.string(),
  names: z.array(z.string()),
  repoExists: z.record(z.string(), z.boolean()),
});

export type StoredAreaLabels = z.output<typeof areaLabelsSchema>;

export type AreaLabels = Omit<StoredAreaLabels, 'at'> & { at: string | null };
