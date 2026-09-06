import type {
  Claim,
  ResolutionType,
  Severity,
} from '@/src/compliance/core/schemas';
import type { RegulationChunk } from '@/src/compliance/regulatory/schemas';
import {
  ComplianceFindingSchema,
  ComplianceReasoningInputSchema,
  type ComplianceFinding,
  type ComplianceReasoningProvider,
} from '@/src/ai/providers/compliance-reasoning-provider';

import { GENERAL_FOOD_ANALYSIS_INSTRUCTIONS } from './general-food-compliance-pack';

export class GeneralFoodReasoningProvider implements ComplianceReasoningProvider {
  async analyze(input: Parameters<ComplianceReasoningProvider['analyze']>[0]) {
    const parsed = ComplianceReasoningInputSchema.parse(input);
    if (
      GENERAL_FOOD_ANALYSIS_INSTRUCTIONS.some(
        (instruction) => !parsed.instructions.includes(instruction),
      )
    ) {
      throw new Error('General Food 필수 분석 지침이 누락되었습니다.');
    }

    return parsed.items.map(({ claim, retrievedChunks }) =>
      ComplianceFindingSchema.parse(
        createFoodFinding(claim, selectFoodChunks(claim, retrievedChunks)),
      ),
    );
  }
}

function createFoodFinding(
  claim: Claim,
  chunks: RegulationChunk[],
): ComplianceFinding {
  const sourceChunkIds = chunks.map((chunk) => chunk.id);
  const citationAssertions = chunks.map((chunk) => ({
    chunkId: chunk.id,
    article: chunk.article,
  }));
  const hasSources = sourceChunkIds.length > 0;
  const content = FOOD_FINDING_CONTENT[claim.claimType] ?? fallbackContent;
  const severity = hasSources ? content.severity : 'REVIEW_REQUIRED';

  return {
    claimId: claim.id,
    severity,
    issueType: claim.claimType,
    explanation: content.explanation,
    sourceChunkIds,
    citationAssertions,
    requiredEvidence: content.requiredEvidence,
    suggestedRewrites: createFoodRewrites(claim, content.suggestedRewrites),
    resolutionType: content.resolutionType,
    ...(!hasSources && {
      uncertaintyReason:
        '검증 가능한 General Food 규정 청크를 찾지 못했습니다.',
    }),
  };
}

type FoodFindingContent = {
  severity: Severity;
  explanation: string;
  requiredEvidence: string[];
  suggestedRewrites: string[];
  resolutionType: ResolutionType;
};

