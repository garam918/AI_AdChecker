import { ScanAnalysisResultSchema } from '../compliance/core/schemas';

/**
 * UI-facing analysis gateway. The UI depends on this stable function rather
 * than a concrete provider. Retrieval and citation validation run only on the
 * server route, keeping future provider keys and source internals out of UI.
 */
export async function analyzeContent(input: string) {
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: input }),
  });
  const output: unknown = await response.json();

  if (!response.ok) {
    const message =
      typeof output === 'object' &&
      output !== null &&
      'message' in output &&
      typeof output.message === 'string'
        ? output.message
        : '분석을 완료하지 못했습니다.';
    throw new Error(message);
  }

  return ScanAnalysisResultSchema.parse(output);
}
