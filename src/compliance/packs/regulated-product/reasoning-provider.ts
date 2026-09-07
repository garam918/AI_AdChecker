import {
  ComplianceFindingSchema,
  ComplianceReasoningInputSchema,
  type ComplianceFinding,
  type ComplianceReasoningProvider,
} from '@/src/ai/providers/compliance-reasoning-provider';
import type { Claim, Severity } from '@/src/compliance/core/schemas';
import type { ProductAuthorizationResolution } from '@/src/compliance/product-authorization/schemas';
import type { RegulationChunk } from '@/src/compliance/regulatory/schemas';
import type { DetectedCategory } from '@/src/content/web/schemas';

type RegulatedCategory = Extract<
  DetectedCategory,
  'PHARMACEUTICAL' | 'MEDICAL_DEVICE' | 'COSMETIC'
>;

const CATEGORY_LABEL: Record<RegulatedCategory, string> = {
  PHARMACEUTICAL: '의약품',
  MEDICAL_DEVICE: '의료기기',
  COSMETIC: '화장품',
};

const AUTHORIZATION_LABEL: Record<RegulatedCategory, string> = {
  PHARMACEUTICAL: '품목허가·신고된 효능·효과 및 용법·용량',
  MEDICAL_DEVICE: '허가·인증·신고된 사용목적 및 성능',
  COSMETIC: '기능성화장품 심사·보고 범위',
};

const DOMAIN_PATTERNS: Record<
  RegulatedCategory,
  Array<{ key: string; pattern: RegExp }>
> = {
  PHARMACEUTICAL: [
    { key: '감기', pattern: /감기/ },
    { key: '두통·통증', pattern: /두통|치통|통증|진통/ },
    { key: '발열', pattern: /발열|해열/ },
    { key: '염증', pattern: /염증|소염/ },
    { key: '알레르기', pattern: /알레르기/ },
    { key: '소화불량', pattern: /소화불량|소화/ },
    { key: '혈압', pattern: /혈압|고혈압/ },
    { key: '혈당', pattern: /혈당|당뇨/ },
    { key: '수면', pattern: /수면|불면/ },
  ],
  MEDICAL_DEVICE: [
    { key: '통증', pattern: /통증|근육통|관절통/ },
    { key: '혈압', pattern: /혈압/ },
    { key: '혈당', pattern: /혈당/ },
    { key: '상처', pattern: /상처|창상/ },
    { key: '체지방', pattern: /체지방|비만/ },
    { key: '디스크', pattern: /디스크|추간판/ },
    { key: '교정', pattern: /교정/ },
  ],
  COSMETIC: [
    { key: '미백', pattern: /미백/ },
    { key: '주름', pattern: /주름/ },
    { key: '자외선', pattern: /자외선|선케어/ },
    { key: '탈모 증상 완화', pattern: /탈모/ },
    { key: '여드름성 피부 완화', pattern: /여드름성\s*피부/ },
    { key: '튼살', pattern: /튼살/ },
    { key: '피부 장벽', pattern: /피부\s*장벽/ },
  ],
};

export class RegulatedProductReasoningProvider implements ComplianceReasoningProvider {
  constructor(
    private readonly category: RegulatedCategory,
    private readonly requiredInstructions: readonly string[],
  ) {}

  async analyze(input: Parameters<ComplianceReasoningProvider['analyze']>[0]) {
    const parsed = ComplianceReasoningInputSchema.parse(input);
    if (
      this.requiredInstructions.some(
        (instruction) => !parsed.instructions.includes(instruction),
      )
    ) {
      throw new Error(
        `${CATEGORY_LABEL[this.category]} 필수 분석 지침이 누락되었습니다.`,
      );
    }

    return parsed.items.map(({ claim, retrievedChunks }) =>
      ComplianceFindingSchema.parse(
        createFinding(
          this.category,
          claim,
          selectChunks(claim, retrievedChunks, this.category),
          parsed.productAuthorization,
        ),
      ),
    );
  }
}

