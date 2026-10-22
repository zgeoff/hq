// Requests that reach another session or change one: a message, typed text, a spawn, a stop, an update, a forget.
export const ATC_WRITES = new Set(['session.message', 'session.submit', 'session.input', 'session.spawn', 'session.kill', 'session.update', 'session.forget']);
