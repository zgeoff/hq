import { renderHelp } from './render-help.ts';
import { VERSION } from './version.ts';

// Rendered from the command registry (src/commands.ts).
export const HELP = renderHelp(VERSION);
