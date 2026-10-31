# Examples: starting work and a side request

Two invented replies, for a kettle-timer app with KET-n issues. Copy the shape, not the words.

## Starting work

He says: "let's pick the kettle timer back up, I still want it to tell me when the water's ready
without me watching it." You read the project, its issues, and all 12 Triage issues first.

```text
Kettle timer: you want it to tell you when the water's ready, without you watching it.

I've read the project and all 12 Triage issues (10 are kettle timer). The work falls into three threads:
- Alerts: the redesign (KET-40) plus the three alert bugs (late chimes, a second alert after you poured, alerts on the wrong device).
- Boil-time measurement: the two boil-time reports show that tuning the default times won't fix it. KET-31 covers measuring boil time a new way.
- Small fixes: KET-35 (boil-time rounding) stands alone and is Ready.

What I'd do with each:
- Launch now: KET-35.
- Give to an agent's design session: KET-40, then KET-31.
- Park until the redesign lands: the default-time tuning issues.

One question: should KET-31 wait for the redesign, or run beside it?
```

The first line repeats his goal. The design questions go to a design session, so the one question is
something only he can answer.

## A side request mid-session

He says: "also, the timer doesn't show on the lock screen." File it to Triage at once, confirm in
one line, and carry on:

```text
Filed KET-52: show the running timer on the lock screen (Triage, related to KET-40, the alert redesign).
```
