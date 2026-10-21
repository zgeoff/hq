import { HttpResponse, http } from 'msw';
import { z } from 'zod';
import { LINEAR_GRAPHQL_URL } from './linear-handlers.ts';

// Linear's GraphQL API, answering each issues page query (one with a `filter`) with the next of the
// scripted answers, in order, and answering 500 past the last. Every other query falls through to
// linearHandlers.
export function buildStubLinearIssuePages(answers: unknown[]) {
  const queue = [...answers];
  return http.post(LINEAR_GRAPHQL_URL, (info) => answerIssuesPage(info.request, queue, answers.length));
}

const bodySchema = z.object({ variables: z.record(z.string(), z.unknown()) });

async function answerIssuesPage(request: Request, queue: unknown[], scripted: number): Promise<Response | undefined> {
  const sent: unknown = await request.clone().json();
  const body = bodySchema.parse(sent);
  if (!('filter' in body.variables)) {
    return;
  }
  if (queue.length === 0) {
    return HttpResponse.json({ errors: [{ message: `the issues page stub holds ${scripted} answers and was asked for one more` }] }, { status: 500 });
  }
  return HttpResponse.json({ data: queue.shift() });
}
