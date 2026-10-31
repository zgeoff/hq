# Launching a helper session

For a session another role starts for one job, such as `z-stu`'s PR walk or `z-release`'s atc
upgrade. Delivery agents launch through `z-delivery` instead.

1. Write the brief as the owner, "I" to "you": the auto-mode classifier reads "the owner" as someone
   else's claim. Put every grant in the brief itself, never in a file.
2. Launch with `atc_session_spawn`: `detached: true`, a name that says the job, and an
   `idempotencyKey` such as `pr-walk-2026-11-02-1`.
3. Twenty seconds later, check `atc_session_get` shows it working. Unsure whether it launched: look
   it up before retrying.
4. When it reports, forget it with `atc_session_forget` and `stop: true`, unless it holds unpushed
   work.
