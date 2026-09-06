import type { Claim } from '../../core/schemas';

type ClaimPattern = {
  pattern: RegExp;
  claimType: Claim['claimType'];
};

const CLAIM_PATTERNS: ClaimPattern[] = [
  {
    pattern: /업무 시간을\s*70%\s*줄여(?:주는|드립니다)/g,
    claimType: 'OBJECTIVE_PERFORMANCE',
  },
  {
    pattern: /100%\s*정확한\s*AI/g,
    claimType: 'OBJECTIVE_PERFORMANCE',
  },
  {
    pattern: /99\.9%\s*정확도를\s*기록했습니다/g,
    claimType: 'OBJECTIVE_PERFORMANCE',
  },
  {
    pattern: /경쟁사\s*대비\s*3배\s*빠릅니다/g,
    claimType: 'COMPARATIVE',
  },
  { pattern: /국내\s*최고의/g, claimType: 'SUPERIORITY' },
  { pattern: /업계\s*1위/g, claimType: 'SUPERIORITY' },
  {
    pattern: /무료로\s*사용할\s*수\s*있습니다/g,
    claimType: 'PRICE_CONDITION',
  },
];

export function extractGeneralAdvertisingClaims(input: string, scanId: string) {
  const candidates = CLAIM_PATTERNS.flatMap(({ pattern, claimType }) =>
    [...input.matchAll(pattern)].map((match) => ({
      text: match[0],
      claimType,
      startOffset: match.index,
      endOffset: match.index + match[0].length,
    })),
  ).sort(
    (a, b) =>
      a.startOffset - b.startOffset ||
      b.endOffset - b.startOffset - (a.endOffset - a.startOffset),
  );

  const nonOverlapping = candidates.filter(
    (candidate, index, all) =>
      !all
        .slice(0, index)
        .some(
          (accepted) =>
            candidate.startOffset < accepted.endOffset &&
            candidate.endOffset > accepted.startOffset,
        ),
  );

  return nonOverlapping.map(
    (candidate, index): Claim => ({
      id: `${scanId}-claim-${index + 1}`,
      scanId,
      ...candidate,
    }),
  );
}
