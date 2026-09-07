import type { PreparedClaim } from './compliance-analyzer';
import type { Claim } from './schemas';
import type {
  DetectedCategory,
  DetectedContentType,
  ExtractedWebContent,
} from '@/src/content/web/schemas';
import type { CompliancePackId } from '@/src/compliance/regulatory/schemas';
import type { ProductIdentity } from '@/src/compliance/product-authorization/schemas';

export type PackContentInput = {
  text: string;
  detectedContentType: DetectedContentType;
  webContent?: ExtractedWebContent;
  categoryHint?: DetectedCategory;
  productIdentity?: ProductIdentity;
};

export type PackCategoryDetection = {
  category: DetectedCategory;
  confidence: number;
  disposition: 'MATCH' | 'UNCERTAIN' | 'NO_MATCH';
  reasons: string[];
};

export interface CompliancePackDefinition {
  readonly metadata: {
    id: CompliancePackId;
    title: string;
    version: string;
    category: DetectedCategory;
  };
  readonly supportedContentTypes: readonly DetectedContentType[];
  readonly detectionSignals: readonly string[];
  readonly claimCategories: readonly string[];
  readonly analysisInstructions: readonly string[];
  readonly appliesToCategories: readonly DetectedCategory[];
  detect(input: PackContentInput): PackCategoryDetection;
  extractClaims(input: PackContentInput): PreparedClaim[];
  buildRetrievalQuery(claim: Claim): string;
}
