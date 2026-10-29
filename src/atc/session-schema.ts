import { z } from 'zod';

// What hq reads of atc's answers. Every object is loose: fields hq does not read pass through, and
// a field hq treats as optional stays optional.
// pluginDirs (atc 4.15+) are the plugin folders the session was spawned with.
// agentSessionID is the agent's own id (Claude's session id); an ended session may lack it.
// parent is the session a sub-session lists under; cwd is where it runs, inside its host.
// createdAt is when atc made the session, in ms. locator.targetID is the host it runs on (local: this PC); lifecycle.vm is none for a session on this PC.
// oxlint-disable-next-line promise/prefer-await-to-then, unicorn/prefer-top-level-await -- zod's .catch, not a promise's
export const sessionSchema = z.looseObject({ id: z.string(), name: z.string(), alive: z.boolean(), state: z.string(), agentSessionID: z.string().nullish().catch(undefined), pluginDirs: z.array(z.string()).nullish().catch(undefined), parent: z.string().nullish().catch(undefined), pinned: z.boolean().nullish().catch(undefined), cwd: z.string().nullish().catch(undefined), createdAt: z.number().nullish().catch(undefined), locator: z.looseObject({ targetID: z.string().nullish().catch(undefined) }).nullish().catch(undefined), lifecycle: z.looseObject({ vm: z.string().nullish().catch(undefined) }).nullish().catch(undefined) });
export type SessionInfo = z.infer<typeof sessionSchema>;
