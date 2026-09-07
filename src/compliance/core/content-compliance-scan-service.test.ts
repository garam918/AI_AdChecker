import { describe, expect, it } from 'vitest';

import { contentComplianceScanService } from '@/src/server/regulatory-runtime';
import type { Issue } from './schemas';
import { deduplicateIssues } from './content-compliance-scan-service';

describe('ContentComplianceScanService', () => {
  it('runs text food input through claims, food retrieval and citations', async () => {
    const result = await contentComplianceScanService.analyze(
      '매일 한 잔으로 혈당 관리와 면역력 개선',
    );

    expect(result.detectedCategory).toBe('GENERAL_FOOD');
    expect(result.overallRisk).toBe('HIGH');
    expect(result.activePacks).toEqual(['GENERAL_ADVERTISING', 'GENERAL_FOOD']);
    expect(result.issues.map((issue) => issue.originalText)).toEqual([
      '혈당 관리',
      '면역력 개선',
    ]);
    expect(
      result.issues.every(
        (issue) =>
          issue.packId === 'GENERAL_FOOD' &&
          issue.citationStatus === 'VERIFIED' &&
          issue.sourceChunkIds.length > 0,
      ),
    ).toBe(true);
  });

  it('routes claims to different packs and merges the report', async () => {
    const result = await contentComplianceScanService.analyze(
      '국내 1위 혈당 개선 차',
    );

    expect(result.issues.map((issue) => issue.category)).toEqual(
      expect.arrayContaining([
        'COMPARATIVE_CLAIM',
        'HEALTH_FUNCTIONAL_FOOD_CONFUSION',
      ]),
    );
    expect(new Set(result.issues.map((issue) => issue.packId))).toEqual(
      new Set(['GENERAL_ADVERTISING', 'GENERAL_FOOD']),
    );
  });

  it('returns a low-risk result for descriptive food copy', async () => {
    const result = await contentComplianceScanService.analyze(
      '구수하게 즐기는 무가당 보리차',
    );

    expect(result.detectedCategory).toBe('GENERAL_FOOD');
    expect(result.overallRisk).toBe('LOW');
    expect(result.issues).toEqual([]);
  });

  it('routes explicit health functional food input and never invents authorization', async () => {
    const result = await contentComplianceScanService.analyzeContent({
      text: '건강기능식품으로 감기 예방과 면역력 강화',
      detectedContentType: 'ADVERTISEMENT_TEXT',
      categoryHint: 'HEALTH_FUNCTIONAL_FOOD',
      productIdentity: { productName: '건강기능식품 데모 제품' },
    });

    expect(result.detectedCategory).toBe('HEALTH_FUNCTIONAL_FOOD');
    expect(result.activePacks).toEqual(
      expect.arrayContaining(['GENERAL_ADVERTISING', 'HEALTH_FUNCTIONAL_FOOD']),
    );
    expect(result.productAuthorization?.status).toBe('UNAVAILABLE');
    expect(result.productAuthorization?.selectedProduct).toBeNull();
    expect(result.issues.map((issue) => issue.category)).toEqual(
      expect.arrayContaining([
        'DISEASE_PREVENTION_TREATMENT',
        'PRODUCT_AUTHORIZATION_NOT_VERIFIED',
      ]),
    );
    expect(result.notices.map((notice) => notice.code)).toEqual(
      expect.arrayContaining([
        'PRODUCT_AUTHORIZATION_UNAVAILABLE',
        'PRIOR_REVIEW_REQUIRED',
      ]),
    );
  });

  it('deduplicates only the same issue type, expression and source set', () => {
    const base = createIssue();
    const duplicate: Issue = {
      ...base,
      id: 'issue-2',
      severity: 'HIGH',
      suggestedRewrites: ['다른 수정안'],
    };
    const distinctType: Issue = {
      ...base,
      id: 'issue-3',
      category: 'HEALTH_FUNCTIONAL_FOOD_CONFUSION',
    };

    const result = deduplicateIssues([base, duplicate, distinctType]);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      severity: 'HIGH',
      suggestedRewrites: ['수정안', '다른 수정안'],
    });
  });
});

function createIssue(): Issue {
  return {
    id: 'issue-1',
    scanId: 'scan-1',
    claimId: 'claim-1',
    packId: 'GENERAL_FOOD',
    severity: 'MEDIUM',
    category: 'DISEASE_PREVENTION_TREATMENT',
    originalText: '감기 예방',
    explanation: '잠재적 위험 설명',
    regulationSourceIds: ['chunk-1'],
    sourceChunkIds: ['chunk-1'],
    citationStatus: 'VERIFIED',
    uncertaintyReason: null,
    suggestedRewrites: ['수정안'],
    requiredEvidence: [],
    resolutionType: 'REMOVE_OR_REWRITE',
    similarEnforcementCaseIds: [],
  };
}
