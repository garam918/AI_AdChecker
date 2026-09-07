import { describe, expect, it } from 'vitest';

import { contentComplianceScanService } from '@/src/server/regulatory-runtime';
import {
  createCosmeticRagComplianceAnalyzer,
  createMedicalDeviceRagComplianceAnalyzer,
  createPharmaceuticalRagComplianceAnalyzer,
} from '@/src/server/regulatory-runtime';
import { detectCosmeticCategory } from '@/src/compliance/packs/cosmetic/category-detector';
import { detectMedicalDeviceCategory } from '@/src/compliance/packs/medical-device/category-detector';
import { detectPharmaceuticalCategory } from '@/src/compliance/packs/pharmaceutical/category-detector';
import { extractRegulatedProductClaimCandidates } from './claim-extractor';
import type { ProductAuthorizationResolution } from '@/src/compliance/product-authorization/schemas';

describe('regulated product compliance packs', () => {
  it('detects and analyzes pharmaceutical authorization and safety claims', async () => {
    const text = '일반의약품입니다. 두통을 완치하고 부작용이 전혀 없습니다.';
    expect(
      detectPharmaceuticalCategory({
        text,
        detectedContentType: 'ADVERTISEMENT_TEXT',
      }).disposition,
    ).toBe('MATCH');
    expect(
      extractRegulatedProductClaimCandidates(text, 'PHARMACEUTICAL').map(
        (claim) => claim.claimType,
      ),
    ).toEqual(
      expect.arrayContaining([
        'AUTHORIZATION_SCOPE_CLAIM',
        'ABSOLUTE_SAFETY_OR_EFFECT_CLAIM',
      ]),
    );

    const result = await contentComplianceScanService.analyzeContent({
      text,
      detectedContentType: 'ADVERTISEMENT_TEXT',
      categoryHint: 'PHARMACEUTICAL',
      productIdentity: { productName: '테스트정' },
    });

    expect(result.detectedCategory).toBe('PHARMACEUTICAL');
    expect(result.activePacks).toEqual(
      expect.arrayContaining(['GENERAL_ADVERTISING', 'PHARMACEUTICAL']),
    );
    expect(result.productAuthorization?.status).toBe('UNAVAILABLE');
    expect(result.issues.map((issue) => issue.category)).toEqual(
      expect.arrayContaining([
        'PRODUCT_AUTHORIZATION_NOT_VERIFIED',
        'ABSOLUTE_SAFETY_OR_EFFECT_CLAIM',
      ]),
    );
    expectVerifiedPackSources(result, 'PHARMACEUTICAL');
    expect(result.notices.map((notice) => notice.code)).toContain(
      'PRIOR_REVIEW_REQUIRED',
    );
  });

  it('detects and analyzes medical device performance and endorsement claims', async () => {
    const text = '의료기기 제품으로 통증을 완치합니다. 의사가 추천합니다.';
    expect(
      detectMedicalDeviceCategory({
        text,
        detectedContentType: 'ADVERTISEMENT_TEXT',
      }).disposition,
    ).toBe('MATCH');

    const result = await contentComplianceScanService.analyzeContent({
      text,
      detectedContentType: 'ADVERTISEMENT_TEXT',
      categoryHint: 'MEDICAL_DEVICE',
      productIdentity: { productName: '테스트 의료기기' },
    });

    expect(result.detectedCategory).toBe('MEDICAL_DEVICE');
    expect(result.issues.map((issue) => issue.category)).toEqual(
      expect.arrayContaining([
        'PRODUCT_AUTHORIZATION_NOT_VERIFIED',
        'EXPERT_ENDORSEMENT_RISK',
      ]),
    );
    expectVerifiedPackSources(result, 'MEDICAL_DEVICE');
    expect(result.notices.map((notice) => notice.code)).toContain(
      'PRIOR_REVIEW_REQUIRED',
    );
  });

  it('detects cosmetics and treats medicinal and objective claims separately', async () => {
    const text =
      '기능성 화장품으로 여드름을 치료하고 피부 재생 효과를 제공합니다.';
    expect(
      detectCosmeticCategory({
        text,
        detectedContentType: 'ADVERTISEMENT_TEXT',
      }).disposition,
    ).toBe('MATCH');

    const result = await contentComplianceScanService.analyzeContent({
      text,
      detectedContentType: 'ADVERTISEMENT_TEXT',
      categoryHint: 'COSMETIC',
      productIdentity: { productName: '테스트 세럼' },
    });

    expect(result.detectedCategory).toBe('COSMETIC');
    expect(result.issues.map((issue) => issue.category)).toEqual(
      expect.arrayContaining([
        'PHARMACEUTICAL_MISRECOGNITION',
        'OBJECTIVE_EFFECT_CLAIM',
      ]),
    );
    expectVerifiedPackSources(result, 'COSMETIC');
    expect(result.notices.map((notice) => notice.code)).not.toContain(
      'PRIOR_REVIEW_REQUIRED',
    );
  });

  it('blocks public-facing prescription drug promotion after product verification', async () => {
    const text = '두통을 완화합니다.';
    const result = await createPharmaceuticalRagComplianceAnalyzer().analyze({
      text,
      claims: extractRegulatedProductClaimCandidates(text, 'PHARMACEUTICAL'),
      productAuthorization: authorization('PHARMACEUTICAL', {
        productType: '전문의약품',
        primaryFunctionality: '두통의 완화',
      }),
    });

    expect(result.issues[0]).toMatchObject({
      category: 'PRESCRIPTION_DRUG_PUBLIC_ADVERTISING',
      severity: 'HIGH',
      citationStatus: 'VERIFIED',
    });
  });

  it('passes a medical device claim that stays within verified intended use', async () => {
    const text = '통증을 완화합니다.';
    const result = await createMedicalDeviceRagComplianceAnalyzer().analyze({
      text,
      claims: extractRegulatedProductClaimCandidates(text, 'MEDICAL_DEVICE'),
      productAuthorization: authorization('MEDICAL_DEVICE', {
        primaryFunctionality: '근육통 및 관절통의 완화에 사용',
      }),
    });

    expect(result.issues).toEqual([]);
    expect(result.overallRisk).toBe('LOW');
  });

  it('flags a cosmetic function outside the verified review scope', async () => {
    const text = '주름을 개선합니다.';
    const result = await createCosmeticRagComplianceAnalyzer().analyze({
      text,
      claims: extractRegulatedProductClaimCandidates(text, 'COSMETIC'),
      productAuthorization: authorization('COSMETIC', {
        primaryFunctionality: '피부의 미백에 도움',
      }),
    });

    expect(result.issues[0]).toMatchObject({
      category: 'OUTSIDE_AUTHORIZED_SCOPE',
      severity: 'HIGH',
      citationStatus: 'VERIFIED',
    });
  });
});

