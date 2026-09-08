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
});