function createFinding(
  category: RegulatedCategory,
  claim: Claim,
  chunks: RegulationChunk[],
  authorization?: ProductAuthorizationResolution,
): ComplianceFinding {
  const professionalDrug =
    category === 'PHARMACEUTICAL' &&
    authorization?.status === 'VERIFIED' &&
    /전문/.test(authorization.selectedProduct?.productType ?? '');
  const selectedChunks = professionalDrug
    ? preferTopics(chunks, ['전문의약품 대중광고', '광고 금지']).slice(0, 3)
    : chunks;
  const common = citationFields(selectedChunks);
  const cited = common.sourceChunkIds.length > 0;

  if (professionalDrug) {
    return {
      ...common,
      claimId: claim.id,
      disposition: 'ISSUE',
      severity: cited ? 'HIGH' : 'REVIEW_REQUIRED',
      issueType: 'PRESCRIPTION_DRUG_PUBLIC_ADVERTISING',
      explanation:
        '연결된 품목정보가 전문의약품으로 분류됩니다. 일반 소비자를 대상으로 하는 매체의 제품 광고는 원칙적으로 제한되므로 광고 대상과 매체를 우선 확인해야 합니다.',
      requiredEvidence: [
        '의약품 품목허가정보',
        '광고 매체와 수신 대상',
        '법정 예외 해당 자료',
      ],
      suggestedRewrites: [
        '일반 소비자 대상 제품 광고를 게시하지 말고, 허용되는 전문매체·법정 예외 해당 여부를 검토합니다.',
      ],
      resolutionType: 'REMOVE_OR_REWRITE',
      ...(!cited && noSource(category)),
    };
  }

  if (claim.claimType === 'PHARMACEUTICAL_MISRECOGNITION') {
    return {
      ...common,
      claimId: claim.id,
      disposition: 'ISSUE',
      severity: cited ? 'HIGH' : 'REVIEW_REQUIRED',
      issueType: claim.claimType,
      explanation:
        '화장품이 질병을 예방·치료하거나 의약품과 같은 작용을 하는 것으로 잘못 인식될 우려가 있는 표현입니다.',
      requiredEvidence: [],
      suggestedRewrites: [
        '질병명과 치료·완치·재생 표현을 제거하고 확인된 화장품 기능 또는 사용감만 안내합니다.',
      ],
      resolutionType: 'REMOVE_OR_REWRITE',
      ...(!cited && noSource(category)),
    };
  }

  if (claim.claimType === 'ABSOLUTE_SAFETY_OR_EFFECT_CLAIM') {
    return issueFinding({
      category,
      claim,
      common,
      cited,
      severity: 'HIGH',
      explanation:
        '효과를 절대적으로 보장하거나 부작용·이상반응 가능성을 부정하는 표현은 공식 허가 범위 및 객관적 자료보다 강한 인상을 줄 수 있습니다.',
      requiredEvidence: [
        AUTHORIZATION_LABEL[category],
        '표현과 직접 관련된 객관적 시험자료',
      ],
      suggestedRewrite:
        '100%·완벽·부작용 없음과 같은 절대 표현을 제거하고 공식 품목정보 범위로 한정합니다.',
    });
  }

  if (claim.claimType === 'EXPERT_ENDORSEMENT_RISK') {
    return issueFinding({
      category,
      claim,
      common,
      cited,
      severity: category === 'COSMETIC' ? 'MEDIUM' : 'HIGH',
      explanation:
        category === 'COSMETIC'
          ? '전문가의 권위가 제품 효능을 보증하는 것처럼 소비자를 오인하게 하는지 전체 광고 맥락을 확인해야 합니다.'
          : `${CATEGORY_LABEL[category]}의 효능·성능을 의료인 또는 전문가가 보증·추천·공인한 것으로 오해하게 할 우려가 있는 표현입니다.`,
      requiredEvidence: ['추천 발언의 전체 맥락', '광고 참여 및 이해관계 정보'],
      suggestedRewrite:
        '전문가의 권위를 효능·성능 보증처럼 사용하는 문구를 제거합니다.',
    });
  }

  if (claim.claimType === 'BEFORE_AFTER_OR_TESTIMONIAL_RISK') {
    return issueFinding({
      category,
      claim,
      common,
      cited,
      severity: category === 'MEDICAL_DEVICE' ? 'HIGH' : 'MEDIUM',
      explanation:
        '개인의 체험이나 전후 비교가 제품의 보편적 효능·성능으로 받아들여질 수 있어 대표성, 촬영 조건과 광고 전체 맥락을 확인해야 합니다.',
      requiredEvidence: [
        '후기·전후 비교의 원자료',
        '대표성 및 촬영·측정 조건',
        AUTHORIZATION_LABEL[category],
      ],
      suggestedRewrite:
        '개인 체험이나 전후 사진 대신 공식 품목정보와 검증된 사용 조건을 안내합니다.',
    });
  }

  if (claim.claimType === 'OBJECTIVE_EFFECT_CLAIM') {
    return issueFinding({
      category,
      claim,
      common,
      cited,
      severity: 'MEDIUM',
      explanation:
        '화장품 효능에 관한 사실 표현은 광고 문구와 직접 관련된 객관적·과학적 실증자료가 필요합니다.',
      requiredEvidence: [
        '광고 주장과 직접 관련된 인체적용시험 또는 동등 수준 자료',
        '시험 대상·기간·조건',
      ],
      suggestedRewrite:
        '직접 관련된 실증자료가 없으면 효능 단정을 제거하고 사용감·제형 등 확인된 특성만 안내합니다.',
      resolutionType: 'PROVIDE_EVIDENCE',
    });
  }

  return authorizationScopeFinding(
    category,
    claim,
    common,
    cited,
    authorization,
  );
}