function expectVerifiedPackSources(
  result: Awaited<
    ReturnType<typeof contentComplianceScanService.analyzeContent>
  >,
  packId: 'PHARMACEUTICAL' | 'MEDICAL_DEVICE' | 'COSMETIC',
) {
  const packIssues = result.issues.filter((issue) => issue.packId === packId);
  expect(packIssues.length).toBeGreaterThan(0);
  expect(
    packIssues.every(
      (issue) =>
        issue.citationStatus === 'VERIFIED' &&
        issue.regulationSourceIds.length > 0,
    ),
  ).toBe(true);
}

function authorization(
  category: 'PHARMACEUTICAL' | 'MEDICAL_DEVICE' | 'COSMETIC',
  overrides: Partial<
    NonNullable<ProductAuthorizationResolution['selectedProduct']>
  >,
): ProductAuthorizationResolution {
  const product = {
    category,
    authorizationType: '테스트 허가',
    licenseNumber: '',
    companyName: '테스트 업체',
    reportNumber: 'TEST-001',
    productName: '테스트 제품',
    authorizationDate: '20200101',
    productForm: '',
    intakeMethod: '',
    primaryFunctionality: '',
    intakePrecautions: '',
    productType: '',
    functionalIngredients: '',
    productionStatus: '',
    lastUpdatedAt: '',
    ...overrides,
  };
  return {
    status: 'VERIFIED',
    query: { productName: product.productName },
    selectedProduct: product,
    candidates: [product],
    sourceName: '식약처 테스트 품목정보',
    sourceUrl: 'https://data.mfds.go.kr/',
    checkedAt: '2026-09-07T00:00:00.000Z',
    message: '공식 품목정보와 연결했습니다.',
  };
}
