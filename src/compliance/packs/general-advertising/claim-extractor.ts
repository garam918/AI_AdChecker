import type { PreparedClaim } from '../../core/compliance-analyzer';
import type { Claim, ClaimSignal } from '../../core/schemas';
import { affirmedExpressionMatches } from '../../core/affirmed-expressions';

type ClaimPattern = {
  pattern: RegExp;
  claimType: Claim['claimType'];
  importance: NonNullable<Claim['importance']>;
  signals: ClaimSignal[];
};

const CLAIM_PATTERNS: ClaimPattern[] = [
  {
    pattern:
      /업무\s*시간(?:을)?\s*\d+(?:\.\d+)?%\s*(?:줄이는|줄여주는|줄여드립니다|단축합니다|단축해주는)/g,
    claimType: 'OBJECTIVE_PERFORMANCE',
    importance: 'HIGH',
    signals: ['NUMERICAL', 'PERCENTAGE'],
  },
  {
    pattern: /\d+(?:\.\d+)?%\s*정확(?:도(?:를)?(?:\s*기록했습니다)?|한\s*AI)/g,
    claimType: 'OBJECTIVE_PERFORMANCE',
    importance: 'HIGH',
    signals: ['NUMERICAL', 'PERCENTAGE'],
  },
  {
    pattern: /\d{1,3}(?:,\d{3})+\s*(?:개\s*)?기업이\s*선택/g,
    claimType: 'NUMERICAL',
    importance: 'HIGH',
    signals: ['NUMERICAL', 'SOCIAL_PROOF'],
  },
  {
    pattern:
      /(?:이 서비스를 쓰고\s*)?생산성이\s*\d+(?:\.\d+)?배(?:가)?\s*됐습니다/g,
    claimType: 'TESTIMONIAL',
    importance: 'HIGH',
    signals: ['NUMERICAL', 'MULTIPLIER', 'TESTIMONIAL'],
  },
  {
    pattern: /경쟁사\s*대비\s*\d+(?:\.\d+)?배\s*[^.!?\n]{1,30}/g,
    claimType: 'COMPARATIVE',
    importance: 'HIGH',
    signals: ['NUMERICAL', 'MULTIPLIER'],
  },
  {
    pattern: /(?:국내|업계)\s*(?:최고(?:의)?|1위)|No\.?\s*1/gi,
    claimType: 'SUPERIORITY',
    importance: 'HIGH',
    signals: ['SUPERLATIVE'],
  },
  {
    pattern: /무료로\s*사용할\s*수\s*있습니다/g,
    claimType: 'PRICE_CONDITION',
    importance: 'HIGH',
    signals: ['FREE'],
  },
  {
    pattern: /(?:완전|지금)\s*무료|무료\s*(?:체험|플랜|요금제)/g,
    claimType: 'FREE',
    importance: 'HIGH',
    signals: ['FREE'],
  },
  {
    pattern: /(?:효과|성과|결과)를?\s*(?:반드시|확실히)\s*보장[^.!?\n]*/g,
    claimType: 'GUARANTEE',
    importance: 'HIGH',
    signals: ['GUARANTEE'],
  },
];

export function extractGeneralAdvertisingClaimCandidates(
  input: string,
  context: {
    sourceSectionId?: string | null;
    baseOffset?: number;
  } = {},
): PreparedClaim[] {
  const candidates = CLAIM_PATTERNS.flatMap(
    ({ pattern, claimType, importance, signals }) =>
      affirmedExpressionMatches(input, pattern).map((match) => ({
        text: match[0].trim(),
        claimType,
        importance,
        signals,
        startOffset: (context.baseOffset ?? 0) + match.index,
        endOffset: (context.baseOffset ?? 0) + match.index + match[0].length,
        sourceSectionId: context.sourceSectionId ?? null,
        contextText: input,
        contextRole: 'ADVERTISING' as const,
      })),
  ).sort(
    (a, b) =>
      a.startOffset - b.startOffset ||
      b.endOffset - b.startOffset - (a.endOffset - a.startOffset),
  );

  return candidates.filter(
    (candidate, index, all) =>
      !all
        .slice(0, index)
        .some(
          (accepted) =>
            candidate.startOffset < accepted.endOffset &&
            candidate.endOffset > accepted.startOffset,
        ),
  );
}

export function extractGeneralAdvertisingClaims(input: string, scanId: string) {
  return materializeClaims(
    extractGeneralAdvertisingClaimCandidates(input),
    scanId,
  );
}

export function materializeClaims(
  candidates: PreparedClaim[],
  scanId: string,
): Claim[] {
  return candidates.map(
    (candidate, index): Claim => ({
      id: `${scanId}-claim-${index + 1}`,
      scanId,
      ...candidate,
    }),
  );
}
