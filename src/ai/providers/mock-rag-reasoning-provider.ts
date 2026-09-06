import type { Claim } from '@/src/compliance/core/schemas';
import type { RegulationChunk } from '@/src/compliance/regulatory/schemas';

import {
  ComplianceFindingSchema,
  ComplianceReasoningInputSchema,
  type ComplianceFinding,
  type ComplianceReasoningProvider,
} from './compliance-reasoning-provider';

const SAFE_ANALYSIS_INSTRUCTIONS = [
  '제공된 규정 청크만 근거로 사용한다.',
  '출처, 법령명 또는 조항 번호를 새로 만들지 않는다.',
  '근거가 불충분하면 REVIEW_REQUIRED를 반환한다.',
  '합법 또는 위법을 단정하지 않고 잠재적 위험만 설명한다.',
];

export class MockRagReasoningProvider implements ComplianceReasoningProvider {
  async analyze(input: Parameters<ComplianceReasoningProvider['analyze']>[0]) {
    const parsed = ComplianceReasoningInputSchema.parse(input);

    if (
      SAFE_ANALYSIS_INSTRUCTIONS.some(
        (instruction) => !parsed.instructions.includes(instruction),
      )
    ) {
      throw new Error('필수 출처 제한 분석 지침이 누락되었습니다.');
    }

    return parsed.items.map(({ claim, retrievedChunks }) =>
      ComplianceFindingSchema.parse(
        createFinding(claim, selectRelevantChunks(claim, retrievedChunks)),
      ),
    );
  }
}

export { SAFE_ANALYSIS_INSTRUCTIONS };

function createFinding(
  claim: Claim,
  chunks: RegulationChunk[],
): ComplianceFinding {
  const sourceChunkIds = chunks.map((chunk) => chunk.id);
  const citationAssertions = chunks.map((chunk) => ({
    chunkId: chunk.id,
    article: chunk.article,
  }));
  const hasSources = chunks.length > 0;

  if (
    ['OBJECTIVE_PERFORMANCE', 'NUMERICAL', 'GUARANTEE', 'TESTIMONIAL'].includes(
      claim.claimType,
    )
  ) {
    const findingContent = createEvidenceFindingContent(claim);

    return {
      claimId: claim.id,
      severity:
        hasSources && claim.claimType === 'TESTIMONIAL'
          ? 'MEDIUM'
          : hasSources
            ? 'HIGH'
            : 'REVIEW_REQUIRED',
      issueType: 'EVIDENCE_REQUIRED',
      ...findingContent,
      sourceChunkIds,
      citationAssertions,
      ...(!hasSources && {
        uncertaintyReason: '검증 가능한 관련 규정 청크를 찾지 못했습니다.',
      }),
    };
  }

  if (claim.claimType === 'SUPERIORITY' || claim.claimType === 'COMPARATIVE') {
    return {
      claimId: claim.id,
      severity: hasSources ? 'HIGH' : 'REVIEW_REQUIRED',
      issueType: 'COMPARATIVE_CLAIM',
      explanation:
        '비교 우위 표현은 비교 대상과 기준이 명확해야 하며, 적정한 방법으로 확인된 사실에 근거하는지 추가 검토가 필요합니다.',
      sourceChunkIds,
      citationAssertions,
      requiredEvidence: [
        '비교 대상',
        '평가 기준',
        '시험·조사 방법',
        '조사 기관',
        '조사 시점',
      ],
      suggestedRewrites: [
        '다양한 업무 자동화 기능을 제공합니다.',
        '검증된 비교 대상과 기준, 조사 시점을 문구와 함께 명시합니다.',
      ],
      ...(!hasSources && {
        uncertaintyReason: '검증 가능한 관련 규정 청크를 찾지 못했습니다.',
      }),
    };
  }

  if (claim.claimType === 'PRICE_CONDITION' || claim.claimType === 'FREE') {
    return {
      claimId: claim.id,
      severity: hasSources ? 'MEDIUM' : 'REVIEW_REQUIRED',
      issueType: 'CONDITION_DISCLOSURE',
      explanation:
        '무료 표현의 적용 범위나 기간, 유료 전환 조건이 생략되면 소비자가 실제 이용 조건을 다르게 이해할 수 있어 조건 확인이 필요합니다.',
      sourceChunkIds,
      citationAssertions,
      requiredEvidence: ['무료 적용 범위', '무료 제공 기간', '유료 전환 조건'],
      suggestedRewrites: [
        '기본 기능은 무료로 제공되며, 유료 기능과 이용 조건은 요금표에서 확인할 수 있습니다.',
        '무료 제공 범위와 기간을 문구에 함께 명시합니다.',
      ],
      uncertaintyReason:
        '입력 문구만으로 무료 제공의 세부 조건을 확인할 수 없습니다.',
    };
  }

  if (claim.claimType === 'GENERAL_MARKETING') {
    return {
      claimId: claim.id,
      severity: hasSources ? 'MEDIUM' : 'REVIEW_REQUIRED',
      issueType: 'EVIDENCE_REQUIRED',
      explanation:
        '업무 자동화나 효율 개선 같은 효익 표현은 실제 제공 기능과 적용 범위에 따라 소비자가 기대하는 효과가 달라질 수 있어 추가 확인이 필요합니다.',
      sourceChunkIds,
      citationAssertions,
      requiredEvidence: [
        '제공 기능 범위',
        '적용 가능한 업무 유형',
        '효과가 달라지는 조건',
      ],
      suggestedRewrites: [
        '지원되는 반복 업무 유형을 선택해 자동화할 수 있습니다.',
        '제공 기능과 적용 범위를 문구와 함께 구체적으로 안내합니다.',
      ],
      ...(!hasSources && {
        uncertaintyReason: '검증 가능한 관련 규정 청크를 찾지 못했습니다.',
      }),
    };
  }

  return {
    claimId: claim.id,
    severity: 'REVIEW_REQUIRED',
    issueType: 'EVIDENCE_REQUIRED',
    explanation:
      '현재 활성화된 일반 광고 규칙만으로는 이 표현의 맥락을 충분히 판단하기 어렵습니다.',
    sourceChunkIds,
    citationAssertions,
    requiredEvidence: ['표현의 적용 범위와 객관적 근거'],
    suggestedRewrites: ['검증 가능한 범위와 조건을 구체적으로 명시합니다.'],
    uncertaintyReason: '지원되는 claim 유형으로 분류되지 않았습니다.',
  };
}

