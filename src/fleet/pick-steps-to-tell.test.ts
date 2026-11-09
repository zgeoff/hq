import { expect, test } from "bun:test";
import { pickStepsToTell } from "./pick-steps-to-tell.ts";
import type { EnsureStep } from "./types.ts";

test.each<{ title: string; told: EnsureStep[]; owner: EnsureStep[]; news: EnsureStep[] }>([
  {
    title: "a spawned step goes to news alone",
    told: [{ name: "z-kettle", action: "spawned", detail: "abcd1234 after 10 min" }],
    owner: [],
    news: [{ name: "z-kettle", action: "spawned", detail: "abcd1234 after 10 min" }],
  },
  {
    title: "a failed step goes to the owner alone",
    told: [{ name: "z-teapot", action: "failed", detail: "cwd is missing" }],
    owner: [{ name: "z-teapot", action: "failed", detail: "cwd is missing" }],
    news: [],
  },
  {
    title: "a duplicates step goes to the owner alone",
    told: [{ name: "z-urn", action: "duplicates", detail: "2 live sessions share the name" }],
    owner: [{ name: "z-urn", action: "duplicates", detail: "2 live sessions share the name" }],
    news: [],
  },
  {
    title: "a remote control step goes to the owner alone",
    told: [{ name: "z-kettle", action: "remote control", detail: "turned off" }],
    owner: [{ name: "z-kettle", action: "remote control", detail: "turned off" }],
    news: [],
  },
  {
    title: "an urgent spawned step goes to the owner alone",
    told: [{ name: "z-kettle", action: "spawned", detail: "abcd1234 after 10 min", urgent: true }],
    owner: [{ name: "z-kettle", action: "spawned", detail: "abcd1234 after 10 min", urgent: true }],
    news: [],
  },
  {
    title: "a spawned and a failed step split between news and the owner",
    told: [
      { name: "z-kettle", action: "spawned", detail: "abcd1234 after 10 min" },
      { name: "z-teapot", action: "failed", detail: "cwd is missing" },
    ],
    owner: [{ name: "z-teapot", action: "failed", detail: "cwd is missing" }],
    news: [{ name: "z-kettle", action: "spawned", detail: "abcd1234 after 10 min" }],
  },
  { title: "no steps give two empty lists", told: [], owner: [], news: [] },
])("#pickStepsToTell sends $title", (row) => {
  expect(pickStepsToTell(row.told, new Set())).toStrictEqual({ owner: row.owner, news: row.news });
});

test.each<{ title: string; told: EnsureStep[]; owner: EnsureStep[]; news: EnsureStep[] }>([
  {
    title: "a restarting session's spawned step to neither list",
    told: [{ name: "z-kettle", action: "spawned", detail: "abcd1234 after 0 min (--now)" }],
    owner: [],
    news: [],
  },
  {
    title: "another session's spawned step to news beside a restarting one",
    told: [
      { name: "z-kettle", action: "spawned", detail: "abcd1234 after 0 min (--now)" },
      { name: "z-urn", action: "spawned", detail: "ef567890 after 10 min" },
    ],
    owner: [],
    news: [{ name: "z-urn", action: "spawned", detail: "ef567890 after 10 min" }],
  },
  {
    title: "a restarting session's failed step to the owner",
    told: [{ name: "z-kettle", action: "failed", detail: "cwd is missing" }],
    owner: [{ name: "z-kettle", action: "failed", detail: "cwd is missing" }],
    news: [],
  },
])("#pickStepsToTell sends $title while z-kettle restarts", (row) => {
  expect(pickStepsToTell(row.told, new Set(["z-kettle"]))).toStrictEqual({ owner: row.owner, news: row.news });
});
