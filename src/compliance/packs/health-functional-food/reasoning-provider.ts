import {
  ComplianceFindingSchema,
  ComplianceReasoningInputSchema,
  type ComplianceFinding,
  type ComplianceReasoningProvider,
} from '@/src/ai/providers/compliance-reasoning-provider';
import type { Claim } from '@/src/compliance/core/schemas';
import type { ProductAuthorizationResolution } from '@/src/compliance/product-authorization/schemas';
import type { RegulationChunk } from '@/src/compliance/regulatory/schemas';

import { HEALTH_FUNCTIONAL_FOOD_ANALYSIS_INSTRUCTIONS } from './health-functional-food-compliance-pack';

const FUNCTION_DOMAINS: Array<{ key: string; pattern: RegExp }> = [
  { key: '면역', pattern: /면역/ },
  { key: '혈당', pattern: /혈당/ },
  { key: '체지방', pattern: /체지방|체중/ },
  { key: '혈행', pattern: /혈행|혈액\s*흐름/ },
  { key: '콜레스테롤', pattern: /콜레스테롤/ },
  { key: '관절·연골', pattern: /관절|연골/ },
  { key: '눈', pattern: /눈|시력/ },
  { key: '간', pattern: /간\s*건강|간\s*기능/ },
  { key: '장', pattern: /장\s*건강|배변/ },
  { key: '기억력', pattern: /기억력|인지/ },
  { key: '피로', pattern: /피로/ },
  { key: '피부', pattern: /피부/ },
  { key: '뼈', pattern: /뼈|골다공/ },
  { key: '항산화', pattern: /항산화/ },
];

export class HealthFunctionalFoodReasoningProvider implements ComplianceReasoningProvider {
  async analyze(input: Parameters<ComplianceReasoningProvider['analyze']>[0]) {
    const parsed = ComplianceReasoningInputSchema.parse(input);
    if (
      HEALTH_FUNCTIONAL_FOOD_ANALYSIS_INSTRUCTIONS.some(
        (instruction) => !parsed.instructions.includes(instruction),
      )
    ) {
      throw new Error(
        'Health Functional Food 필수 분석 지침이 누락되었습니다.',
      );
    }

    return parsed.items.map(({ claim, retrievedChunks }) =>
      ComplianceFindingSchema.parse(
        createFinding(
          claim,
          selectChunks(claim, retrievedChunks),
          parsed.productAuthorization,
        ),
      ),
    );
  }
}

function createFinding(
  claim: Claim,
  chunks: RegulationChunk[],
  authorization?: ProductAuthorizationResolution,
): ComplianceFinding {
  const sourceChunkIds = chunks.map((chunk) => chunk.id);
  const citationAssertions = chunks.map((chunk) => ({
    chunkId: chunk.id,
    article: chunk.article,
  }));
  const cited = sourceChunkIds.length > 0;
  const common = { sourceChunkIds, citationAssertions };

  if (claim.claimType === 'DISEASE_PREVENTION_TREATMENT') {
    return {
      ...common,
      claimId: claim.id,
      disposition: 'ISSUE',
      severity: cited ? 'HIGH' : 'REVIEW_REQUIRED',
      issueType: claim.claimType,
      explanation:
        '건강기능식품도 의약품이 아니므로 질병의 예방·치료 효능으로 인식될 수 있는 표현은 높은 검토 위험이 있습니다.',
      requiredEvidence: [],
      suggestedRewrites: [
        authorizedFunctionalityRewrite(authorization),
        '질병명과 예방·치료·완치 표현을 제거하고 신고된 기능성 범위만 안내합니다.',
      ],
      resolutionType: 'REMOVE_OR_REWRITE',
      ...(!cited && noSource()),
    };
  }

  if (claim.claimType === 'PHARMACEUTICAL_CONFUSION') {
    return {
      ...common,
      claimId: claim.id,
      disposition: 'ISSUE',
      severity: cited ? 'HIGH' : 'REVIEW_REQUIRED',
      issueType: claim.claimType,
      explanation:
        '제품이 의약품과 같은 약리작용이나 치료효과를 가진 것으로 받아들여질 수 있는 표현입니다.',
      requiredEvidence: [],
      suggestedRewrites: [
        authorizedFunctionalityRewrite(authorization),
        '의약품·치료제를 연상시키는 표현을 제거합니다.',
      ],
      resolutionType: 'REMOVE_OR_REWRITE',
      ...(!cited && noSource()),
    };
  }

  if (claim.claimType === 'FALSE_EXAGGERATED_CLAIM') {
    return {
      ...common,
      claimId: claim.id,
      disposition: 'ISSUE',
      severity: cited ? 'HIGH' : 'REVIEW_REQUIRED',
      issueType: claim.claimType,
      explanation:
        '효과를 절대적·즉각적으로 단정하는 표현은 신고된 기능성 및 실증 범위를 넘어 소비자를 오인하게 할 가능성이 있습니다.',
      requiredEvidence: [
        '식품안전나라 품목제조신고 정보',
        '표현과 직접 관련된 시험·조사 결과',
        '자율심의 결과와 심의받은 광고 원문',
      ],
      suggestedRewrites: [
        authorizedFunctionalityRewrite(authorization),
        '절대적·즉각적 효과를 단정하는 표현을 제거합니다.',
      ],
      resolutionType: 'REMOVE_OR_REWRITE',
      ...(!cited && noSource()),
    };
  }

  return functionalityFinding(claim, common, cited, authorization);
}