const FOOD_FINDING_CONTENT: Record<string, FoodFindingContent> = {
  DISEASE_PREVENTION_TREATMENT: {
    severity: 'HIGH',
    explanation:
      '일반식품이 질병의 예방 또는 치료에 효능이 있는 것으로 받아들여질 수 있는 표현이므로, 제품의 맛·원료·섭취 방식 중심으로 수정하는 것이 권장됩니다.',
    requiredEvidence: [],
    suggestedRewrites: [
      '제품의 실제 맛과 섭취 방법을 중심으로 소개합니다.',
      '질병의 예방·치료를 기대하게 하는 표현을 제거합니다.',
    ],
    resolutionType: 'REMOVE_OR_REWRITE',
  },
  HEALTH_FUNCTIONAL_FOOD_CONFUSION: {
    severity: 'HIGH',
    explanation:
      '일반식품에 특정 건강기능을 직접 기대하게 해 소비자가 건강기능식품과 유사한 기능성이 있는 것으로 인식할 가능성이 있습니다.',
    requiredEvidence: [],
    suggestedRewrites: [
      '제품의 실제 원료, 맛과 섭취 방식을 중심으로 표현합니다.',
      '입증되지 않은 신체 기능 개선 표현을 제거합니다.',
    ],
    resolutionType: 'REMOVE_OR_REWRITE',
  },
  PHARMACEUTICAL_CONFUSION: {
    severity: 'HIGH',
    explanation:
      '일반식품이 의약품과 유사한 효능이나 작용을 가진 것으로 오인될 가능성이 있어 의약품을 연상시키는 표현의 제거가 권장됩니다.',
    requiredEvidence: [],
    suggestedRewrites: [
      '의약품의 효능이나 작용을 연상시키는 표현을 제거합니다.',
      '확인된 제품 특성과 섭취 방법만 안내합니다.',
    ],
    resolutionType: 'REMOVE_OR_REWRITE',
  },
  FALSE_EXAGGERATED_CLAIM: {
    severity: 'HIGH',
    explanation:
      '효과를 절대적이거나 즉각적인 것으로 단정하는 표현은 실제 제품 특성과 다르게 받아들여질 수 있어 객관적 근거와 표현 범위를 확인해야 합니다.',
    requiredEvidence: ['표현과 직접 관련된 시험·조사 결과', '적용 대상과 조건'],
    suggestedRewrites: [
      '절대적·즉각적 효과를 단정하는 표현을 제거합니다.',
      '확인된 제품 정보의 범위 안에서 구체적으로 안내합니다.',
    ],
    resolutionType: 'PROVIDE_EVIDENCE',
  },
  CONSUMER_EXPERIENCE_GENERALIZATION: {
    severity: 'MEDIUM',
    explanation:
      '개인의 체험 결과가 제품의 일반적인 효능처럼 받아들여질 수 있어, 후기의 광고 활용 맥락과 대표성을 추가로 확인해야 합니다.',
    requiredEvidence: [],
    suggestedRewrites: [
      '개인의 신체 변화 체험을 제품의 일반적인 효과처럼 제시하지 않습니다.',
      '제품의 실제 맛과 이용 경험을 중심으로 후기를 구성합니다.',
    ],
    resolutionType: 'REMOVE_OR_REWRITE',
  },
  BEFORE_AFTER_RISK: {
    severity: 'REVIEW_REQUIRED',
    explanation:
      '전후 비교 맥락이 감지됐지만 이미지 분석이 없어 변화의 표현 방식과 대표성을 확인할 수 없습니다.',
    requiredEvidence: [],
    suggestedRewrites: [
      '전후 비교 대신 확인된 제품 정보와 섭취 방법을 안내합니다.',
    ],
    resolutionType: 'HUMAN_REVIEW',
  },
  EXPERT_ENDORSEMENT_RISK: {
    severity: 'REVIEW_REQUIRED',
    explanation:
      '전문가 권위가 제품 효능의 보증처럼 사용됐는지 확인이 필요하며, 현재 텍스트만으로 추천의 전체 맥락을 판단하기 어렵습니다.',
    requiredEvidence: ['추천 발언의 전체 맥락', '광고 참여 및 이해관계 정보'],
    suggestedRewrites: [
      '전문가의 권위를 효능 보증처럼 사용하는 표현을 제거합니다.',
    ],
    resolutionType: 'HUMAN_REVIEW',
  },
};

const fallbackContent: FoodFindingContent = {
  severity: 'REVIEW_REQUIRED',
  explanation:
    '현재 General Food 규칙만으로 표현의 위험 유형을 충분히 판단하기 어렵습니다.',
  requiredEvidence: [],
  suggestedRewrites: ['확인된 제품 정보만 구체적으로 안내합니다.'],
  resolutionType: 'HUMAN_REVIEW',
};

function createFoodRewrites(claim: Claim, defaults: string[]) {
  if (/차|티|한\s*잔/.test(claim.contextText ?? claim.text)) {
    return [
      '매일 편하게 즐기는 차.',
      '제품의 실제 원료와 맛, 섭취 방법을 중심으로 소개합니다.',
    ];
  }
  return defaults;
}

function selectFoodChunks(claim: Claim, chunks: RegulationChunk[]) {
  const preferredTopics: Record<string, string[]> = {
    DISEASE_PREVENTION_TREATMENT: ['질병 예방 치료', '질병 효능'],
    HEALTH_FUNCTIONAL_FOOD_CONFUSION: ['건강기능식품 오인', '신체 기능'],
    PHARMACEUTICAL_CONFUSION: ['의약품 오인', '의약품 효능'],
    FALSE_EXAGGERATED_CLAIM: ['거짓 과장', '실증'],
    CONSUMER_EXPERIENCE_GENERALIZATION: ['체험기', '소비자 기만'],
    BEFORE_AFTER_RISK: ['거짓 과장', '소비자 오인'],
    EXPERT_ENDORSEMENT_RISK: ['의약품 오인', '소비자 오인'],
  };
  const topics = preferredTopics[claim.claimType] ?? ['부당 광고'];
  const preferred = chunks.filter((chunk) =>
    chunk.metadata.topics.some((topic) => topics.includes(topic)),
  );
  return (preferred.length > 0 ? preferred : chunks).slice(0, 3);
}
