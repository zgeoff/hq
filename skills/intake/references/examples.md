# examples

How `intake` opens a working session and files a side request. The scene is invented, a kettle-timer app with KET-n issues, to show the intended behaviour.

## opening a session

The owner: "let's pick the kettle timer back up."

Before replying, read the kettle-timer project, its open issues, and all of Triage. Then:

```text
Kettle timer: you want a timer that says when the water is ready without you watching the kettle.

I've read the project and all 12 Triage items (10 are kettle timer). The work falls into three threads:
- Alert model: the redesign (KET-40) plus the alert findings (late chimes, a second alert after you already poured, alerts on the wrong device).
- Boil-time tests: the two reports show tuning the default times alone won't get there; KET-31 covers rethinking how boil time is measured.
- Small fixes: KET-35 (boil-time rounding) is independent and ready.

Proposed working set:
- Ready to launch: KET-35.
- Design session with you: KET-40, then KET-31.
- Parked until the redesign lands: the default-time tuning issues.

One question: should the measurement rethink wait for the redesign, or run alongside it?
```

What makes this work: the goal is in the owner's words, Triage was read before any recommendation, the design questions are left for the design session, and there's one question only the owner can answer.

## a side request mid-session

The owner: "also, the timer doesn't show on the lock screen."

File it straight away, link it to related work, and keep going in one short reply:

```text
Filed KET-52: show the running timer on the lock screen (Triage, linked to the notification work). Separate from KET-51's chime-volume issue so neither gets lost.
```
