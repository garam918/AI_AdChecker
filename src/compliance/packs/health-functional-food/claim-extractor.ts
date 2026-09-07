import type { PreparedClaim } from '@/src/compliance/core/compliance-analyzer';
import type {
  ClaimContextRole,
  ClaimImportance,
} from '@/src/compliance/core/schemas';

type ClaimPattern = {
  pattern: RegExp;
  claimType: string;
  importance: ClaimImportance;
  signals: string[];
};

const FUNCTION_DOMAINS =
  '면역(?:력|기능)?|혈당|체지방|혈행|콜레스테롤|관절|연골|눈|간|장|기억력|피로|피부|뼈|항산화';

const CLAIM_PATTERNS: ClaimPattern[] = [
  {
    pattern:
      /(?:감기|당뇨|아토피|관절염|고혈압|암|치매)(?:을|를|에|의)?\s*(?:예방|치료|완치|개선|완화)(?:에\s*좋은|하는|해주는|합니다)?/g,
    claimType: 'DISEASE_PREVENTION_TREATMENT',
    importance: 'HIGH',
    signals: ['DISEASE', 'EFFICACY'],
  },
  {
    pattern: new RegExp(
      `(?:${FUNCTION_DOMAINS})(?:을|를|이|에|의)?\\s*(?:건강(?:에)?\\s*)?(?:개선|강화|증진|감소|관리|조절|낮추는|높이는|보호|회복|완화|도움을\\s*줄\\s*수\\s*있(?:음|습니다))`,
      'g',
    ),
    claimType: 'FUNCTIONALITY_SCOPE_CLAIM',
    importance: 'HIGH',
    signals: ['HEALTH_FUNCTION', 'AUTHORIZATION_SCOPE'],
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
      /(?:(?:100%|무조건|완벽하게|기적적으로)\s*[^.!?\n]{0,28}(?:효과|개선|회복|치료|감소|강화)|즉시\s*[^.!?\n]{0,24}(?:개선|효과|강화))/g,
    claimType: 'FALSE_EXAGGERATED_CLAIM',
    importance: 'HIGH',
    signals: ['ABSOLUTE', 'EXAGGERATED'],
  },
];

const WARNING_PATTERN =
  /(?:환자|치료\s*중|약을\s*복용)[^.!?\n]{0,40}(?:주의|상담)|섭취\s*전[^.!?\n]{0,30}상담/;
const NEGATED_PATTERN =
  /(?:효능|효과|기능성|치료|예방)[^.!?\n]{0,18}(?:아닙니다|없습니다|않습니다)|의약품이\s*아닙니다/;

export function extractHealthFunctionalFoodClaimCandidates(
  input: string,
  context: {
    sourceSectionId?: string | null;
    baseOffset?: number;
    contextRole?: ClaimContextRole;
  } = {},
): PreparedClaim[] {
  const candidates = CLAIM_PATTERNS.flatMap(
    ({ pattern, claimType, importance, signals }) =>
      [...input.matchAll(pattern)].flatMap((match) => {
        const contextText = sentenceContext(
          input,
          match.index,
          match[0].length,
        );
        if (
          WARNING_PATTERN.test(contextText) ||
          NEGATED_PATTERN.test(contextText)
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
            contextText,
            contextRole: context.contextRole ?? 'ADVERTISING',
          },
        ];
      }),
  ).sort((left, right) => left.startOffset - right.startOffset);

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
