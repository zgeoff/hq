// The /goal line's review clause. noslop posts no review in a repo off its list, so there the
// agent's own review stands in for it.
export function buildGoalReview(noslopListed: boolean): string {
  return noslopListed ? "noslop's review answered" : "your own review's findings fixed";
}
