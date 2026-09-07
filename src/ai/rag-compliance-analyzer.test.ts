import evalCases from '@/evals/general-advertising/cases.json';
import { describe, expect, it } from 'vitest';

import { InMemoryRegulationRepository } from '@/src/compliance/regulatory/in-memory-regulation-repository';
import { LocalProcessedRegulationLoader } from '@/src/compliance/regulatory/local-processed-regulation-loader';
import { createRagComplianceAnalyzer } from '@/src/server/regulatory-runtime';
import { RagComplianceAnalyzer } from './rag-compliance-analyzer';
import type { ComplianceReasoningProvider } from './providers/compliance-reasoning-provider';

describe('RagComplianceAnalyzer', () => {
  it('runs the text-to-retrieval-to-validated-result pipeline end to end', async () => {
    const analyzer = createRagComplianceAnalyzer({ includeDebug: true });
    const result = await analyzer.analyze(
      '업무 시간을 70% 줄여주는 국내 최고의 AI 서비스',
    );

    expect(result.overallRisk).toBe('HIGH');
    expect(result.issues).toHaveLength(2);
    expect(
      result.issues.every(
        (issue) =>
          issue.citationStatus === 'VERIFIED' &&
          issue.sourceChunkIds.length > 0,
      ),
    ).toBe(true);
    expect(
      result.sources.every(
        (source) => !source.isDemoData && source.sourceUrl !== null,
      ),
    ).toBe(true);
    expect(result.debug?.retrieved.length).toBeGreaterThan(0);
  });

  it('downgrades a finding with no citation to REVIEW_REQUIRED', async () => {
    const noCitationProvider: ComplianceReasoningProvider = {
      async analyze(input) {
        return input.items.map(({ claim }) => ({
          claimId: claim.id,
          severity: 'HIGH',
          issueType: 'EVIDENCE_REQUIRED',
          explanation: '수치 주장이므로 근거 확인이 필요합니다.',
          sourceChunkIds: [],
          citationAssertions: [],
          requiredEvidence: ['시험 결과'],
          suggestedRewrites: ['업무 효율 개선을 지원합니다.'],
          resolutionType: 'PROVIDE_EVIDENCE',
        }));
      },
    };
    const analyzer = new RagComplianceAnalyzer({
      corpusLoader: new LocalProcessedRegulationLoader(),
      repository: new InMemoryRegulationRepository(),
      reasoningProvider: noCitationProvider,
      includeDebug: true,
    });

    const result = await analyzer.analyze('업무 시간을 70% 줄여드립니다');

    expect(result.overallRisk).toBe('REVIEW_REQUIRED');
    expect(result.issues[0]).toMatchObject({
      severity: 'REVIEW_REQUIRED',
      citationStatus: 'REVIEW_REQUIRED',
      sourceChunkIds: [],
    });
    expect(result.sources).toHaveLength(0);
  });

  it('links omitted free-use conditions to the current deceptive-advertising guidance', async () => {
    const analyzer = createRagComplianceAnalyzer();
    const result = await analyzer.analyze('무료로 사용할 수 있습니다');

    expect(result.issues[0]).toMatchObject({
      severity: 'MEDIUM',
      category: 'CONDITION_DISCLOSURE',
      citationStatus: 'VERIFIED',
    });
    expect(result.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: '기만적인 표시·광고 심사지침',
          section: 'Ⅴ. 세부심사지침',
          heading: '가격 또는 거래조건의 중요정보',
        }),
        expect.objectContaining({
          title: '표시·광고의 공정화에 관한 법률 시행령',
          article: '제3조',
          paragraph: '제2항',
        }),
      ]),
    );
  });

  it.each(evalCases)(
    'matches the deterministic expectation for $id',
    async (evaluationCase) => {
      const analyzer = createRagComplianceAnalyzer();
      const result = await analyzer.analyze(evaluationCase.input);

      if (evaluationCase.expectedClaimType === null) {
        expect(result.claims).toHaveLength(0);
        expect(result.overallRisk).toBe('LOW');
        return;
      }

      expect(result.claims[0]?.claimType).toBe(
        evaluationCase.expectedClaimType,
      );
      expect(result.issues[0]?.category).toBe(
        evaluationCase.expectedRiskFamily,
      );
      if (evaluationCase.citationRequired) {
        expect(result.issues[0]?.citationStatus).toBe('VERIFIED');
      }
    },
  );
});
