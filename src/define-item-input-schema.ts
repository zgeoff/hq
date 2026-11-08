import { z } from 'zod';

const TITLE_MAX = 80;

export function defineItemInputSchema() {
  const DetailSchema = z.strictObject({ heading: defineText(), text: defineText(), code: defineText().optional() });
  const DiffSchema = z.strictObject({ now: defineText(), would: defineText() });
  const LinkSchema = z.strictObject({ label: defineText(), url: z.url({ protocol: /^https?$/u }), subject: z.literal(true).optional() });
  const GrantSchema = z.strictObject({ action: z.enum(['override', 'accept-risk']), pr: z.string().regex(/^[\w.-]+\/[\w.-]+#\d+$/u, 'must be <owner>/<repo>#<number>'), finding: defineText().optional(), head: z.string().regex(/^[0-9a-f]{40}$/u, 'must be a 40-character commit sha').optional() });
  const OptionSchema = z.strictObject({ label: defineText(), effect: defineText(), recommended: z.boolean().optional(), grants: GrantSchema.optional() });
  const UnblocksSchema = z.strictObject({ id: defineText(), title: defineText() });
  return z.strictObject({
    title: defineText().max(TITLE_MAX),
    question: defineText(),
    deadline: defineText().optional(),
    time: defineText().optional(),
    options: z.array(OptionSchema).min(2).max(4).optional(),
    stuView: defineText().optional(),
    details: z.array(DetailSchema).default([]),
    diff: DiffSchema.optional(),
    unblocks: z.array(UnblocksSchema).default([]),
    links: z.array(LinkSchema).default([]),
  });
}

function defineText() {
  return z.string().regex(/\S/u, 'must not be blank');
}
