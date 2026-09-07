import { BASE_SAFE_ANALYSIS_INSTRUCTIONS } from '@/src/compliance/core/analysis-instructions';
import type {
  CompliancePackDefinition,
  PackContentInput,
} from '@/src/compliance/core/compliance-pack';
import { extractRegulatedProductClaimCandidates } from '@/src/compliance/packs/regulated-product/claim-extractor';

import { detectCosmeticCategory } from './category-detector';
import { CosmeticRetrievalQueryBuilder } from './retrieval-query-builder';

export const COSMETIC_ANALYSIS_INSTRUCTIONS = [
  ...BASE_SAFE_ANALYSIS_INSTRUCTIONS,
  'The product is classified as a cosmetic, not a medicine.',
  'Treat medicinal or disease-treatment expressions separately from cosmetic functions.',
  'Compare functional cosmetic claims with official review or report information.',
  'Require directly related substantiation for objective cosmetic effect claims.',
  'Do not infer functional cosmetic status when official product information is unavailable.',
  'Use only provided regulatory sources and official product fields.',
  'Never classify an advertisement as illegal with certainty.',
  'Return source chunk IDs.',
] as const;

export class CosmeticCompliancePack implements CompliancePackDefinition {
  readonly metadata = {
    id: 'COSMETIC' as const,
    title: 'Cosmetic',
    version: '1.0.0',
    category: 'COSMETIC' as const,
  };
  readonly supportedContentTypes = [
    'ADVERTISEMENT_TEXT',
    'LANDING_PAGE',
    'PRODUCT_DETAIL',
  ] as const;
  readonly detectionSignals = [
    '화장품·기능성화장품 문구',
    '기능성 심사·보고번호',
    '화장품 제형 및 기능 표현',
  ] as const;
  readonly claimCategories = [
    'PHARMACEUTICAL_MISRECOGNITION',
    'AUTHORIZATION_SCOPE_CLAIM',
    'OBJECTIVE_EFFECT_CLAIM',
    'ABSOLUTE_SAFETY_OR_EFFECT_CLAIM',
    'EXPERT_ENDORSEMENT_RISK',
    'BEFORE_AFTER_OR_TESTIMONIAL_RISK',
  ] as const;
  readonly analysisInstructions = COSMETIC_ANALYSIS_INSTRUCTIONS;
  readonly appliesToCategories = ['COSMETIC'] as const;
  private readonly queryBuilder = new CosmeticRetrievalQueryBuilder();

  detect(input: PackContentInput) {
    return detectCosmeticCategory(input);
  }

  extractClaims(input: PackContentInput) {
    if (!input.webContent) {
      return extractRegulatedProductClaimCandidates(input.text, 'COSMETIC');
    }
    return input.webContent.sections.flatMap((section) => {
      const baseOffset = input.text.indexOf(section.text);
      if (baseOffset < 0) return [];
      return extractRegulatedProductClaimCandidates(section.text, 'COSMETIC', {
        baseOffset,
        sourceSectionId: section.id,
        contextRole:
          section.type === 'TESTIMONIAL' ? 'TESTIMONIAL' : 'ADVERTISING',
      });
    });
  }

  buildRetrievalQuery(
    claim: Parameters<CosmeticRetrievalQueryBuilder['build']>[0],
  ) {
    return this.queryBuilder.build(claim);
  }
}

export const cosmeticCompliancePack = new CosmeticCompliancePack();
