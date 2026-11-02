import type { Out } from '../commands.ts';
import { HqError } from '../errors.ts';
import { parseLowerRepo } from '../noslop/parse-lower-repo.ts';
import { runNoslopCheck } from '../noslop/run-noslop-check.ts';
import type { NoslopCheckOutcome } from '../noslop/run-noslop-check.ts';
import { readAcceptedRiskRecords } from './find-accepted-risks.ts';
import type { AcceptedRiskRecord } from './find-accepted-risks.ts';
import type { PRRef } from './parse-pr-ref.ts';
import { ReplyFailureError, postAcceptRiskReply } from './post-accept-risk-reply.ts';
import type { PostedReply } from './post-accept-risk-reply.ts';
import { readPRHead } from './read-pr-head.ts';
import { recordPRAcceptedRisk } from './record-pr-accepted-risk.ts';
import { requireOwnerSource } from './require-owner-source.ts';
import type { PRCommandInput } from './run-pr-command.ts';

const USAGE = 'usage: hq pr accept-risk <repo> <pr> <finding-id> --source S --note T';
const FINDING_ID = /^[0-9a-f]{16}$/u;

interface Accepting {
  input: PRCommandInput;
  ref: PRRef;
  record: AcceptedRiskRecord;
  alreadyRecorded: boolean;
}

export async function runAcceptRisk(input: PRCommandInput, ref: PRRef, finding: string | undefined): Promise<Out> {
  if (finding === undefined || finding.trim() === '') {
    throw new HqError('bad_args', USAGE);
  }
  if (!FINDING_ID.test(finding)) {
    throw new HqError('bad_args', `finding id "${finding}" must be noslop's 16 lowercase hex characters, as its comment shows them`);
  }
  const head = await readPRHead(input.run, ref.slug, ref.pr);
  const source = await requireOwnerSource(input, {
    ref,
    wanted: { action: 'accept-risk', finding },
    head,
  });
  const note = input.flags.note?.trim() ?? '';
  if (note === '') {
    throw new HqError('bad_args', '--note is required: why the owner accepts this risk');
  }
  if (/[\r\n]/u.test(note)) {
    throw new HqError('bad_args', '--note must be one line: noslop reads the first line of the reply as the disposition');
  }
  const actor = await input.actor();

  // One immediate transaction reads and writes, so two runs at once leave one record.
  const kept = input.db
    .transaction(() => {
      const standing = readAcceptedRiskRecords(input.db, ref.repo, ref.pr).find((record) => record.finding === finding);
      return standing === undefined ? { record: { event: recordPRAcceptedRisk(input.db, { repo: ref.repo, pr: ref.pr, finding, source, note, actor }), finding, source, note }, alreadyRecorded: false } : { record: standing, alreadyRecorded: true };
    })
    .immediate();
  const accepting: Accepting = { input, ref, ...kept };
  const reply = await postReply(accepting);
  const check = await setCheck(accepting, reply);
  rejectOwnOpenFinding(accepting, reply, check);
  return buildOut(accepting, reply, check);
}

async function postReply(accepting: Accepting): Promise<PostedReply> {
  try {
    return await postAcceptRiskReply(accepting.input.run, accepting.ref, accepting.record);
  } catch (error) {
    if (error instanceof ReplyFailureError) {
      throw new HqError('reply_failed', `${error.message}. The record stands (hq event ${accepting.record.event}), but the merge gate stays shut until both the reply and noslop's check exist. Rerun hq pr accept-risk to post it and set noslop's check; to post it by hand instead, put this reply in ${error.where}, then rerun:\n\n${error.text}`, { acceptedRisk: { ...describeRun(accepting), reply: 'not-posted', replyText: error.text } });
    }
    throw error;
  }
}

function describeRun(accepting: Accepting): Record<string, unknown> {
  const record = accepting.record;
  return { repo: accepting.ref.repo, pr: accepting.ref.pr, finding: record.finding, source: record.source, note: record.note, alreadyRecorded: accepting.alreadyRecorded, event: record.event };
}

async function setCheck(accepting: Accepting, reply: PostedReply): Promise<NoslopCheckOutcome> {
  try {
    return await runNoslopCheck(
      {
        run: accepting.input.run,
        db: accepting.input.db,
        rawRepo: accepting.ref.slug,
        pr: accepting.ref.pr,
      },
      parseLowerRepo(accepting.ref.slug, undefined),
    );
  } catch (error) {
    if (error instanceof HqError) {
      const posted = reply.reply === 'posted' ? 'posted' : 'already posted';
      throw new HqError(
        'check_failed',
        `The reply is ${posted} (${reply.url}), but noslop's check was not set: ${error.message}. The record stands (hq event ${accepting.record.event}), and the merge gate stays shut until noslop's check is set. Rerun hq pr accept-risk: it posts nothing again and sets the check.`,
        {
          acceptedRisk: {
            ...describeRun(accepting),
            reply: reply.reply,
            replyURL: reply.url,
            replyText: reply.text,
          },
        },
      );
    }
    throw error;
  }
}

// A check that still lists the accepted finding as open means noslop did not take the reply (for
// example the author lacks admin permission, or noslop has not read the reply yet).
function rejectOwnOpenFinding(accepting: Accepting, reply: PostedReply, check: NoslopCheckOutcome): void {
  const own = check.open.find((finding) => finding.id === accepting.record.finding);
  if (check.conclusion === 'success' || own === undefined) {
    return;
  }
  const posted = reply.reply === 'posted' ? 'posted' : 'already posted';
  throw new HqError('check_failed', `The reply is ${posted} (${reply.url}), but noslop's check still lists finding ${own.id} as open: ${own.reason}. The record stands (hq event ${accepting.record.event}), and the merge gate stays shut until noslop reads the reply as accepted-risk. Rerun hq pr accept-risk once the cause is fixed.`, { acceptedRisk: { ...describeRun(accepting), reply: reply.reply, replyURL: reply.url, check } });
}

function buildOut(accepting: Accepting, reply: PostedReply, check: NoslopCheckOutcome): Out {
  const record = accepting.record;
  const where = `${accepting.ref.repo}#${accepting.ref.pr}`;
  const lead = accepting.alreadyRecorded
    ? `The owner's acceptance of the risk of finding ${record.finding} for ${where} already stood as hq event ${record.event} (${record.source}): ${record.note}`
    : `Recorded the owner's acceptance of the risk of finding ${record.finding} for ${where} as hq event ${record.event} (${record.source}): ${record.note}`;
  const posted = `Reply: ${reply.reply === 'posted' ? 'posted' : 'already posted'} at ${reply.url}`;
  return {
    data: {
      acceptedRisk: { ...describeRun(accepting), reply: reply.reply, replyURL: reply.url, check },
    },
    text: [lead, posted, formatCheck(check)].join('\n'),
  };
}

function formatCheck(check: NoslopCheckOutcome): string {
  if (check.conclusion === 'success') {
    return `noslop check: pass (${check.title})`;
  }
  const others = check.open.length > 0 ? `open findings: ${check.open.map((finding) => finding.id).join(', ')}` : 'no open finding named';
  return `noslop check: still failing (${check.title}); first problem: ${check.problem ?? 'none named'}; ${others}. Other findings or checks are open, so the merge gate may stay shut until they clear; this is not an error of accept-risk.`;
}