function functionalityFinding(
  claim: Claim,
  common: Pick<ComplianceFinding, 'sourceChunkIds' | 'citationAssertions'>,
  cited: boolean,
  authorization?: ProductAuthorizationResolution,
): ComplianceFinding {
  if (authorization?.status !== 'VERIFIED' || !authorization.selectedProduct) {
    return {
      ...common,
      claimId: claim.id,
      disposition: 'ISSUE',
      severity: 'REVIEW_REQUIRED',
      issueType: 'PRODUCT_AUTHORIZATION_NOT_VERIFIED',
      explanation:
        '기능성 광고 표현을 확인했지만 제품의 공식 품목제조신고 정보를 확정하지 못해 허용 범위와 대조할 수 없습니다.',
      requiredEvidence: [
        '정확한 제품명 또는 품목제조번호',
        '식품안전나라 품목제조신고의 주된 기능성',
        '자율심의 결과와 심의받은 광고 원문',
      ],
      suggestedRewrites: [
        '제품을 확정한 뒤 식품안전나라의 주된 기능성 문구 범위로 수정합니다.',
      ],
      resolutionType: 'VERIFY_PRODUCT_CLASSIFICATION',
      uncertaintyReason:
        authorization?.message ?? '허가정보 조회 결과가 없습니다.',
    };
  }

  const official = authorization.selectedProduct.primaryFunctionality;
  const claimedDomains = detectDomains(claim.text);
  const officialDomains = detectDomains(official);
  const outsideDomains = claimedDomains.filter(
    (domain) => !officialDomains.includes(domain),
  );
  if (outsideDomains.length > 0 || officialDomains.length === 0) {
    return {
      ...common,
      claimId: claim.id,
      disposition: 'ISSUE',
      severity: cited ? 'HIGH' : 'REVIEW_REQUIRED',
      issueType: 'OUTSIDE_AUTHORIZED_FUNCTIONALITY',
      explanation:
        officialDomains.length === 0
          ? '공식 품목제조신고의 주된 기능성을 구조적으로 대조하기 어려워 추가 확인이 필요합니다.'
          : `광고의 ${outsideDomains.join('·')} 기능 표현이 이 제품의 신고된 주된 기능성 범위에서 확인되지 않습니다.`,
      requiredEvidence: [
        '식품안전나라 품목제조신고의 주된 기능성',
        '자율심의 결과와 심의받은 광고 원문',
      ],
      suggestedRewrites: [authorizedFunctionalityRewrite(authorization)],
      resolutionType: 'REMOVE_OR_REWRITE',
      ...(!cited && noSource()),
    };
  }

  const cautious = /도움을\s*줄\s*수\s*있/.test(claim.text);
  if (!cautious) {
    return {
      ...common,
      claimId: claim.id,
      disposition: 'ISSUE',
      severity: cited ? 'HIGH' : 'REVIEW_REQUIRED',
      issueType: 'AUTHORIZED_FUNCTIONALITY_OVERSTATEMENT',
      explanation:
        '기능의 방향은 신고 내용과 관련되지만, 광고가 “도움을 줄 수 있음”보다 강한 개선·강화·감소 효과를 단정하고 있습니다.',
      requiredEvidence: [
        '식품안전나라 품목제조신고의 주된 기능성',
        '자율심의 결과와 심의받은 광고 원문',
      ],
      suggestedRewrites: [authorizedFunctionalityRewrite(authorization)],
      resolutionType: 'REMOVE_OR_REWRITE',
      ...(!cited && noSource()),
    };
  }

  return {
    ...common,
    claimId: claim.id,
    disposition: 'PASS',
    severity: 'LOW',
    issueType: 'AUTHORIZED_FUNCTIONALITY_MATCH',
    explanation:
      '광고의 기능성 방향과 표현 강도가 조회된 품목제조신고의 주된 기능성 범위와 일치합니다.',
    requiredEvidence: [],
    suggestedRewrites: [authorizedFunctionalityRewrite(authorization)],
    resolutionType: 'HUMAN_REVIEW',
  };
}

function authorizedFunctionalityRewrite(
  authorization?: ProductAuthorizationResolution,
) {
  const functionality = authorization?.selectedProduct?.primaryFunctionality;
  return functionality
    ? `식품안전나라에 신고된 기능성 범위로 표현합니다: ${functionality}`
    : '제품 허가정보를 확인한 뒤 신고된 주된 기능성 범위로 표현합니다.';
}

function detectDomains(text: string) {
  return FUNCTION_DOMAINS.filter(({ pattern }) => pattern.test(text)).map(
    ({ key }) => key,
  );
}

function noSource() {
  return {
    uncertaintyReason:
      '검증 가능한 Health Functional Food 규정 청크를 찾지 못했습니다.',
  };
}

function selectChunks(claim: Claim, chunks: RegulationChunk[]) {
  const preferredTopics: Record<string, string[]> = {
    DISEASE_PREVENTION_TREATMENT: ['질병 예방 치료', '의약품 오인'],
    FUNCTIONALITY_SCOPE_CLAIM: ['기능성 범위', '거짓 과장', '품목제조신고'],
    PHARMACEUTICAL_CONFUSION: ['의약품 오인', '질병 효능'],
    FALSE_EXAGGERATED_CLAIM: ['거짓 과장', '실증'],
  };
  const topics = preferredTopics[claim.claimType] ?? ['부당 광고'];
  const preferred = chunks.filter((chunk) =>
    chunk.metadata.topics.some((topic) => topics.includes(topic)),
  );
  return (preferred.length > 0 ? preferred : chunks).slice(0, 3);
}