function createEvidenceFindingContent(claim: Claim) {
  if (claim.claimType === 'NUMERICAL') {
    return {
      explanation:
        '이용 기업 수처럼 검증 가능한 수치는 집계 기준과 기준 시점에 따라 의미가 달라질 수 있어, 표현과 직접 연결되는 객관적 집계 자료를 확인해야 합니다.',
      requiredEvidence: [
        '집계 대상과 포함 기준',
        '중복 제거 기준',
        '집계 기준 시점',
        '원본 집계 자료',
      ],
      suggestedRewrites: [
        '2026년 8월 기준, 중복 계정을 제외한 누적 도입 기업 수는 10,000곳입니다.',
        '확인 가능한 집계 기준과 기준 시점을 수치와 함께 명시합니다.',
      ],
    };
  }

  if (claim.claimType === 'TESTIMONIAL') {
    return {
      explanation:
        '고객 후기의 구체적인 성과 표현은 모든 이용자에게 동일한 결과가 보장되는 것으로 오인되지 않도록 실제 후기 여부와 적용 조건을 확인해야 합니다.',
      requiredEvidence: [
        '실제 후기 원문과 작성자 동의',
        '성과 측정 기준과 기간',
        '대표성 및 예외 조건',
      ],
      suggestedRewrites: [
        '개별 고객의 사용 경험이며, 결과는 업무 환경과 이용 방식에 따라 달라질 수 있습니다.',
        '후기에서 확인된 범위와 측정 조건을 문구에 함께 명시합니다.',
      ],
    };
  }

  if (claim.claimType === 'GUARANTEE') {
    return {
      explanation:
        '결과를 보장하는 표현은 적용 대상과 예외 조건이 불명확하면 실제 제공 범위를 오인하게 할 수 있어 객관적 근거와 제한 조건 확인이 필요합니다.',
      requiredEvidence: [
        '보장 적용 대상',
        '보장 조건과 제외 조건',
        '보장 결과를 뒷받침하는 객관적 자료',
      ],
      suggestedRewrites: [
        '적용 대상과 이용 조건에 따라 기대할 수 있는 효과가 달라질 수 있습니다.',
        '보장 범위와 예외 조건을 본문에 명확하게 표시합니다.',
      ],
    };
  }

  return {
    explanation:
      '측정 가능한 성능 수치는 사실 관련 주장으로 해석될 수 있어, 표현과 직접 관련된 객관적 자료와 적절한 시험·조사 방법을 함께 확인해야 합니다.',
    requiredEvidence: [
      '테스트 방법',
      '테스트 대상과 표본',
      '비교 기준',
      '측정 기간',
      '원본 결과 데이터',
    ],
    suggestedRewrites: [
      '반복 업무를 줄여 업무 효율 개선을 지원합니다.',
      '자체 테스트 환경과 측정 조건을 명시한 뒤 확인된 결과를 안내합니다.',
    ],
  };
}

function selectRelevantChunks(claim: Claim, chunks: RegulationChunk[]) {
  const preferredTopics = [
    'OBJECTIVE_PERFORMANCE',
    'NUMERICAL',
    'GUARANTEE',
    'TESTIMONIAL',
  ].includes(claim.claimType)
    ? ['실증', '실증 방법', '실증자료']
    : claim.claimType === 'PRICE_CONDITION' || claim.claimType === 'FREE'
      ? ['기만', '소비자 오인']
      : claim.claimType === 'GENERAL_MARKETING'
        ? ['기만', '소비자 오인', '사실 관련 사항']
        : ['비교 광고', '비교 대상', '비교 기준'];

  const preferred = chunks.filter((chunk) =>
    chunk.metadata.topics.some((topic) => preferredTopics.includes(topic)),
  );

  return (preferred.length > 0 ? preferred : chunks).slice(0, 3);
}
