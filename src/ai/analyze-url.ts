import { requestAnalysis } from './analysis-stream';
import type { AnalysisProgress } from './providers/content-analysis-provider';
import { type AnalysisAudience } from '../compliance/core/schemas';
import type { ProductIdentity } from '../compliance/product-authorization/schemas';
import type { DetectedCategory } from '../content/web/schemas';

type RegulatedAnalysisCategory = Extract<
  DetectedCategory,
  'HEALTH_FUNCTIONAL_FOOD' | 'PHARMACEUTICAL' | 'MEDICAL_DEVICE' | 'COSMETIC'
>;

export async function analyzeUrl(
  input: {
    url?: string;
    fixtureId?: string;
    audience?: AnalysisAudience;
    categoryHint?: RegulatedAnalysisCategory;
    productIdentity?: ProductIdentity;
  },
  onProgress?: AnalysisProgress,
) {
  return requestAnalysis(
    '/api/analyze-url',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
    onProgress,
  );
}
