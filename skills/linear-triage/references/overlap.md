# Overlap

Step 6 of a full pass: find pairs of open issues that do the same work, split one piece of work
without saying so, or pull a design two ways, before an agent builds one. Each pair is judged once
and never comes up again, so judge with care. Never mark an In Progress or In Review issue Duplicate
or change its scope.

## Finding the pairs

1. From the skill's folder, run (on a first run, create the judged file empty and the relations file
   as `[]`):

   ```bash
   scripts/overlap-candidates.sh --judged ~/.local/share/z-sessions/triage-overlap.tsv --relations ~/.local/share/z-sessions/triage-relations.json <scratch>/pages/*
   ```

   Expect up to 15 pairs, strongest first: older ID, newer ID, score, shared terms. Pairs past 15
   come up on later passes.

2. Run it again with `--rollouts`. Expect groups of template siblings making one change in different
   repos. Judge the oldest against each sibling, as one pair each.

## Judging each pair

Read both issues in full, with comments and relations. Add each issue's `get_issue` result, with
relations, to `triage-relations.json`, replacing any older copy, so the script skips linked pairs
next time. If the two are already linked in Linear, the verdict is `linked` and you change nothing.

- **Duplicate,** the same change: copy any missing detail into the older one, and mark the newer
  Duplicate of it. If either is In Progress or In Review, judge it as an overlap or a conflict
  instead.
- **Overlap,** both buildable but one contains or needs part of the other: add `blocks` or
  `related`, and comment on each which part belongs where.
- **Conflict,** both can't be built as written: flag the newer one with both issues, what each would
  build, and your recommendation. Move it from Ready to Backlog, unless it's In Progress or In
  Review.
- **Rollout,** one shared change in different repos: make the older one the umbrella (or add a box
  if it already is) and mark the newer Duplicate. Instead, take the first that fits:
  - either is vers feature work: relate them, nothing else;
  - the older is In Progress or In Review: relate them, and flag the newer as a conflict;
  - the newer is In Progress or In Review: add its box to the older, and relate them.
- **Unrelated,** titles match but the work doesn't: change nothing.

Append each pair to `triage-overlap.tsv`, tab-separated: older ID, newer ID, verdict (`duplicate`,
`overlap`, `conflict`, `rollout`, `unrelated` or `linked`), date as `YYYY-MM-DD`.

## Reporting

Add one line under the pass's "TRIAGE PASS at" line in `~/.local/share/z-sessions/triage.md`:

```text
overlap: <N> pairs checked, <D> marked duplicate, <U> folded into an umbrella, <R> related, <F> flagged
```

`<N>` counts both runs. A rollout's Duplicate counts in `<U>`, not `<D>`. `<R>` counts every
relation added.
