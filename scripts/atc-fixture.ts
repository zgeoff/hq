import { AtcClient } from '../src/atc/atc-client.ts';
import { eventsCursorSchema } from '../src/atc/events-cursor-schema.ts';
import { socketPath } from '../src/atc/socket-path.ts';

const client = await AtcClient.open(socketPath(), 3000),
  events = await client.call('events.read', { limit: 1 }, eventsCursorSchema);
console.log(JSON.stringify({ recorded: new Date().toISOString().slice(0, 10), cursor: events.cursor, cursorDecoded: Buffer.from(events.cursor, 'base64url').toString() }, null, 2));
client.close();