function authorizationScopeFinding(
  category: RegulatedCategory,
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
      explanation: `${CATEGORY_LABEL[category]} 효능·성능·기능 표현을 확인했지만 공식 품목정보를 확정하지 못해 허용 범위와 대조할 수 없습니다.`,
      requiredEvidence: [
        '정확한 제품명과 공식 품목 식별번호',
        AUTHORIZATION_LABEL[category],
      ],
      suggestedRewrites: [
        `제품을 확정한 뒤 ${AUTHORIZATION_LABEL[category]} 안에서 문구를 다시 작성합니다.`,
      ],
      resolutionType: 'VERIFY_PRODUCT_CLASSIFICATION',
      uncertaintyReason:
        authorization?.message ?? '공식 품목정보 조회 결과가 없습니다.',
    };
  }

  const official = authorization.selectedProduct.primaryFunctionality;
  const claimedDomains = detectDomains(category, claim.text);
  const officialDomains = detectDomains(category, official);
  const outsideDomains = claimedDomains.filter(
    (domain) => !officialDomains.includes(domain),
  );
  if (!official.trim() || officialDomains.length === 0) {
    return {
      ...common,
      claimId: claim.id,
      disposition: 'ISSUE',
      severity: 'REVIEW_REQUIRED',
      issueType: 'AUTHORIZATION_SCOPE_REQUIRES_REVIEW',
      explanation:
        '공식 품목은 연결했지만 조회 결과의 효능·성능·기능 범위를 구조적으로 대조하기 어려워 원문 확인이 필요합니다.',
      requiredEvidence: [
        AUTHORIZATION_LABEL[category],
        '광고 원문과 적용 대상·조건',
      ],
      suggestedRewrites: [officialRewrite(category, authorization)],
      resolutionType: 'HUMAN_REVIEW',
      uncertaintyReason:
        '공식 품목정보에 비교 가능한 기능 범위가 없거나 형식이 불완전합니다.',
    };
  }
  if (outsideDomains.length > 0) {
    return issueFinding({
      category,
      claim,
      common,
      cited,
      severity: 'HIGH',
      issueType: 'OUTSIDE_AUTHORIZED_SCOPE',
      explanation: `광고의 ${outsideDomains.join('·')} 관련 표현이 연결된 제품의 공식 허가·심사 범위에서 확인되지 않습니다.`,
      requiredEvidence: [AUTHORIZATION_LABEL[category]],
      suggestedRewrite: officialRewrite(category, authorization),
    });
  }

  if (/100%|완벽|무조건|즉시|완치|보장|확실/.test(claim.text)) {
    return issueFinding({
      category,
      claim,
      common,
      cited,
      severity: 'HIGH',
      issueType: 'AUTHORIZED_SCOPE_OVERSTATEMENT',
      explanation:
        '효능·성능의 방향은 공식 범위와 관련되지만 효과의 정도와 확실성을 더 강하게 단정하고 있습니다.',
      requiredEvidence: [AUTHORIZATION_LABEL[category]],
      suggestedRewrite: officialRewrite(category, authorization),
    });
  }

  return {
    ...common,
    claimId: claim.id,
    disposition: 'PASS',
    severity: 'LOW',
    issueType: 'AUTHORIZED_SCOPE_MATCH',
    explanation: `광고의 기능 방향이 연결된 ${CATEGORY_LABEL[category]} 공식 품목정보 범위와 일치합니다.`,
    requiredEvidence: [],
    suggestedRewrites: [officialRewrite(category, authorization)],
    resolutionType: 'HUMAN_REVIEW',
  };
}

