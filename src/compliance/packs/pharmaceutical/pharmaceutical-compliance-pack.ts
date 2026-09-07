import { BASE_SAFE_ANALYSIS_INSTRUCTIONS } from '@/src/compliance/core/analysis-instructions';
import type {
  CompliancePackDefinition,
  PackContentInput,
} from '@/src/compliance/core/compliance-pack';
import { extractRegulatedProductClaimCandidates } from '@/src/compliance/packs/regulated-product/claim-extractor';

import { detectPharmaceuticalCategory } from './category-detector';
import { PharmaceuticalRetrievalQueryBuilder } from './retrieval-query-builder';

export const PHARMACEUTICAL_ANALYSIS_INSTRUCTIONS = [
  ...BASE_SAFE_ANALYSIS_INSTRUCTIONS,
  'The product is classified as a pharmaceutical.',
  'Compare efficacy and dosage claims with official product authorization fields.',
  'Check whether a verified product is a prescription drug before public advertising.',
  'Do not infer authorization scope when official product information is unavailable.',
  'Use only provided regulatory sources and official product fields.',
  'Never classify an advertisement as illegal with certainty.',
  'Return source chunk IDs.',
] as const;

export class PharmaceuticalCompliancePack implements CompliancePackDefinition {
  readonly metadata = {
    id: 'PHARMACEUTICAL' as const,
    title: 'Pharmaceutical',
    version: '1.0.0',
    category: 'PHARMACEUTICAL' as const,
  };
  readonly supportedContentTypes = [
    'ADVERTISEMENT_TEXT',
    'LANDING_PAGE',
    'PRODUCT_DETAIL',
  ] as const;
  readonly detectionSignals = [
    '의약품·전문의약품·일반의약품 문구',
    '품목기준코드 또는 의약품 허가정보',
  ] as const;
  readonly claimCategories = [
    'AUTHORIZATION_SCOPE_CLAIM',
    'ABSOLUTE_SAFETY_OR_EFFECT_CLAIM',
    'EXPERT_ENDORSEMENT_RISK',
    'BEFORE_AFTER_OR_TESTIMONIAL_RISK',
  ] as const;
  readonly analysisInstructions = PHARMACEUTICAL_ANALYSIS_INSTRUCTIONS;
  readonly appliesToCategories = ['PHARMACEUTICAL'] as const;
  private readonly queryBuilder = new PharmaceuticalRetrievalQueryBuilder();

  detect(input: PackContentInput) {
    return detectPharmaceuticalCategory(input);
  }

  extractClaims(input: PackContentInput) {
    if (!input.webContent) {
      return extractRegulatedProductClaimCandidates(
        input.text,
        'PHARMACEUTICAL',
      );
    }
    return input.webContent.sections.flatMap((section) => {
      const baseOffset = input.text.indexOf(section.text);
      if (baseOffset < 0) return [];
      return extractRegulatedProductClaimCandidates(
        section.text,
        'PHARMACEUTICAL',
        {
          baseOffset,
          sourceSectionId: section.id,
          contextRole:
            section.type === 'TESTIMONIAL' ? 'TESTIMONIAL' : 'ADVERTISING',
        },
      );
    });
  }

  buildRetrievalQuery(
    claim: Parameters<PharmaceuticalRetrievalQueryBuilder['build']>[0],
  ) {
    return this.queryBuilder.build(claim);
  }
}

export const pharmaceuticalCompliancePack = new PharmaceuticalCompliancePack();
