import { expect, onTestFinished, test } from "bun:test";
import { freshDb } from "../../test/helpers.ts";
import { readOwnerSession } from "./read-owner-session.ts";
import type { OwnerProbeClient } from "./read-owner-session.ts";

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  const opened: string[] = [];
  const closed: boolean[] = [];
  const client = (ownerID: string): OwnerProbeClient => ({
    resolve: (target) => {
      opened.push(target);
      return Promise.resolve({ id: ownerID });
    },
    close: () => {
      closed.push(true);
    },
  });
  return { db: fresh.db, opened, closed, client };
}

test("it refuses a caller with no session id even when HQ_AS and --by name the owner", async () => {
  const ctx = setupTest();
  const savedAs = process.env["HQ_AS"];
  process.env["HQ_AS"] = "z-stu";
  onTestFinished(() => {
    if (savedAs === undefined) {
      delete process.env["HQ_AS"];
    } else {
      process.env["HQ_AS"] = savedAs;
    }
  });

  await expect(
    readOwnerSession(ctx.db, {
      sessionID: "",
      openClient: () => Promise.resolve(ctx.client("sess-owner")),
    }),
  ).resolves.toStrictEqual({ verdict: "other" });
  await expect(
    readOwnerSession(ctx.db, { openClient: () => Promise.resolve(ctx.client("sess-owner")) }),
  ).resolves.toStrictEqual({ verdict: "other" });
  expect(ctx.opened).toStrictEqual([]);
});

test("it refuses a session id that is not the owner session", async () => {
  const ctx = setupTest();

  await expect(
    readOwnerSession(ctx.db, {
      sessionID: "sess-kettle",
      openClient: () => Promise.resolve(ctx.client("sess-owner")),
    }),
  ).resolves.toStrictEqual({ verdict: "other" });
  expect(ctx.opened).toStrictEqual(["z-stu"]);
});

test("it accepts the session id atc resolves the owner to", async () => {
  const ctx = setupTest();

  await expect(
    readOwnerSession(ctx.db, {
      sessionID: "sess-owner",
      openClient: () => Promise.resolve(ctx.client("sess-owner")),
    }),
  ).resolves.toStrictEqual({ verdict: "owner" });
  expect(ctx.closed).toStrictEqual([true]);
});

test("it keeps the cause when atc is unreachable, rather than calling the caller another session", async () => {
  const ctx = setupTest();

  await expect(
    readOwnerSession(ctx.db, {
      sessionID: "sess-owner",
      openClient: () => Promise.reject(new Error("no socket")),
    }),
  ).resolves.toStrictEqual({ verdict: "unknown", cause: "no socket" });
});
