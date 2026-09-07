import { describe, expect, it } from 'vitest';

import { detectHealthFunctionalFoodCategory } from './category-detector';
import { extractHealthFunctionalFoodClaimCandidates } from './claim-extractor';
import { createHealthFunctionalFoodRagComplianceAnalyzer } from '@/src/server/regulatory-runtime';
import { healthFunctionalFoodCompliancePack } from './health-functional-food-compliance-pack';
import type { ProductAuthorizationResolution } from '@/src/compliance/product-authorization/schemas';

describe('health functional food pack', () => {
  it('requires an explicit health-functional-food identity signal', () => {
    expect(
      detectHealthFunctionalFoodCategory({
        text: '건강기능식품 품목제조신고번호 20040020000123',
        detectedContentType: 'ADVERTISEMENT_TEXT',
      }),
    ).toMatchObject({
      category: 'HEALTH_FUNCTIONAL_FOOD',
      disposition: 'MATCH',
    });
    expect(
      detectHealthFunctionalFoodCategory({
        text: '매일 먹는 영양제',
        detectedContentType: 'ADVERTISEMENT_TEXT',
      }).disposition,
    ).toBe('UNCERTAIN');
  });

  it('extracts disease and functionality-scope claims', () => {
    const claims = extractHealthFunctionalFoodClaimCandidates(
      '건강기능식품으로 감기 예방과 면역력 강화에 도움을 드립니다.',
    );
    expect(claims.map((claim) => claim.claimType)).toEqual([
      'DISEASE_PREVENTION_TREATMENT',
      'FUNCTIONALITY_SCOPE_CLAIM',
    ]);
  });

  it('compares claims with the matched product functionality', async () => {
    const text = '건강기능식품으로 혈당 개선과 면역력 강화';
    const claims = healthFunctionalFoodCompliancePack.extractClaims({
      text,
      detectedContentType: 'ADVERTISEMENT_TEXT',
    });
    const result =
      await createHealthFunctionalFoodRagComplianceAnalyzer().analyze({
        text,
        claims,
        productAuthorization: verifiedAuthorization,
      });

    expect(result.issues.map((issue) => issue.category)).toEqual([
      'OUTSIDE_AUTHORIZED_FUNCTIONALITY',
      'AUTHORIZED_FUNCTIONALITY_OVERSTATEMENT',
    ]);
    expect(result.issues.every((issue) => issue.severity === 'HIGH')).toBe(
      true,
    );
    expect(
      result.issues.every(
        (issue) =>
          issue.citationStatus === 'VERIFIED' &&
          issue.sourceChunkIds.length > 0,
      ),
    ).toBe(true);
  });

  it('does not create an issue for cautious wording inside the matched scope', async () => {
    const text = '건강기능식품으로 면역기능에 도움을 줄 수 있습니다';
    const claims = healthFunctionalFoodCompliancePack.extractClaims({
      text,
      detectedContentType: 'ADVERTISEMENT_TEXT',
    });
    const result =
      await createHealthFunctionalFoodRagComplianceAnalyzer().analyze({
        text,
        claims,
        productAuthorization: verifiedAuthorization,
      });

    expect(result.issues).toEqual([]);
    expect(result.overallRisk).toBe('LOW');
  });
});

const verifiedAuthorization: ProductAuthorizationResolution = {
  status: 'VERIFIED',
  query: { reportNumber: '20040020000123' },
  selectedProduct: {
    licenseNumber: '1234',
    companyName: '테스트바이오',
    reportNumber: '20040020000123',
    productName: '테스트 면역 제품',
    authorizationDate: '20240101',
    productForm: '정제',
    intakeMethod: '1일 1회, 1회 1정',
    primaryFunctionality: '정상적인 면역기능에 도움을 줄 수 있음',
    intakePrecautions: '',
    productType: '건강기능식품',
    functionalIngredients: '아연',
    productionStatus: '생산',
    lastUpdatedAt: '20260101120000',
  },
  candidates: [],
  sourceName: '식품안전나라 건강기능식품 품목제조신고',
  sourceUrl:
    'https://www.foodsafetykorea.go.kr/api/openApiInfo.do?menu_grp=MENU_GRP31&menu_no=661&show_cnt=10&start_idx=1&svc_no=I0030',
  checkedAt: '2026-09-07T00:00:00.000Z',
  message: '제품을 연결했습니다.',
};
