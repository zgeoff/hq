import { z } from "zod";
import { parseJSON } from "../noslop/parse-json.ts";
import { boundedRunner } from "../runner/bounded-runner.ts";
import type { Runner } from "../runner/types.ts";
import { CALL_MS } from "../watcher/call-ms.ts";

const CommentSchema = z.object({
  id: z.number(),
  replyTo: z.number().nullish(),
  login: z.string().nullish(),
  type: z.string().nullish(),
  body: z
    .string()
    .nullish()
    .transform((body) => body ?? ""),
  url: z.string(),
});

// A comment on a PR, whether a review comment (a thread on the diff) or an issue comment.
export type PRComment = z.output<typeof CommentSchema>;

// Every comment under a gh api path (`repos/<slug>/pulls/<n>/comments` or `repos/<slug>/issues/<n>/comments`),
// oldest first. Throws an Error naming the path when gh fails or prints a line that is not a comment.
export async function readPRComments(run: Runner, path: string): Promise<PRComment[]> {
  const result = await boundedRunner(
    run,
    CALL_MS,
  )([
    "gh",
    "api",
    path,
    "--paginate",
    "--jq",
    ".[] | {id, replyTo: .in_reply_to_id, login: .user.login, type: .user.type, body, url: .html_url}",
  ]);
  if (result.code !== 0) {
    throw new Error(
      `gh cannot read ${path} (${(result.stderr || result.stdout).trim().slice(0, 300)})`,
    );
  }
  const parsed = z.array(CommentSchema).safeParse(
    result.stdout
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => parseJSON(line)),
  );
  if (!parsed.success) {
    throw new Error(`gh api ${path} printed a line that is not a comment`);
  }
  return parsed.data;
}
