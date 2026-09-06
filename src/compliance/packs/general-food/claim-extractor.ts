import type { PreparedClaim } from '@/src/compliance/core/compliance-analyzer';
import type {
  ClaimContextRole,
  ClaimImportance,
} from '@/src/compliance/core/schemas';

type FoodClaimPattern = {
  pattern: RegExp;
  claimType: string;
  importance: ClaimImportance;
  signals: string[];
};

const FOOD_CLAIM_PATTERNS: FoodClaimPattern[] = [
  {
    pattern:
      /(?:감기|당뇨|아토피|관절염|고혈압|암)(?:을|를|에|의)?\s*(?:예방|치료|개선|완화)(?:에\s*좋은|하는|해주는|합니다)?/g,
    claimType: 'DISEASE_PREVENTION_TREATMENT',
    importance: 'HIGH',
    signals: ['DISEASE', 'EFFICACY'],
  },
  {
    pattern:
      /(?:혈당(?:을|이)?\s*(?:관리|개선|조절|낮추는|낮춰주는)|면역력\s*(?:개선|강화|증진)|체지방\s*(?:감소|관리)|체중\s*(?:감량|감소|관리)|관절\s*(?:건강|기능|통증)?\s*(?:개선|강화|완화)|피부\s*(?:건강|상태|트러블)?\s*(?:개선|회복|완화))/g,
    claimType: 'HEALTH_FUNCTIONAL_FOOD_CONFUSION',
    importance: 'HIGH',
    signals: ['HEALTH_FUNCTION', 'EFFICACY'],
  },
  {
    pattern:
      /(?:약처럼\s*[^.!?\n]{0,24}|치료제(?:와\s*같은|처럼)?|항염\s*(?:효과|작용)|진통\s*(?:효과|작용)|약효)/g,
    claimType: 'PHARMACEUTICAL_CONFUSION',
    importance: 'HIGH',
    signals: ['PHARMACEUTICAL'],
  },
  {
    pattern:
      /(?:(?:100%|무조건|완벽하게|기적적으로)\s*[^.!?\n]{0,24}(?:효과|개선|회복|치료|감소)|즉시\s*[^.!?\n]{0,20}(?:개선|효과))/g,
    claimType: 'FALSE_EXAGGERATED_CLAIM',
    importance: 'HIGH',
    signals: ['ABSOLUTE', 'EXAGGERATED'],
  },
  {
    pattern:
      /(?:먹고|마시고|섭취하고)\s*[^.!?\n]{0,36}(?:좋아졌(?:어요|습니다)?|나았(?:어요|습니다)?|개선됐(?:어요|습니다)?|줄었(?:어요|습니다)?)/g,
    claimType: 'CONSUMER_EXPERIENCE_GENERALIZATION',
    importance: 'MEDIUM',
    signals: ['TESTIMONIAL', 'GENERALIZATION'],
  },
  {
    pattern: /(?:섭취|복용)\s*전후|비포\s*(?:앤드|&)\s*애프터|전후\s*사진/g,
    claimType: 'BEFORE_AFTER_RISK',
    importance: 'MEDIUM',
    signals: ['BEFORE_AFTER'],
  },
  {
    pattern: /(?:의사|약사|전문의|전문가)\s*[^.!?\n]{0,24}(?:추천|보증|인정)/g,
    claimType: 'EXPERT_ENDORSEMENT_RISK',
    importance: 'MEDIUM',
    signals: ['EXPERT_ENDORSEMENT'],
  },
];

const WARNING_PATTERN =
  /(?:환자|치료\s*중|약을\s*복용)[^.!?\n]{0,40}(?:주의|상담)|섭취\s*전[^.!?\n]{0,30}상담/;
const NUTRITION_INFORMATION_PATTERN =
  /(?:영양정보|영양성분|당류\s*\d+(?:\.\d+)?\s*g|열량\s*\d+(?:\.\d+)?\s*kcal)/i;
const NEGATED_CLAIM_PATTERN =
  /(?:효능|효과|기능성|추천|보증|전후\s*사진)[^.!?\n]{0,16}(?:아닙니다|없습니다|않습니다|않았습니다)|(?:사용|표방|의미)하지\s*않/;

export function extractGeneralFoodClaimCandidates(
  input: string,
  context: {
    sourceSectionId?: string | null;
    baseOffset?: number;
    contextRole?: ClaimContextRole;
  } = {},
): PreparedClaim[] {
  const candidates = FOOD_CLAIM_PATTERNS.flatMap(
    ({ pattern, claimType, importance, signals }) =>
      [...input.matchAll(pattern)].flatMap((match) => {
        const localContext = extractSentenceContext(
          input,
          match.index,
          match[0].length,
        );
        const contextRole = classifyContext(localContext, context.contextRole);
        if (
          contextRole === 'WARNING' ||
          contextRole === 'NUTRITION_INFORMATION' ||
          NEGATED_CLAIM_PATTERN.test(localContext)
        ) {
          return [];
        }

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
            contextText: localContext,
            contextRole,
          },
        ];
      }),
  ).sort(
    (a, b) =>
      a.startOffset - b.startOffset ||
      b.endOffset - b.startOffset - (a.endOffset - a.startOffset),
  );

  const seen = new Set<string>();
  return candidates.filter((candidate, index, all) => {
    const key = `${candidate.claimType}:${candidate.text.toLocaleLowerCase('ko-KR')}`;
    if (seen.has(key)) return false;
    const overlaps = all
      .slice(0, index)
      .some(
        (accepted) =>
          candidate.startOffset < accepted.endOffset &&
          candidate.endOffset > accepted.startOffset,
      );
    if (overlaps) return false;
    seen.add(key);
    return true;
  });
}

function extractSentenceContext(input: string, start: number, length: number) {
  const leftBoundary = Math.max(
    input.lastIndexOf('.', start - 1),
    input.lastIndexOf('!', start - 1),
    input.lastIndexOf('?', start - 1),
    input.lastIndexOf('\n', start - 1),
  );
  const followingBoundaries = ['.', '!', '?', '\n']
    .map((separator) => input.indexOf(separator, start + length))
    .filter((index) => index >= 0);
  const rightBoundary =
    followingBoundaries.length > 0
      ? Math.min(...followingBoundaries)
      : input.length;
  return input.slice(leftBoundary + 1, rightBoundary).trim();
}

function classifyContext(
  input: string,
  suppliedRole?: ClaimContextRole,
): ClaimContextRole {
  if (WARNING_PATTERN.test(input)) return 'WARNING';
  if (NUTRITION_INFORMATION_PATTERN.test(input)) {
    return 'NUTRITION_INFORMATION';
  }
  if (suppliedRole === 'TESTIMONIAL' || /후기|리뷰/.test(input)) {
    return 'TESTIMONIAL';
  }
  return suppliedRole ?? 'ADVERTISING';
}
