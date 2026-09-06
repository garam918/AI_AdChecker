import aiSaasLandingHtml from '@/data/web-fixtures/ai-saas-landing.html?raw';
import generalFoodProductHtml from '@/data/web-fixtures/general-food-product.html?raw';

import { SemanticHtmlExtractor } from './semantic-html-extractor';

export const AI_SAAS_DEMO_FIXTURE_ID = 'ai-saas-landing';
export const AI_SAAS_DEMO_URL = 'https://demo.contentlint.example/ai-saas';
export const GENERAL_FOOD_DEMO_FIXTURE_ID = 'general-food-product';
export const GENERAL_FOOD_DEMO_URL =
  'https://demo.contentlint.example/general-food-product';
export const DEMO_FIXTURE_IDS = [
  AI_SAAS_DEMO_FIXTURE_ID,
  GENERAL_FOOD_DEMO_FIXTURE_ID,
] as const;

const FIXTURES = {
  [AI_SAAS_DEMO_FIXTURE_ID]: {
    html: aiSaasLandingHtml,
    url: AI_SAAS_DEMO_URL,
  },
  [GENERAL_FOOD_DEMO_FIXTURE_ID]: {
    html: generalFoodProductHtml,
    url: GENERAL_FOOD_DEMO_URL,
  },
} as const;

export class FixtureWebContentExtractor {
  constructor(private readonly htmlExtractor = new SemanticHtmlExtractor()) {}

  async extract(fixtureId: string) {
    const fixture = FIXTURES[fixtureId as keyof typeof FIXTURES];
    if (!fixture) {
      throw new Error('지원하지 않는 웹페이지 데모 fixture입니다.');
    }

    return this.htmlExtractor.extract({
      html: fixture.html,
      url: fixture.url,
      finalUrl: fixture.url,
      fixtureId,
    });
  }
}
