import type { WebContentExtractor } from './web-content-extractor';
import { WebExtractionError } from './web-extraction-error';
import type { SafeHtmlFetcher } from './safe-html-fetcher';
import type { SemanticHtmlExtractor } from './semantic-html-extractor';

export class SafeStaticWebContentExtractor implements WebContentExtractor {
  constructor(
    private readonly htmlFetcher: SafeHtmlFetcher,
    private readonly htmlExtractor: SemanticHtmlExtractor,
  ) {}

  async extract(url: string) {
    const fetched = await this.htmlFetcher.fetch(url);
    const extracted = this.htmlExtractor.extract(fetched);

    if (extracted.sections.length === 0 || extracted.visibleText.length < 10) {
      throw new WebExtractionError(
        'JAVASCRIPT_ONLY',
        '현재 페이지 내용을 충분히 추출하지 못했습니다. 텍스트를 붙여넣어 검사해 주세요.',
      );
    }
    return extracted;
  }
}
