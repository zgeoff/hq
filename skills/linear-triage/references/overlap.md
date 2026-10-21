# overlap

Read this on a full pass, after the stale check. It compares open issues with each other, so two issues that do the same work, split one piece of work without saying so, or pull a design two ways, are found before an agent builds one of them. A Triage issue's duplicate check in step 3 sees only new issues; this one sees the rest.

## finding the pairs

Run `scripts/overlap-candidates.sh --judged ~/.local/share/z-sessions/triage-overlap.tsv --relations ~/.local/share/z-sessions/triage-relations.json <page files>` on the full pass's saved pages. It pairs open issues in the same project, or that share an area label, scores how much their titles and descriptions name the same things, and prints at most 15 pairs, strongest first: the older ID, the newer ID, the score, and the shared terms. It leaves out every pair already in the judged file, every pair the relations file links, a parent and its sub-issue, and siblings made from one template: the same change in each repo, or the same title but for one or two names, such as a package or a check, each where a name goes. A verb that differs, such as accept against reject, still pairs. Links, URLs, issue IDs and the issue list's truncation note count for nothing, since every issue has them. A pair prints at a score of 0.8 or more: on 19 Oct's 461 open issues, 0.8 left 22 pairs and 0.85 left 8, so 0.8 is the lowest round step that a pass or two clears. Its count of pairs above the threshold goes to stderr: when it is more than 15, the rest come up on later passes.

Then run it again with `--rollouts` and the same files. It prints only the siblings the first run leaves out that make one change in different repos: titles with different repo prefixes, or that differ by a repo name, across projects and areas. Judge each such pair as below.

## judging each pair

Read both issues in full, with their comments and relations, then give the pair one verdict. Linear's issue list carries no relations, so add each issue you read with relations to `~/.local/share/z-sessions/triage-relations.json`, a JSON list of `get_issue` results, replacing an older copy of the same issue: one read of an issue that blocks four others drops all four pairs on the next pass. When a pair is already linked, give it the verdict `linked` and change nothing in Linear.

- **Duplicate:** both issues ask for the same change. Copy any detail the older lacks into it, then mark the newer one Duplicate of the older. When either issue is In Progress or In Review, don't mark it; judge the pair as an overlap or a conflict instead.
- **Overlap:** both can be built, but part of one sits inside the other, or one needs the other first. Add a relation, blocks when one needs the other first and related otherwise, and comment on each issue which part belongs where.
- **Conflict:** both can't be built as written, such as one central runner and one check per repo for the same job. Give the newer issue `Needs Geoff` and a comment that names both issues, what each would build, and your recommendation. Move it from Ready to Backlog, as `tickets.md` keeps an issue with an open question; leave an In Progress or In Review issue in its state. Then write the question into the check's notes file as the flag step says. The check puts it to the owner as one call.
- **Rollout:** both make one shared change in different repos. When one of the two is a vers issue, relate them and change nothing else: vers stays its own issue. Otherwise make the older the umbrella issue, with a box for each repo but vers, as `tickets.md` says, and mark the newer one Duplicate of it. When the newer is In Progress or In Review, add its repo's box to the older and relate the two instead.
- **Unrelated:** the titles match, but the work doesn't. Change nothing in Linear.

Never change the scope of an In Progress issue without that call. Save each issue as `tickets.md` says under "saving an issue".

Append each judged pair to the judged file as one line, tab-separated: the older ID, the newer ID, the verdict (`duplicate`, `overlap`, `conflict`, `rollout`, `unrelated` or `linked`), and today's date. A pair in it never comes up again, so judge it once with care.

## reporting

Write one line after the pass's "TRIAGE PASS at" line in `~/.local/share/z-sessions/triage.md`: `overlap: <N> pairs checked, <D> marked duplicate, <U> folded into an umbrella, <R> related, <F> flagged`.