function issueFinding(input: {
  category: RegulatedCategory;
  claim: Claim;
  common: Pick<ComplianceFinding, 'sourceChunkIds' | 'citationAssertions'>;
  cited: boolean;
  severity: Severity;
  issueType?: string;
  explanation: string;
  requiredEvidence: string[];
  suggestedRewrite: string;
  resolutionType?: 'REMOVE_OR_REWRITE' | 'PROVIDE_EVIDENCE';
}): ComplianceFinding {
  return {
    ...input.common,
    claimId: input.claim.id,
    disposition: 'ISSUE',
    severity: input.cited ? input.severity : 'REVIEW_REQUIRED',
    issueType: input.issueType ?? input.claim.claimType,
    explanation: input.explanation,
    requiredEvidence: input.requiredEvidence,
    suggestedRewrites: [input.suggestedRewrite],
    resolutionType: input.resolutionType ?? 'REMOVE_OR_REWRITE',
    ...(!input.cited && noSource(input.category)),
  };
}

function citationFields(chunks: RegulationChunk[]) {
  return {
    sourceChunkIds: chunks.map((chunk) => chunk.id),
    citationAssertions: chunks.map((chunk) => ({
      chunkId: chunk.id,
      article: chunk.article,
    })),
  };
}

function noSource(category: RegulatedCategory) {
  return {
    uncertaintyReason: `검증 가능한 ${CATEGORY_LABEL[category]} 광고 규정 청크를 찾지 못했습니다.`,
  };
}

function officialRewrite(
  category: RegulatedCategory,
  authorization: ProductAuthorizationResolution,
) {
  const functionality = authorization.selectedProduct?.primaryFunctionality;
  return functionality
    ? `공식 품목정보 범위로 표현합니다: ${stripMarkup(functionality)}`
    : `${AUTHORIZATION_LABEL[category]}를 확인한 뒤 해당 범위로 표현합니다.`;
}

function stripMarkup(value: string) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectDomains(category: RegulatedCategory, text: string) {
  return DOMAIN_PATTERNS[category]
    .filter(({ pattern }) => pattern.test(text))
    .map(({ key }) => key);
}

function selectChunks(
  claim: Claim,
  chunks: RegulationChunk[],
  category: RegulatedCategory,
) {
  const topics: Record<string, string[]> = {
    AUTHORIZATION_SCOPE_CLAIM: ['허가 범위', '효능 성능', '기능성 심사 범위'],
    ABSOLUTE_SAFETY_OR_EFFECT_CLAIM: [
      '거짓 과장',
      '절대적 표현',
      '부작용 부정',
    ],
    EXPERT_ENDORSEMENT_RISK: ['전문가 보증 추천', '의료인 추천'],
    BEFORE_AFTER_OR_TESTIMONIAL_RISK: ['체험담', '전후 비교', '소비자 오인'],
    PHARMACEUTICAL_MISRECOGNITION: ['의약품 오인', '질병 치료'],
    OBJECTIVE_EFFECT_CLAIM: ['표시 광고 실증', '객관적 근거'],
  };
  const categoryTopic = {
    PHARMACEUTICAL: '의약품 광고',
    MEDICAL_DEVICE: '의료기기 광고',
    COSMETIC: '화장품 광고',
  }[category];
  const preferred = preferTopics(chunks, [
    ...(topics[claim.claimType] ?? ['부당 광고']),
    categoryTopic,
  ]);
  return (preferred.length > 0 ? preferred : chunks).slice(0, 3);
}

function preferTopics(chunks: RegulationChunk[], topics: string[]) {
  return chunks.filter((chunk) =>
    chunk.metadata.topics.some((topic) => topics.includes(topic)),
  );
}
