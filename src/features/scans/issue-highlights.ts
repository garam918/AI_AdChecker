import type { Issue, ScanAnalysisResult } from '@/src/compliance/core/schemas';

/** Resolve the displayed quote, not stale offsets from a shorter merged claim. */
export function findIssueHighlights(
  text: string,
  issues: Issue[],
  claims: ScanAnalysisResult['claims'],
) {
  const matches = issues
    .flatMap((issue) => {
      const quote = issue.originalText;
      if (!quote) return [];
      const claim = claims.find((item) => item.id === issue.claimId);
      const offset = claim?.startOffset;
      const start =
        offset !== undefined &&
        text.slice(offset, offset + quote.length) === quote
          ? offset
          : text.indexOf(quote);
      if (start < 0) return [];
      // Ambiguous repeated quotes without a verified offset stay in the issue list.
      if (start !== offset && text.indexOf(quote, start + 1) >= 0) return [];
      return [{ issue, start, end: start + quote.length }];
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);
  let cursor = 0;
  return matches.filter((match) => {
    if (match.start < cursor) return false;
    cursor = match.end;
    return true;
  });
}
