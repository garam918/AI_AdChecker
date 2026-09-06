import type { Claim } from '@/src/compliance/core/schemas';

const CLAIM_CONTEXT: Record<string, string[]> = {
  DISEASE_PREVENTION_TREATMENT: [
    '질병 예방 치료 효능 인식 우려',
    '일반식품',
    '소비자 오인',
  ],
  HEALTH_FUNCTIONAL_FOOD_CONFUSION: [
    '건강기능식품 오인',
    '일반식품 기능성',
    '소비자 오인',
  ],
  PHARMACEUTICAL_CONFUSION: ['의약품 오인', '효능 효과', '일반식품'],
  FALSE_EXAGGERATED_CLAIM: ['거짓 과장', '실증자료', '객관적 근거'],
  CONSUMER_EXPERIENCE_GENERALIZATION: [
    '체험기 후기',
    '일반적 효능 오인',
    '소비자 기만',
  ],
  BEFORE_AFTER_RISK: ['전후 사진', '효능 과장', '소비자 오인'],
  EXPERT_ENDORSEMENT_RISK: ['전문가 추천', '의약품 오인', '소비자 오인'],
};

export class GeneralFoodRetrievalQueryBuilder {
  build(claim: Claim) {
    return [
      '일반식품 표시 광고 검토',
      `광고 표현: ${claim.text}`,
      `식품 Claim 유형: ${claim.claimType}`,
      ...(CLAIM_CONTEXT[claim.claimType] ?? [
        '부당한 표시 광고',
        '소비자 오인',
      ]),
    ].join(' ');
  }
}
