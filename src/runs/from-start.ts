// Omitting the cursor reads the newest page; a read after event 0 starts at the oldest kept event.
// atc 6.0.0 (protocol 7) and 7.0.0 (protocol 8) write an events cursor as the tuple ["events", id].
export const FROM_START = Buffer.from(JSON.stringify(['events', 0])).toString('base64url');
