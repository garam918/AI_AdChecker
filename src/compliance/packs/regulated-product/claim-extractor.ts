import type { PreparedClaim } from '@/src/compliance/core/compliance-analyzer';
import type {
  ClaimContextRole,
  ClaimImportance,
} from '@/src/compliance/core/schemas';
import type { DetectedCategory } from '@/src/content/web/schemas';

type RegulatedCategory = Extract<
  DetectedCategory,
  'PHARMACEUTICAL' | 'MEDICAL_DEVICE' | 'COSMETIC'
>;

type ClaimPattern = {
  pattern: RegExp;
  claimType: string;
  importance: ClaimImportance;
  signals: string[];
};

const COMMON_PATTERNS: ClaimPattern[] = [
  {
    pattern:
      /(?:(?:100%|완벽하게|무조건|확실히|기적적으로)\s*[^.!?\n]{0,34}(?:치료|완치|개선|제거|회복|효과|보장)|(?:부작용|이상반응)\s*(?:이|은|가)?\s*(?:전혀\s*)?(?:없(?:다|습니다|음)|제로)|완전(?:히)?\s*안전)/g,
    claimType: 'ABSOLUTE_SAFETY_OR_EFFECT_CLAIM',
    importance: 'HIGH',
    signals: ['ABSOLUTE', 'SAFETY_OR_EFFECT'],
  },
  {
    pattern:
      /(?:의사|치과의사|한의사|약사|교수|전문의|전문가)(?:가|도|들이)?\s*[^.!?\n]{0,32}(?:추천|보증|인정|공인|사용)/g,
    claimType: 'EXPERT_ENDORSEMENT_RISK',
    importance: 'HIGH',
    signals: ['EXPERT', 'ENDORSEMENT'],
  },
  {
    pattern:
      /(?:(?:사용|복용)\s*(?:전|후)\s*(?:사진|비교|효과)|비포\s*(?:&|앤드)?\s*애프터|(?:환자|고객|사용자)\s*(?:체험담|후기)[^.!?\n]{0,24}(?:치료|완치|효과|개선))/g,
    claimType: 'BEFORE_AFTER_OR_TESTIMONIAL_RISK',
    importance: 'HIGH',
    signals: ['TESTIMONIAL', 'BEFORE_AFTER'],
  },
];

const CATEGORY_PATTERNS: Record<RegulatedCategory, ClaimPattern[]> = {
  PHARMACEUTICAL: [
    {
      pattern:
        /(?:감기|두통|치통|발열|통증|염증|알레르기|소화불량|고혈압|당뇨|불면증|우울증|질환|증상)(?:을|를|이|에|의)?\s*(?:예방|치료|완치|개선|완화|제거|낮추|줄이|없애)[^.!?\n]{0,18}/g,
      claimType: 'AUTHORIZATION_SCOPE_CLAIM',
      importance: 'HIGH',
      signals: ['EFFICACY', 'AUTHORIZATION_SCOPE'],
    },
    {
      pattern:
        /(?:해열|진통|소염|항균|항바이러스|혈압\s*(?:강하|조절)|혈당\s*(?:강하|조절)|수면\s*(?:유도|개선))\s*(?:효과|작용|에\s*도움)?/g,
      claimType: 'AUTHORIZATION_SCOPE_CLAIM',
      importance: 'HIGH',
      signals: ['EFFICACY', 'AUTHORIZATION_SCOPE'],
    },
  ],
  MEDICAL_DEVICE: [
    {
      pattern:
        /(?:통증|염증|부종|상처|흉터|혈압|혈당|체지방|근육통|관절통|디스크|질환|증상)(?:을|를|이|에|의)?\s*(?:측정|진단|예방|치료|완치|개선|완화|감소|제거|교정|회복)[^.!?\n]{0,18}/g,
      claimType: 'AUTHORIZATION_SCOPE_CLAIM',
      importance: 'HIGH',
      signals: ['PERFORMANCE', 'AUTHORIZATION_SCOPE'],
    },
  ],
  COSMETIC: [
    {
      pattern:
        /(?:여드름|아토피|피부염|염증|탈모|상처|흉터|습진|무좀)(?:을|를|이|에|의)?\s*(?:예방|치료|완치|재생|회복|제거|개선)[^.!?\n]{0,18}/g,
      claimType: 'PHARMACEUTICAL_MISRECOGNITION',
      importance: 'HIGH',
      signals: ['DISEASE', 'PHARMACEUTICAL_MISRECOGNITION'],
    },
    {
      pattern:
        /(?:미백|주름|자외선|탈모\s*증상|여드름성\s*피부|튼살|피부\s*장벽)(?:을|를|이|에|의)?\s*(?:개선|완화|차단|보호|회복|도움을\s*줄\s*수\s*있(?:음|습니다))[^.!?\n]{0,18}/g,
      claimType: 'AUTHORIZATION_SCOPE_CLAIM',
      importance: 'HIGH',
      signals: ['FUNCTIONAL_COSMETIC', 'AUTHORIZATION_SCOPE'],
    },
    {
      pattern:
        /(?:피부\s*(?:재생|세포\s*재생)|모공\s*축소|탄력\s*개선|보습\s*(?:개선|지속)|피부\s*장벽\s*(?:개선|회복))/g,
      claimType: 'OBJECTIVE_EFFECT_CLAIM',
      importance: 'MEDIUM',
      signals: ['OBJECTIVE_EFFECT', 'SUBSTANTIATION'],
    },
  ],
};

const NEGATED_PATTERN =
  /(?:효능|효과|기능|치료|예방)[^.!?\n]{0,20}(?:아닙니다|없습니다|않습니다)|의약품이\s*아닙니다/;

export function extractRegulatedProductClaimCandidates(
  input: string,
  category: RegulatedCategory,
  context: {
    sourceSectionId?: string | null;
    baseOffset?: number;
    contextRole?: ClaimContextRole;
  } = {},
): PreparedClaim[] {
  const patterns = [...COMMON_PATTERNS, ...CATEGORY_PATTERNS[category]];
  const candidates = patterns
    .flatMap(({ pattern, claimType, importance, signals }) =>
      [...input.matchAll(pattern)].flatMap((match) => {
        const contextText = sentenceContext(
          input,
          match.index,
          match[0].length,
        );
        if (NEGATED_PATTERN.test(contextText)) return [];
        return [
          {
            text: match[0].trim(),
            claimType,
            importance,
            signals,
            startOffset: (context.baseOffset ?? 0) + match.index,
            endOffset:
              (context.baseOffset ?? 0) + match.index + match[0].length,
            sourceSectionId: context.sourceSectionId ?? null,
            contextText,
            contextRole: context.contextRole ?? 'ADVERTISING',
          },
        ];
      }),
    )
    .sort((left, right) => left.startOffset - right.startOffset);

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.claimType}:${candidate.startOffset}:${candidate.endOffset}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sentenceContext(input: string, start: number, length: number) {
  const left = Math.max(
    input.lastIndexOf('.', start - 1),
    input.lastIndexOf('!', start - 1),
    input.lastIndexOf('?', start - 1),
    input.lastIndexOf('\n', start - 1),
  );
  const following = ['.', '!', '?', '\n']
    .map((separator) => input.indexOf(separator, start + length))
    .filter((index) => index >= 0);
  const right = following.length > 0 ? Math.min(...following) : input.length;
  return input.slice(left + 1, right).trim();
}
