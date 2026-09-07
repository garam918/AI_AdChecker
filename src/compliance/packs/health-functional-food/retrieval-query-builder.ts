import type { Claim } from '@/src/compliance/core/schemas';

const CONTEXT: Record<string, string[]> = {
  DISEASE_PREVENTION_TREATMENT: ['질병 예방 치료', '의약품 오인'],
  FUNCTIONALITY_SCOPE_CLAIM: [
    '품목제조신고 주된 기능성',
    '기능성 범위',
    '거짓 과장',
  ],
  PHARMACEUTICAL_CONFUSION: ['의약품 오인', '질병 효능'],
  FALSE_EXAGGERATED_CLAIM: ['거짓 과장', '실증', '객관적 근거'],
};

export class HealthFunctionalFoodRetrievalQueryBuilder {
  build(claim: Claim) {
    return [
      '건강기능식품 표시 광고 검토',
      `광고 표현: ${claim.text}`,
      `Claim 유형: ${claim.claimType}`,
      ...(CONTEXT[claim.claimType] ?? ['부당한 표시 광고']),
    ].join(' ');
  }
}
