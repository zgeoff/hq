# pins

How `agent-delegation` pins and unpins sessions.

Pin and unpin with `atc_session_update` only the sessions in your work: those you or another coordinator launched, design sessions included, and their children. Never manage the owner's own sessions.

- Pin a session while it needs the owner's action: a question, an approval, a PR that waits on his review or merge, or a design or audit session that waits on him. Design-session pins need no approval. When you pin one, tell the owner its name and to chat with it.
- Keep every other session in your work unpinned, even one that is kept or still running.
- Re-check the pin when the session's state changes: at launch, each check-in, and wrap-up. Pin the parent; its children follow. At each check-in, run `hq pins` and wrap up each pinned session in your work, watched or not, that no longer needs the owner.
