import type { Database } from "bun:sqlite";
import { parseLowerRepo } from "../noslop/parse-lower-repo.ts";
import { readNoslopFindings } from "../noslop/read-noslop-findings.ts";
import type { NoslopFinding } from "../noslop/read-noslop-findings.ts";
import type { Runner } from "../runner/types.ts";
import { readAcceptedRiskRecords } from "./find-accepted-risks.ts";
import type { AcceptedRiskRecord } from "./find-accepted-risks.ts";
import type { PRRef } from "./parse-pr-ref.ts";
import type { AcceptedRiskView } from "./types.ts";

// The PR's accepted risks with the state noslop gives each finding. noslop is read only when the PR
// holds a record, and a failed read never fails the caller: each risk then shows no state and why.
export async function readAcceptedRiskViews(
  run: Runner,
  db: Database,
  ref: PRRef,
): Promise<AcceptedRiskView[]> {
  const records = readAcceptedRiskRecords(db, ref.repo, ref.pr);
  if (records.length === 0) {
    return [];
  }
  const read = await readFindings(run, db, ref);
  return records.map((record) => buildView(record, read));
}

async function readFindings(
  run: Runner,
  db: Database,
  ref: PRRef,
): Promise<NoslopFinding[] | string> {
  try {
    return await readNoslopFindings(
      { run, db, rawRepo: ref.slug, pr: ref.pr },
      parseLowerRepo(ref.slug, undefined),
    );
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function buildView(record: AcceptedRiskRecord, read: NoslopFinding[] | string): AcceptedRiskView {
  if (typeof read === "string") {
    return {
      finding: record.finding,
      source: record.source,
      note: record.note,
      event: record.event,
      noslopState: null,
      noslopError: read,
    };
  }
  return {
    finding: record.finding,
    source: record.source,
    note: record.note,
    event: record.event,
    noslopState: read.find((listed) => listed.id === record.finding)?.state ?? "not listed",
  };
}
