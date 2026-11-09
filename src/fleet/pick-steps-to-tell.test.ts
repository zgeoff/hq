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
  expect(pickStepsToTell(row.told)).toStrictEqual({ owner: row.owner, news: row.news });
});
