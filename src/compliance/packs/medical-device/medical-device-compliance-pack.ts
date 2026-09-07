import { BASE_SAFE_ANALYSIS_INSTRUCTIONS } from '@/src/compliance/core/analysis-instructions';
import type {
  CompliancePackDefinition,
  PackContentInput,
} from '@/src/compliance/core/compliance-pack';
import { extractRegulatedProductClaimCandidates } from '@/src/compliance/packs/regulated-product/claim-extractor';

import { detectMedicalDeviceCategory } from './category-detector';
import { MedicalDeviceRetrievalQueryBuilder } from './retrieval-query-builder';

export const MEDICAL_DEVICE_ANALYSIS_INSTRUCTIONS = [
  ...BASE_SAFE_ANALYSIS_INSTRUCTIONS,
  'The product is classified as a medical device.',
  'Compare performance, efficacy and intended-use claims with official permit, certification or report fields.',
  'Do not infer authorization scope when official product information is unavailable.',
  'Check expert endorsement, testimonials and absolute safety or efficacy claims separately.',
  'Use only provided regulatory sources and official product fields.',
  'Never classify an advertisement as illegal with certainty.',
  'Return source chunk IDs.',
] as const;

export class MedicalDeviceCompliancePack implements CompliancePackDefinition {
  readonly metadata = {
    id: 'MEDICAL_DEVICE' as const,
    title: 'Medical Device',
    version: '1.0.0',
    category: 'MEDICAL_DEVICE' as const,
  };
  readonly supportedContentTypes = [
    'ADVERTISEMENT_TEXT',
    'LANDING_PAGE',
    'PRODUCT_DETAIL',
  ] as const;
  readonly detectionSignals = [
    '의료기기 문구',
    '품목허가·인증·신고번호',
    '의료기기 등급',
  ] as const;
  readonly claimCategories = [
    'AUTHORIZATION_SCOPE_CLAIM',
    'ABSOLUTE_SAFETY_OR_EFFECT_CLAIM',
    'EXPERT_ENDORSEMENT_RISK',
    'BEFORE_AFTER_OR_TESTIMONIAL_RISK',
  ] as const;
  readonly analysisInstructions = MEDICAL_DEVICE_ANALYSIS_INSTRUCTIONS;
  readonly appliesToCategories = ['MEDICAL_DEVICE'] as const;
  private readonly queryBuilder = new MedicalDeviceRetrievalQueryBuilder();

  detect(input: PackContentInput) {
    return detectMedicalDeviceCategory(input);
  }

  extractClaims(input: PackContentInput) {
    if (!input.webContent) {
      return extractRegulatedProductClaimCandidates(
        input.text,
        'MEDICAL_DEVICE',
      );
    }
    return input.webContent.sections.flatMap((section) => {
      const baseOffset = input.text.indexOf(section.text);
      if (baseOffset < 0) return [];
      return extractRegulatedProductClaimCandidates(
        section.text,
        'MEDICAL_DEVICE',
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
    claim: Parameters<MedicalDeviceRetrievalQueryBuilder['build']>[0],
  ) {
    return this.queryBuilder.build(claim);
  }
}

export const medicalDeviceCompliancePack = new MedicalDeviceCompliancePack();
