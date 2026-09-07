import type { Claim } from '@/src/compliance/core/schemas';

const CONTEXT: Record<string, string[]> = {
  AUTHORIZATION_SCOPE_CLAIM: ['품목허가 효능 효과', '허가 범위'],
  ABSOLUTE_SAFETY_OR_EFFECT_CLAIM: ['거짓 과장', '절대적 표현', '부작용 부정'],
  EXPERT_ENDORSEMENT_RISK: ['의료인 보증 추천'],
  BEFORE_AFTER_OR_TESTIMONIAL_RISK: ['체험담', '소비자 오인'],
};

export class PharmaceuticalRetrievalQueryBuilder {
  build(claim: Claim) {
    return [
      '의약품 광고 약사법 검토',
      '전문의약품 대중광고 광고 금지',
      `광고 표현: ${claim.text}`,
      `Claim 유형: ${claim.claimType}`,
      ...(CONTEXT[claim.claimType] ?? ['의약품 광고']),
    ].join(' ');
  }
}
