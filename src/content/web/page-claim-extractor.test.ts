import { describe, expect, it } from 'vitest';

import { FixtureWebContentExtractor } from './fixture-web-content-extractor';
import { PageClaimExtractor } from './page-claim-extractor';

describe('PageClaimExtractor', () => {
  it('extracts high-value web claims with their source sections', async () => {
    const content = await new FixtureWebContentExtractor().extract(
      'ai-saas-landing',
    );
    const claims = new PageClaimExtractor().extract(content);

    expect(claims.map((claim) => claim.claimType)).toEqual(
      expect.arrayContaining([
        'OBJECTIVE_PERFORMANCE',
        'SUPERIORITY',
        'NUMERICAL',
        'FREE',
        'TESTIMONIAL',
        'GENERAL_MARKETING',
      ]),
    );
    expect(
      claims.every((claim) =>
        ['HIGH', 'MEDIUM'].includes(claim.importance ?? ''),
      ),
    ).toBe(true);
    expect(claims.every((claim) => Boolean(claim.sourceSectionId))).toBe(true);
    expect(
      claims.some(
        (claim) =>
          claim.claimType === 'GENERAL_MARKETING' &&
          claim.importance === 'MEDIUM',
      ),
    ).toBe(true);
  });
});
