import type { ComplianceAnalyzer } from '@/src/compliance/core/compliance-analyzer';
import {
  ScanAnalysisResultSchema,
  type ScanAnalysisResult,
} from '@/src/compliance/core/schemas';
import { GENERAL_ADVERTISING_DEMO_SOURCE } from '@/src/compliance/packs/general-advertising/demo-data';
import { runGeneralAdvertisingDemoRules } from '@/src/compliance/packs/general-advertising/demo-rules';

export class MockComplianceAnalyzer implements ComplianceAnalyzer {
  async analyze(input: string): Promise<ScanAnalysisResult> {
    const normalizedInput = input.trim();

    if (!normalizedInput) {
      throw new Error('분석할 광고 문구를 입력해 주세요.');
    }

    const scanId = `scan-${createStableId(normalizedInput)}`;
    const { claims, issues } = runGeneralAdvertisingDemoRules(
      normalizedInput,
      scanId,
    );

    return ScanAnalysisResultSchema.parse({
      detectedContentType: 'ADVERTISEMENT_TEXT',
      detectedCategory: 'GENERAL_ADVERTISING',
      overallRisk: issues.length > 0 ? 'HIGH' : 'LOW',
      claims,
      issues,
      sources: issues.length > 0 ? [GENERAL_ADVERTISING_DEMO_SOURCE] : [],
    });
  }
}

function createStableId(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}
