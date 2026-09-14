import type { AnalysisProgress } from '@/src/ai/providers/content-analysis-provider';
import type { ContentComplianceScanService } from '@/src/compliance/core/content-compliance-scan-service';
import { ScanAnalysisResultSchema } from '@/src/compliance/core/schemas';
import type { ProductIdentity } from '@/src/compliance/product-authorization/schemas';

import { classifyWebContent } from './content-classifier';
import type { FixtureWebContentExtractor } from './fixture-web-content-extractor';
import type { DetectedCategory } from './schemas';
import type { WebContentExtractor } from './web-content-extractor';

type UrlScanOptions = {
  categoryHint?: DetectedCategory;
  productIdentity?: ProductIdentity;
};

export type UrlScanInput =
  | ({ url: string; fixtureId?: never } & UrlScanOptions)
  | ({ fixtureId: string; url?: never } & UrlScanOptions);

export class UrlComplianceScanService {
  constructor(
    private readonly webContentExtractor: WebContentExtractor,
    private readonly fixtureContentExtractor: FixtureWebContentExtractor,
    private readonly complianceAnalyzer: Pick<
      ContentComplianceScanService,
      'analyzeContent'
    >,
    private readonly aiEnabled = false,
  ) {}

  async analyze(input: UrlScanInput, progress?: AnalysisProgress) {
    progress?.('EXTRACTING');
    const webContent = input.fixtureId
      ? await this.fixtureContentExtractor.extract(input.fixtureId)
      : await this.webContentExtractor.extract(input.url!);
    const classified = classifyWebContent(webContent);
    const detectedContentType = classified.detectedContentType;
    const detectedCategory =
      input.categoryHint && input.categoryHint !== 'UNKNOWN'
        ? input.categoryHint
        : classified.detectedCategory;
    const notices: Array<{
      code:
        | 'CONTENT_TRUNCATED'
        | 'UNKNOWN_CATEGORY'
        | 'PRODUCT_AUTHORIZATION_REQUIRED'
        | 'PRODUCT_AUTHORIZATION_NOT_FOUND'
        | 'PRODUCT_AUTHORIZATION_AMBIGUOUS'
        | 'PRODUCT_AUTHORIZATION_UNAVAILABLE'
        | 'PRIOR_REVIEW_REQUIRED';
      message: string;
    }> = webContent.contentTruncated
      ? [
          {
            code: 'CONTENT_TRUNCATED',
            message: '페이지가 커서 우선순위가 높은 콘텐츠만 분석했습니다.',
          },
        ]
      : [];

    if (detectedCategory === 'UNKNOWN' && !this.aiEnabled) {
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

    const complianceResult = await this.complianceAnalyzer.analyzeContent(
      {
        text: webContent.visibleText,
        detectedContentType,
        webContent,
        categoryHint: input.categoryHint,
        productIdentity: input.productIdentity,
      },
      progress,
    );

    return ScanAnalysisResultSchema.parse({
      ...complianceResult,
      inputType: 'URL',
      detectedContentType: complianceResult.detectedContentType,
      detectedCategory: complianceResult.detectedCategory,
      webContent,
      notices: [...complianceResult.notices, ...notices],
    });
  }
}
