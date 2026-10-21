# launch order

The owner set this order on 2026-10-17, to pay down debt before more features (decision D-debt-first): tie off in-flight feature work, then put tech debt, architecture and cleanup work first. A project returns to feature work once that work is done. Urgent bugs and specific requests stay highest priority.

## Cleanup first, until no `quality` issue is open

From 2026-10-19, this comes before the groups below, until no `quality` issue is open (decision D-cleanup-first). There is no sweep freeze: the review pipeline keeps being tuned, and that may file more issues.

- In every lane, a Ready issue labelled `quality` launches before any other, within the lane's own limits, such as the `cleanup` lane's set.
- Within that, noslop cleanup and maintenance launch first, ahead of every other cleanup issue: an issue in zgeoff/noslop, or one in another repo whose change alters what noslop checks, such as a rule in tools' shared skills or lint config that a noslop lens reads. The owner put it first on 2026-10-19 because it gates everything else; hq-private's `delivery-design.md` holds his words. The order is GEO-1437, GEO-1438, GEO-1370, then any other open noslop issue.
- Next, within a lane and one priority, a Ready issue labelled `enabler` launches ahead of a one-off fix: work that unblocks or speeds up other work, such as review-tool and gate fixes, pre-push and test flakes, sync and CI fixes, and the GEO-1540 alignment rollouts. (decision D-enabler-first). **Triage** adds the label.
- An issue labelled `process` launches only into the `process` lane, ahead of any work that lane borrowed. The owner judged it worth pursuing and signed off its design before it was filed.
- These still launch in their turn: an Urgent or High issue; GEO-1408 and GEO-1409 (the band); GEO-1319 in the `memory` lane; and security hardening work already in flight.
- A run already going finishes where it is.
- It holds until no `quality` issue is open, in Triage, Backlog, Ready, In Progress or In Review. Count them each tick from Linear: label `quality`, those states. On the tick the count first reads 0, the order below comes back by itself: post it to `hq news`, and record the date here.

## The groups

Within a lane, take Ready issues in these groups, and within each group, highest priority first, then `enabler` issues first, then oldest first:

1. **Urgent bugs, and work the owner asked for by name.**
2. **Debt:** reliability work on the agent stack (atc, imp, auto-mode, the cloud images) first, then architecture and docs rebuilds, `quality`-labelled issues, max-lines and max-params refactors, other bugs, and security hardening.
3. **Features,** only in a project whose architecture, quality and clean-up issues are all Done, or down to design sessions with the owner. A feature in any other project waits.

A feature already in flight finishes its current PR or stack, ships, and passes its live check. Then it stops: launch no next slice of it until its project clears.

In a repo under a major refactor, land the architecture work first, then the lint rule enables, then leave any design that remains to a session with the owner (decision D-architecture-first).

When usage runs out and the lanes wait, let them wait, for up to 24 hours, since this is personal work with no deadlines (decision D-usage-wait).
