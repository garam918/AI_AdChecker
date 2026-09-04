import type { Claim, Issue } from '../../core/schemas';
import { GENERAL_ADVERTISING_DEMO_SOURCE } from './demo-data';

type DemoRule = {
  id: string;
  pattern: RegExp;
  claimType: Claim['claimType'];
  category: Issue['category'];
  explanation: string;
  requiredEvidence: string[];
  suggestedRewrites: string[];
};

/**
 * DEMO DATA ONLY.
 * These deterministic rules demonstrate the compliance-pack boundary and are
 * not a substitute for retrieval-backed regulation analysis.
 */
export const GENERAL_ADVERTISING_DEMO_RULES: DemoRule[] = [
  {
    id: 'objective-performance',
    pattern: /업무 시간을 70% 줄여주는/g,
    claimType: 'OBJECTIVE_PERFORMANCE',
    category: 'EVIDENCE_REQUIRED',
    explanation:
      '측정 가능한 성능 수치를 포함하고 있으므로 이를 뒷받침할 객관적인 근거가 필요한 표현입니다.',
    requiredEvidence: [
      '테스트 방법',
      '테스트 대상',
      '비교 기준',
      '측정 기간',
      '결과 데이터',
    ],
    suggestedRewrites: [
      '반복 업무를 줄여 업무 효율 개선을 지원하는',
      '자체 테스트 환경에서 업무시간 절감 효과를 확인한',
    ],
  },
  {
    id: 'superiority',
    pattern: /국내 최고의/g,
    claimType: 'SUPERIORITY',
    category: 'COMPARATIVE_CLAIM',
    explanation:
      '비교 우위를 주장하는 표현이므로 비교 대상과 평가 기준을 명확하게 입증할 필요가 있습니다.',
    requiredEvidence: ['비교 대상', '평가 기준', '조사 기관', '조사 시점'],
    suggestedRewrites: [
      '다양한 업무 자동화 기능을 제공하는',
      '팀의 반복 업무 자동화를 지원하는',
    ],
  },
];

export function runGeneralAdvertisingDemoRules(input: string, scanId: string) {
  const claims: Claim[] = [];
  const issues: Issue[] = [];

  for (const rule of GENERAL_ADVERTISING_DEMO_RULES) {
    for (const match of input.matchAll(rule.pattern)) {
      const startOffset = match.index;
      const originalText = match[0];
      const claimId = `${scanId}-claim-${claims.length + 1}`;

      claims.push({
        id: claimId,
        scanId,
        text: originalText,
        claimType: rule.claimType,
        startOffset,
        endOffset: startOffset + originalText.length,
      });

      issues.push({
        id: `${scanId}-issue-${issues.length + 1}`,
        scanId,
        claimId,
        severity: 'HIGH',
        category: rule.category,
        originalText,
        explanation: rule.explanation,
        regulationSourceIds: [GENERAL_ADVERTISING_DEMO_SOURCE.id],
        suggestedRewrites: rule.suggestedRewrites,
        requiredEvidence: rule.requiredEvidence,
      });
    }
  }

  return { claims, issues };
}
