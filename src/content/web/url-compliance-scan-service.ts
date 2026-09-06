import type { ContentComplianceScanService } from '@/src/compliance/core/content-compliance-scan-service';
import { ScanAnalysisResultSchema } from '@/src/compliance/core/schemas';

import { classifyWebContent } from './content-classifier';
import type { FixtureWebContentExtractor } from './fixture-web-content-extractor';
import type { WebContentExtractor } from './web-content-extractor';

export type UrlScanInput =
  | { url: string; fixtureId?: never }
  | { fixtureId: string; url?: never };

export class UrlComplianceScanService {
  constructor(
    private readonly webContentExtractor: WebContentExtractor,
    private readonly fixtureContentExtractor: FixtureWebContentExtractor,
    private readonly complianceAnalyzer: Pick<
      ContentComplianceScanService,
      'analyzeContent'
    >,
  ) {}

  async analyze(input: UrlScanInput) {
    const webContent = input.fixtureId
      ? await this.fixtureContentExtractor.extract(input.fixtureId)
      : await this.webContentExtractor.extract(input.url!);
    const { detectedContentType, detectedCategory } =
      classifyWebContent(webContent);
    const notices: Array<{
      code: 'CONTENT_TRUNCATED' | 'UNKNOWN_CATEGORY';
      message: string;
    }> = webContent.contentTruncated
      ? [
          {
            code: 'CONTENT_TRUNCATED',
            message: '페이지가 커서 우선순위가 높은 콘텐츠만 분석했습니다.',
          },
        ]
      : [];

    if (detectedCategory === 'UNKNOWN') {
      notices.push({
        code: 'UNKNOWN_CATEGORY',
        message:
          '페이지 유형 또는 상품 카테고리를 충분히 분류하지 못해 추가 검토가 필요합니다.',
      });

      return ScanAnalysisResultSchema.parse({
        inputType: 'URL',
        detectedContentType,
        detectedCategory,
        overallRisk: 'REVIEW_REQUIRED',
        claims: [],
        issues: [],
        sources: [],
        webContent,
        notices,
      });
    }

    const complianceResult = await this.complianceAnalyzer.analyzeContent({
      text: webContent.visibleText,
      detectedContentType,
      webContent,
    });

    return ScanAnalysisResultSchema.parse({
      ...complianceResult,
      inputType: 'URL',
      detectedContentType,
      detectedCategory: complianceResult.detectedCategory,
      webContent,
      notices: [...complianceResult.notices, ...notices],
    });
  }
}
