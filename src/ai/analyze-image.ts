import { requestAnalysis } from './analysis-stream';
import type { AnalysisProgress } from './providers/content-analysis-provider';
import type { analyzeContent } from './analyze-content';
import type { AnalysisAudience } from '@/src/compliance/core/schemas';

export function analyzeImage(
  image: File,
  audience: AnalysisAudience,
  options?: Parameters<typeof analyzeContent>[2],
  onProgress?: AnalysisProgress,
) {
  const body = new FormData();
  body.append('image', image);
  body.append('options', JSON.stringify({ audience, ...options }));
  return requestAnalysis(
    '/api/analyze-image',
    { method: 'POST', body },
    onProgress,
  );
}
