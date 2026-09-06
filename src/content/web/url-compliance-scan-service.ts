import type { ComplianceAnalyzer } from '@/src/compliance/core/compliance-analyzer';
import { ScanAnalysisResultSchema } from '@/src/compliance/core/schemas';

import { classifyWebContent } from './content-classifier';
import type { FixtureWebContentExtractor } from './fixture-web-content-extractor';
import { PageClaimExtractor } from './page-claim-extractor';
import type { WebContentExtractor } from './web-content-extractor';

export type UrlScanInput =
  | { url: string; fixtureId?: never }
  | { fixtureId: string; url?: never };

export class UrlComplianceScanService {
  private readonly claimExtractor = new PageClaimExtractor();

  constructor(
    private readonly webContentExtractor: WebContentExtractor,
    private readonly fixtureContentExtractor: FixtureWebContentExtractor,
    private readonly complianceAnalyzer: ComplianceAnalyzer,
  ) {}

  async analyze(input: UrlScanInput) {
    const webContent = input.fixtureId
      ? await this.fixtureContentExtractor.extract(input.fixtureId)
      : await this.webContentExtractor.extract(input.url!);
    const { detectedContentType, detectedCategory } =
      classifyWebContent(webContent);
    const notices: Array<{
      code:
        | 'CONTENT_TRUNCATED'
        | 'GENERAL_FOOD_PACK_DISABLED'
        | 'UNKNOWN_CATEGORY';
      message: string;
    }> = webContent.contentTruncated
      ? [
          {
            code: 'CONTENT_TRUNCATED',
            message: '페이지가 커서 우선순위가 높은 콘텐츠만 분석했습니다.',
          },
        ]
      : [];

    if (detectedCategory !== 'GENERAL_ADVERTISING') {
      notices.push(
        detectedCategory === 'GENERAL_FOOD'
          ? {
              code: 'GENERAL_FOOD_PACK_DISABLED',
              message:
                'General Food로 분류됐지만 해당 Compliance Pack은 아직 활성화되지 않았습니다.',
            }
          : {
              code: 'UNKNOWN_CATEGORY',
              message:
                '페이지 유형 또는 상품 카테고리를 충분히 분류하지 못해 추가 검토가 필요합니다.',
            },
      );

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

    const claims = this.claimExtractor.extract(webContent);
    const complianceResult = await this.complianceAnalyzer.analyze({
      text: webContent.visibleText,
      claims,
    });

    return ScanAnalysisResultSchema.parse({
      ...complianceResult,
      inputType: 'URL',
      detectedContentType,
      detectedCategory,
      webContent,
      notices,
    });
  }
}
