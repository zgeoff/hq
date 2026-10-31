# Example: a delivery brief for a small bug

The start of a filled-in [delivery brief](brief.md), for an invented repo and issue. It stops after
Permissions; check the rest against the template. The Permissions line stands in for the private
wording: never paste the angle-bracket line.

```text
/goal A ready PR in acme/rates for ACME-92, with evidence for each acceptance item and the review answered

Outcome: the config loader rejects a probability table whose values don't sum to 1.
Context: the loader is in src/config/load-thresholds.ts.
Scope:
- In: validation at load time, with an error naming the table and its sum.
- Out: changing existing threshold values.
Acceptance:
- Loading a table that sums to 0.97 fails with an error naming the table and the sum (unit test)
- All shipped configs still load (existing suite passes)

Permissions:
<the wording for the Code delivery grant from briefs.private.md, with acme/rates as the repo>
```

Later in the same brief: `{{stack}}` and `{{imp_line}}` are empty (one PR, launched locally), and
the merge completes the issue, so the Finish line reads
`Finish line: a ready PR in acme/rates whose description holds the line "Fixes ACME-92", …`.
