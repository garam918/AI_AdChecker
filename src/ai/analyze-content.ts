import { MockComplianceAnalyzer } from './providers/mock-compliance-analyzer';
import { ScanAnalysisResultSchema } from '../compliance/core/schemas';

const analyzer = new MockComplianceAnalyzer();

/**
 * UI-facing analysis gateway. The UI depends on this stable function rather
 * than a concrete provider, so a retrieval-backed analyzer can replace the
 * mock without changing components.
 */
export async function analyzeContent(input: string) {
  const output = await analyzer.analyze(input);
  return ScanAnalysisResultSchema.parse(output);
}
