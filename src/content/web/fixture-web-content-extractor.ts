import aiSaasLandingHtml from '@/data/web-fixtures/ai-saas-landing.html?raw';

import { SemanticHtmlExtractor } from './semantic-html-extractor';

export const AI_SAAS_DEMO_FIXTURE_ID = 'ai-saas-landing';
export const AI_SAAS_DEMO_URL = 'https://demo.contentlint.example/ai-saas';

export class FixtureWebContentExtractor {
  constructor(private readonly htmlExtractor = new SemanticHtmlExtractor()) {}

  async extract(fixtureId: string) {
    if (fixtureId !== AI_SAAS_DEMO_FIXTURE_ID) {
      throw new Error('지원하지 않는 웹페이지 데모 fixture입니다.');
    }

    return this.htmlExtractor.extract({
      html: aiSaasLandingHtml,
      url: AI_SAAS_DEMO_URL,
      finalUrl: AI_SAAS_DEMO_URL,
      fixtureId,
    });
  }
}
