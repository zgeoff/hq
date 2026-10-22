# example: delivery brief for a small bug

The delivery brief in `templates/brief.md`, filled in.

```text
/goal A ready PR in zgeoff/auto-mode for GEO-92, with evidence for each acceptance item and the review answered

Outcome: the config loader rejects a probability table whose values don't sum to 1.
Context: loader in src/config/load-thresholds.ts.
Scope: in: validation at load time, with an error naming the table and its sum. Out: changing existing threshold values.
Acceptance:
- Loading a table that sums to 0.97 fails with an error naming the table and the sum (unit test)
- All shipped configs still load (existing suite passes)

Permissions:
<the Code delivery phrase, with zgeoff/auto-mode as the repo>
```

The real brief goes on with the finish line, cleanup and note lines verbatim.
