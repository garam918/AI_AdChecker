import type {
  CompliancePackDefinition,
  PackContentInput,
} from '@/src/compliance/core/compliance-pack';
import { BASE_SAFE_ANALYSIS_INSTRUCTIONS } from '@/src/compliance/core/analysis-instructions';
import { PageClaimExtractor } from '@/src/content/web/page-claim-extractor';

import { extractGeneralAdvertisingClaimCandidates } from './claim-extractor';
import { RegulatoryQueryBuilder } from '../../regulatory/regulatory-query-builder';

const SOFTWARE_SIGNALS = /saas|소프트웨어|서비스|솔루션|플랫폼|앱|ai|api/i;

export class GeneralAdvertisingCompliancePack implements CompliancePackDefinition {
  readonly metadata = {
    id: 'GENERAL_ADVERTISING' as const,
    title: 'General Advertising',
    version: '1.0.0',
    category: 'GENERAL_ADVERTISING' as const,
  };
  readonly supportedContentTypes = [
    'ADVERTISEMENT_TEXT',
    'LANDING_PAGE',
    'PRODUCT_DETAIL',
  ] as const;
  readonly detectionSignals = [
    'SaaS 또는 소프트웨어 표현',
    '일반 서비스·상품 광고',
    '기본 광고 카테고리',
  ] as const;
  readonly claimCategories = [
    'OBJECTIVE_PERFORMANCE',
    'NUMERICAL',
    'SUPERIORITY',
    'COMPARATIVE',
    'GUARANTEE',
    'PRICE_CONDITION',
    'FREE',
    'TESTIMONIAL',
    'GENERAL_MARKETING',
  ] as const;
  readonly analysisInstructions = BASE_SAFE_ANALYSIS_INSTRUCTIONS;
  readonly appliesToCategories = [
    'GENERAL_ADVERTISING',
    'GENERAL_FOOD',
  ] as const;
  private readonly queryBuilder = new RegulatoryQueryBuilder();
  private readonly pageClaimExtractor = new PageClaimExtractor();

  detect(input: PackContentInput) {
    const hasSoftwareSignals = SOFTWARE_SIGNALS.test(input.text);
    return {
      category: 'GENERAL_ADVERTISING' as const,
      confidence: hasSoftwareSignals ? 0.82 : 0.2,
      disposition: 'MATCH' as const,
      reasons: hasSoftwareSignals
        ? ['소프트웨어 또는 서비스 표현을 확인했습니다.']
        : ['다른 지원 카테고리가 확인되지 않을 때 적용되는 기본 Pack입니다.'],
    };
  }

  extractClaims(input: PackContentInput) {
    return input.webContent
      ? this.pageClaimExtractor.extract(input.webContent)
      : extractGeneralAdvertisingClaimCandidates(input.text);
  }

  buildRetrievalQuery(claim: Parameters<RegulatoryQueryBuilder['build']>[0]) {
    return this.queryBuilder.build(claim);
  }
}

export const generalAdvertisingCompliancePack =
  new GeneralAdvertisingCompliancePack();
