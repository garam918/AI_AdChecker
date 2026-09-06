import { BASE_SAFE_ANALYSIS_INSTRUCTIONS } from '@/src/compliance/core/analysis-instructions';
import type {
  CompliancePackDefinition,
  PackContentInput,
} from '@/src/compliance/core/compliance-pack';

import { detectGeneralFoodCategory } from './category-detector';
import { extractGeneralFoodClaimCandidates } from './claim-extractor';
import { GeneralFoodRetrievalQueryBuilder } from './retrieval-query-builder';

export const GENERAL_FOOD_ANALYSIS_INSTRUCTIONS = [
  ...BASE_SAFE_ANALYSIS_INSTRUCTIONS,
  'Product is currently classified as general food.',
  'Determine potential consumer misunderstanding.',
  'Use only provided regulatory sources.',
  'Never classify as illegal with certainty.',
  'Return source chunk IDs.',
  'Distinguish disease claims from health-functional claims.',
  'Consider context.',
  'If product classification is uncertain, return REVIEW_REQUIRED.',
] as const;

export class GeneralFoodCompliancePack implements CompliancePackDefinition {
  readonly metadata = {
    id: 'GENERAL_FOOD' as const,
    title: 'General Food',
    version: '1.0.0',
    category: 'GENERAL_FOOD' as const,
  };
  readonly supportedContentTypes = [
    'ADVERTISEMENT_TEXT',
    'LANDING_PAGE',
    'PRODUCT_DETAIL',
  ] as const;
  readonly detectionSignals = [
    '일반식품·가공식품 또는 식품 유형',
    '원재료·영양정보·섭취 표현',
    '음료·차·커피·분말·스낵 등 제품 형태',
    '식품 관련 Product structured data',
  ] as const;
  readonly claimCategories = [
    'DISEASE_PREVENTION_TREATMENT',
    'HEALTH_FUNCTIONAL_FOOD_CONFUSION',
    'PHARMACEUTICAL_CONFUSION',
    'FALSE_EXAGGERATED_CLAIM',
    'CONSUMER_EXPERIENCE_GENERALIZATION',
    'BEFORE_AFTER_RISK',
    'EXPERT_ENDORSEMENT_RISK',
  ] as const;
  readonly analysisInstructions = GENERAL_FOOD_ANALYSIS_INSTRUCTIONS;
  readonly appliesToCategories = ['GENERAL_FOOD'] as const;
  private readonly queryBuilder = new GeneralFoodRetrievalQueryBuilder();

  detect(input: PackContentInput) {
    return detectGeneralFoodCategory(input);
  }

  extractClaims(input: PackContentInput) {
    if (!input.webContent) {
      return extractGeneralFoodClaimCandidates(input.text);
    }

    return input.webContent.sections.flatMap((section) => {
      const baseOffset = input.text.indexOf(section.text);
      if (baseOffset < 0) return [];
      return extractGeneralFoodClaimCandidates(section.text, {
        baseOffset,
        sourceSectionId: section.id,
        contextRole:
          section.type === 'TESTIMONIAL' ? 'TESTIMONIAL' : 'ADVERTISING',
      });
    });
  }

  buildRetrievalQuery(
    claim: Parameters<GeneralFoodRetrievalQueryBuilder['build']>[0],
  ) {
    return this.queryBuilder.build(claim);
  }
}

export const generalFoodCompliancePack = new GeneralFoodCompliancePack();
