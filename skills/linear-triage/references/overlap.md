# overlap

On a full pass, after the stale check, compare the open issues with each other. Two issues that do the same work, split one piece of work without saying so, or pull a design two ways are cheapest to settle before an agent builds one of them. Step 3's duplicate check covers only Triage issues; this check covers the rest.

## finding the pairs

1. Run `scripts/overlap-candidates.sh --judged ~/.local/share/z-sessions/triage-overlap.tsv --relations ~/.local/share/z-sessions/triage-relations.json <page files>` on the full pass's saved pages.

   It prints at most 15 pairs of open issues in one project or area whose text names the same things, strongest first: the older ID, the newer ID, the score, and the shared terms. It leaves out a pair already judged or linked, a parent and its sub-issue, and siblings made from one template, such as the same change in each repo. The threshold sits at the lowest score that a pass or two can clear, and its count of pairs above the threshold goes to stderr: past 15, the rest come up on later passes. [overlap-candidates.sh](../scripts/overlap-candidates.sh) owns the scoring.

2. Run it again with `--rollouts` and the same files. It prints the template siblings the first run leaves out that make one change in different repos.

## judging each pair

Read both issues in full, with their comments and relations, then give the pair one verdict. Linear's issue list carries no relations, so add each issue you read with its relations to `~/.local/share/z-sessions/triage-relations.json`, a JSON list of `get_issue` results, replacing an older copy of the same issue. One read of an issue that blocks four others drops all four pairs on the next pass. A pair that is already linked gets the verdict `linked`, and nothing changes in Linear.

- **Duplicate:** both issues ask for the same change. Copy any detail the older one lacks into it, then mark the newer one Duplicate of the older. When either issue is In Progress or In Review, don't mark it; judge the pair as an overlap or a conflict instead.
- **Overlap:** both can be built, but part of one sits inside the other, or one needs the other first. Add a relation, blocks when one needs the other first and related otherwise, and comment on each issue which part belongs where.
- **Conflict:** both can't be built as written, such as one central runner and one check per repo for the same job. Give the newer issue `Needs Geoff` and a comment that names both issues, what each would build, and your recommendation. Move it from Ready to Backlog, since `tickets.md` keeps an issue with an open question out of Ready; leave an In Progress or In Review issue in its state. Then write the question into the check's notes file as the flag step says, and the check puts it to the owner as one call.
- **Rollout:** both make one shared change in different repos. When one of the two is vers feature work, relate them and change nothing else, because vers feature work stays its own issue. Otherwise make the older one the umbrella issue, with a box for each repo, as `tickets.md` says, and mark the newer one Duplicate of it. A vers issue that is not feature work gets its box there like any other repo's. When the newer one is In Progress or In Review, add its repo's box to the older one and relate the two instead.
- **Unrelated:** the titles match, but the work doesn't. Change nothing in Linear.

Never change the scope of an In Progress issue without the owner's call. Save each issue as `tickets.md` says under "saving an issue".

Append each judged pair to the judged file as one tab-separated line: the older ID, the newer ID, the verdict (`duplicate`, `overlap`, `conflict`, `rollout`, `unrelated` or `linked`), and today's date. A judged pair never comes up again, so judge it once with care.

## reporting

Write one line after the pass's "TRIAGE PASS at" line in `~/.local/share/z-sessions/triage.md`: `overlap: <N> pairs checked, <D> marked duplicate, <U> folded into an umbrella, <R> related, <F> flagged`.
