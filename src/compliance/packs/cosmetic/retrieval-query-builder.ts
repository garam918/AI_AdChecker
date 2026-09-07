import type { Claim } from '@/src/compliance/core/schemas';

const CONTEXT: Record<string, string[]> = {
  PHARMACEUTICAL_MISRECOGNITION: ['의약품 오인', '질병 치료'],
  AUTHORIZATION_SCOPE_CLAIM: ['기능성화장품 심사 보고 범위'],
  OBJECTIVE_EFFECT_CLAIM: ['표시 광고 실증', '객관적 근거'],
  ABSOLUTE_SAFETY_OR_EFFECT_CLAIM: ['거짓 과장', '소비자 오인'],
  EXPERT_ENDORSEMENT_RISK: ['전문가 보증', '소비자 오인'],
  BEFORE_AFTER_OR_TESTIMONIAL_RISK: ['전후 비교', '체험담', '실증'],
};

export class CosmeticRetrievalQueryBuilder {
  build(claim: Claim) {
    return [
      '화장품 표시 광고 화장품법 검토',
      `광고 표현: ${claim.text}`,
      `Claim 유형: ${claim.claimType}`,
      ...(CONTEXT[claim.claimType] ?? ['화장품 광고']),
    ].join(' ');
  }
}
