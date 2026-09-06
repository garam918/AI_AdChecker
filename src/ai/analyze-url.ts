import { ScanAnalysisResultSchema } from '../compliance/core/schemas';

export async function analyzeUrl(input: { url?: string; fixtureId?: string }) {
  const response = await fetch('/api/analyze-url', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const output: unknown = await response.json();

  if (!response.ok) {
    const message =
      typeof output === 'object' &&
      output !== null &&
      'message' in output &&
      typeof output.message === 'string'
        ? output.message
        : '웹페이지 분석을 완료하지 못했습니다.';
    throw new Error(message);
  }

  return ScanAnalysisResultSchema.parse(output);
}
