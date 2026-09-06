import type { PreparedClaim } from '@/src/compliance/core/compliance-analyzer';
import { extractGeneralAdvertisingClaimCandidates } from '@/src/compliance/packs/general-advertising/claim-extractor';

import type { ExtractedWebContent } from './schemas';

const IMPORTANCE_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
const MEDIUM_WEB_CLAIM_PATTERN =
  /(?:반복\s*업무를\s*(?:한곳에서\s*)?자동화(?:하세요|합니다)|업무\s*효율(?:을|이)?\s*(?:개선|향상)[^.!?\n]{0,20})/g;

export class PageClaimExtractor {
  constructor(private readonly maximumClaims = 20) {}

  extract(content: ExtractedWebContent): PreparedClaim[] {
    const candidates = content.sections.flatMap((section) => {
      const baseOffset = content.visibleText.indexOf(section.text);
      if (baseOffset < 0) return [];
      return [
        ...extractGeneralAdvertisingClaimCandidates(section.text, {
          sourceSectionId: section.id,
          baseOffset,
        }),
        ...extractMediumWebClaims(section.text, section.id, baseOffset),
      ];
    });

    const unique = new Map<string, PreparedClaim>();
    candidates.forEach((candidate) => {
      const key = `${candidate.sourceSectionId}:${candidate.text.toLocaleLowerCase('ko-KR')}`;
      if (!unique.has(key)) unique.set(key, candidate);
    });

    return [...unique.values()]
      .filter((claim) => claim.importance !== 'LOW')
      .sort(
        (a, b) =>
          IMPORTANCE_ORDER[a.importance ?? 'LOW'] -
            IMPORTANCE_ORDER[b.importance ?? 'LOW'] ||
          a.startOffset - b.startOffset,
      )
      .slice(0, this.maximumClaims)
      .sort((a, b) => a.startOffset - b.startOffset);
  }
}

function extractMediumWebClaims(
  text: string,
  sourceSectionId: string,
  baseOffset: number,
): PreparedClaim[] {
  return [...text.matchAll(MEDIUM_WEB_CLAIM_PATTERN)].map((match) => ({
    text: match[0].trim(),
    claimType: 'GENERAL_MARKETING',
    importance: 'MEDIUM',
    signals: [],
    startOffset: baseOffset + match.index,
    endOffset: baseOffset + match.index + match[0].length,
    sourceSectionId,
  }));
}
