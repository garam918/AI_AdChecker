import type { PreparedClaim } from './compliance-analyzer';

// Rule extractors and the AI extractor label the same expression with
// slightly different type names. Normalize only within the pack that owns
// both names so a food or cosmetics type is never folded into advertising.
const GENERAL_ADVERTISING_ALIASES: Record<string, string> = {
  NUMERICAL: 'OBJECTIVE_PERFORMANCE',
  FREE: 'PRICE_CONDITION',
};

const MINIMUM_OVERLAP_RATIO = 0.8;

/**
 * Merges rule-based and AI-extracted claims that point at the same span.
 *
 * Two claims merge when they share a claim type, context role and page
 * section, and the overlap covers at least 80% of the shorter span. The
 * longer quote wins so the user sees the full expression; signals and
 * context from both are preserved. Non-overlapping occurrences, testimonials
 * and warnings are never merged into advertising claims.
 */
export function mergeClaims(
  claims: PreparedClaim[],
  packId: string,
): PreparedClaim[] {
  const result: PreparedClaim[] = [];
  for (const claim of claims) {
    const claimType =
      packId === 'GENERAL_ADVERTISING'
        ? (GENERAL_ADVERTISING_ALIASES[claim.claimType] ?? claim.claimType)
        : claim.claimType;
    const normalized: PreparedClaim = { ...claim, claimType };
    const index = result.findIndex((other) => overlaps(other, normalized));
    if (index < 0) {
      result.push(normalized);
      continue;
    }
    const previous = result[index];
    const longer =
      previous.text.length >= normalized.text.length ? previous : normalized;
    result[index] = {
      ...previous,
      ...longer,
      contextText: previous.contextText ?? normalized.contextText,
      signals: [
        ...new Set([
          ...(previous.signals ?? []),
          ...(normalized.signals ?? []),
        ]),
      ],
    };
  }
  return result;
}

function overlaps(left: PreparedClaim, right: PreparedClaim) {
  if (left.claimType !== right.claimType) return false;
  if (
    (left.contextRole ?? 'ADVERTISING') !== (right.contextRole ?? 'ADVERTISING')
  )
    return false;
  if ((left.sourceSectionId ?? null) !== (right.sourceSectionId ?? null))
    return false;
  const overlap =
    Math.min(left.endOffset, right.endOffset) -
    Math.max(left.startOffset, right.startOffset);
  if (overlap <= 0) return false;
  const shorter = Math.min(
    left.endOffset - left.startOffset,
    right.endOffset - right.startOffset,
  );
  return overlap / shorter >= MINIMUM_OVERLAP_RATIO;
}
