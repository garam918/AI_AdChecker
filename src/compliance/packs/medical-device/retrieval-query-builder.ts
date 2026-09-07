import type { Claim } from '@/src/compliance/core/schemas';

const CONTEXT: Record<string, string[]> = {
  AUTHORIZATION_SCOPE_CLAIM: ['품목허가 사용목적 성능', '허가 범위'],
  ABSOLUTE_SAFETY_OR_EFFECT_CLAIM: [
    '거짓 과대광고',
    '절대적 표현',
    '부작용 부정',
  ],
  EXPERT_ENDORSEMENT_RISK: ['의료인 보증 추천'],
  BEFORE_AFTER_OR_TESTIMONIAL_RISK: ['체험담', '전후 비교'],
};

export class MedicalDeviceRetrievalQueryBuilder {
  build(claim: Claim) {
    return [
      '의료기기 광고 의료기기법 검토',
      `광고 표현: ${claim.text}`,
      `Claim 유형: ${claim.claimType}`,
      ...(CONTEXT[claim.claimType] ?? ['의료기기 광고']),
    ].join(' ');
  }
}
