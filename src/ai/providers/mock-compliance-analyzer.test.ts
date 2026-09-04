import { describe, expect, it } from 'vitest';

import { ScanAnalysisResultSchema } from '@/src/compliance/core/schemas';
import { SAFE_DEMO_REWRITE } from '@/src/compliance/packs/general-advertising/demo-data';
import { MockComplianceAnalyzer } from './mock-compliance-analyzer';

const DEMO_INPUT = '업무 시간을 70% 줄여주는 국내 최고의 AI 서비스';

describe('MockComplianceAnalyzer', () => {
  const analyzer = new MockComplianceAnalyzer();

  it('extracts two claims from the demo input', async () => {
    const result = await analyzer.analyze(DEMO_INPUT);

    expect(result.claims).toHaveLength(2);
  });

  it('creates a HIGH issue for an objective performance claim', async () => {
    const result = await analyzer.analyze(DEMO_INPUT);
    const issue = result.issues.find(
      (candidate) => candidate.category === 'EVIDENCE_REQUIRED',
    );

    expect(issue).toMatchObject({
      severity: 'HIGH',
      originalText: '업무 시간을 70% 줄여주는',
    });
  });

  it('creates an issue for a superiority claim', async () => {
    const result = await analyzer.analyze(DEMO_INPUT);
    const issue = result.issues.find(
      (candidate) => candidate.category === 'COMPARATIVE_CLAIM',
    );

    expect(issue).toMatchObject({
      severity: 'HIGH',
      originalText: '국내 최고의',
    });
  });

  it('returns LOW after the safe demo rewrite is applied', async () => {
    const result = await analyzer.analyze(SAFE_DEMO_REWRITE);

    expect(result.overallRisk).toBe('LOW');
    expect(result.issues).toHaveLength(0);
  });

  it('rejects malformed analysis output at the schema boundary', () => {
    const invalidResult = {
      detectedContentType: 'ADVERTISEMENT_TEXT',
      detectedCategory: 'GENERAL_ADVERTISING',
      overallRisk: 'HIGH',
      claims: [],
      issues: [
        {
          id: 'issue-without-source',
          scanId: 'scan-invalid',
          claimId: 'missing-claim',
          severity: 'HIGH',
          category: 'EVIDENCE_REQUIRED',
          originalText: '70% 개선',
          explanation: '근거 확인이 필요합니다.',
          regulationSourceIds: ['missing-source'],
          suggestedRewrites: ['효율 개선을 지원합니다.'],
          requiredEvidence: [],
        },
      ],
      sources: [],
    };

    expect(() => ScanAnalysisResultSchema.parse(invalidResult)).toThrow();
  });
});
