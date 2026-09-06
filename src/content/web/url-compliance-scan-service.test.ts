import { describe, expect, it, vi } from 'vitest';

import { createRagComplianceAnalyzer } from '@/src/server/regulatory-runtime';
import { FixtureWebContentExtractor } from './fixture-web-content-extractor';
import { SemanticHtmlExtractor } from './semantic-html-extractor';
import { UrlComplianceScanService } from './url-compliance-scan-service';

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
      createRagComplianceAnalyzer(),
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

  it('returns review required without running general-ad rules for food content', async () => {
    const foodContent = new SemanticHtmlExtractor().extract({
      html: `
        <html lang="ko">
          <head><title>건강 음료</title></head>
          <body><main class="hero"><h1>매일 한 잔으로 혈당 관리와 면역력 개선</h1></main></body>
        </html>
      `,
      url: 'https://food.example.com',
      finalUrl: 'https://food.example.com',
    });
    const analyze = vi.fn();
    const service = new UrlComplianceScanService(
      {
        async extract() {
          return foodContent;
        },
      },
      new FixtureWebContentExtractor(),
      { analyze },
    );

    const result = await service.analyze({ url: foodContent.url });

    expect(result.detectedCategory).toBe('GENERAL_FOOD');
    expect(result.overallRisk).toBe('REVIEW_REQUIRED');
    expect(result.claims).toEqual([]);
    expect(result.issues).toEqual([]);
    expect(result.notices).toContainEqual(
      expect.objectContaining({ code: 'GENERAL_FOOD_PACK_DISABLED' }),
    );
    expect(analyze).not.toHaveBeenCalled();
  });
});
