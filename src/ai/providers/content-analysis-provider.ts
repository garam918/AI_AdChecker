import type { PreparedClaim } from '@/src/compliance/core/compliance-analyzer';
import type {
  CompliancePackDefinition,
  PackContentInput,
} from '@/src/compliance/core/compliance-pack';
import type {
  DetectedCategory,
  DetectedContentType,
} from '@/src/content/web/schemas';

export type PreparedContent = {
  category: DetectedCategory;
  contentType: DetectedContentType;
  uncertain: boolean;
  truncated: boolean;
  claims: Array<PreparedClaim & { packId: string }>;
};

export interface ContentAnalysisProvider {
  readonly model: string;
  prepareContent(
    input: PackContentInput,
    packs: readonly CompliancePackDefinition[],
  ): Promise<PreparedContent>;
}

export type AnalysisStage =
  | 'EXTRACTING'
  | 'CLASSIFYING'
  | 'RETRIEVING'
  | 'ANALYZING'
  | 'VALIDATING';
export type AnalysisProgress = (stage: AnalysisStage) => void;
