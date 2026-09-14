import { describe, expect, it } from 'vitest';

import { createContentComplianceScanService } from '@/src/server/regulatory-runtime';
import { FixtureWebContentExtractor } from './fixture-web-content-extractor';
import { UrlComplianceScanService } from './url-compliance-scan-service';

const contentComplianceScanService = createContentComplianceScanService();

describe('URL compliance scan integration', () => {
  it('runs demo HTML through extraction, claims, RAG and citation validation', async () => {
    const fixtureExtractor = new FixtureWebContentExtractor();
    const service = new UrlComplianceScanService(
      {
        async extract() {
          throw new Error('Network extraction must not run for demo fixtures.');
        },
      },
      fixtureExtractor,
      contentComplianceScanService,
    );

    const result = await service.analyze({ fixtureId: 'ai-saas-landing' });

    expect(result.inputType).toBe('URL');
    expect(result.detectedContentType).toBe('LANDING_PAGE');
    expect(result.detectedCategory).toBe('GENERAL_ADVERTISING');
    expect(result.webContent?.fixtureId).toBe('ai-saas-landing');
    expect(result.claims.length).toBeGreaterThanOrEqual(5);
    expect(result.claims.every((claim) => Boolean(claim.sourceSectionId))).toBe(
      true,
    );
    expect(
      result.issues.every(
        (issue) =>
          issue.citationStatus === 'VERIFIED' &&
          issue.sourceChunkIds.length > 0,
      ),
    ).toBe(true);
  });

  it('runs a general-food fixture through both applicable packs', async () => {
    const service = new UrlComplianceScanService(
      {
        async extract() {
          throw new Error('Network extraction must not run for demo fixtures.');
        },
      },
      new FixtureWebContentExtractor(),
      contentComplianceScanService,
    );

    const result = await service.analyze({ fixtureId: 'general-food-product' });

    expect(result.detectedCategory).toBe('GENERAL_FOOD');
    expect(result.detectedContentType).toBe('PRODUCT_DETAIL');
    expect(result.overallRisk).toBe('HIGH');
    expect(result.activePacks).toEqual(
      expect.arrayContaining(['GENERAL_ADVERTISING', 'GENERAL_FOOD']),
    );
    expect(result.issues.map((issue) => issue.category)).toEqual(
      expect.arrayContaining([
        'HEALTH_FUNCTIONAL_FOOD_CONFUSION',
        'CONSUMER_EXPERIENCE_GENERALIZATION',
      ]),
    );
    expect(
      result.issues.every(
        (issue) =>
          issue.citationStatus === 'VERIFIED' &&
          issue.sourceChunkIds.length > 0,
      ),
    ).toBe(true);
    expect(result.enforcementCases.length).toBeGreaterThan(0);
  });
});
