import type { Claim } from '../core/schemas';

const CLAIM_CONTEXT: Record<Claim['claimType'], string[]> = {
  OBJECTIVE_PERFORMANCE: [
    '사실 관련 사항',
    '수치 주장',
    '실증',
    '객관적 자료',
    '시험 조사',
  ],
  SUPERIORITY: [
    '우월성 주장',
    '비교 광고',
    '비교 대상',
    '비교 기준',
    '객관적 실증',
  ],
  COMPARATIVE: [
    '비교 광고',
    '경쟁사 비교',
    '비교 대상',
    '비교 기준',
    '시험 조사',
  ],
  PRICE_CONDITION: [
    '기만 광고',
    '소비자 오인',
    '이용 조건',
    '제한 사항',
    '무료 표시',
  ],
  NUMERICAL: [
    '사실 관련 사항',
    '수치 주장',
    '실증',
    '객관적 자료',
    '사회적 증거',
  ],
  GUARANTEE: [
    '사실 관련 사항',
    '보장 표현',
    '실증',
    '객관적 자료',
    '소비자 오인',
  ],
  FREE: ['기만 광고', '소비자 오인', '이용 조건', '제한 사항', '무료 표시'],
  TESTIMONIAL: [
    '사실 관련 사항',
    '추천 후기',
    '수치 주장',
    '실증',
    '객관적 자료',
  ],
  GENERAL_MARKETING: ['광고 표현', '소비자 오인', '사실 관련 사항'],
  UNKNOWN: ['광고 표현', '판단 불충분', '추가 검토'],
};

export class RegulatoryQueryBuilder {
  build(claim: Claim) {
    return [
      '일반 광고 표시광고법 검토',
      `광고 주장: ${claim.text}`,
      `주장 유형: ${claim.claimType}`,
      ...CLAIM_CONTEXT[claim.claimType],
    ].join(' ');
  }
}
