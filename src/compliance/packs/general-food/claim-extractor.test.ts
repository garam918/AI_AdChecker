import { describe, expect, it } from 'vitest';

import { extractGeneralFoodClaimCandidates } from './claim-extractor';

describe('extractGeneralFoodClaimCandidates', () => {
  it('extracts separate health-function candidates from one sentence', () => {
    const claims = extractGeneralFoodClaimCandidates(
      '매일 한 잔으로 혈당 관리와 면역력 개선',
    );

    expect(claims.map((claim) => claim.text)).toEqual([
      '혈당 관리',
      '면역력 개선',
    ]);
    expect(
      claims.every(
        (claim) =>
          claim.claimType === 'HEALTH_FUNCTIONAL_FOOD_CONFUSION' &&
          claim.contextRole === 'ADVERTISING',
      ),
    ).toBe(true);
  });

  it.each([
    ['감기 예방에 좋은 차', 'DISEASE_PREVENTION_TREATMENT'],
    [
      '일반식품인 이 음료는 당뇨병을 치료합니다',
      'DISEASE_PREVENTION_TREATMENT',
    ],
    ['약처럼 빠른 효과의 분말', 'PHARMACEUTICAL_CONFUSION'],
    ['100% 체지방 감소 효과', 'FALSE_EXAGGERATED_CLAIM'],
    [
      '이 차를 마시고 몸이 훨씬 좋아졌어요',
      'CONSUMER_EXPERIENCE_GENERALIZATION',
    ],
    ['섭취 전후 사진', 'BEFORE_AFTER_RISK'],
    ['의사가 추천한 차', 'EXPERT_ENDORSEMENT_RISK'],
  ])('maps %s to %s', (text, expectedType) => {
    expect(extractGeneralFoodClaimCandidates(text)[0]?.claimType).toBe(
      expectedType,
    );
  });

  it.each([
    '당뇨 환자는 섭취 전 전문가와 상담하세요.',
    '당뇨병을 치료하는 환자는 섭취 전 전문가와 상담하세요.',
    '영양정보: 당류 0g',
    '의사가 추천하지 않았습니다.',
    '전후 사진을 사용하지 않습니다.',
  ])('does not promote contextual non-claims: %s', (text) => {
    expect(extractGeneralFoodClaimCandidates(text)).toEqual([]);
  });

  it('keeps an advertising claim even when a separate warning follows', () => {
    const claims = extractGeneralFoodClaimCandidates(
      '혈당을 낮춰주는 보리차. 당뇨 환자는 섭취 전 상담하세요.',
    );
    expect(claims.map((claim) => claim.text)).toEqual(['혈당을 낮춰주는']);
  });

  it.each([
    '혈당 관리 효과는 없지만 면역력 개선에 도움을 줍니다.',
    '영양정보: 당류 0g, 면역력 개선에 도움을 주는 차입니다.',
    '면역력 개선에 도움을 주는 차, 당뇨 환자는 섭취 전 상담하세요.',
  ])(
    'does not erase a positive claim with nearby non-claim context: %s',
    (text) => {
      const claim = extractGeneralFoodClaimCandidates(text).find(
        (candidate) => candidate.text === '면역력 개선',
      );
      expect(claim?.contextRole).toBe('ADVERTISING');
    },
  );

  it('excludes a coordinated functional-food disclaimer', () => {
    expect(
      extractGeneralFoodClaimCandidates(
        '일반식품입니다. 혈당 조절이나 면역력 개선 기능을 인정받은 건강기능식품이 아닙니다.',
      ),
    ).toEqual([]);
  });
  it('handles disease disclaimers without suppressing a separate positive effect', () => {
    expect(
      extractGeneralFoodClaimCandidates(
        '일반식품 보리차이며 감기 예방이나 질병 치료 효과를 광고하지 않습니다.',
      ),
    ).toEqual([]);
    expect(
      extractGeneralFoodClaimCandidates(
        '일반식품이며 질병 치료 효과를 광고하지 않지만 감기 예방에 좋은 차입니다.',
      ).map((claim) => claim.text),
    ).toContain('감기 예방에 좋은');
  });
  it('separates packaging-only comparisons from health before/after claims', () => {
    expect(
      extractGeneralFoodClaimCandidates(
        '변경 전후 사진은 포장 디자인만 비교합니다.',
      ),
    ).toEqual([]);
    expect(
      extractGeneralFoodClaimCandidates(
        '섭취 전후 사진은 체중 변화를 비교합니다.',
      ),
    ).toHaveLength(1);
  });
});
