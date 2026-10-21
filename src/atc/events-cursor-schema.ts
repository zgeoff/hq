import { z } from 'zod';
import { eventsPage } from './events-page.ts';

export const eventsCursorSchema = z.looseObject(eventsPage);
