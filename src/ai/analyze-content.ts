import { requestAnalysis } from './analysis-stream';
import type { AnalysisProgress } from './providers/content-analysis-provider';
import { type AnalysisAudience } from '../compliance/core/schemas';
import type { ProductIdentity } from '../compliance/product-authorization/schemas';
import type { DetectedCategory } from '../content/web/schemas';

type RegulatedAnalysisCategory = Extract<
  DetectedCategory,
  'HEALTH_FUNCTIONAL_FOOD' | 'PHARMACEUTICAL' | 'MEDICAL_DEVICE' | 'COSMETIC'
>;

/**
 * UI-facing analysis gateway. The UI depends on this stable function rather
 * than a concrete provider. Retrieval and citation validation run only on the
 * server route, keeping future provider keys and source internals out of UI.
 */
export async function analyzeContent(
  input: string,
  audience: AnalysisAudience = 'CONSUMER',
  options?: {
    categoryHint?: RegulatedAnalysisCategory;
    productIdentity?: ProductIdentity;
  },
  onProgress?: AnalysisProgress,
  signal?: AbortSignal,
) {
  return requestAnalysis(
    '/api/analyze',
    {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: input, audience, ...options }),
    },
    onProgress,
  );
}
