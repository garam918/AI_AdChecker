import { BASE_SAFE_ANALYSIS_INSTRUCTIONS } from '@/src/compliance/core/analysis-instructions';
import type {
  CompliancePackDefinition,
  PackContentInput,
} from '@/src/compliance/core/compliance-pack';

import { detectHealthFunctionalFoodCategory } from './category-detector';
import { extractHealthFunctionalFoodClaimCandidates } from './claim-extractor';
import { HealthFunctionalFoodRetrievalQueryBuilder } from './retrieval-query-builder';

export const HEALTH_FUNCTIONAL_FOOD_ANALYSIS_INSTRUCTIONS = [
  ...BASE_SAFE_ANALYSIS_INSTRUCTIONS,
  'The product is classified as health functional food, not medicine.',
  'Compare every functionality claim with the retrieved official product authorization.',
  'Do not infer an authorization when the official product record is unavailable.',
  'Treat disease prevention or treatment claims separately from authorized functionality.',
  'Use only provided regulatory sources and official product fields.',
  'Never classify an advertisement as illegal with certainty.',
  'Return source chunk IDs.',
] as const;

export class HealthFunctionalFoodCompliancePack implements CompliancePackDefinition {
  readonly metadata = {
    id: 'HEALTH_FUNCTIONAL_FOOD' as const,
    title: 'Health Functional Food',
    version: '1.0.0',
    category: 'HEALTH_FUNCTIONAL_FOOD' as const,
  };
  readonly supportedContentTypes = [
    'ADVERTISEMENT_TEXT',
    'LANDING_PAGE',
    'PRODUCT_DETAIL',
  ] as const;
  readonly detectionSignals = [
    '건강기능식품 또는 건기식 문구',
    '품목제조신고번호',
    '건강기능식품 도안',
    '기능성 원료',
  ] as const;
  readonly claimCategories = [
    'DISEASE_PREVENTION_TREATMENT',
    'FUNCTIONALITY_SCOPE_CLAIM',
    'PHARMACEUTICAL_CONFUSION',
    'FALSE_EXAGGERATED_CLAIM',
  ] as const;
  readonly analysisInstructions = HEALTH_FUNCTIONAL_FOOD_ANALYSIS_INSTRUCTIONS;
  readonly appliesToCategories = ['HEALTH_FUNCTIONAL_FOOD'] as const;
  private readonly queryBuilder =
    new HealthFunctionalFoodRetrievalQueryBuilder();

  detect(input: PackContentInput) {
    return detectHealthFunctionalFoodCategory(input);
  }

  extractClaims(input: PackContentInput) {
    if (!input.webContent) {
      return extractHealthFunctionalFoodClaimCandidates(input.text);
    }
    return input.webContent.sections.flatMap((section) => {
      const baseOffset = input.text.indexOf(section.text);
      if (baseOffset < 0) return [];
      return extractHealthFunctionalFoodClaimCandidates(section.text, {
        baseOffset,
        sourceSectionId: section.id,
        contextRole:
          section.type === 'TESTIMONIAL' ? 'TESTIMONIAL' : 'ADVERTISING',
      });
    });
  }

  buildRetrievalQuery(
    claim: Parameters<HealthFunctionalFoodRetrievalQueryBuilder['build']>[0],
  ) {
    return this.queryBuilder.build(claim);
  }
}

export const healthFunctionalFoodCompliancePack =
  new HealthFunctionalFoodCompliancePack();
